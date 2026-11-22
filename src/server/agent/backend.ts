/**
 * Chọn "bộ não" cho một tác vụ:
 *   router        → agent ReAct có công cụ thật, chạy trên nhà cung cấp AI tự kết nối (OmniRoute / Ollama / API miễn phí…)
 *   cursor-agent  → Cursor CLI (tuỳ chọn nâng cao, cần đăng nhập Cursor)
 *   auto          → router nếu có nhà cung cấp sẵn sàng; không thì Cursor nếu đã đăng nhập; không thì báo lỗi hướng dẫn kết nối AI
 *   rule          → không gọi LLM
 */
import type { CursorAgentOptions, CursorAgentResult } from "../budget/cursorAgent.js";
import type { AiHub } from "../ai/hub.js";
import type { AgentRegistry } from "../agents/agentRegistry.js";
import { runAgent } from "./executor.js";
import { toolsForAgent, type ToolDef } from "./tools.js";
import { msg, type Lang } from "../../shared/messages.js";

export interface RunLlmOptions extends CursorAgentOptions {
  agentId?: string;
  agentName?: string;
  department?: string;
  lang?: Lang;
  taskId?: string;
}

export type UsageSource = "provider-usage" | "cli-usage" | "estimated";

export interface RunLlmResult extends CursorAgentResult {
  backend?: string;
  usageSource?: UsageSource;
  steps?: number;
}

export type RunLlm = (opts: RunLlmOptions) => Promise<RunLlmResult>;
export type BackendSetting = "auto" | "router" | "cursor-agent" | "rule";

export interface BackendDeps {
  hub: Pick<AiHub, "chat" | "status" | "hasProvider">;
  tools: ToolDef[];
  registry: Pick<AgentRegistry, "get">;
  cursor: (o: CursorAgentOptions) => Promise<CursorAgentResult>;
  cursorAvailable: () => boolean;
  setting: () => BackendSetting;
  company: () => string;
  maxSteps?: () => number;
}

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function noBackend(lang: Lang, key: string): RunLlmResult {
  return { ok: false, text: "", usage: ZERO, durationMs: 0, error: msg(lang, key), errorKey: key };
}

export function createRunLlm(deps: BackendDeps): RunLlm {
  return async (opts) => {
    const lang = opts.lang ?? "vi";
    const setting = deps.setting();
    if (setting === "rule") return noBackend("vi", "err.ai.noProvider");

    let useRouter = setting === "router";
    if (setting === "auto") {
      await deps.hub.status(); // dò mới nếu cache cũ
      useRouter = deps.hub.hasProvider();
      if (!useRouter && !deps.cursorAvailable()) useRouter = true; // để router báo lỗi hướng dẫn kết nối AI
    }
    if (!useRouter) return { ...(await deps.cursor(opts)), backend: "cursor-agent" };

    const base = deps.registry.get(opts.agentId ?? "");
    const roleKey = `role.${base?.id ?? ""}`;
    const localizedRole = msg(lang, roleKey);
    const agent = {
      id: base?.id ?? opts.agentId ?? "agent",
      name: base?.name ?? opts.agentName ?? "Agent",
      department: base?.department ?? opts.department ?? "dispatch",
      tier: base?.tier ?? 3,
      role: localizedRole !== roleKey ? localizedRole : (base?.role ?? "Assistant"),
    };
    let tools = toolsForAgent(deps.tools, agent);
    if (opts.mode === "plan" || opts.mode === "ask") tools = tools.filter((t) => t.risk === "read");

    const res = await runAgent({
      agent,
      company: deps.company(),
      prompt: opts.prompt,
      lang,
      chat: (m, o) => deps.hub.chat(m, o),
      tools,
      allToolNames: deps.tools.map((t) => t.name),
      maxSteps: deps.maxSteps?.() ?? 6,
      timeoutMs: Math.max(opts.timeoutMs ?? 0, 150_000),
    });
    const usage = { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 };
    return {
      ok: res.ok,
      text: res.text,
      usage,
      model: res.model,
      durationMs: res.durationMs,
      error: res.error ? (res.error.key ? msg(lang, res.error.key, res.error.vars) : res.error.text) : undefined,
      errorKey: res.error?.key,
      errorVars: res.error?.vars,
      backend: `router:${res.providerId ?? "none"}`,
      usageSource: "provider-usage",
      steps: res.steps.length,
    };
  };
}
