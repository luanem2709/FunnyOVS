/**
 * Lớp Token Budget — TÁC GIẢ KHÔNG BAO GIỜ ĐƯỢC SỬA.
 *
 * - Đối tượng bị `Object.freeze` → không agent nào gán thêm/thay thế thuộc tính được.
 * - State nằm trong #private fields (Object.freeze không chặn được) nhưng chỉ `configure()`
 *   với token nội bộ mới sửa được. Server giữ token, agent không có đường tới token.
 * - Mọi hoạt động tự học dùng chung lớp này nhưng có "thẻ ngân sách" riêng.
 */
export interface TokenUsage {
  used: number;
  limit: number;
  resetAt: string;
}

export type WalletKind = "normal" | "learning";

/** Token nội bộ: chỉ server giữ, agent không truy cập được. */
const CONFIG_TOKEN = Symbol("office3d.budget.config-token");

export class TokenBudget {
  #dailyLimit = 500_000;
  #learningPercent = 10;
  #used = 0;
  #learningUsed = 0;
  #resetAt = nextMidnight();
  #listeners: Array<(s: { total: TokenUsage; learning: TokenUsage }) => void> = [];
  #token: symbol | null = null;

  constructor(locked = true) {
    if (locked) Object.freeze(this);
  }

  /** Chỉ server gọi, giữ token ở biến riêng (không export). */
  issueConfigToken(): symbol {
    this.#token = CONFIG_TOKEN;
    return CONFIG_TOKEN;
  }

  get #learningLimit(): number {
    return Math.floor((this.#dailyLimit * this.#learningPercent) / 100);
  }

  #isLearningLocked(kind: WalletKind): boolean {
    if (kind !== "learning") return false;
    return this.#used + this.#learningUsed >= this.#dailyLimit;
  }

  canSpend(kind: WalletKind, amount: number): boolean {
    if (this.#isLearningLocked(kind)) return false;
    if (kind === "learning") return this.#learningUsed + amount <= this.#learningLimit;
    return this.#used + amount <= this.#dailyLimit;
  }

  spend(kind: WalletKind, amount: number): boolean {
    if (!this.canSpend(kind, amount)) return false;
    if (kind === "learning") this.#learningUsed += amount;
    else this.#used += amount;
    this.#emit();
    return true;
  }

  getUsage(kind: WalletKind = "normal"): TokenUsage {
    if (kind === "learning") {
      return { used: this.#learningUsed, limit: this.#learningLimit, resetAt: this.#resetAt };
    }
    return { used: this.#used, limit: this.#dailyLimit, resetAt: this.#resetAt };
  }

  /**
   * Đổi cấu hình — CHỈ được gọi khi kèm token hợp lệ.
   * Agent không có token ⇒ không thể tăng hạn mức hay mở rộng quyền.
   */
  configure(opts: { dailyLimit?: number; learningPercent?: number }, token?: symbol): boolean {
    if (token !== this.#token) return false;
    if (opts.dailyLimit !== undefined) {
      this.#dailyLimit = Math.max(1000, Math.floor(opts.dailyLimit));
    }
    if (opts.learningPercent !== undefined) {
      this.#learningPercent = Math.max(0, Math.min(50, Math.floor(opts.learningPercent)));
    }
    this.#emit();
    return true;
  }

  maybeReset(): void {
    if (new Date() > new Date(this.#resetAt)) {
      this.#used = 0;
      this.#learningUsed = 0;
      this.#resetAt = nextMidnight();
      this.#emit();
    }
  }

  onChange(cb: (s: { total: TokenUsage; learning: TokenUsage }) => void): void {
    this.#listeners.push(cb);
  }

  #emit(): void {
    const s = { total: this.getUsage("normal"), learning: this.getUsage("learning") };
    for (const l of this.#listeners) l(s);
  }
}

function nextMidnight(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}
