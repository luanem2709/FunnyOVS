/**
 * Nhãn 3D (billboard) cho phòng ban và nhân vật.
 *
 * Yêu cầu (GĐ 1.2):
 *  - Chữ RÕ nét: nền tối đậm, chữ trắng đậm, viền tương phản.
 *  - KHÔNG đè lên nhau: nhãn phòng và nhãn nhân vật tách chiều cao; nhãn nhân
 *    vật được cắt bớt khi xa.
 *  - TỰ ẨN khi xa: quá xa → ẩn hẳn (tiết draw call + tránh rối mắt).
 *  - Biểu tượng trạng thái + thanh tiến độ ngay trên nhãn.
 *
 * Kỹ thuật: dùng `THREE.Sprite` (luôn hướng về camera) với `CanvasTexture`.
 * Canvas được vẽ sẵn ở độ phân giải cao (1024×256) và dùng `LinearFilter` +
 * `generateMipmaps` để chữ không bị rỗ khi thu nhỏ.
 */
import * as THREE from "three";

export type LabelStatus =
  | "idle"
  | "working"
  | "researching"
  | "learning"
  | "waiting"
  | "blocked"
  | "stopped";

/** Màu + biểu tượng theo trạng thái. */
const STATUS_STYLE: Record<LabelStatus, { color: string; icon: string; label: string }> = {
  idle: { color: "#8b949e", icon: "●", label: "Rảnh" },
  working: { color: "#3fb950", icon: "⚙", label: "Đang làm" },
  researching: { color: "#4f9cf9", icon: "🔍", label: "Đang duyệt web" },
  learning: { color: "#8f7bf0", icon: "📘", label: "Đang học" },
  waiting: { color: "#d29922", icon: "⏳", label: "Chờ duyệt" },
  blocked: { color: "#f85149", icon: "⛔", label: "Bị chặn" },
  stopped: { color: "#484f58", icon: "■", label: "Đã dừng" },
};

const CANVAS_W = 1024;
const CANVAS_H = 256;

/** Vẽ nền bo góc + viền. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Vẽ một nhãn lên canvas.
 *
 * @param title   Dòng tiêu đề (tên nhân vật / tên phòng)
 * @param sub     Dòng phụ (vai trò / số token)
 * @param status  Trạng thái → màu + biểu tượng
 * @param progress 0..1 — thanh tiến độ (null = không vẽ)
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  title: string,
  sub: string,
  status: LabelStatus,
  progress: number | null,
): void {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.idle;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Nền tối đậm, hơi trong suốt → chữ trắng nổi bật trên nền sáng.
  ctx.fillStyle = "rgba(8, 11, 16, 0.94)";
  roundRect(ctx, 4, 4, CANVAS_W - 8, CANVAS_H - 8, 26);
  ctx.fill();

  // Viền màu trạng thái.
  ctx.strokeStyle = st.color;
  ctx.lineWidth = 7;
  roundRect(ctx, 4, 4, CANVAS_W - 8, CANVAS_H - 8, 26);
  ctx.stroke();

  // Dải trạng thái bên trái.
  ctx.fillStyle = st.color;
  roundRect(ctx, 4, 4, 20, CANVAS_H - 8, 10);
  ctx.fill();

  // Biểu tượng trạng thái.
  ctx.font = "bold 74px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = st.color;
  ctx.fillText(st.icon, 42, 78);

  // Tiêu đề — chữ trắng đậm, cỡ lớn.
  ctx.font = "bold 82px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(title, 140, 78);

  // Dòng phụ.
  ctx.font = "46px system-ui, sans-serif";
  ctx.fillStyle = "#c9d1d9";
  const maxSub = 34;
  const subText = sub.length > maxSub ? sub.slice(0, maxSub - 1) + "…" : sub;
  ctx.fillText(subText, 140, 168);

  // Nhãn trạng thái ở góc phải.
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = st.color;
  ctx.fillText(st.label, CANVAS_W - 40, 168);

  // Thanh tiến độ.
  if (progress !== null) {
    const bx = 140;
    const bw = CANVAS_W - 180;
    const by = 208;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, bx, by, bw, 18, 9);
    ctx.fill();
    const p = Math.max(0, Math.min(1, progress));
    ctx.fillStyle = st.color;
    roundRect(ctx, bx, by, Math.max(18, bw * p), 18, 9);
    ctx.fill();
  }
}

export interface LabelOptions {
  /** Chiều rộng sprite (đơn vị cảnh). */
  width?: number;
  /** Chiều cao sprite. */
  height?: number;
  /** Ẩn khi camera cách quá xa (world units). */
  hideBeyond?: number;
}

/**
 * Tạo một nhãn billboard có thể cập nhật.
 *
 * Sprite luôn hướng về camera (billboard) nên không cần xoay thủ công.
 */
export class BillboardLabel {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private lastKey = "";
  private hideBeyond: number;

  constructor(opts: LabelOptions = {}) {
    const cvs = document.createElement("canvas");
    cvs.width = CANVAS_W;
    cvs.height = CANVAS_H;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.renderOrder = 900;
    this.sprite.scale.set(opts.width ?? 2.4, opts.height ?? 0.6, 1);
    this.hideBeyond = opts.hideBeyond ?? 16;
    this.update("", "", "idle", null);
  }

  /** Cập nhật nội dung — chỉ vẽ lại khi thực sự thay đổi. */
  update(title: string, sub: string, status: LabelStatus, progress: number | null): void {
    const p = progress === null ? "none" : progress.toFixed(2);
    const key = `${title}|${sub}|${status}|${p}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    drawLabel(this.ctx, title, sub, status, progress);
    this.tex.needsUpdate = true;
  }

  /** Ẩn/hiện theo khoảng cách camera (tránh rối mắt + tiết draw call). */
  updateVisibility(camera: THREE.Camera): void {
    const d = this.sprite.position.distanceTo(camera.position);
    const visible = d <= this.hideBeyond;
    if (this.sprite.visible !== visible) this.sprite.visible = visible;
    // Ở xa → thu nhỏ dần để không chiếm chỗ trên màn hình.
    const k = Math.max(0.45, Math.min(1, this.hideBeyond / Math.max(1, d)));
    this.sprite.scale.set(
      (this.sprite.userData.baseW ?? 2.4) * k,
      (this.sprite.userData.baseH ?? 0.6) * k,
      1,
    );
  }

  /** Đặt kích thước gốc (dùng khi updateVisibility thu nhỏ). */
  setSize(w: number, h: number): void {
    this.sprite.userData.baseW = w;
    this.sprite.userData.baseH = h;
    this.sprite.scale.set(w, h, 1);
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

/** Nhãn phòng ban — cố định trên tường, ẩn khi xa. */
export function makeRoomLabel(text: string, width: number): BillboardLabel {
  const label = new BillboardLabel({ width, height: width * 0.25, hideBeyond: 34 });
  label.setSize(width, width * 0.25);
  label.update(text, "", "idle", null);
  return label;
}
