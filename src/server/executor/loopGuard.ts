/**
 * Chống vòng lặp (GĐ 4).
 *
 * Yêu cầu: "Giới hạn bước/thời gian/token mỗi tác vụ, chống vòng lặp
 * (lỗi giống 3 lần thì dừng)."
 *
 * Cơ chế: đếm chữ ký của (loại hành động + tham số đã chuẩn hóa + kết quả).
 * Nếu cùng một chữ ký lỗi xuất hiện `maxRepeats` lần → dừng.
 * Chữ ký lỗi KHÔNG tính lần lặp "bình thường" (cùng hành động nhưng thành công
 * là việc hợp lệ, ví dụ đọc cùng một file nhiều lần).
 */
export interface LoopGuardOptions {
  /** Số lần lặp lại cùng một lỗi thì dừng (mặc định 3). */
  maxRepeats?: number;
  /** Tổng số bước tối đa (mặc định 50). */
  maxSteps?: number;
  /** Tổng thời gian tối đa (ms). */
  maxDurationMs?: number;
  /** Tổng token tối đa (nếu biết trước). */
  maxTokens?: number;
}

export interface LoopCheckResult {
  ok: boolean;
  reason?: string;
  /** Loại giới hạn đã vượt. */
  limit?: "steps" | "duration" | "tokens" | "repeat";
}

/** Chuẩn hóa tham số để so sánh (bỏ qua thứ tự key, số lượng nhỏ khác nhau). */
function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number") return String(Math.round(value));
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalize).join(",");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .map((k) => `${k}=${normalize(o[k])}`)
      .join("&");
  }
  return String(value);
}

/** Chữ ký của một lần thử hành động. */
export function actionSignature(type: string, params: unknown, outcome: string): string {
  return `${type}|${normalize(params)}|${normalize(outcome)}`;
}

export class LoopGuard {
  private readonly maxRepeats: number;
  private readonly maxSteps: number;
  private readonly maxDurationMs: number;
  private readonly maxTokens: number;
  private readonly startedAt = Date.now();
  private steps = 0;
  private tokens = 0;
  private repeats = new Map<string, number>();

  constructor(opts: LoopGuardOptions = {}) {
    this.maxRepeats = opts.maxRepeats ?? 3;
    this.maxSteps = opts.maxSteps ?? 50;
    this.maxDurationMs = opts.maxDurationMs ?? 300_000;
    this.maxTokens = opts.maxTokens ?? 200_000;
  }

  /** Ghi nhận một bước đã thực hiện; trả về có vượt giới hạn không. */
  record(type: string, params: unknown, outcome: { ok: boolean; error?: string }): LoopCheckResult {
    this.steps++;
    // Chỉ lỗi mới tính lặp.
    if (!outcome.ok) {
      const sig = actionSignature(type, params, outcome.error ?? "error");
      const n = (this.repeats.get(sig) ?? 0) + 1;
      this.repeats.set(sig, n);
      if (n >= this.maxRepeats) {
        return {
          ok: false,
          limit: "repeat",
          reason: `Dừng: cùng một lỗi lặp lại ${n} lần (${truncate(outcome.error)}).`,
        };
      }
    }
    return this.check();
  }

  /** Kiểm tra các giới hạn tổng (bước / thời gian / token). */
  check(): LoopCheckResult {
    if (this.steps >= this.maxSteps) {
      return { ok: false, limit: "steps", reason: `Dừng: vượt giới hạn ${this.maxSteps} bước.` };
    }
    if (Date.now() - this.startedAt > this.maxDurationMs) {
      return {
        ok: false,
        limit: "duration",
        reason: `Dừng: vượt giới hạn thời gian ${this.maxDurationMs}ms.`,
      };
    }
    if (this.tokens > this.maxTokens) {
      return { ok: false, limit: "tokens", reason: `Dừng: vượt giới hạn ${this.maxTokens} token.` };
    }
    return { ok: true };
  }

  /** Cộng token đã dùng. */
  addTokens(n: number): void {
    this.tokens += Math.max(0, n);
  }

  get stats(): { steps: number; tokens: number; elapsedMs: number; repeats: number } {
    return {
      steps: this.steps,
      tokens: this.tokens,
      elapsedMs: Date.now() - this.startedAt,
      repeats: this.repeats.size,
    };
  }
}

function truncate(s: string | undefined, n = 120): string {
  if (!s) return "lỗi";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
