/**
 * Sàn riêng cho từng khu: gỗ (phòng họp, Giám đốc, Thư viện), thảm (sảnh, phòng kinh doanh), gạch (pantry, phòng kỹ thuật).
 * Texture sinh bằng canvas (không cần tệp ngoài), có hạt giống cố định nên dựng lại cảnh vẫn ra đúng hình cũ.
 */
import * as THREE from "three";
import type { FloorKind } from "../../shared/facilities.js";
import { canvasTexture } from "./decor.js";

/** Loại sàn của các phòng ban (phòng tiện ích tự khai báo trong `FACILITIES`). */
export const DEPARTMENT_FLOOR: Record<string, FloorKind> = {
  executive: "wood",
  library: "wood",
  marketing: "carpet",
  sales: "carpet",
  support: "carpet",
  finance: "carpet",
  dispatch: "tile",
  "ai-team": "tile",
  automation: "tile",
};

export function floorKindFor(roomId: string): FloorKind {
  return DEPARTMENT_FLOOR[roomId] ?? "tile";
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32) — cùng hạt giống cho ra cùng texture. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shade = (hex: number, k: number): string => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();

function drawWood(c: CanvasRenderingContext2D, color: number): void {
  const rand = seeded(11);
  const planks = 8;
  const pw = 256 / planks;
  for (let i = 0; i < planks; i++) {
    c.fillStyle = shade(color, 0.9 + rand() * 0.18);
    c.fillRect(i * pw, 0, pw, 256);
    // thớ gỗ
    c.strokeStyle = "rgba(60,36,16,0.16)";
    c.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      const x = i * pw + 4 + rand() * (pw - 8);
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 5 * rand(), 80, x - 5 * rand(), 170, x + 2, 256);
      c.stroke();
    }
    // mối nối đầu tấm (so le giữa các tấm)
    c.fillStyle = "rgba(40,24,10,0.35)";
    c.fillRect(i * pw, ((i * 97) % 256) | 0, pw, 2);
    c.fillRect(i * pw, 0, 1.5, 256);
  }
}

function drawCarpet(c: CanvasRenderingContext2D, color: number): void {
  const rand = seeded(23);
  c.fillStyle = shade(color, 1);
  c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
    c.fillRect(rand() * 128, rand() * 128, 1.5, 1.5);
  }
  // sọc dệt mờ
  c.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = 0; y < 128; y += 4) c.fillRect(0, y, 128, 1);
}

function drawTile(c: CanvasRenderingContext2D, color: number): void {
  const rand = seeded(37);
  const n = 4;
  const s = 256 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      c.fillStyle = shade(color, 0.96 + rand() * 0.08);
      c.fillRect(x * s, y * s, s, s);
      c.fillStyle = "rgba(255,255,255,0.22)";
      c.fillRect(x * s + 5, y * s + 5, s * 0.42, s * 0.18);
    }
  }
  c.strokeStyle = "rgba(70,74,70,0.55)";
  c.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    c.beginPath();
    c.moveTo(i * s, 0);
    c.lineTo(i * s, 256);
    c.moveTo(0, i * s);
    c.lineTo(256, i * s);
    c.stroke();
  }
}

/** Số ô lặp mỗi mét theo loại sàn (kích cỡ thấy được của tấm gỗ/ô gạch/sợi thảm). */
export const FLOOR_METRES_PER_TILE: Record<FloorKind, number> = { wood: 2.4, carpet: 2.5, tile: 1.6 };

/** Vật liệu sàn cho một phòng rộng w×d (mét). */
export function floorMaterial(kind: FloorKind, color: number, w: number, d: number): THREE.MeshStandardMaterial {
  const tex =
    kind === "wood"
      ? canvasTexture(256, 256, (c) => drawWood(c, color))
      : kind === "carpet"
        ? canvasTexture(128, 128, (c) => drawCarpet(c, color))
        : canvasTexture(256, 256, (c) => drawTile(c, color));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const m = FLOOR_METRES_PER_TILE[kind];
  tex.repeat.set(w / m, d / m);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: kind === "carpet" ? 1 : kind === "wood" ? 0.55 : 0.4,
    metalness: 0,
  });
}
