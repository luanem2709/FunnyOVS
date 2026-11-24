/**
 * AiHub — "tự động kết nối AI": dò OmniRoute/Ollama/LM Studio, nhận khoá miễn phí từ biến môi trường hoặc kho khoá,
 * dựng chuỗi dự phòng theo ưu tiên và cung cấp `chat()` cho phần còn lại của app.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CATALOG, pickModel } from "./catalog.js";
import { MAX_CUSTOM_PROVIDERS, customToDef, newCustomId, normalizeBaseUrl, normalizeCustomInput, parseCustomRecords, type CustomRecord } from "./custom.js";
import { LlmRouter } from "./router.js";
import { SecretStore } from "./secrets.js";
import {
  AiError,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type ProviderDef,
  type ProviderState,
  type ProviderStatus,
  type ResolvedProvider,
} from "./types.js";
import { redact } from "../security/redact.js";
import { aiErrorI18n, aiErrorText } from "../../shared/aiErrors.js";
import { msg } from "../../shared/messages.js";
import { ROUTING_STRATEGIES, type RoutingStrategy } from "../../shared/ai.js";
import { ValidationError } from "../../shared/validation.js";

interface Settings {
  disabled: string[];
  /** Ghi đè thứ tự ưu tiên (danh sách id). */
  order?: string[];
  models: Record<string, string>;
  /** Nguồn do người dùng thêm (không chứa khoá). */
  custom: CustomRecord[];
  strategy: RoutingStrategy;
}

type Vars = Record<string, string | number>;

interface Probe {
  state: ProviderState;
  /** Khoá i18n (`ai.detail.*`) + biến giải thích trạng thái dò; client dịch theo ngôn ngữ người dùng. */
  detailKey?: string;
  detailVars?: Vars;
  models: string[];
  at: number;
}

/** Kết quả thao tác (kiểm thử, khởi động OmniRoute): `message` là bản tiếng Việt dự phòng, client dịch theo `key`. */
export interface ActionResult {
  ok: boolean;
  message: string;
  key?: string;
  vars?: Vars;
}

function result(ok: boolean, key: string, vars?: Vars): ActionResult {
  return { ok, key, vars, message: msg("vi", key, vars) };
}

export interface HubOptions {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Ghi sổ cái cho mỗi lần gọi thành công. */
  onUsage?: (r: ChatResult) => void;
  /** Thời gian giữ kết quả dò (ms). */
  probeTtlMs?: number;
  /** Thay `child_process.spawn` (test không được chạy tiến trình thật). */
  spawnImpl?: typeof spawn;
  /** Chu kỳ dò khi chờ OmniRoute khởi động (ms, mặc định 1500). */
  omniPollMs?: number;
}

const PROBE_TIMEOUT_MS = 1500;
/** Nguồn tuỳ chỉnh thường ở xa (đám mây) nên được chờ lâu hơn máy cục bộ. */
const CUSTOM_PROBE_TIMEOUT_MS = 4000;

export class AiHub {
  readonly secrets: SecretStore;
  readonly router: LlmRouter;
  private settings: Settings = { disabled: [], models: {}, custom: [], strategy: "priority" };
  /** Bộ đếm cho cách chọn xoay vòng. */
  private rr = 0;
  private probes = new Map<string, Probe>();
  private probing: Promise<void> | null = null;
  private readonly env: NodeJS.ProcessEnv;
  private readonly settingsFile: string;
  private readonly f: typeof fetch;
  private readonly ttl: number;

  constructor(private readonly opts: HubOptions) {
    this.env = opts.env ?? process.env;
    this.f = opts.fetchImpl ?? fetch;
    this.ttl = opts.probeTtlMs ?? 30_000;
    this.secrets = new SecretStore(path.join(opts.dataDir, "secrets.json"));
    this.settingsFile = path.join(opts.dataDir, "ai.json");
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsFile, "utf8")) as Partial<Settings>;
      this.settings = {
        disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((x) => typeof x === "string") : [],
        order: Array.isArray(raw.order) ? raw.order.filter((x) => typeof x === "string") : undefined,
        models: raw.models && typeof raw.models === "object" ? { ...raw.models } : {},
        custom: parseCustomRecords(raw.custom),
        strategy: (ROUTING_STRATEGIES as readonly string[]).includes(String(raw.strategy)) ? (raw.strategy as RoutingStrategy) : "priority",
      };
    } catch {
      /* chưa có cấu hình */
    }
    this.router = new LlmRouter({
      candidates: () => this.candidates(),
      fetchImpl: this.f,
      now: opts.now,
      secrets: () => this.secrets.allValues(),
      rediscoverModels: (p) => this.rediscover(p),
      onSuccess: (r) => opts.onUsage?.(r),
    });
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
    fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings), "utf8");
  }

  // ---- Khoá & địa chỉ ----

  /** Khoá hiệu lực của một nhà cung cấp: kho khoá trước, rồi biến môi trường. */
  private keyOf(def: ProviderDef): { key?: string; source?: "env" | "stored" } {
    const stored = this.secrets.get(`ai.${def.id}.key`);
    if (stored) return { key: stored, source: "stored" };
    for (const name of def.keyEnv) {
      const v = this.env[name]?.trim();
      if (v) return { key: v, source: "env" };
    }
    return {};
  }

  private baseUrlOf(def: ProviderDef): string {
    if (def.custom) return def.baseUrl;
    const e = this.env;
    if (def.id === "custom") return (e.OFFICE_LLM_BASE_URL ?? e.OPENAI_BASE_URL ?? "").trim();
    if (def.id === "omniroute" && e.OFFICE_OMNIROUTE_URL) return e.OFFICE_OMNIROUTE_URL.trim();
    if (def.id === "lmstudio" && e.OFFICE_LMSTUDIO_URL) return e.OFFICE_LMSTUDIO_URL.trim();
    if (def.id === "ollama" && e.OLLAMA_HOST) {
      const h = e.OLLAMA_HOST.trim().replace(/\/$/, "");
      return `${/^https?:\/\//.test(h) ? h : `http://${h}`}/v1`;
    }
    return def.baseUrl;
  }

  private isConfigured(def: ProviderDef): boolean {
    return def.id !== "custom" || Boolean(this.baseUrlOf(def));
  }

  private modelOf(def: ProviderDef, probe?: Probe): string {
    const override = this.settings.models[def.id];
    if (override) return override;
    if (def.custom) {
      // Model do người dùng đặt khi thêm (nếu máy chủ có liệt kê model mà không có model đó thì chọn lại theo danh sách).
      const m = def.defaultModel;
      if (m && (!probe || probe.models.length === 0 || probe.models.includes(m))) return m;
      return pickModel(def, probe?.models ?? []) ?? m ?? "gpt-4o-mini";
    }
    if (def.id === "custom") return (this.env.OFFICE_LLM_MODEL ?? this.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
    return pickModel(def, probe?.models ?? []) ?? def.defaultModel ?? "auto";
  }

  // ---- Dò ----

  private async probeOne(def: ProviderDef): Promise<Probe> {
    const at = this.now();
    const { key } = this.keyOf(def);
    if (def.kind === "cloud") {
      return key || !def.needsKey
        ? { state: "ready", models: [], at }
        : { state: "no-key", detailKey: "ai.detail.noKey", models: [], at };
    }
    const base = this.baseUrlOf(def);
    if (!base) return { state: "offline", detailKey: "ai.detail.noBase", models: [], at };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), def.custom ? CUSTOM_PROBE_TIMEOUT_MS : PROBE_TIMEOUT_MS);
    try {
      const res = await this.f(`${base.replace(/\/$/, "")}/models`, {
        headers: key ? { authorization: `Bearer ${key}` } : {},
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return { state: key ? "auth-failed" : "no-key", detailKey: key ? "ai.detail.badKey" : "ai.detail.needsKey", models: [], at };
      }
      if (!res.ok) {
        // Máy chủ tuỳ chỉnh có thể không có /models: coi là sẵn sàng.
        return def.kind === "custom"
          ? { state: "ready", models: [], at }
          : { state: "offline", detailKey: "ai.detail.http", detailVars: { status: res.status }, models: [], at };
      }
      const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
      const models = (json?.data ?? []).map((m) => (typeof m.id === "string" ? m.id : "")).filter(Boolean);
      return { state: "ready", models, at };
    } catch {
      return { state: "offline", detailKey: def.kind === "custom" ? "ai.detail.unreachable" : "ai.detail.notRunning", models: [], at };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Dò lại mọi nhà cung cấp (song song). */
  async refresh(): Promise<void> {
    if (this.probing) return this.probing;
    this.probing = (async () => {
      const defs = this.allDefs().filter((d) => this.isConfigured(d));
      const results = await Promise.all(defs.map(async (d) => [d.id, await this.probeOne(d)] as const));
      const live = new Set(defs.map((d) => d.id));
      for (const id of [...this.probes.keys()]) if (!live.has(id)) this.probes.delete(id); // nguồn đã xoá
      for (const [id, p] of results) this.probes.set(id, p);
    })().finally(() => {
      this.probing = null;
    });
    return this.probing;
  }

  /**
   * Dò lại khi kết quả đã cũ. `block = false` (đường gọi chat): chỉ chờ ở lần dò ĐẦU TIÊN; các lần sau dò ngầm — nếu không, một nguồn tuỳ chỉnh
   * chậm hoặc đứt mạng sẽ làm chậm mọi cuộc gọi AI mỗi chu kỳ (mất kết nối giữa chừng đã có ngắt mạch của router lo).
   */
  private async ensureFresh(block = true): Promise<void> {
    const oldest = Math.min(...[...this.probes.values()].map((p) => p.at), Infinity);
    if (this.probes.size === 0) return this.refresh();
    if (this.now() - oldest > this.ttl) {
      const p = this.refresh();
      if (block) await p;
      else void p.catch(() => undefined);
    }
  }

  // ---- Ứng viên cho router ----

  private enabled(id: string): boolean {
    return !this.settings.disabled.includes(id);
  }

  private orderedDefs(): ProviderDef[] {
    const order = this.settings.order;
    const rank = (d: ProviderDef): number => {
      const i = order?.indexOf(d.id) ?? -1;
      return i >= 0 ? i - 1000 : d.priority;
    };
    return this.allDefs().filter((d) => this.isConfigured(d)).sort((a, b) => rank(a) - rank(b));
  }

  private resolve(def: ProviderDef): ResolvedProvider | null {
    const probe = this.probes.get(def.id);
    if (!probe || probe.state !== "ready") return null;
    return {
      def,
      baseUrl: this.baseUrlOf(def),
      apiKey: this.keyOf(def).key,
      model: this.modelOf(def, probe),
      models: probe.models,
    };
  }

  private async candidates(): Promise<ResolvedProvider[]> {
    await this.ensureFresh(false);
    const out: ResolvedProvider[] = [];
    for (const def of this.orderedDefs()) {
      if (!this.enabled(def.id)) continue;
      const r = this.resolve(def);
      if (r) out.push(r);
    }
    // Xoay vòng: dàn đều tải giữa các nguồn đang sẵn sàng (vẫn dự phòng theo thứ tự còn lại khi nguồn đầu lỗi).
    if (this.settings.strategy === "roundrobin" && out.length > 1) {
      const k = this.rr++ % out.length;
      return [...out.slice(k), ...out.slice(0, k)];
    }
    return out;
  }

  private async rediscover(p: ResolvedProvider): Promise<{ model?: string; models: string[] }> {
    try {
      const res = await this.f(`${p.baseUrl.replace(/\/$/, "")}/models`, {
        headers: p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { models: [] };
      const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
      const models = (json.data ?? []).map((m) => (typeof m.id === "string" ? m.id : "")).filter(Boolean);
      const old = this.probes.get(p.def.id);
      if (old) this.probes.set(p.def.id, { ...old, models });
      return { model: pickModel(p.def, models.filter((m) => m !== p.model)), models };
    } catch {
      return { models: [] };
    }
  }

  // ---- API công khai ----

  /** Có ít nhất một nhà cung cấp sẵn sàng (dùng cache; không dò mới). */
  hasProvider(): boolean {
    return this.orderedDefs().some((d) => this.enabled(d.id) && this.resolve(d) !== null);
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    try {
      return await this.router.chat(messages, opts);
    } catch (e) {
      if (e instanceof AiError) {
        const secrets = this.secrets.allValues();
        const attempts = e.attempts.map((a) => ({ ...a, error: redact(a.error, secrets) }));
        throw new AiError(e.code, redact(e.message, secrets), e.status, e.retryAfterMs, attempts, e.vars);
      }
      throw e;
    }
  }

  async status(refresh = false): Promise<ProviderStatus[]> {
    if (refresh) await this.refresh();
    else await this.ensureFresh();
    return this.orderedDefs().map((def) => {
      const probe = this.probes.get(def.id);
      const { key, source } = this.keyOf(def);
      const enabled = this.enabled(def.id);
      const stats = { ...this.router.stats(def.id) };
      let state: ProviderState = probe?.state ?? "offline";
      let detailKey = probe?.detailKey;
      let detailVars = probe?.detailVars;
      if (!enabled) state = "disabled";
      else if (state === "ready" && this.router.isCooling(def.id)) {
        state = stats.lastErrorStatus === 401 || stats.lastErrorStatus === 403 ? "auth-failed" : "cooling";
        detailKey = stats.lastErrorKey;
        detailVars = stats.lastErrorVars;
      }
      return {
        id: def.id,
        label: def.label,
        kind: def.kind,
        free: def.free,
        baseUrl: this.baseUrlOf(def),
        state,
        detail: detailKey ? msg("vi", detailKey, detailVars) : undefined,
        detailKey,
        detailVars,
        hasKey: Boolean(key),
        keySource: source,
        keyMask: source === "stored" ? this.secrets.mask(`ai.${def.id}.key`) : undefined,
        models: (probe?.models ?? []).slice(0, 30),
        activeModel: state === "disabled" ? undefined : this.modelOf(def, probe),
        modelOverride: this.settings.models[def.id],
        signupUrl: def.signupUrl,
        stats,
        enabled,
        priority: def.priority,
        ...(def.custom ? { custom: true } : {}),
      } satisfies ProviderStatus;
    });
  }

  /** Gửi một yêu cầu nhỏ tới đúng nhà cung cấp này để kiểm tra (bỏ qua ngắt mạch). */
  async test(id: string): Promise<ActionResult & { latencyMs?: number; model?: string }> {
    if (!this.def(id)) return result(false, "err.api.unknownProvider", { id: id.slice(0, 40) });
    await this.refresh();
    this.router.resetHealth(id);
    try {
      const r = await this.chat([{ role: "user", content: "Reply with the single word: OK" }], { only: id, maxTokens: 16, temperature: 0, timeoutMs: 20_000 });
      return { ok: true, message: r.text.slice(0, 60), latencyMs: r.latencyMs, model: r.model };
    } catch (e) {
      if (e instanceof AiError) {
        // `only: id` nên lỗi của đúng nhà cung cấp này nằm ở attempts[0]; không có thì dùng chính lỗi.
        const a = e.attempts[0];
        const like = a?.code ? { code: a.code, message: a.error, status: a.status, vars: a.vars } : e;
        const info = aiErrorI18n(like);
        return { ok: false, key: info.key, vars: info.vars, message: aiErrorText("vi", like) };
      }
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async setKey(id: string, key: string): Promise<void> {
    if (!this.def(id)) throw new Error("unknown AI provider");
    this.secrets.set(`ai.${id}.key`, key);
    this.router.resetHealth(id);
    await this.refresh();
  }

  async clearKey(id: string): Promise<void> {
    this.secrets.delete(`ai.${id}.key`);
    this.router.resetHealth(id);
    await this.refresh();
  }

  setEnabled(id: string, enabled: boolean): void {
    if (!this.def(id)) throw new Error("unknown AI provider");
    const set = new Set(this.settings.disabled);
    if (enabled) set.delete(id);
    else set.add(id);
    this.settings.disabled = [...set];
    this.save();
  }

  setModel(id: string, model: string): void {
    if (!this.def(id)) throw new Error("unknown AI provider");
    if (model.trim()) this.settings.models[id] = model.trim().slice(0, 120);
    else delete this.settings.models[id];
    this.router.resetHealth(id);
    this.save();
  }

  // ---- Nguồn tuỳ chỉnh (nút "+ Thêm API") ----

  /** Danh mục dựng sẵn + nguồn người dùng thêm. */
  private allDefs(): ProviderDef[] {
    return [...CATALOG, ...this.settings.custom.map((r, i) => customToDef(r, i))];
  }

  private def(id: string): ProviderDef | undefined {
    return this.allDefs().find((d) => d.id === id);
  }

  /** Id này có phải một nhà cung cấp đang có (dựng sẵn hoặc do người dùng thêm) không. */
  knows(id: string): boolean {
    return this.def(id) !== undefined;
  }

  strategy(): RoutingStrategy {
    return this.settings.strategy;
  }

  setStrategy(value: unknown): void {
    if (!(ROUTING_STRATEGIES as readonly string[]).includes(String(value))) throw new ValidationError("val.ai.badStrategy");
    this.settings.strategy = value as RoutingStrategy;
    this.save();
  }

  /** Thứ tự ưu tiên do người dùng sắp xếp (id lạ bị bỏ). */
  setOrder(ids: unknown): void {
    const known = new Set(this.allDefs().map((d) => d.id));
    const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && known.has(x)) : [];
    this.settings.order = [...new Set(list)];
    this.save();
  }

  /**
   * Kiểm tra một điểm cuối TRƯỚC khi lưu: gọi `GET <địa chỉ>/models` (kèm khoá nếu có) và báo số model thấy được.
   * Khi sửa nguồn đã có mà không nhập lại khoá thì dùng khoá đã lưu — nhưng CHỈ khi địa chỉ không đổi (không bao giờ gửi khoá đã lưu tới địa chỉ khác).
   */
  async check(raw: unknown): Promise<ActionResult & { models?: string[] }> {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(o.baseUrl);
    } catch (e) {
      if (e instanceof ValidationError) return result(false, e.key, e.vars);
      throw e;
    }
    let key = typeof o.apiKey === "string" ? o.apiKey.trim().slice(0, 500) : "";
    if (!key && typeof o.id === "string") {
      const rec = this.settings.custom.find((r) => r.id === o.id);
      if (rec && rec.baseUrl === baseUrl) key = this.secrets.get(`ai.${rec.id}.key`) ?? "";
    }
    try {
      const res = await this.f(`${baseUrl}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(7000) });
      if (res.status === 401 || res.status === 403) return result(false, key ? "ai.detail.badKey" : "ai.detail.needsKey");
      if (!res.ok) return result(false, "ai.detail.http", { status: res.status });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
      const models = (json?.data ?? []).map((m) => (typeof m.id === "string" ? m.id : "")).filter(Boolean);
      if (models.length === 0) return result(true, "ai.check.noList");
      return { ...result(true, "ai.check.ok", { n: models.length }), models: models.slice(0, 40) };
    } catch {
      return result(false, "ai.detail.unreachable");
    }
  }

  private statusOf(id: string): Promise<ProviderStatus> {
    return this.status().then((all) => all.find((s) => s.id === id)!);
  }

  async addCustom(raw: unknown): Promise<ProviderStatus> {
    const input = normalizeCustomInput(raw);
    if (this.settings.custom.length >= MAX_CUSTOM_PROVIDERS) throw new ValidationError("val.ai.tooMany", { max: MAX_CUSTOM_PROVIDERS });
    const id = newCustomId(input.label, new Set(this.allDefs().map((d) => d.id)));
    this.settings.custom.push({ id, label: input.label, baseUrl: input.baseUrl, model: input.model, free: input.free });
    if (input.apiKey) this.secrets.set(`ai.${id}.key`, input.apiKey);
    this.save();
    await this.refresh();
    return this.statusOf(id);
  }

  async updateCustom(id: string, raw: unknown): Promise<ProviderStatus> {
    const rec = this.settings.custom.find((r) => r.id === id);
    if (!rec) throw new ValidationError("val.ai.notCustom");
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const input = normalizeCustomInput(o, { partial: true });
    if (o.label !== undefined) rec.label = input.label;
    if (o.baseUrl !== undefined && input.baseUrl !== rec.baseUrl) {
      // Đổi sang địa chỉ khác (khác nơi nhận): khoá cũ không được tự theo sang — phải nhập lại.
      if (new URL(input.baseUrl).origin !== new URL(rec.baseUrl).origin && !input.apiKey) this.secrets.delete(`ai.${id}.key`);
      rec.baseUrl = input.baseUrl;
    }
    if (o.model !== undefined) rec.model = input.model;
    if (o.free !== undefined) rec.free = input.free;
    if (input.apiKey) this.secrets.set(`ai.${id}.key`, input.apiKey);
    this.router.resetHealth(id);
    this.save();
    await this.refresh();
    return this.statusOf(id);
  }

  async removeCustom(id: string): Promise<void> {
    if (!this.settings.custom.some((r) => r.id === id)) throw new ValidationError("val.ai.notCustom");
    this.settings.custom = this.settings.custom.filter((r) => r.id !== id);
    this.settings.disabled = this.settings.disabled.filter((x) => x !== id);
    if (this.settings.order) this.settings.order = this.settings.order.filter((x) => x !== id);
    delete this.settings.models[id];
    this.secrets.delete(`ai.${id}.key`);
    this.probes.delete(id);
    this.router.resetHealth(id);
    this.save();
  }

  /**
   * Khởi động cổng gom cục bộ (OmniRoute hoặc 9router — cùng nghe cổng 20128, đường dẫn /v1) nếu đã cài global bằng npm, rồi chờ nó sẵn sàng tối đa `waitMs`.
   * Thử lần lượt từng lệnh; lệnh không cài thì shell thoát ngay với mã lỗi nên chuyển sang lệnh kế tiếp ngay (không đợi hết giờ).
   * Lệnh là hằng số, không nhận tham số từ người dùng.
   */
  async startOmniRoute(waitMs = 25_000): Promise<ActionResult> {
    await this.refresh();
    if (this.probes.get("omniroute")?.state === "ready") return result(true, "ai.omni.running");
    const commands = ["omniroute", "9router"];
    const slice = Math.max(1, Math.floor(waitMs / commands.length));
    for (const cmd of commands) {
      let dead = false;
      try {
        const child = (this.opts.spawnImpl ?? spawn)(cmd, [], { shell: true, detached: true, stdio: "ignore", windowsHide: true });
        child.on("error", () => {
          dead = true;
        });
        child.on("exit", (code) => {
          if (code !== 0) dead = true;
        });
        child.unref();
      } catch {
        continue;
      }
      const deadline = this.now() + slice;
      while (this.now() < deadline && !dead) {
        await new Promise((r) => setTimeout(r, this.opts.omniPollMs ?? 1500));
        await this.refresh();
        const st = this.probes.get("omniroute");
        if (st?.state === "ready") return result(true, "ai.omni.started");
        if (st?.state === "no-key") return result(false, "ai.omni.needsKey");
      }
    }
    return result(false, "ai.omni.failed");
  }
}
