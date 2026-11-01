/**
 * Lớp Token Budget — TÁC GIẢ KHÔNG BAO GIỚ ĐƯỢC SỬA.
 *
 * - Đối tượng bị `Object.freeze` → không agent nào gán thêm/thay thế thuộc tính được.
 * - State nằm trong #private fields (Object.freeze không chặn được) nhưng chỉ `configure()`
 *   với token nội bộ mới sửa được. Server giữ token, agent không có đường tới token.
 * - Mọi hoạt động tự học dùng chung lớp này nhưng có "thẻ ngân sách" riêng.
 * - Trạng thái được khôi phục từ ledger (SQLite) nên server khởi động lại không mất số liệu.
 */
import type { TokenLedger, LedgerEntry, WalletKind as LedgerWalletKind, QuotaSource } from "./tokenLedger.js";

export interface TokenUsage {
  used: number;
  limit: number;
  resetAt: string;
}

export type WalletKind = "normal" | "learning";

/** Trạng thái hạn mức Cursor (đọc từ API nội bộ của Cursor). */
export interface QuotaSnapshot {
  available: boolean;
  planName?: string;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
  cycleEnd?: string;
  includedLimitZero?: boolean;
  error?: string;
  /** Thời điểm đọc được. */
  readAt: string;
}

/** Token nội bộ: chỉ server giữ, agent không truy cập được. */
const CONFIG_TOKEN = Symbol("office3d.budget.config-token");

export interface BudgetSnapshot {
  total: TokenUsage;
  learning: TokenUsage;
  weekly: { used: number; limit: number };
  /** Phần trăm đã dùng ví chính (0..1). */
  ratio: number;
  /** Đã cảnh báo chưa (để không spam). */
  warned: boolean;
  /** Đã khoá hay chưa. */
  locked: boolean;
  quota?: QuotaSnapshot;
}

export class TokenBudget {
  #dailyLimit = 150_000;
  #weeklyLimit = 900_000;
  #learningPercent = 10;
  #perTaskLimit = 200_000;
  #warnRatio = 0.8;
  #used = 0;
  #learningUsed = 0;
  #weekUsed = 0;
  #resetAt = nextMidnight();
  #warned = false;
  #locked = false;
  #quota: QuotaSnapshot | undefined;
  #listeners: Array<(s: BudgetSnapshot) => void> = [];
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

  /**
   * Ví học bị khoá khi: hết ví học riêng, HOẶC tổng đã chạm trần ngày/tuần.
   * Như vậy học không ăn ví chính, mà học cũng không thể làm vượt trần tổng.
   */
  #isLearningLocked(kind: WalletKind): boolean {
    if (kind !== "learning") return false;
    if (this.#used + this.#learningUsed >= this.#dailyLimit) return true;
    if (this.#weekUsed + this.#learningUsed >= this.#weeklyLimit) return true;
    return false;
  }

  canSpend(kind: WalletKind, amount: number): boolean {
    if (this.#locked) return false;
    if (this.#isLearningLocked(kind)) return false;
    if (kind === "learning") return this.#learningUsed + amount <= this.#learningLimit;
    if (this.#used + amount > this.#dailyLimit) return false;
    if (this.#weekUsed + amount > this.#weeklyLimit) return false;
    return true;
  }

  spend(kind: WalletKind, amount: number): boolean {
    if (!this.canSpend(kind, amount)) return false;
    if (kind === "learning") this.#learningUsed += amount;
    else this.#used += amount;
    this.#weekUsed += amount;
    this.#evaluate();
    this.#emit();
    return true;
  }

  /** Trừ lại khi một lượt LLM thất bại (đã trừ tạm rồi). */
  refund(kind: WalletKind, amount: number): void {
    if (amount <= 0) return;
    if (kind === "learning") this.#learningUsed = Math.max(0, this.#learningUsed - amount);
    else this.#used = Math.max(0, this.#used - amount);
    this.#weekUsed = Math.max(0, this.#weekUsed - amount);
    this.#emit();
  }

  getUsage(kind: WalletKind = "normal"): TokenUsage {
    if (kind === "learning") {
      return { used: this.#learningUsed, limit: this.#learningLimit, resetAt: this.#resetAt };
    }
    return { used: this.#used, limit: this.#dailyLimit, resetAt: this.#resetAt };
  }

  getWeekly(): { used: number; limit: number } {
    return { used: this.#weekUsed, limit: this.#weeklyLimit };
  }

  getPerTaskLimit(): number {
    return this.#perTaskLimit;
  }

  /** Đã khoá chưa (đạt 100% hạn mức). */
  isLocked(): boolean {
    return this.#locked;
  }

  getQuota(): QuotaSnapshot | undefined {
    return this.#quota;
  }

  /**
   * Đặt snapshot hạn mức Cursor. Hàm này KHÔNG dùng để quyết định khoá —
   * vì gói Free không có trần token (`includedLimitZero`), nên ta chỉ dùng nó
   * để cảnh báo sớm.
   */
  setQuota(q: QuotaSnapshot): void {
    this.#quota = q;
    this.#emit();
  }

  /**
   * Đổi cấu hình — CHỈ được gọi khi kèm token hợp lệ.
   * Agent không có token ⇒ không thể tăng hạn mức hay mở rộng quyền.
   */
  configure(
    opts: {
      dailyLimit?: number;
      weeklyLimit?: number;
      learningPercent?: number;
      perTaskLimit?: number;
      warnRatio?: number;
    },
    token?: symbol,
  ): boolean {
    if (token !== this.#token) return false;
    if (opts.dailyLimit !== undefined) {
      this.#dailyLimit = Math.max(1000, Math.floor(opts.dailyLimit));
    }
    if (opts.weeklyLimit !== undefined) {
      this.#weeklyLimit = Math.max(this.#dailyLimit, Math.floor(opts.weeklyLimit));
    }
    if (opts.learningPercent !== undefined) {
      this.#learningPercent = Math.max(0, Math.min(50, Math.floor(opts.learningPercent)));
    }
    if (opts.perTaskLimit !== undefined) {
      this.#perTaskLimit = Math.max(1000, Math.floor(opts.perTaskLimit));
    }
    if (opts.warnRatio !== undefined) {
      this.#warnRatio = Math.max(0.5, Math.min(1, opts.warnRatio));
    }
    this.#evaluate();
    this.#emit();
    return true;
  }

  /** Khôi phục số liệu từ ledger (gọi lúc khởi động server). */
  restoreFromLedger(ledger: TokenLedger): void {
    const t = ledger.totalsToday();
    this.#used = t.normal;
    this.#learningUsed = t.learning;
    this.#weekUsed = t.normal + t.learning;
    this.#evaluate();
    this.#emit();
  }

  /** Ghi một lượt chi tiêu vào ledger và trừ ví tương ứng. */
  record(entry: {
    wallet: LedgerWalletKind;
    totalTokens: number;
    costCents: number;
    cursorPercentUsed?: number;
    quotaSource: QuotaSource;
  }): boolean {
    const ok = this.spend(entry.wallet, entry.totalTokens);
    if (!ok) return false;
    this.#emit();
    return true;
  }

  maybeReset(): void {
    if (new Date() > new Date(this.#resetAt)) {
      this.#used = 0;
      this.#learningUsed = 0;
      this.#resetAt = nextMidnight();
      this.#warned = false;
      this.#locked = false;
      this.#evaluate();
      this.#emit();
    }
  }

  /** Đánh giá ngưỡng 80% / 100%. */
  #evaluate(): void {
    const ratio = this.#dailyLimit > 0 ? this.#used / this.#dailyLimit : 0;
    if (ratio >= 1) this.#locked = true;
    else if (ratio < this.#warnRatio) this.#warned = false;
  }

  /** Đã vượt ngưỡng cảnh báo chưa (dùng 1 lần để phát cảnh báo). */
  shouldWarn(): boolean {
    const ratio = this.#dailyLimit > 0 ? this.#used / this.#dailyLimit : 0;
    if (ratio >= this.#warnRatio && !this.#warned) {
      this.#warned = true;
      return true;
    }
    return false;
  }

  snapshot(): BudgetSnapshot {
    const ratio = this.#dailyLimit > 0 ? this.#used / this.#dailyLimit : 0;
    return {
      total: this.getUsage("normal"),
      learning: this.getUsage("learning"),
      weekly: this.getWeekly(),
      ratio,
      warned: this.#warned,
      locked: this.#locked,
      quota: this.#quota,
    };
  }

  onChange(cb: (s: BudgetSnapshot) => void): void {
    this.#listeners.push(cb);
  }

  #emit(): void {
    const s = this.snapshot();
    for (const l of this.#listeners) l(s);
  }
}

function nextMidnight(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

export type { LedgerEntry };
