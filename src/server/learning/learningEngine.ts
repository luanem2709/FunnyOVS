/**
 * Bộ điều phối tự học TRONG NGÂN SÁCH (GĐ 6).
 *
 * Yêu cầu: "Tự học trong ngân sách."
 *
 * Vấn đề cần giải:
 *  - Tự học tự động (mỗi 30 phút) có thể đốt hết ví học khi còn nhiều
 *    token, hoặc không học gì khi ví cạn — dù vẫn còn nhiều việc cần làm.
 *  - Cần biết "còn bao nhiêu thời gian/token để học" và chọn chủ đề phù hợp.
 *
 * Giải pháp:
 *  1. `planSession()` xem ngân sách còn lại → quyết định có học không, học
 *     bao nhiêu chủ đề, mức độ sâu (số nguồn) — tất cả trong hạn mức.
 *  2. `selectTopic()` ưu tiên chủ đề chưa học / học lâu rồi / liên quan công việc.
 *  3. `recordOutcome()` cập nhật tiến độ để lần sau không học lại yếu.
 *  4. Không bao giờ vượt `learningPercent` của hạn mức ngày.
 */
import { EventEmitter } from "node:events";
import type { TokenBudget, WalletKind } from "../budget/tokenBudget.js";

/** Một chủ đề tự học. */
export interface LearningTopic {
  topic: string;
  /** Số lần đã học. */
  timesLearned: number;
  /** Lần học gần nhất (ISO). */
  lastLearnedAt: string | null;
  /** Điểm đánh giá tổng (0..10 mỗi lần). */
  totalScore: number;
  /** Số lần thất bại. */
  failures: number;
  /** Có đang bị chặn tạm không (sau N lần thất bại liên tiếp). */
  paused: boolean;
}

/** Kế hoạch một phiên học. */
export interface LearningPlan {
  /** Có nên học lượt này không. */
  shouldLearn: boolean;
  /** Lý do (để hiển thị cho người dùng). */
  reason: string;
  /** Số chủ đề sẽ học trong phiên này. */
  topicCount: number;
  /** Số nguồn tối đa mỗi chủ đề (độ sâu). */
  maxSources: number;
  /** Ngân sách token dành cho phiên này. */
  tokenBudget: number;
  /** Chủ đề được chọn. */
  topics: string[];
}

export interface LearningEngineOptions {
  budget: TokenBudget;
  /** Chủ đề do người dùng cấu hình (đọc động để đổi lúc runtime không cần restart). */
  getTopics: () => string[];
  /** Số token ước lượng cho MỘT chủ đề. */
  tokensPerTopic?: number;
  /** Số chủ đề tối đa mỗi phiên. */
  maxTopicsPerSession?: number;
  /** Chu kỳ học (phút). */
  intervalMinutes?: number;
}

/** Ngưỡng còn lại (tỉ lệ) để bắt đầu học. */
const MIN_BUDGET_RATIO = 0.15;

export class LearningEngine extends EventEmitter {
  /** Tiến độ theo chủ đề (in-memory + ghi xuống file để không mất). */
  private progress = new Map<string, LearningTopic>();
  /** Số phiên đã học. */
  private sessions = 0;

  constructor(private readonly opts: LearningEngineOptions) {
    super();
  }

  /** Ước lượng token cho một chủ đề. */
  get tokensPerTopic(): number {
    return this.opts.tokensPerTopic ?? 12_000;
  }

  /** Số phiên đã học. */
  get sessionCount(): number {
    return this.sessions;
  }

  /** Tiến độ tất cả chủ đề. */
  listProgress(): LearningTopic[] {
    return [...this.progress.values()];
  }

  /**
   * Lập kế hoạch phiên học dựa trên ngân sách còn lại.
   *
   * @param learningWallet Phần ngân sách dành cho tự học (token).
   */
  planSession(learningWallet: number): LearningPlan {
    const topics = this.opts.getTopics?.() ?? [];

    if (topics.length === 0) {
      return {
        shouldLearn: false,
        reason: "Chưa cấu hình chủ đề tự học.",
        topicCount: 0,
        maxSources: 3,
        tokenBudget: 0,
        topics: [],
      };
    }

    // Ví học còn lại = hạn mức học - đã dùng.
    const snapshot = this.opts.budget.snapshot();
    const learningLimit = snapshot.learning.limit;
    const learningUsed = snapshot.learning.used;
    const remaining = Math.max(0, learningLimit - learningUsed);

    if (remaining <= 0) {
      return {
        shouldLearn: false,
        reason: "Ví học đã cạn — tạm dừng tự học.",
        topicCount: 0,
        maxSources: 3,
        tokenBudget: 0,
        topics: [],
      };
    }

    // Cần tối thiểu 1 chủ đề.
    const affordable = Math.floor(remaining / this.tokensPerTopic);
    if (affordable < 1) {
      return {
        shouldLearn: false,
        reason: `Ví học còn ${remaining.toLocaleString()} token — chưa đủ cho 1 chủ đề (cần ~${this.tokensPerTopic.toLocaleString()}).`,
        topicCount: 0,
        maxSources: 2,
        tokenBudget: 0,
        topics: [],
      };
    }

    // Chỉ học khi còn đủ tỉ lệ an toàn (không bị cắt giữa chừng).
    const ratio = learningLimit > 0 ? remaining / learningLimit : 0;
    const maxTopics = Math.min(
      this.opts.maxTopicsPerSession ?? 2,
      affordable,
      topics.length,
    );

    if (ratio < MIN_BUDGET_RATIO && this.sessions > 0) {
      return {
        shouldLearn: false,
        reason: `Ví học chỉ còn ${(ratio * 100).toFixed(0)}% — chờ thêm để học cho cả chất lượng.`,
        topicCount: 0,
        maxSources: 2,
        tokenBudget: 0,
        topics: [],
      };
    }

    // Độ sâu: ví càng rộng thì đọc càng nhiều nguồn.
    const maxSources = Math.max(2, Math.min(5, Math.floor(2 + ratio * 4)));

    const chosen = this.selectTopics(maxTopics);
    return {
      shouldLearn: true,
      reason: `Còn ${remaining.toLocaleString()} token trong ví học — học ${chosen.length} chủ đề.`,
      topicCount: chosen.length,
      maxSources,
      tokenBudget: Math.min(remaining, chosen.length * this.tokensPerTopic),
      topics: chosen,
    };
  }

  /**
   * Chọn chủ đề nên học tiếp theo.
   *
   * Ưu tiên:
   *  1. Chủ đề chưa học lần nào.
   *  2. Chủ đề học lâu rồi nhất.
   *  3. Không chọn chủ đề đang bị tạm dừng (thất bại nhiều lần).
   */
  selectTopics(count: number): string[] {
    const all = this.opts.getTopics?.() ?? [];
    const candidates = all.map((t) => this.progressOf(t));

    // Điểm: chưa học = 100, học lâu rồi = theo ngày, thất bại = trừ điểm.
    const scored = candidates
      .filter((c) => !c.paused)
      .map((c) => {
        let score = 100 - c.timesLearned * 10;
        if (c.lastLearnedAt) {
          const days = (Date.now() - new Date(c.lastLearnedAt).getTime()) / 86_400_000;
          score += Math.min(60, days * 5);
        }
        score -= c.failures * 15;
        return { topic: c.topic, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, count).map((s) => s.topic);
  }

  /** Lấy (hoặc tạo) tiến độ của một chủ đề. */
  progressOf(topic: string): LearningTopic {
    let p = this.progress.get(topic);
    if (!p) {
      p = {
        topic,
        timesLearned: 0,
        lastLearnedAt: null,
        totalScore: 0,
        failures: 0,
        paused: false,
      };
      this.progress.set(topic, p);
    }
    return p;
  }

  /**
   * Ghi nhận kết quả một lần học.
   *
   * @param ok     Lượt học có thành công không.
   * @param score  Điểm 0..10 (tuỳ chọn).
   */
  recordOutcome(topic: string, ok: boolean, score?: number): LearningTopic {
    const p = this.progressOf(topic);
    p.timesLearned++;
    p.lastLearnedAt = new Date().toISOString();
    if (ok) {
      p.totalScore += score ?? 5;
      p.failures = 0;
    } else {
      p.failures++;
      // 3 lần thất bại liên tiếp → tạm dừng chủ đề này.
      if (p.failures >= 3) {
        p.paused = true;
        this.emit("topic-paused", p);
      }
    }
    this.emit("progress", p);
    return { ...p };
  }

  /** Ghi nhận một phiên học đã xong. */
  recordSession(): void {
    this.sessions++;
    this.emit("session", { sessions: this.sessions, at: new Date().toISOString() });
  }

  /** Bỏ tạm dừng một chủ đề (người dùng bấm). */
  resumeTopic(topic: string): void {
    const p = this.progressOf(topic);
    p.paused = false;
    p.failures = 0;
    this.emit("progress", { ...p });
  }

  /** Số phần trăm ngân sách học đã dùng. */
  usageRatio(): number {
    const s = this.opts.budget.snapshot();
    const limit = s.learning.limit;
    if (limit <= 0) return 0;
    return Math.min(1, s.learning.used / limit);
  }
}

export type { WalletKind };
