/**
 * Hiệu ứng sự kiện cho cảnh 3D:
 *  - Bubble:  bong bóng thoại trên đầu agent ("Đang đọc: example.com", "Cần bạn duyệt"...).
 *  - Effects: pháo giấy khi xong việc, tia lửa + vòng đỏ khi bị chặn, vòng sóng khi cần duyệt.
 */
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Bong bóng thoại
// ---------------------------------------------------------------------------

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

export class Bubble {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private text = "";
  private color = "#1f6feb";
  private opacity = 0;
  private wanted = 0;

  constructor(parent: THREE.Object3D, y: number) {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 200;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: 0, depthTest: false }),
    );
    this.sprite.scale.set(3.0, 1.17, 1);
    this.sprite.position.set(0, y, 0);
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  /** Đặt nội dung; `null` để ẩn bong bóng. */
  set(text: string | null, color = "#1f6feb"): void {
    if (!text) {
      this.wanted = 0;
      return;
    }
    this.wanted = 1;
    if (text === this.text && color === this.color) return;
    this.text = text;
    this.color = color;
    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    const W = 512;
    const H = 200;
    c.clearRect(0, 0, W, H);
    const bodyH = H - 36;
    c.fillStyle = "rgba(255,255,255,0.96)";
    c.strokeStyle = this.color;
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(6, 6, W - 12, bodyH - 6, 34);
    c.fill();
    c.stroke();
    // Đuôi bong bóng
    c.beginPath();
    c.moveTo(W / 2 - 22, bodyH - 3);
    c.lineTo(W / 2, H - 6);
    c.lineTo(W / 2 + 22, bodyH - 3);
    c.closePath();
    c.fillStyle = "rgba(255,255,255,0.96)";
    c.fill();
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.98)";
    c.fillRect(W / 2 - 18, bodyH - 8, 36, 8);

    c.fillStyle = "#1f2937";
    c.font = "bold 40px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const lines = wrap(c, this.text, W - 64, 2);
    const lh = 48;
    const top = 6 + (bodyH - 6) / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => c.fillText(l, W / 2, top + i * lh));
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.opacity += (this.wanted - this.opacity) * Math.min(1, dt * 8);
    if (Math.abs(this.opacity - this.wanted) < 0.01) this.opacity = this.wanted;
    (this.sprite.material as THREE.SpriteMaterial).opacity = this.opacity;
    this.sprite.visible = this.opacity > 0.02;
  }
}

// ---------------------------------------------------------------------------
// Hạt & vòng sóng
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 360;
const GRAVITY = -7;

interface Pulse {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  maxScale: number;
}

export interface Effects {
  /** Bắn hạt (pháo giấy / tia lửa) tại vị trí thế giới. */
  burst(at: THREE.Vector3, colors: number[], count?: number, speed?: number, up?: number): void;
  /** Vòng sóng lan trên sàn. */
  pulse(at: THREE.Vector3, color: number, maxScale?: number, life?: number): void;
  update(dt: number): void;
}

export function createEffects(scene: THREE.Scene): Effects {
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  for (let i = 0; i < MAX_PARTICLES; i++) pos[i * 3 + 1] = -999;
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const pulses: Pulse[] = [];
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  const c = new THREE.Color();
  let cursor = 0;

  return {
    burst(at, colors, count = 40, speed = 3.2, up = 4.5) {
      for (let k = 0; k < count; k++) {
        const i = cursor++ % MAX_PARTICLES;
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        pos[i * 3] = at.x;
        pos[i * 3 + 1] = at.y;
        pos[i * 3 + 2] = at.z;
        vel[i * 3] = Math.cos(a) * s;
        vel[i * 3 + 1] = up * (0.5 + Math.random() * 0.7);
        vel[i * 3 + 2] = Math.sin(a) * s;
        c.setHex(colors[k % colors.length]);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        life[i] = 1.1 + Math.random() * 0.9;
      }
      geo.attributes.color.needsUpdate = true;
    },
    pulse(at, color, maxScale = 2.4, lifeSec = 1.1) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(at.x, 0.06, at.z);
      scene.add(mesh);
      pulses.push({ mesh, age: 0, life: lifeSec, maxScale });
    },
    update(dt) {
      let touched = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] <= 0) continue;
        touched = true;
        life[i] -= dt;
        if (life[i] <= 0) {
          pos[i * 3 + 1] = -999;
          continue;
        }
        vel[i * 3 + 1] += GRAVITY * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] <= 0.02) {
          vel[i * 3] *= 0.8;
          vel[i * 3 + 2] *= 0.8;
          vel[i * 3 + 1] = 0;
        }
      }
      if (touched) {
        geo.attributes.position.needsUpdate = true;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          pulses.splice(i, 1);
          continue;
        }
        p.mesh.scale.setScalar(0.3 + k * p.maxScale);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      }
    },
  };
}
