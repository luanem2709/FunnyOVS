/**
 * Quản lý 3 cấp quyền + xác nhận 2 bước + hẹn giờ + đánh dấu nhiễm (GĐ 4/GĐ 5).
 *
 * Cấp 1 — Sandbox (mặc định):
 *   Chỉ đọc/ghi trong workspace. Không chạy lệnh, không điều khiển máy.
 *
 * Cấp 2 — Được cấp (Granted):
 *   Người dùng cấp quyền cụ thể qua hộp thoại 4 lựa chọn
 *   (1 lần / đọc / đọc-ghi / từ chối). Vẫn cần hỏi lại việc khó hoàn tác.
 *
 * Cấp 3 — Toàn quyền (Full):
 *   Mặc định **TẮT**. Bật cần: nhập "TOAN QUYEN" + hẹn giờ tự hết hạn.
 *   Vẫn hỏi lại việc khó hoàn tác (xóa hàng loạt, registry, thanh toán…).
 */
import { EventEmitter } from "node:events";
import type { PermissionLevel } from "../executor/actionSchema.js";

export interface PermissionLevelState {
  level: PermissionLevel;
  /** Cấp 3: thời điểm hết hạn (epoch ms). null = không hết hạn (chỉ khi bật thủ công không thời hạn). */
  fullExpiresAt: number | null;
  /** Cấp 3: đang chờ xác nhận bước 2? */
  pendingPhrase: string | null;
  /** Hạn mức tự hết hạn mặc định cho Cấp 3 (ms). */
  fullDurationMs: number;
  /** Đã bật Cấp 3 lần nào (để hiển thị cảnh báo). */
  fullEnabledAt: string | null;
}

export interface TaintState {
  /** Phiên đang bị nhiễm (đã đọc nội dung không tin cậy). */
  tainted: boolean;
  /** Nguồn gây nhiễm. */
  source: string | null;
  /** Thời điểm bị nhiễm. */
  since: string | null;
  /** Yêu cầu xác nhận cụ thể (nếu đang chờ). */
  pendingAction: string | null;
}

/** Cụp từ khóa xác nhận Cấp 3. */
export const FULL_CONFIRM_PHRASE = "TOAN QUYEN";

/** Thời gian hết hạn mặc định của Cấp 3 (15 phút). */
export const DEFAULT_FULL_DURATION_MS = 15 * 60 * 1000;

/** Trạng thái mặc định. */
const DEFAULT_STATE: PermissionLevelState = {
  level: "sandbox",
  fullExpiresAt: null,
  pendingPhrase: null,
  fullDurationMs: DEFAULT_FULL_DURATION_MS,
  fullEnabledAt: null,
};

export class PermissionLevelManager extends EventEmitter {
  private state: PermissionLevelState = structuredClone(DEFAULT_STATE);
  private taint: TaintState = { tainted: false, source: null, since: null, pendingAction: null };

  constructor(private readonly onChange?: (s: PermissionLevelState) => void) {
    super();
    this.timer = setInterval(() => this.#tick(), 1000);
    this.timer.unref?.();
  }

  private timer: NodeJS.Timeout;

  /** Trạng thái hiện tại (đã tính hết hạn). */
  get(): PermissionLevelState {
    this.#tick();
    return structuredClone(this.state);
  }

  /** Cấp quyền hiện hành (đã xét hết hạn). */
  level(): PermissionLevel {
    return this.get().level;
  }

  /** Trạng thái taint. */
  taintState(): TaintState {
    return { ...this.taint };
  }

  /** Phiên có bị nhiễm không. */
  isTainted(): boolean {
    return this.taint.tainted;
  }

  /**
   * Bước 1 của xác nhận Cấp 3: người dùng nhập cụm "TOAN QUYEN".
   * Nếu đúng → sang bước 2 (chọn thời lượng). Nếu sai → từ chối.
   */
  requestFullAccess(phrase: string): { ok: boolean; message: string; needPhrase?: boolean; step?: number } {
    const cleaned = phrase.trim();
    // So sánh NGUYÊN VĂN (không normalize) — nhập "toan quyen" hay "Toan Quyen"
    // đều KHÔNG được chấp nhận. Nếu bỏ case-insensitive thì xác nhận mất ý nghĩa.
    if (cleaned !== FULL_CONFIRM_PHRASE) {
      this.state.pendingPhrase = null;
      this.#persist();
      return {
        ok: false,
        needPhrase: true,
        step: 1,
        message: `Cụm xác nhận không đúng. Hãy nhập chính xác: ${FULL_CONFIRM_PHRASE}`,
      };
    }
    this.state.pendingPhrase = FULL_CONFIRM_PHRASE;
    this.#persist();
    return {
      ok: false,
      needPhrase: false,
      step: 2,
      message: "Đúng cụm xác nhận. Bước 2: chọn thời lượng Toàn quyền (tối đa 60 phút).",
    };
  }

  /**
   * Bước 2: bật Cấp 3 với thời lượng.
   * @param durationMs thời lượng (ms). 0 = không tự hết hạn (vẫn phải tắt thủ công).
   */
  confirmFullAccess(durationMs: number): { ok: boolean; message: string; state: PermissionLevelState } {
    if (this.state.pendingPhrase !== FULL_CONFIRM_PHRASE) {
      return {
        ok: false,
        message: "Cần hoàn thành bước 1 (nhập cụm xác nhận) trước.",
        state: this.get(),
      };
    }
    const dur = Math.max(0, Math.min(durationMs, 60 * 60 * 1000));
    this.state = {
      ...this.state,
      level: "full",
      pendingPhrase: null,
      fullDurationMs: dur,
      fullExpiresAt: dur > 0 ? Date.now() + dur : null,
      fullEnabledAt: new Date().toISOString(),
    };
    this.#persist();
    this.emit("level", this.get());
    this.onChange?.(this.get());
    return {
      ok: true,
      message:
        dur > 0
          ? `Đã bật Toàn quyền trong ${Math.round(dur / 60000)} phút.`
          : "Đã bật Toàn quyền (không hết hạn). Nhớ tắt khi xong.",
      state: this.get(),
    };
  }

  /** Tắt Cấp 3, quay về Sandbox. */
  disableFullAccess(): { ok: boolean; message: string; state: PermissionLevelState } {
    const was = this.state.level;
    this.state = { ...this.state, level: "sandbox", pendingPhrase: null, fullExpiresAt: null, fullEnabledAt: null };
    this.#persist();
    this.emit("level", this.get());
    this.onChange?.(this.get());
    return {
      ok: true,
      message: was === "full" ? "Đã tắt Toàn quyền, quay về Sandbox." : "Đang ở Sandbox.",
      state: this.get(),
    };
  }

  /** Đặt cấp 2 (Được cấp) — sau khi người dùng duyệt một yêu cầu cụ thể. */
  setGranted(): PermissionLevelState {
    this.state = { ...this.state, level: "granted" };
    this.#persist();
    this.emit("level", this.get());
    this.onChange?.(this.get());
    return this.get();
  }

  /** Đánh dấu phiên bị nhiễm (đã đọc nội dung không tin cậy). */
  markTainted(source: string): TaintState {
    this.taint = { tainted: true, source, since: new Date().toISOString(), pendingAction: null };
    this.emit("taint", this.taint);
    return { ...this.taint };
  }

  /** Bỏ đánh dấu nhiễm. */
  clearTaint(): TaintState {
    this.taint = { tainted: false, source: null, since: null, pendingAction: null };
    this.emit("taint", this.taint);
    return { ...this.taint };
  }

  /** Số giây còn lại của Cấp 3 (0 = không bật). */
  remainingSeconds(): number {
    this.#tick();
    if (this.state.level !== "full" || !this.state.fullExpiresAt) return 0;
    return Math.max(0, Math.ceil((this.state.fullExpiresAt - Date.now()) / 1000));
  }

  /** Kiểm tra hết hạn mỗi giây. */
  #tick(): void {
    if (this.state.level === "full" && this.state.fullExpiresAt && Date.now() > this.state.fullExpiresAt) {
      this.state = { ...this.state, level: "sandbox", fullExpiresAt: null, fullEnabledAt: null };
      this.#persist();
      this.emit("level", this.get());
      this.onChange?.(this.get());
    }
  }

  #persist(): void {
    this.emit("state", this.get());
  }
}
