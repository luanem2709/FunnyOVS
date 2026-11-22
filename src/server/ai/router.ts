/**
 * LlmRouter — gọi một danh sách nhà cung cấp OpenAI-compatible theo thứ tự ưu tiên, tự chuyển sang nguồn khác khi lỗi.
 *
 *  - Ngắt mạch (circuit breaker): lỗi liên tiếp → tạm nghỉ nguồn đó với thời gian tăng dần (15s, 30s, 60s… tối đa 5 phút).
 *  - 429: tôn trọng `Retry-After`; 401/403: nghỉ 10 phút và báo "khoá sai"; 404 vì sai model: tự dò `/models` rồi thử lại một lần.
 *  - 400 vì `response_format`: thử lại không dùng JSON mode.
 *  - Không bao giờ ném thông tin bí mật: mọi thông điệp lỗi đi qua `redact`.
 */
import { AiError, type AiAttempt, type ChatMessage, type ChatOptions, type ChatResult, type ProviderStats, type ResolvedProvider } from "./types.js";
import { aiErrorI18n } from "../../shared/aiErrors.js";
import { redact } from "../security/redact.js";

export interface RouterDeps {
  /** Danh sách ứng viên theo thứ tự ưu tiên (đã lọc theo trạng thái sẵn sàng). */
  candidates: () => Promise<ResolvedProvider[]>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Gọi khi model không tồn tại: trả danh sách model mới của nhà cung cấp (hoặc [] nếu không dò được). */
  rediscoverModels?: (p: ResolvedProvider) => Promise<{ model?: string; models: string[] }>;
  /** Các giá trị bí mật cần che khỏi thông điệp lỗi. */
  secrets?: () => string[];
  defaultTimeoutMs?: number;
  /** Gọi sau mỗi lần thành công (để ghi sổ cái). */
  onSuccess?: (r: ChatResult) => void;
}

const MAX_COOLDOWN_MS = 5 * 60_000;
const AUTH_COOLDOWN_MS = 10 * 60_000;

function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === "string" ? p : typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : ""))
      .join("");
  }
  return "";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class LlmRouter {
  private health = new Map<string, ProviderStats>();

  constructor(private readonly deps: RouterDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  stats(id: string): ProviderStats {
    let s = this.health.get(id);
    if (!s) {
      s = { calls: 0, failures: 0, consecutiveFailures: 0 };
      this.health.set(id, s);
    }
    return s;
  }

  isCooling(id: string): boolean {
    const until = this.health.get(id)?.cooldownUntil;
    return until !== undefined && until > this.now();
  }

  resetHealth(id?: string): void {
    if (id) this.health.delete(id);
    else this.health.clear();
  }

  private fail(id: string, err: AiError): void {
    const s = this.stats(id);
    s.failures++;
    s.consecutiveFailures++;
    s.lastError = err.message;
    const i18n = aiErrorI18n(err);
    s.lastErrorKey = i18n.key;
    s.lastErrorVars = i18n.vars;
    s.lastErrorStatus = err.status;
    let cooldown: number;
    if (err.status === 401 || err.status === 403) cooldown = AUTH_COOLDOWN_MS;
    else if (err.status === 429) cooldown = Math.min(MAX_COOLDOWN_MS, err.retryAfterMs ?? 60_000);
    else cooldown = Math.min(MAX_COOLDOWN_MS, 15_000 * 2 ** (s.consecutiveFailures - 1));
    s.cooldownUntil = this.now() + cooldown;
  }

  private ok(id: string, latencyMs: number): void {
    const s = this.stats(id);
    s.calls++;
    s.consecutiveFailures = 0;
    s.cooldownUntil = undefined;
    s.lastError = undefined;
    s.lastErrorKey = undefined;
    s.lastErrorVars = undefined;
    s.lastErrorStatus = undefined;
    s.lastLatencyMs = latencyMs;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    let candidates = await this.deps.candidates();
    if (opts.only) candidates = candidates.filter((c) => c.def.id === opts.only);
    else candidates = candidates.filter((c) => !this.isCooling(c.def.id));
    if (candidates.length === 0) {
      throw new AiError("NO_PROVIDER", "no AI provider is ready");
    }

    const attempts: AiAttempt[] = [];
    for (const provider of candidates) {
      if (opts.signal?.aborted) throw new AiError("ABORTED", "cancelled");
      try {
        const res = await this.callWithRecovery(provider, messages, opts);
        this.ok(provider.def.id, res.latencyMs);
        this.deps.onSuccess?.(res);
        return res;
      } catch (e) {
        const raw = redact(e instanceof Error ? e.message : String(e), this.deps.secrets?.() ?? []);
        const err = e instanceof AiError ? e : new AiError("NETWORK", raw, undefined, undefined, [], { detail: raw });
        if (err.code === "ABORTED") throw err;
        this.fail(provider.def.id, err);
        attempts.push({ providerId: provider.def.id, error: err.message, code: err.code, status: err.status, vars: err.vars });
      }
    }
    throw new AiError(
      "ALL_FAILED",
      `all AI providers failed: ${attempts.map((a) => `${a.providerId}: ${a.error}`).join(" | ")}`,
      undefined,
      undefined,
      attempts,
    );
  }

  private async callWithRecovery(p: ResolvedProvider, messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    let useJson = Boolean(opts.json && p.def.jsonMode);
    let rediscovered = false;
    for (let round = 0; round < 3; round++) {
      try {
        return await this.call(p, messages, opts, useJson);
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        const body = e.message.toLowerCase();
        if (e.status === 400 && useJson && /response_format|json_object|json mode/.test(body)) {
          useJson = false;
          continue;
        }
        if ((e.status === 404 || e.status === 400) && /model/.test(body) && !rediscovered && this.deps.rediscoverModels) {
          rediscovered = true;
          const found = await this.deps.rediscoverModels(p);
          if (found.model && found.model !== p.model) {
            p.model = found.model;
            p.models = found.models;
            continue;
          }
        }
        throw e;
      }
    }
    throw new AiError("BAD_RESPONSE", "retry limit exceeded");
  }

  private async call(p: ResolvedProvider, messages: ChatMessage[], opts: ChatOptions, json: boolean): Promise<ChatResult> {
    const f = this.deps.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.deps.defaultTimeoutMs ?? 60_000;
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
    const onAbort = (): void => ctrl.abort(new Error("aborted"));
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const started = this.now();
    const secrets = this.deps.secrets?.() ?? [];
    try {
      const res = await f(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          max_tokens: opts.maxTokens ?? 1200,
          temperature: opts.temperature ?? 0.3,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = redact((await res.text().catch(() => "")).slice(0, 300), secrets);
        const ra = Number(res.headers.get("retry-after"));
        const detail = body ? `: ${body}` : "";
        throw new AiError("HTTP", `HTTP ${res.status}${detail}`, res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined, [], { detail });
      }
      const data = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      } | null;
      const text = stripThinking(contentText(data?.choices?.[0]?.message?.content));
      if (!text) throw new AiError("BAD_RESPONSE", "provider returned an empty response");
      const inTok = data?.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join("\n"));
      const outTok = data?.usage?.completion_tokens ?? estimateTokens(text);
      return {
        text,
        usage: { inputTokens: inTok, outputTokens: outTok },
        providerId: p.def.id,
        model: p.model,
        latencyMs: this.now() - started,
      };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (opts.signal?.aborted) throw new AiError("ABORTED", "cancelled");
      if (ctrl.signal.aborted) {
        const sec = Math.max(1, Math.ceil(timeoutMs / 1000));
        throw new AiError("TIMEOUT", `timed out after ${sec}s`, undefined, undefined, [], { s: sec });
      }
      const text = redact(e instanceof Error ? e.message : String(e), secrets);
      throw new AiError("NETWORK", text, undefined, undefined, [], { detail: text });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
}
