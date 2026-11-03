/**
 * Vòng lặp hành động: LLM đề xuất → Executor thực thi → phản hồi → lặp lại.
 *
 * Đây là nơi LLM và Executor gặp nhau — nhưng chỉ qua HỢP ĐỒNG JSON.
 * LLM không bao giờ có đường tắt tới máy.
 */
import { Executor } from "./executor.js";
import { planActions, type PlanResult } from "./planner.js";
import { LoopGuard, type LoopGuardOptions } from "./loopGuard.js";
import type { Action } from "./actionSchema.js";

export interface ActionLoopResult {
  ok: boolean;
  /** Các hành động đã thực thi (kết quả từng bước). */
  steps: Array<{
    action: Action;
    ok: boolean;
    data?: unknown;
    error?: string;
    code?: string;
    durationMs?: number;
  }>;
  /** Hành động bị chặn (cần người dùng duyệt). */
  blocked: Array<{ action: Action; reason: string; code?: string }>;
  /** Tổng kết. */
  summary: string;
  /** Vì sao dừng (nếu dừng sớm). */
  stopReason?: string;
  stats: { steps: number; tokens: number; elapsedMs: number };
}

export interface ActionLoopDeps {
  executor: Executor;
  /** Hàm đề xuất hành động (mặc định dùng LLM thật). */
  planner?: typeof planActions;
  /** Giới hạn vòng lặp. */
  guard?: LoopGuardOptions;
  /** Số vòng lặp tối đa (mỗi vòng = 1 lượt LLM). */
  maxTurns?: number;
  /** Phiên có bị nhiễm không. */
  isTainted?: () => boolean;
}

/**
 * Chạy một chuỗi hành động cho tới khi thành công, hết lượt, hoặc bị chặn.
 */
export async function runActionLoop(
  agentId: string,
  agentName: string,
  goal: string,
  deps: ActionLoopDeps,
  initialContext = "",
): Promise<ActionLoopResult> {
  const executor = deps.executor;
  const planner = deps.planner ?? planActions;
  const maxTurns = deps.maxTurns ?? 3;
  const guard = new LoopGuard(deps.guard ?? { maxRepeats: 3, maxSteps: 30, maxDurationMs: 180_000 });

  const steps: ActionLoopResult["steps"] = [];
  const blocked: ActionLoopResult["blocked"] = [];
  let context = initialContext;
  let stopReason: string | undefined;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pre = guard.check();
    if (!pre.ok) {
      stopReason = pre.reason;
      break;
    }

    const plan: PlanResult = await planner(goal, context, deps.isTainted?.() ?? false);
    if (plan.fallback || plan.proposals.length === 0) {
      stopReason =
        plan.rejected.length > 0
          ? `Hành động không hợp lệ: ${plan.rejected[0].error}`
          : "LLM không đề xuất được hành động nào.";
      break;
    }

    let allOk = true;
    for (const proposal of plan.proposals) {
      const r = await executor.execute(agentId, agentName, proposal.raw, guard);
      steps.push({
        action: proposal.action,
        ok: r.ok,
        data: r.data,
        error: r.error,
        code: r.code,
        durationMs: r.durationMs,
      });

      if (r.needsApproval) {
        blocked.push({ action: proposal.action, reason: r.error ?? "Cần duyệt.", code: r.code });
        allOk = false;
        continue;
      }
      if (!r.ok) {
        allOk = false;
        // Lỗi → đưa vào ngữ cảnh để LLM tự sửa ở lượt sau.
        context += `\n[${proposal.action.type}] thất bại: ${r.error ?? "lỗi"}`;
        const g = guard.check();
        if (!g.ok) {
          stopReason = g.reason;
          break;
        }
      } else {
        context += `\n[${proposal.action.type}] ok: ${summarize(r.data)}`;
      }
    }

    if (stopReason) break;
    if (allOk) break;
  }

  const ok = steps.length > 0 && steps.every((s) => s.ok) && blocked.length === 0;
  return {
    ok,
    steps,
    blocked,
    summary: steps.length === 0 ? "Không có hành động nào được thực thi." : summarizeSteps(steps),
    stopReason,
    stats: guard.stats,
  };
}

function summarize(data: unknown): string {
  if (data === undefined || data === null) return "ok";
  if (typeof data === "string") return data.slice(0, 300);
  try {
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return String(data).slice(0, 300);
  }
}

function summarizeSteps(steps: ActionLoopResult["steps"]): string {
  const ok = steps.filter((s) => s.ok).length;
  const fail = steps.length - ok;
  return `Đã thực thi ${steps.length} hành động: ${ok} thành công, ${fail} thất bại.`;
}
