/**
 * Điều khiển camera văn phòng: bay mượt tới phòng, WASD, nút Toàn cảnh.
 *
 * Camera cũ dùng biến rời rạc (`yaw`, `pitch`, `dist`, `target`) nên khi bấm
 * vào phòng, camera "giật" tới vị trí mới. Ở đây gom camera thành một rig:
 *  - `flyTo()` nội suy mượt (ease-in-out) giữa hai trạng thái.
 *  - WASD/ phím mũi tên đẩy mục tiêu (pan) theo hướng nhìn.
 *  - `overview()` trả camera về góc nhìn toàn cảnh văn phòng.
 *  - Người dùng kéo chuột sẽ hủy chuyển động bay để không "giật" tay.
 */
import * as THREE from "three";

export interface CamState {
  /** Tâm nhìn (mặt đất). */
  tx: number;
  tz: number;
  /** Khoảng cách camera. */
  dist: number;
  /** Góc ngẩng (0 = ngang, PI/2 = nhìn xuống). */
  pitch: number;
  /** Góc xoay quanh trục Y. */
  yaw: number;
}

export interface FlyOptions {
  /** Thời lượng bay (giây). */
  duration?: number;
}

const DEG = Math.PI / 180;

/** Nội suy ease-in-out mượt. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Chuẩn hoá góc về (-PI, PI] để camera không quay vòng khi bay. */
function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

export class CameraRig {
  /** Trạng thái hiện tại (được đọc bởi vòng render). */
  readonly state: CamState = { tx: 0, tz: 0, dist: 24, pitch: 0.62, yaw: 0 };

  /** Camera three.js (dùng để chụp / raycast). */
  readonly camera: THREE.PerspectiveCamera;

  private from: CamState | null = null;
  private to: CamState | null = null;
  private t = 0;
  private duration = 1;

  /** Phím đang bấm (để WASD). */
  private keys = new Set<string>();

  /** Người dùng đang kéo chuột → hủy bay. */
  private userControlled = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Đọc trạng thái ngay lập tức (dùng cho hook kiểm thử). */
  snapshot(): CamState {
    return { ...this.state };
  }

  /** Đặt trạng thái tức thì, không nội suy. */
  set(s: Partial<CamState>): void {
    Object.assign(this.state, s);
    this.from = null;
    this.to = null;
  }

  /** Bay mượt tới trạng thái mới. */
  flyTo(s: Partial<CamState>, opts: FlyOptions = {}): void {
    const dur = Math.max(0.05, opts.duration ?? 0.9);
    this.from = { ...this.state };
    this.to = {
      tx: s.tx ?? this.state.tx,
      tz: s.tz ?? this.state.tz,
      dist: s.dist ?? this.state.dist,
      pitch: s.pitch ?? this.state.pitch,
      // Chọn góc xoay gần nhất (không quay 360° vô nghĩa).
      yaw: this.state.yaw + wrapAngle((s.yaw ?? this.state.yaw) - this.state.yaw),
    };
    this.t = 0;
    this.duration = dur;
  }

  /** Góc nhìn toàn cảnh văn phòng (nút "Toàn cảnh"). */
  overview(): void {
    this.flyTo(
      { tx: 0, tz: -2, dist: 46, pitch: 0.78, yaw: 0.42 },
      { duration: 1.1 },
    );
  }

  /** Bay tới một phòng (dùng khi bấm nhãn phòng / nút điều hướng). */
  focusRoom(x: number, z: number, w: number): void {
    this.flyTo(
      {
        tx: x,
        tz: z,
        dist: Math.max(9, Math.min(14, w * 0.95)),
        pitch: 0.52,
        yaw: 0.12,
      },
      { duration: 0.85 },
    );
  }

  /** Người dùng kéo chuột / lăn → hủy bay, điều khiển trực tiếp. */
  beginUserControl(): void {
    this.userControlled = true;
    this.from = null;
    this.to = null;
  }

  /** Đăng ký phím WASD. */
  attachKeyboard(target: Window = window): void {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        k === "w" ||
        k === "a" ||
        k === "s" ||
        k === "d" ||
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright"
      ) {
        this.keys.add(k);
        this.beginUserControl();
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
  }

  /**
   * Cập nhật mỗi khung hình.
   * @param dt thời gian giữa 2 khung (giây)
   */
  update(dt: number): void {
    // Giới hạn dt: nếu tab bị treo rồi quay lại, dt có thể vài giây →
    // camera sẽ nhảy thẳng tới đích, mất cảm giác "bay mượt".
    const step = Math.min(Math.max(dt, 0), 0.05);

    // 1) Bay mượt (ưu tiên cao hơn phím).
    if (this.from && this.to) {
      this.t = Math.min(1, this.t + step / this.duration);
      const k = ease(this.t);
      const a = this.from;
      const b = this.to;
      this.state.tx = a.tx + (b.tx - a.tx) * k;
      this.state.tz = a.tz + (b.tz - a.tz) * k;
      this.state.dist = a.dist + (b.dist - a.dist) * k;
      this.state.pitch = a.pitch + (b.pitch - a.pitch) * k;
      this.state.yaw = a.yaw + (b.yaw - a.yaw) * k;
      if (this.t >= 1) {
        this.from = null;
        this.to = null;
      }
    } else if (this.keys.size > 0) {
      // 2) WASD → pan mục tiêu theo hướng nhìn hiện tại.
      const speed = 14 * step; // đơn vị thế giới / giây
      const forward = new THREE.Vector3(Math.sin(this.state.yaw), 0, Math.cos(this.state.yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const move = new THREE.Vector3();
      if (this.keys.has("w") || this.keys.has("arrowup")) move.add(forward);
      if (this.keys.has("s") || this.keys.has("arrowdown")) move.sub(forward);
      if (this.keys.has("d") || this.keys.has("arrowright")) move.add(right);
      if (this.keys.has("a") || this.keys.has("arrowleft")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        this.state.tx += move.x;
        this.state.tz += move.z;
        // Giới hạn trong bán kính văn phòng để không bay mất.
        const r = Math.hypot(this.state.tx, this.state.tz);
        if (r > 34) {
          this.state.tx = (this.state.tx / r) * 34;
          this.state.tz = (this.state.tz / r) * 34;
        }
      }
    }

    // 3) Đặt camera theo trạng thái.
    const s = this.state;
    this.camera.position.set(
      s.tx + Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist,
      Math.sin(s.pitch) * s.dist,
      s.tz + Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist,
    );
    this.camera.lookAt(s.tx, 1, s.tz);
  }

  /** Người dùng có đang điều khiển trực tiếp không. */
  get manual(): boolean {
    return this.userControlled;
  }

  /** Đánh dấu đã điều khiển xong (sau khi bấm nút/phòng). */
  clearUserControl(): void {
    this.userControlled = false;
  }

  /** Độ (để hiển thị góc nhìn). */
  get pitchDeg(): number {
    return Math.round(this.state.pitch / DEG);
  }
}
