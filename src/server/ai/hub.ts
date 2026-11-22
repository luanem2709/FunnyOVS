/**
 * AiHub — "tự động kết nối AI": dò OmniRoute/Ollama/LM Studio, nhận khoá miễn phí từ biến môi trường hoặc kho khoá,
 * dựng chuỗi dự phòng theo ưu tiên và cung cấp `chat()` cho phần còn lại của app.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CATALOG, pickModel, providerDef } from "./catalog.js";
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

interface Settings {
  disabled: string[];
  /** Ghi đè thứ tự ưu tiên (danh sách id). */
  order?: string[];
  models: Record<string, string>;
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

export class AiHub {
  readonly secrets: SecretStore;
  readonly router: LlmRouter;
  private settings: Settings = { disabled: [], models: {} };
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
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
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
      const defs = CATALOG.filter((d) => this.isConfigured(d));
      const results = await Promise.all(defs.map(async (d) => [d.id, await this.probeOne(d)] as const));
      for (const [id, p] of results) this.probes.set(id, p);
    })().finally(() => {
      this.probing = null;
    });
    return this.probing;
  }

  private async ensureFresh(): Promise<void> {
    const oldest = Math.min(...[...this.probes.values()].map((p) => p.at), Infinity);
    if (this.probes.size === 0 || this.now() - oldest > this.ttl) await this.refresh();
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
    return CATALOG.filter((d) => this.isConfigured(d)).sort((a, b) => rank(a) - rank(b));
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
    await this.ensureFresh();
    const out: ResolvedProvider[] = [];
    for (const def of this.orderedDefs()) {
      if (!this.enabled(def.id)) continue;
      const r = this.resolve(def);
      if (r) out.push(r);
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
      } satisfies ProviderStatus;
    });
  }

  /** Gửi một yêu cầu nhỏ tới đúng nhà cung cấp này để kiểm tra (bỏ qua ngắt mạch). */
  async test(id: string): Promise<ActionResult & { latencyMs?: number; model?: string }> {
    if (!providerDef(id)) return result(false, "err.api.unknownProvider", { id: id.slice(0, 40) });
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
    if (!providerDef(id)) throw new Error("unknown AI provider");
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
    if (!providerDef(id)) throw new Error("unknown AI provider");
    const set = new Set(this.settings.disabled);
    if (enabled) set.delete(id);
    else set.add(id);
    this.settings.disabled = [...set];
    this.save();
  }

  setModel(id: string, model: string): void {
    if (!providerDef(id)) throw new Error("unknown AI provider");
    if (model.trim()) this.settings.models[id] = model.trim().slice(0, 120);
    else delete this.settings.models[id];
    this.router.resetHealth(id);
    this.save();
  }

  /**
   * Khởi động OmniRoute (nếu đã cài global bằng npm) và chờ nó sẵn sàng tối đa `waitMs`.
   * Lệnh là hằng số, không nhận tham số từ người dùng.
   */
  async startOmniRoute(waitMs = 25_000): Promise<ActionResult> {
    await this.refresh();
    if (this.probes.get("omniroute")?.state === "ready") return result(true, "ai.omni.running");
    try {
      const child = (this.opts.spawnImpl ?? spawn)("omniroute", [], { shell: true, detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", () => undefined);
      child.unref();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    const deadline = this.now() + waitMs;
    while (this.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.opts.omniPollMs ?? 1500));
      await this.refresh();
      const st = this.probes.get("omniroute");
      if (st?.state === "ready") return result(true, "ai.omni.started");
      if (st?.state === "no-key") return result(false, "ai.omni.needsKey");
    }
    return result(false, "ai.omni.failed");
  }
}
