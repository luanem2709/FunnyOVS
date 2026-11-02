/**
 * Bộ điều phối tác vụ — Phase 4.
 *
 * Luồng một tác vụ:
 *   1. ƯỚC LƯỢNG chi phí token (trước khi gọi LLM)
 *   2. NẾU vượt ngưỡng → TẠO YÊU CẦU DUYỆT, dừng lại, chờ người dùng
 *   3. Kiểm tra Token Budget (ví + trần tác vụ + trần ngày)
 *   4. Gọi backend LLM (Cursor CLI trước)
 *   5. Ghi ledger + cập nhật ngân sách + đẩy trạng thái lên 3D
 */
import { randomUUID } from "node:crypto";
import type { TokenBudget, WalletKind } from "../budget/tokenBudget.js";
import type { TokenLedger, QuotaSource } from "../budget/tokenLedger.js";
import { estimateTask, type Estimation } from "../budget/estimation.js";
import { runCursorAgent, type CursorAgentMode } from "../budget/cursorAgent.js";
import { pricingFor, estimateCost } from "../budget/estimation.js";

export type TaskStatus = "pending" | "awaiting-approval" | "running" | "done" | "failed" | "rejected";

export interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  agentId: string;
  agentName: string;
  department: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  estimation?: Estimation;
  result?: string;
  error?: string;
  model?: string;
  backend?: string;
  tokens?: number;
  costCents?: number;
  quotaSource?: QuotaSource;
  /** Lý do cần người dùng duyệt. */
  approvalReason?: string;
  /** Đây là tác vụ tự học (dùng ví learning). */
  wallet: WalletKind;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  title: string;
  agentId: string;
  agentName: string;
  department: string;
  reason: string;
  estimation: Estimation;
  createdAt: string;
}

export interface TaskRunnerDeps {
  budget: TokenBudget;
  ledger: TokenLedger;
  workspace: string;
  /** Gọi khi trạng thái tác vụ thay đổi (để đẩy lên 3D). */
  onUpdate?: (task: TaskRecord) => void;
  /** Gửi yêu cầu duyệt lên 3D. */
  onApprovalNeeded?: (req: ApprovalRequest) => void;
  /** Đọc % hạn mức Cursor hiện tại (để ghi vào ledger). */
  getCursorPercentUsed?: () => number | undefined;
  /** Model mặc định. */
  defaultModel?: string;
  /** Chỉ cho dùng "auto" (gói Free). */
  freeTierOnly?: boolean;
  /**
   * Timeout cứng cho một lượt Cursor CLI (ms).
   * Mặc định 300_000 — lượt thật đo được 261s nên 120s là quá ngắn và khiến
   * task luôn fail với "quá thời gian" dù CLI đang chạy tốt.
   */
  taskTimeoutMs?: number;
  /** Có cho phép tự chủ cao không (bỏ qua bước duyệt ước lượng). */
  autonomous?: boolean;
  /** Đọc động chế độ tự động hiện tại (để đổi lúc runtime không cần restart). */
  isAutonomous?: () => boolean;
  /** Được gọi khi tác vụ thất bại — để tạo đề xuất tự sửa (không tự áp dụng). */
  onSelfPropose?: (p: { agentId: string; agentName: string; title: string; rationale: string }) => void;
  /** Gọi LLM. Mặc định dùng Cursor CLI; test có thể thay bằng hàm giả. */
  runLlm?: typeof runCursorAgent;
}

export class TaskRunner {
  private tasks = new Map<string, TaskRecord>();
  private approvals = new Map<string, ApprovalRequest>();
  private seq = 0;

  constructor(private readonly deps: TaskRunnerDeps) {}

  list(): TaskRecord[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  listApprovals(): ApprovalRequest[] {
    return [...this.approvals.values()];
  }

  /**
   * Tạo + chạy một tác vụ. Trả về bản ghi tác vụ.
   * Nếu cần duyệt → tác vụ ở trạng thái "awaiting-approval", chưa gọi LLM.
   */
  async submit(input: {
    title: string;
    prompt: string;
    agentId: string;
    agentName: string;
    department: string;
    context?: string;
    toolSteps?: number;
    mode?: CursorAgentMode;
    wallet?: WalletKind;
  }): Promise<TaskRecord> {
    const id = `task_${++this.seq}_${randomUUID().slice(0, 8)}`;
    const wallet = input.wallet ?? "normal";

    const estimation = estimateTask(
      { prompt: input.prompt, context: input.context, toolSteps: input.toolSteps },
      { freeTierOnly: this.deps.freeTierOnly },
    );

    const task: TaskRecord = {
      id,
      title: input.title,
      prompt: input.prompt,
      agentId: input.agentId,
      agentName: input.agentName,
      department: input.department,
      status: "pending",
      createdAt: new Date().toISOString(),
      estimation,
      wallet,
    };
    this.tasks.set(id, task);

    // Bước 1: cần người dùng duyệt?
    const autonomous = this.deps.isAutonomous?.() ?? this.deps.autonomous ?? false;
    if (estimation.needsApproval && !autonomous) {
      task.status = "awaiting-approval";
      task.approvalReason = estimation.reason;
      const req: ApprovalRequest = {
        id: `apr_${id}`,
        taskId: id,
        title: input.title,
        agentId: input.agentId,
        agentName: input.agentName,
        department: input.department,
        reason: estimation.reason ?? "",
        estimation,
        createdAt: new Date().toISOString(),
      };
      this.approvals.set(req.id, req);
      this.deps.onApprovalNeeded?.(req);
      this.#emit(task);
      return task;
    }

    await this.#run(task, input.mode);
    return task;
  }

  /** Người dùng duyệt yêu cầu → chạy tiếp. */
  async approve(approvalId: string): Promise<TaskRecord | undefined> {
    const req = this.approvals.get(approvalId);
    if (!req) return undefined;
    this.approvals.delete(approvalId);
    const task = this.tasks.get(req.taskId);
    if (!task) return undefined;
    task.status = "pending";
    task.approvalReason = undefined;
    await this.#run(task);
    return task;
  }

  /** Người dùng từ chối. */
  reject(approvalId: string): TaskRecord | undefined {
    const req = this.approvals.get(approvalId);
    if (!req) return undefined;
    this.approvals.delete(approvalId);
    const task = this.tasks.get(req.taskId);
    if (!task) return undefined;
    task.status = "rejected";
    task.finishedAt = new Date().toISOString();
    task.error = "Người dùng từ chối.";
    this.#emit(task);
    return task;
  }

  /** Hủy tác vụ đang chờ duyệt hoặc đang chạy. */
  cancel(taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    task.status = "rejected";
    task.error = "Đã hủy.";
    task.finishedAt = new Date().toISOString();
    this.#emit(task);
    return task;
  }

  async #run(task: TaskRecord, mode?: CursorAgentMode): Promise<void> {
    // Bước 2: kiểm tra ngân sách
    const est = task.estimation!;

    // Trần mỗi tác vụ là chốt chặn CỨNG — kể cả ở chế độ tự chủ cao,
    // nếu không thì một yêu cầu khổng lồ sẽ đốt sạch hạn mức.
    const perTaskLimit = this.deps.budget.getPerTaskLimit();
    if (est.estimatedTokens > perTaskLimit) {
      task.status = "failed";
      task.error = `Ước lượng ${est.estimatedTokens.toLocaleString()} token vượt trần mỗi tác vụ (${perTaskLimit.toLocaleString()}). Hãy chia nhỏ tác vụ.`;
      task.finishedAt = new Date().toISOString();
      this.#emit(task);
      return;
    }

    if (!this.deps.budget.canSpend(task.wallet, est.estimatedTokens)) {
      task.status = "failed";
      task.error = "Không đủ hạn mức token để chạy tác vụ này.";
      task.finishedAt = new Date().toISOString();
      this.#emit(task);
      return;
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();
    task.model = this.deps.defaultModel ?? est.suggestedModel;
    task.backend = "cursor-agent";
    this.#emit(task);

    const result = await (this.deps.runLlm ?? runCursorAgent)({
      prompt: task.prompt,
      workspace: this.deps.workspace,
      model: task.model,
      mode,
      timeoutMs: this.deps.taskTimeoutMs ?? 300_000,
    });

    // Bước 3: ghi ledger + trừ ngân sách
    const usage = result.usage;
    const totalTokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    const pricing = pricingFor(task.model ?? "auto");
    const costCents = estimateCost(pricing, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens) * 100;

    const quotaSource: QuotaSource = totalTokens > 0 ? "cli-usage" : "estimated";
    this.deps.ledger.add({
      taskId: task.id,
      department: task.department,
      agentId: task.agentId,
      agentName: task.agentName,
      model: task.model ?? "auto",
      backend: "cursor-agent",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costCents,
      wallet: task.wallet,
      cursorPercentUsed: this.deps.getCursorPercentUsed?.(),
      quotaSource,
      durationMs: result.durationMs,
      ok: result.ok,
      error: result.error,
    });

    if (totalTokens > 0) {
      this.deps.budget.spend(task.wallet, totalTokens);
    }

    task.tokens = totalTokens;
    task.costCents = costCents;
    task.quotaSource = quotaSource;

    if (result.ok) {
      task.status = "done";
      task.result = result.text;
    } else {
      task.status = "failed";
      task.error = result.error ?? "Lỗi không xác định.";
      if (result.quotaExhausted) task.error = `Đã chạm hạn mức Cursor: ${task.error}`;
      // Tự đề xuất sửa (self-dev): agent không tự sửa mã, chỉ tạo đề xuất.
      this.deps.onSelfPropose?.({
        agentId: task.agentId,
        agentName: task.agentName,
        title: `Xử lý lỗi: ${task.title}`,
        rationale: `Tác vụ thất bại với lỗi: ${task.error}`,
      });
    }
    task.finishedAt = new Date().toISOString();
    this.#emit(task);
  }

  #emit(task: TaskRecord): void {
    this.deps.onUpdate?.(task);
  }
}
