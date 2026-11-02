/**
 * Bộ điều tiết CHẤT LƯỢNG theo FPS (GĐ 3).
 *
 * Mục tiêu: giữ 60 fps trên laptop thường, tự hạ chất lượng khi FPS thấp,
 * tự nâng lại khi máy rảnh. Ba mức: Thấp / Vừa / Cao.
 *
 * Nguyên tắc:
 *  - Đo FPS bằng trung vị của các khung hình gần đây (không dùng trung bình
 *    để tránh bị ảnh hưởng bởi một khung hình lag đột ngột).
 *  - Có "độ trễ" (hysteresis): phải vượt ngưỡng đủ lâu mới đổi mức, tránh
 *    nhấp nháy giữa hai mức.
 *  - Hạ mức theo thứ tự an toàn: pixel ratio → SSAO → bloom → MSAA → bóng đổ.
 *    Tăng mức theo thứ tự ngược lại.
 *  - KHÔNG bao giờ tự tăng trần quyền hay hạn mức token — chỉ đồ hoạ.
 */

export type QualityLevel = "low" | "medium" | "high";

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
};

export interface QualitySettings {
  /** Pixel ratio của renderer. */
  pixelRatio: number;
  /** Bật hậu kỳ (bloom + SSAO) không. */
  postProcessing: boolean;
  /** Bật SSAO không. */
  ssao: boolean;
  /** Bật bloom không. */
  bloom: boolean;
  /** Bật bóng đổ không. */
  shadows: boolean;
  /** Kích thước bản đồ bóng (px). */
  shadowMapSize: number;
  /** Số mẫu MSAA của render target. */
  msaaSamples: number;
  /** Có bật đèn bàn/màn hình phát sáng (tốn đèn) không. */
  emissiveLights: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    pixelRatio: 0.7,
    postProcessing: false,
    ssao: false,
    bloom: false,
    shadows: false,
    shadowMapSize: 512,
    msaaSamples: 0,
    emissiveLights: false,
  },
  medium: {
    pixelRatio: 1.0,
    postProcessing: true,
    ssao: false,
    bloom: true,
    shadows: true,
    shadowMapSize: 1024,
    msaaSamples: 2,
    emissiveLights: true,
  },
  high: {
    pixelRatio: 1.5,
    postProcessing: true,
    ssao: true,
    bloom: true,
    shadows: true,
    shadowMapSize: 2048,
    msaaSamples: 4,
    emissiveLights: true,
  },
};

export interface QualityControllerOptions {
  /** FPS mục tiêu (mặc định 60). */
  targetFps?: number;
  /** Ngưỡng hạ mức (mặc định 0.75 × target). */
  downThreshold?: number;
  /** Ngưỡng nâng mức (mặc định 0.92 × target). */
  upThreshold?: number;
  /** Số khung hình phải vượt ngưỡng liên tiếp mới đổi mức. */
  requiredFrames?: number;
  /** Chặn tự động (người dùng chọn tay ⇒ không tự đổi). */
  auto?: boolean;
}

/** Trạng thái hiện tại để UI hiển thị. */
export interface QualityStatus {
  level: QualityLevel;
  fps: number;
  auto: boolean;
  /** Số lần đã đổi mức. */
  changes: number;
}

/**
 * Bộ điều tiết chất lượng.
 *
 * Sử dụng:
 * ```ts
 * const qc = new QualityController({});
 * qc.onChange((s, preset) => applyPreset(s, preset));
 * // trong vòng lặp render:
 * qc.sample(dt);
 * ```
 */
export class QualityController {
  private level: QualityLevel = "medium";
  private auto: boolean;
  private targetFps: number;
  private downThreshold: number;
  private upThreshold: number;
  private requiredFrames: number;

  /** Các mốc thời gian khung hình gần đây (ms). */
  private frames: number[] = [];
  private belowCount = 0;
  private aboveCount = 0;
  private changes = 0;

  private listeners: Array<(level: QualityLevel, settings: QualitySettings) => void> = [];

  constructor(opts: QualityControllerOptions = {}) {
    this.auto = opts.auto ?? true;
    this.targetFps = opts.targetFps ?? 60;
    this.downThreshold = opts.downThreshold ?? this.targetFps * 0.75;
    this.upThreshold = opts.upThreshold ?? this.targetFps * 0.92;
    this.requiredFrames = opts.requiredFrames ?? 90;
  }

  get current(): QualityLevel {
    return this.level;
  }

  get settings(): QualitySettings {
    return QUALITY_PRESETS[this.level];
  }

  get status(): QualityStatus {
    return {
      level: this.level,
      fps: Math.round(this.fps),
      auto: this.auto,
      changes: this.changes,
    };
  }

  onChange(cb: (level: QualityLevel, settings: QualitySettings) => void): void {
    this.listeners.push(cb);
  }

  /** Người dùng chọn mức tay ⇒ tắt tự động. */
  setManual(level: QualityLevel): void {
    this.auto = false;
    this.#apply(level);
  }

  /** Bật lại tự động. */
  setAuto(on: boolean): void {
    this.auto = on;
  }

  /** Trung vị FPS của các khung hình gần đây. */
  get fps(): number {
    if (this.frames.length < 5) return this.targetFps;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return median > 0 ? 1000 / median : this.targetFps;
  }

  /** Gọi mỗi khung hình với dt (giây). */
  sample(dt: number): void {
    const ms = dt * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.frames.push(ms);
    if (this.frames.length > 120) this.frames.shift();
    if (!this.auto) return;
    if (this.frames.length < 30) return;

    const fps = this.fps;
    if (fps < this.downThreshold) {
      this.belowCount++;
      this.aboveCount = 0;
    } else if (fps > this.upThreshold) {
      this.aboveCount++;
      this.belowCount = 0;
    } else {
      // Vùng chết động → reset bộ đếm (không đổi mức lung tung).
      this.belowCount = 0;
      this.aboveCount = 0;
    }

    if (this.belowCount >= this.requiredFrames) {
      this.belowCount = 0;
      const next = this.level === "high" ? "medium" : this.level === "medium" ? "low" : null;
      if (next) this.#apply(next);
    } else if (this.aboveCount >= this.requiredFrames) {
      this.aboveCount = 0;
      const next = this.level === "low" ? "medium" : this.level === "medium" ? "high" : null;
      if (next) this.#apply(next);
    }
  }

  #apply(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    this.changes++;
    const s = QUALITY_PRESETS[level];
    for (const l of this.listeners) l(level, s);
  }
}
