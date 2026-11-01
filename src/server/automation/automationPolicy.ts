/**
 * Chế độ tự động 3 mức + giới hạn vòng lặp/thời gian/trang.
 */
export type AutomationLevel = "ask" | "balanced" | "autonomous";

export const AUTOMATION_LEVELS: AutomationLevel[] = ["ask", "balanced", "autonomous"];

export const LEVEL_LABELS: Record<AutomationLevel, string> = {
  ask: "Chỉ hỏi",
  balanced: "Cân bằng",
  autonomous: "Tự chủ cao",
};

export interface AutomationPolicy {
  level: AutomationLevel;
  /** Có tự học khi rảnh không. */
  selfLearning: boolean;
  /** Số vòng lặp tối đa mỗi tác vụ. */
  maxIterations: number;
  /** Thời gian tối đa mỗi tác vụ (ms). */
  maxDurationMs: number;
  /** Số trang tối đa mỗi tác vụ. */
  maxPages: number;
  /** Có tự đề xuất thay đổi mã nguồn không. */
  allowSelfProposals: boolean;
}

export function policyForLevel(level: AutomationLevel, overrides: Partial<AutomationPolicy> = {}): AutomationPolicy {
  const base: AutomationPolicy =
    level === "ask"
      ? {
          level,
          selfLearning: false,
          maxIterations: 3,
          maxDurationMs: 45_000,
          maxPages: 5,
          allowSelfProposals: false,
        }
      : level === "balanced"
        ? {
            level,
            selfLearning: true,
            maxIterations: 8,
            maxDurationMs: 120_000,
            maxPages: 15,
            allowSelfProposals: true,
          }
        : {
            level,
            selfLearning: true,
            maxIterations: 16,
            maxDurationMs: 300_000,
            maxPages: 40,
            allowSelfProposals: true,
          };
  return { ...base, ...overrides };
}

/** Kiểm soát giới hạn cho một tác vụ tự chạy. */
export class TaskGuard {
  private pages = 0;
  private iterations = 0;
  private readonly startedAt = Date.now();
  private aborted = false;

  constructor(private policy: AutomationPolicy) {}

  check(): { ok: boolean; reason?: string } {
    if (this.aborted) return { ok: false, reason: "Tác vụ đã bị dừng khẩn cấp." };
    if (this.iterations >= this.policy.maxIterations) {
      return { ok: false, reason: `Đã đạt giới hạn ${this.policy.maxIterations} vòng lặp.` };
    }
    if (Date.now() - this.startedAt > this.policy.maxDurationMs) {
      return { ok: false, reason: `Đã đạt giới hạn thời gian ${this.policy.maxDurationMs}ms.` };
    }
    if (this.pages >= this.policy.maxPages) {
      return { ok: false, reason: `Đã đạt giới hạn ${this.policy.maxPages} trang.` };
    }
    return { ok: true };
  }

  nextIteration(): void {
    this.iterations++;
  }

  nextPage(): void {
    this.pages++;
  }

  abort(): void {
    this.aborted = true;
  }

  get stats(): { pages: number; iterations: number; elapsedMs: number } {
    return { pages: this.pages, iterations: this.iterations, elapsedMs: Date.now() - this.startedAt };
  }
}
