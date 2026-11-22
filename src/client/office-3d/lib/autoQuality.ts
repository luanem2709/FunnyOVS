/**
 * Tự hạ chất lượng đồ hoạ khi máy yếu.
 *
 * Mỗi khung hình báo thời gian cho `AutoQualityMonitor.tick()`. Bỏ qua giai đoạn khởi động (nạp asset, biên dịch shader); sau đó tính thời gian
 * trung bình theo từng cửa sổ N khung. Trung bình > ngưỡng ở 2 cửa sổ LIÊN TIẾP → trả "downgrade" đúng một lần rồi dừng (không bật lên lại tự động
 * để tránh nhấp nháy giữa hai mức). Khung hình quá dài (tab bị ẩn, máy treo thoáng qua) bị cắt trần để không gây hạ oan.
 */
export interface AutoQualityOptions {
  /** Bỏ qua khoảng đầu (ms) — nạp asset và biên dịch shader luôn chậm. */
  warmupMs?: number;
  /** Số khung mỗi cửa sổ đo. */
  windowFrames?: number;
  /** Thời gian khung trung bình (ms) coi là "chậm" (40 ms ≈ 25 FPS). */
  slowMs?: number;
  /** Số cửa sổ chậm liên tiếp trước khi hạ. */
  strikes?: number;
  /** Cắt trần một khung (ms). */
  clampMs?: number;
}

export type QualityVerdict = "downgrade" | null;

export class AutoQualityMonitor {
  private readonly o: Required<AutoQualityOptions>;
  private startedAt: number | null = null;
  private sum = 0;
  private n = 0;
  private slowWindows = 0;
  private done = false;
  /** Trung bình cửa sổ gần nhất (ms) — để hiển thị/gỡ lỗi. */
  lastMean = 0;

  constructor(options: AutoQualityOptions = {}) {
    this.o = { warmupMs: 4000, windowFrames: 90, slowMs: 40, strikes: 2, clampMs: 250, ...options };
  }

  /** Báo một khung hình (`dtMs` = thời gian khung, `nowMs` = đồng hồ tăng dần bất kỳ). */
  tick(dtMs: number, nowMs: number): QualityVerdict {
    if (this.done) return null;
    this.startedAt ??= nowMs;
    if (nowMs - this.startedAt < this.o.warmupMs) return null;
    this.sum += Math.min(this.o.clampMs, Math.max(0, dtMs));
    this.n++;
    if (this.n < this.o.windowFrames) return null;
    this.lastMean = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    this.slowWindows = this.lastMean > this.o.slowMs ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= this.o.strikes) {
      this.done = true;
      return "downgrade";
    }
    return null;
  }
}

export type QualitySetting = "auto" | "high" | "low";

/** Mức dựng thực tế: "auto" bắt đầu ở cao và rơi xuống thấp sau khi bị hạ. */
export function effectiveQuality(setting: QualitySetting, downgraded: boolean): "high" | "low" {
  return setting === "auto" ? (downgraded ? "low" : "high") : setting;
}
