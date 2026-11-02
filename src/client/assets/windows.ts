/**
 * Ngoại cảnh vòng quanh văn phòng: skyline thành phố 360° + bậu cửa sổ.
 *
 * Port từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   `world/windows.js` → cityTex (skyline vẽ bằng canvas)
 *
 * Ở đây dùng một vòng hình trụ bao quanh toàn bộ tầng văn phòng thay vì
 * đặt cửa sổ trên từng bức tường. Nhờ vậy:
 *   - tầm nhìn không bị tường chặn (tường phòng thấp 1.3m)
 *   - có đường chân trời thành phố nhìn được từ mọi góc quay camera
 */
import * as THREE from "three";

/** Số ngẫu nhiên có seed để skyline ổn định giữa các lần tải. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Vẽ skyline thành phố lên canvas.
 * @param width bề rộng canvas
 * @param height chiều cao canvas
 * @param seed hạt ngẫu nhiên
 */
export function drawCityscape(
  width: number,
  height: number,
  seed = 7,
): HTMLCanvasElement {
  const cvs = document.createElement("canvas");
  cvs.width = width;
  cvs.height = height;
  const g = cvs.getContext("2d")!;
  const rand = rng(seed);

  // Bầu trời.
  const sky = g.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#7fb9e8");
  sky.addColorStop(0.62, "#c8e2f5");
  sky.addColorStop(1, "#eaf3fa");
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  // Mây.
  g.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 22; i++) {
    const cx = rand() * width;
    const cy = rand() * height * 0.32;
    const r = 14 + rand() * 30;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  // Ba lớp tòa nhà từ xa tới gần.
  const layers = [
    { col: "#a8bccd", top: 0.52, hMin: 0.14, hMax: 0.3, wMin: 26, wMax: 60 },
    { col: "#8fa6bb", top: 0.58, hMin: 0.2, hMax: 0.4, wMin: 34, wMax: 74 },
    { col: "#6d8296", top: 0.66, hMin: 0.26, hMax: 0.5, wMin: 46, wMax: 96 },
  ];
  for (const layer of layers) {
    let x = -30;
    while (x < width) {
      const bw = layer.wMin + rand() * (layer.wMax - layer.wMin);
      const bh = height * (layer.hMin + rand() * (layer.hMax - layer.hMin));
      const base = height * layer.top;
      g.fillStyle = layer.col;
      g.fillRect(x, base - bh, bw, bh + (height - base));

      // Cửa sổ.
      const wg = g.createLinearGradient(0, base - bh, 0, base);
      wg.addColorStop(0, "rgba(255,255,255,.30)");
      wg.addColorStop(1, "rgba(255,255,255,.05)");
      g.fillStyle = wg;
      const cols = Math.max(1, Math.floor(bw / 11));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < Math.floor(bh / 13); r++) {
          g.fillRect(x + 4 + c * 11, base - bh + 6 + r * 13, 5, 7);
        }
      }
      x += bw + 2 + rand() * 10;
    }
  }

  // Đường chân trời / mặt đất.
  g.fillStyle = "#54697c";
  g.fillRect(0, height * 0.9, width, height * 0.1);

  return cvs;
}

/** Texture skyline cho vòng ngoại cảnh. */
export function skylineTexture(repeat = 4, seed = 7): THREE.CanvasTexture {
  const cvs = drawCityscape(2048, 512, seed);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(repeat, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Vòng ngoại cảnh: trụ kín bao quanh + khung cửa sổ + bậu cửa.
 * @param radius bán kính vòng ngoại cảnh
 * @param height chiều cao vòng
 */
export function skylineRing(radius = 26, height = 9): THREE.Group {
  const g = new THREE.Group();

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 64, 1, true),
    new THREE.MeshBasicMaterial({
      map: skylineTexture(4),
      side: THREE.BackSide,
      toneMapped: false,
      fog: true,
    }),
  );
  glass.position.y = height / 2 - 1.6;
  g.add(glass);

  // Trụ đứng (mối cửa sổ) và thanh ngang.
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2f343e,
    roughness: 0.6,
  });
  const posts = 28;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, height - 1.6, 0.16),
      frameMat,
    );
    post.position.set(Math.cos(a) * radius, (height - 1.6) / 2, Math.sin(a) * radius);
    post.rotation.y = -a;
    g.add(post);
  }
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, 0.14, 64, 1, true),
    frameMat,
  );
  rail.position.y = height - 1.6;
  g.add(rail);

  // Bậu cửa (vòng đếm bán kính, cao bằng bề rộng tường).
  const sill = new THREE.Mesh(
    new THREE.CylinderGeometry(radius - 0.25, radius - 0.25, 0.22, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3e, roughness: 0.75 }),
  );
  sill.position.y = -1.5;
  sill.material.side = THREE.DoubleSide;
  g.add(sill);

  return g;
}
