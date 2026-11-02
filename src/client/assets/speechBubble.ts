/**
 * Bong bóng thoại 3D cho nhân vật (GĐ 3).
 *
 * Khi agent báo kết quả (task xong) hoặc cần duyệt, một bong bóng ngắn hiện
 * lên trên đầu nhân vật trong ~3 giây rồi tự tắt.
 *
 * Dùng `THREE.Sprite` + `CanvasTexture` để chữ luôn hướng về camera.
 */
import * as THREE from "three";

const W = 512;
const H = 160;

/** Rút gọn chữ cho bong bóng. */
function ell(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export interface BubbleOptions {
  /** Thời gian hiển thị (giây). */
  ttl?: number;
}

export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private ttl: number;
  private elapsed = 0;
  private text = "";

  constructor(opts: BubbleOptions = {}) {
    const cvs = document.createElement("canvas");
    cvs.width = W;
    cvs.height = H;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sprite.renderOrder = 950;
    this.sprite.scale.set(1.7, 0.53, 1);
    this.sprite.visible = false;
    this.ttl = opts.ttl ?? 3.2;
  }

  /** Hiện bong bóng với nội dung (gọi lại để gia hạn). */
  show(text: string, color = "#4f9cf9"): void {
    const t = ell(text, 46);
    if (t === this.text && this.sprite.visible) {
      this.elapsed = 0;
      return;
    }
    this.text = t;
    const c = this.ctx;
    c.clearRect(0, 0, W, H);

    // Thân bong bóng bo tròn.
    c.fillStyle = "rgba(10,14,20,0.95)";
    c.strokeStyle = color;
    c.lineWidth = 6;
    const x = 10;
    const y = 8;
    const w = W - 20;
    const h = H - 42;
    const r = 22;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x + w - 26, y + h, r);
    c.lineTo(W / 2 + 14, y + h + 26);
    c.lineTo(W / 2 - 14, y + h);
    c.arcTo(x, y + h, x, y + h, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
    c.stroke();

    c.fillStyle = "#ffffff";
    c.font = "bold 44px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(t, W / 2, y + h / 2, w - 40);

    this.tex.needsUpdate = true;
    this.sprite.visible = true;
    this.elapsed = 0;
  }

  /** Ẩn ngay. */
  hide(): void {
    this.sprite.visible = false;
    this.elapsed = 0;
  }

  /**
   * Cập nhật mỗi khung hình.
   * @param dt thời gian giữa 2 khung (giây)
   */
  update(dt: number): void {
    if (!this.sprite.visible) return;
    this.elapsed += dt;
    // Mờ dần ở 0.4 giây cuối.
    const remain = this.ttl - this.elapsed;
    const mat = this.sprite.material as THREE.SpriteMaterial;
    mat.opacity = remain < 0.4 ? Math.max(0, remain / 0.4) : 1;
    if (this.elapsed >= this.ttl) this.hide();
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}
