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

  // Bầu trời — gradient dọc, không dùng texture đốm.
  const sky = g.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#2f6fb5");
  sky.addColorStop(0.28, "#6ea6df");
  sky.addColorStop(0.55, "#a9cdec");
  sky.addColorStop(0.78, "#d5e8f7");
  sky.addColorStop(1, "#eef6fb");
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  // Mây — dùng radial gradient mềm thay vì hình tròn đặc (tránh "đốm tròn").
  // Mỗi đám mây là nhiều blob gradient chồng lên, alpha tăng dần về tâm.
  for (let i = 0; i < 14; i++) {
    const cx = rand() * width;
    const cy = rand() * height * 0.30;
    const scale = 0.6 + rand() * 1.1;
    const blobs = 4 + Math.floor(rand() * 4);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + (rand() - 0.5) * 130 * scale;
      const by = cy + (rand() - 0.5) * 26 * scale;
      const r = (26 + rand() * 42) * scale;
      const grd = g.createRadialGradient(bx, by, 0, bx, by, r);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(0.45, "rgba(255,255,255,0.24)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(bx, by, r, 0, Math.PI * 2);
      g.fill();
    }
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

  // Lớp sương mờ phía trên đường chân trời → skyline xa nhưng vẫn nổi
  // nhẹ, không bị cứng như tranh vẽ.
  const haze = g.createLinearGradient(0, height * 0.5, 0, height * 0.92);
  haze.addColorStop(0, "rgba(214, 233, 247, 0.55)");
  haze.addColorStop(0.55, "rgba(206, 227, 243, 0.32)");
  haze.addColorStop(1, "rgba(198, 220, 238, 0.12)");
  g.fillStyle = haze;
  g.fillRect(0, height * 0.5, width, height * 0.42);

  return cvs;
}

/**
 * Dải skyline MỜ ở xa (2 vòng) — đưa tầm nhìn ra xa, tạo chiều sâu.
 * Vẽ bằng canvas, alpha thấp → mờ vào bầu trời.
 */
export function distantSkyline(radius: number, height: number, seed = 21): THREE.Group {
  const g = new THREE.Group();

  const layers: Array<{ r: number; h: number; col: string; alpha: number; seed: number }> = [
    { r: radius * 1.45, h: height * 0.85, col: "#8fa9c2", alpha: 0.4, seed },
    { r: radius * 1.8, h: height * 0.6, col: "#a7bdd2", alpha: 0.26, seed: seed + 3 },
  ];

  for (const layer of layers) {
    const cvs = document.createElement("canvas");
    cvs.width = 2048;
    cvs.height = 256;
    const ctx = cvs.getContext("2d")!;
    const rand = rng(layer.seed);
    ctx.fillStyle = layer.col;
    ctx.globalAlpha = layer.alpha;

    let x = -20;
    while (x < 2048) {
      const bw = 30 + rand() * 70;
      const bh = 40 + rand() * 150;
      ctx.fillRect(x, 256 - bh, bw, bh);
      x += bw + 6 + rand() * 18;
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(5, 1);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(layer.r, layer.r, layer.h, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        transparent: true,
        opacity: layer.alpha,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.position.y = layer.h / 2 - 1.2;
    mesh.renderOrder = -5;
    g.add(mesh);
  }

  return g;
}

/**
 * Vòm trời (sky dome) — gradient mượt phía trên, không dùng texture.
 * Dùng shader nội suy màu theo chiều cao → không bị vệt/đốm.
 */
export function skyDome(radius = 120): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f6fb5) },
      midColor: { value: new THREE.Color(0x9fc6ea) },
      bottomColor: { value: new THREE.Color(0xeaf3fa) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = clamp(vWorld.y / ${radius.toFixed(1)}, -1.0, 1.0);
        // h: -1 (dưới) .. 1 (trên). Dùng 3 chặng để chuyển màu mượt.
        vec3 c = h > 0.0
          ? mix(midColor, topColor, pow(h, 0.65))
          : mix(midColor, bottomColor, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
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
