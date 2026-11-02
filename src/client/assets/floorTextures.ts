/**
 * Texture sàn ván và sàn gạch cho văn phòng.
 *
 * Port từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   `world/terrace.js` → canvasTex (vẽ texture bằng canvas)
 *
 * Sàn phẳng một màu trông rất "chết" và chiếm phần lớn khung hình khi camera
 * nhìn xuống. Texture ván gỗ + hoa văn sàn gạch văn phòng giúp phòng có chiều
 * sâu và dễ đọc hơn nhiều.
 */
import * as THREE from "three";

/** Số ngẫu nhiên có seed để texture ổn định giữa các lần tải. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Texture sàn ván gỗ (ván dài, màu gỗ ấm). */
export function woodFloorTexture(seed = 3): THREE.CanvasTexture {
  const size = 512;
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const g = cvs.getContext("2d")!;
  const rand = rng(seed);

  g.fillStyle = "#a98a63";
  g.fillRect(0, 0, size, size);

  const plankH = size / 8;
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * (size / 4);
    for (let col = -1; col < 4; col++) {
      const x = offset + col * (size / 4);
      const shade = 0.9 + rand() * 0.2;
      const r = Math.round(169 * shade);
      const gg = Math.round(138 * shade);
      const b = Math.round(99 * shade);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x, row * plankH, size / 4 - 1.5, plankH - 1.5);

      // Vân gỗ.
      g.strokeStyle = `rgba(90,64,40,${0.06 + rand() * 0.07})`;
      g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = row * plankH + 3 + rand() * (plankH - 6);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(
          x + size / 12,
          y + (rand() - 0.5) * 5,
          x + size / 6,
          y + (rand() - 0.5) * 5,
          x + size / 4,
          y,
        );
        g.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Texture sàn gạch văn phòng (gạch vuông nhạt, có gờ). */
export function tileFloorTexture(seed = 5): THREE.CanvasTexture {
  const size = 512;
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const g = cvs.getContext("2d")!;
  const rand = rng(seed);

  g.fillStyle = "#b9b2a4";
  g.fillRect(0, 0, size, size);

  const n = 8;
  const cell = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const l = 74 + rand() * 5;
      g.fillStyle = `hsl(38, 14%, ${l}%)`;
      g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Texture sàn cho phòng ban, chọn theo màu sàn của phòng.
 * Phòng có sàn tối → gạch; sàn sáng → ván gỗ.
 */
export function floorTextureFor(color: number, seed = 3): THREE.CanvasTexture {
  const c = new THREE.Color(color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  // Three.js dùng color space tuyến tính cho số màu hex.
  const srgbLum = Math.pow(lum, 1 / 2.2);
  return srgbLum < 0.62 ? tileFloorTexture(seed) : woodFloorTexture(seed);
}
