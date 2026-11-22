/**
 * Trang trí & môi trường cho văn phòng 3D — hoàn toàn dựng bằng code (không cần model ngoài).
 *
 *  - buildEnvironment: bầu trời, mây, bãi cỏ, nền lát gạch, cây, đèn đường, đài phun nước, ghế đá.
 *  - buildRoomDecor:   len chân tường, cửa sổ, đồng hồ, thảm, cây cảnh, đồ đặc trưng từng phòng.
 *  - build*Prop:       đồ đặc trưng thay cho các hộp xám (tổng đài, phễu bán hàng, biểu đồ, tủ server...).
 *  - tickDecor:        chuyển động nhẹ (LED nhấp nháy, phễu xoay, cột biểu đồ, kim đồng hồ, nước, mây).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Tiện ích dựng hình
// ---------------------------------------------------------------------------

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function std(color: number, roughness = 0.8, metalness = 0, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${emissive}|${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
    matCache.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function ball(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true, seg = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  draw(cvs.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Vật liệu phát sáng: sáng hơn ban đêm (đèn đường, cửa sổ). */
const glowMats = new Map<THREE.MeshStandardMaterial, { day: number; night: number }>();
export function registerGlow(mat: THREE.MeshStandardMaterial, day: number, night: number): THREE.MeshStandardMaterial {
  glowMats.set(mat, { day, night });
  return mat;
}

/** Đèn điểm (đèn phòng) sáng hơn ban đêm. */
const nightLights = new Map<THREE.Light, { day: number; night: number }>();
export function registerNightLight<T extends THREE.Light>(light: T, day: number, night: number): T {
  nightLights.set(light, { day, night });
  light.intensity = day;
  return light;
}

/** Số vật liệu/đèn đã đăng ký theo mức đêm (để test và gỡ lỗi). */
export function nightRegistrySize(): { glows: number; lights: number } {
  return { glows: glowMats.size, lights: nightLights.size };
}

/** Đặt mức "đêm" 0..1 cho các vật liệu phát sáng và đèn phòng. */
export function setNight(k: number): void {
  for (const [mat, v] of glowMats) mat.emissiveIntensity = v.day + (v.night - v.day) * k;
  for (const [light, v] of nightLights) light.intensity = v.day + (v.night - v.day) * k;
}

/** Thêm một hàm chuyển động chạy mỗi khung hình (đồng hồ, LED nhấp nháy...). */
export function addAnimator(fn: (t: number) => void): void {
  animators.push(fn);
}

interface SkyUniforms {
  top: { value: THREE.Color };
  bottom: { value: THREE.Color };
}
let skyUniforms: SkyUniforms | null = null;
export function getSkyUniforms(): SkyUniforms | null {
  return skyUniforms;
}

/** Bộ dịch chữ trên các bảng/biển vẽ bằng canvas (đặt từ renderer trước khi dựng cảnh). Mặc định trả nguyên khoá. */
let T: (key: string) => string = (k) => k;
export function setDecorTranslator(fn: (key: string) => string): void {
  T = fn;
}

/** Danh sách hàm chuyển động, chạy mỗi khung hình. */
const animators: Array<(t: number) => void> = [];
let sky: THREE.Mesh | null = null;

/** Xoá trạng thái toàn cục (hàm chuyển động, vật liệu phát sáng) trước khi dựng lại cảnh — tránh rò rỉ khi mount lại. */
export function resetDecor(): void {
  animators.length = 0;
  glowMats.clear();
  nightLights.clear();
  sky = null;
  skyUniforms = null;
}

/** Gọi mỗi khung hình từ vòng lặp chính. */
export function tickDecor(t: number, camera: THREE.Camera): void {
  if (sky) sky.position.copy(camera.position);
  for (const fn of animators) fn(t);
}

/**
 * Gộp các mesh tĩnh cùng vật liệu thành một mesh duy nhất (giảm hàng trăm draw call).
 * Hình học được "nướng" theo toạ độ thế giới nên `target` phải là scene (không có biến đổi).
 */
export function mergeStatic(source: THREE.Object3D, target: THREE.Object3D, castShadow: boolean): void {
  source.updateWorldMatrix(true, true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const list = buckets.get(m.material) ?? [];
    list.push(geo);
    buckets.set(m.material, list);
  });
  for (const [mat, list] of buckets) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    target.add(mesh);
  }
}

// ---------------------------------------------------------------------------
// Môi trường ngoài trời
// ---------------------------------------------------------------------------

/** Nền lát dưới toàn bộ toà nhà (tâm + kích thước). Mọi phòng phải nằm trong nền này (test `facilities.layout`). */
export const SLAB = { cx: 5.25, cz: -4, w: 50, d: 46 };

function makeTree(x: number, z: number, scale: number, variant: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = cyl(0.14 * scale, 0.2 * scale, 1.4 * scale, std(0x7a5636), 0, 0.7 * scale, 0, 8);
  g.add(trunk);
  const leaf = [0x4f8f4a, 0x5fa052, 0x3f7d46][variant % 3];
  if (variant % 2 === 0) {
    g.add(ball(0.95 * scale, std(leaf, 0.9), 0, 1.9 * scale, 0, true, 8));
    g.add(ball(0.65 * scale, std(leaf, 0.9), 0.5 * scale, 1.5 * scale, 0.2 * scale, true, 8));
  } else {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry((1.0 - i * 0.22) * scale, 1.2 * scale, 10), std(leaf, 0.9));
      c.position.y = (1.5 + i * 0.7) * scale;
      c.castShadow = true;
      g.add(c);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = x * 7.3 + z * 3.1;
  return g;
}

function makeLampPost(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.07, 3.2, std(0x30363d, 0.5, 0.6), 0, 1.6, 0, 8, false));
  g.add(box(0.5, 0.06, 0.1, std(0x30363d, 0.5, 0.6), 0.2, 3.2, 0, false));
  g.add(ball(0.14, registerGlow(std(0xfff2c4, 0.4, 0, 0xffe08a, 0.15), 0.15, 2.6), 0.4, 3.12, 0, false));
  g.position.set(x, 0, z);
  return g;
}

function makeBench(x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  const wood = std(0xa87f52, 0.75);
  g.add(box(1.5, 0.07, 0.45, wood, 0, 0.5, 0));
  g.add(box(1.5, 0.4, 0.06, wood, 0, 0.78, -0.2));
  for (const sx of [-0.6, 0.6]) g.add(box(0.06, 0.5, 0.4, std(0x30363d, 0.5, 0.6), sx, 0.25, 0));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function makeFountain(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(1.25, 1.35, 0.4, std(0xb9b4aa, 0.9), 0, 0.2, 0, 28));
  const water = cyl(1.05, 1.05, 0.05, std(0x6fb7e6, 0.15, 0.1, 0x2c6fa0, 0.35), 0, 0.4, 0, 28, false);
  g.add(water);
  g.add(cyl(0.18, 0.28, 0.9, std(0xb9b4aa, 0.9), 0, 0.85, 0, 12));
  const jet = cyl(0.05, 0.12, 0.5, std(0xbfe6ff, 0.2, 0, 0x7ec4f2, 0.6), 0, 1.5, 0, 10, false);
  (jet.material as THREE.MeshStandardMaterial).transparent = true;
  (jet.material as THREE.MeshStandardMaterial).opacity = 0.75;
  g.add(jet);
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.36, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.43;
  g.add(ripple);
  animators.push((t) => {
    const k = (t * 0.5) % 1;
    ripple.scale.setScalar(1 + k * 2.6);
    (ripple.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    jet.scale.y = 1 + Math.sin(t * 5) * 0.12;
  });
  g.position.set(x, 0, z);
  return g;
}

/** Bầu trời, mây, mặt đất, nền lát gạch, cây xanh và tiểu cảnh quanh toà nhà. */
export function buildEnvironment(scene: THREE.Object3D, ground: THREE.Mesh): void {
  const envStatic = new THREE.Group();

  // --- Bầu trời chuyển màu (đi theo camera) ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5a9be3) },
      bottom: { value: new THREE.Color(0xcdd9e6) },
    },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: [
      "uniform vec3 top; uniform vec3 bottom; varying float h;",
      "void main(){",
      "  float t = smoothstep(0.0, 0.6, h);",
      "  gl_FragColor = vec4(mix(bottom, top, t), 1.0);",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  });
  skyUniforms = skyMat.uniforms as unknown as SkyUniforms;
  sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // --- Mây trôi chậm ---
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + (k % 2) * 1.5, 10, 8), cloudMat);
      puff.scale.set(1.6, 0.55, 1);
      puff.position.set((k - 1.5) * 3.4, (k % 2) * 0.6, (k % 3) * 0.8);
      c.add(puff);
    }
    c.position.set(-110 + ((i * 53) % 220), 48 + (i % 3) * 7, -90 + ((i * 37) % 150));
    scene.add(c);
    clouds.push(c);
  }
  animators.push((t) => {
    clouds.forEach((c, i) => {
      c.position.x += 0.004 + i * 0.0007;
      if (c.position.x > 120) c.position.x = -120;
    });
    void t;
  });

  // --- Bãi cỏ ---
  ground.position.y = -0.03;
  ground.scale.set(3, 3, 1);
  const grassTex = canvasTexture(256, 256, (c) => {
    c.fillStyle = "#8db077";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const g = 120 + Math.floor(Math.random() * 60);
      c.fillStyle = `rgba(${70 + Math.floor(Math.random() * 40)},${g},${60 + Math.floor(Math.random() * 30)},0.35)`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(70, 70);
  (ground.material as THREE.MeshStandardMaterial).map = grassTex;
  (ground.material as THREE.MeshStandardMaterial).color.set(0xffffff);
  (ground.material as THREE.MeshStandardMaterial).needsUpdate = true;

  // --- Nền lát gạch dưới toàn bộ toà nhà ---
  const tileTex = canvasTexture(128, 128, (c) => {
    c.fillStyle = "#d6d2c8";
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "rgba(120,114,100,0.55)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 126, 126);
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(6, 6, 54, 54);
    c.fillRect(70, 70, 52, 52);
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(SLAB.w / 2.2, SLAB.d / 2.2);
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(SLAB.w, SLAB.d),
    new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(SLAB.cx, 0.004, SLAB.cz);
  slab.receiveShadow = true;
  scene.add(slab);

  // Gờ viền nền
  const curb = std(0x9a958a, 0.9);
  const hw = SLAB.w / 2;
  const hd = SLAB.d / 2;
  for (const [w, d, x, z] of [
    [SLAB.w + 0.4, 0.4, 0, -hd],
    [SLAB.w + 0.4, 0.4, 0, hd],
    [0.4, SLAB.d, -hw, 0],
    [0.4, SLAB.d, hw, 0],
  ] as const) {
    envStatic.add(box(w, 0.14, d, curb, SLAB.cx + x, 0.07, SLAB.cz + z, false));
  }

  // --- Cây xanh & bụi cây quanh viền ---
  let n = 0;
  const ring = (x: number, z: number): void => {
    envStatic.add(makeTree(x, z, 1.0 + (n % 3) * 0.18, n));
    n++;
  };
  for (let x = SLAB.cx - hw - 2; x <= SLAB.cx + hw + 2; x += 5.2) {
    ring(x, SLAB.cz - hd - 2.4);
    // Chừa lối nhìn vào sảnh lễ tân ở góc trước-trái (x từ -18 đến -8).
    if (x + 2.2 < -18 || x + 2.2 > -8) ring(x + 2.2, SLAB.cz + hd + 2.4);
  }
  for (let z = SLAB.cz - hd + 3; z <= SLAB.cz + hd - 3; z += 5.6) {
    ring(SLAB.cx - hw - 2.6, z);
    ring(SLAB.cx + hw + 2.6, z + 1.4);
  }
  // Bụi cây sát viền
  const bush = std(0x4a8a48, 0.95);
  for (let x = SLAB.cx - hw + 1; x < SLAB.cx + hw; x += 3.1) {
    envStatic.add(ball(0.5, bush, x, 0.35, SLAB.cz + hd + 0.9, false));
    envStatic.add(ball(0.5, bush, x + 1.5, 0.35, SLAB.cz - hd - 0.9, false));
  }

  // --- Đèn đường ---
  for (const x of [-18, 26.8]) for (const z of [-25, -14, -3, 8, 15]) envStatic.add(makeLampPost(x, z));

  // --- Tiểu cảnh giữa toà nhà ---
  scene.add(makeFountain(0, 5.9));
  envStatic.add(makeBench(-2.6, 5.9, Math.PI));
  envStatic.add(makeBench(2.6, 5.9, Math.PI));
  for (const x of [-7, 7]) {
    envStatic.add(makeBench(x, 0.2, x < 0 ? Math.PI / 2 : -Math.PI / 2));
    envStatic.add(makeTree(x, -9.2, 0.75, 0));
    envStatic.add(makeTree(x, 6.2, 0.75, 1));
  }
  envStatic.add(makeBench(-13, 0.6, Math.PI));
  envStatic.add(makeBench(13, 0.6, Math.PI));

  // Lối đi vào: vạch kẻ đường trước cổng chính (trục Z phía trước toà nhà).
  const stripe = std(0xf1ead2, 0.8);
  for (let z = 15; z > 12.8; z -= 0.9) envStatic.add(box(0.5, 0.01, 0.4, stripe, 0, 0.012, z, false));
  mergeStatic(envStatic, scene, false);
}

// ---------------------------------------------------------------------------
// Đồ đặc trưng cho từng phòng (thay các hộp xám)
// ---------------------------------------------------------------------------

/** Quầy tổng đài + điện thoại (Phòng Khách hàng). */
export function buildPhoneProp(): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xf3efe6, 0.5);
  g.add(box(1.1, 0.9, 0.6, std(0x5b7ea8, 0.7), 0, 0.45, 0));
  g.add(box(1.16, 0.06, 0.66, white, 0, 0.93, 0));
  // Máy bàn + ống nghe
  g.add(box(0.3, 0.08, 0.26, std(0x232a33, 0.4), -0.2, 1.0, 0.05));
  g.add(box(0.34, 0.06, 0.07, std(0x232a33, 0.4), -0.2, 1.07, 0.05));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.add(box(0.05, 0.015, 0.05, std(0xb8c0cc, 0.4), -0.28 + i * 0.08, 1.045, 0.0 + j * 0.06, false));
  // Tai nghe
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), std(0x232a33, 0.5));
  band.position.set(0.25, 1.06, 0.02);
  g.add(band);
  g.add(ball(0.03, std(0x232a33), 0.15, 0.96 + 0.1, 0.02, false));
  g.add(ball(0.03, std(0x232a33), 0.35, 0.96 + 0.1, 0.02, false));
  // Biển "SUPPORT"
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.28),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 80, (c) => {
        c.fillStyle = "#1f6feb";
        c.fillRect(0, 0, 256, 80);
        c.fillStyle = "#fff";
        c.font = "bold 36px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(T("scene.support247"), 128, 42);
      }),
    }),
  );
  sign.position.set(0, 0.5, 0.305);
  g.add(sign);
  return g;
}

/** Phễu bán hàng nhiều tầng, xoay chậm (Phòng Bán hàng). */
export function buildFunnelProp(): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(cyl(0.6, 0.65, 0.1, std(0x3a4350, 0.6), 0, 0.05, 0));
  const tiers: Array<[number, number, number]> = [
    [0.62, 0.5, 0xf7b32b],
    [0.5, 0.38, 0xf59e3b],
    [0.38, 0.26, 0xee7f3c],
    [0.26, 0.14, 0xe0593f],
  ];
  tiers.forEach(([rTop, rBot, color], i) => {
    spin.add(cyl(rTop, rBot, 0.3, std(color, 0.45, 0.1), 0, 1.15 - i * 0.3, 0, 20));
  });
  spin.add(cyl(0.12, 0.12, 0.28, std(0xe0593f, 0.45), 0, 0.14 + 0.12, 0, 12));
  g.add(spin);
  // Hạt "khách hàng" rơi xuống phễu
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const d = ball(0.05, std(0xffffff, 0.3, 0, 0xffffff, 0.4), 0, 1.5, 0, false);
    dots.push(d);
    g.add(d);
  }
  animators.push((t) => {
    spin.rotation.y = t * 0.6;
    dots.forEach((d, i) => {
      const k = (t * 0.45 + i / dots.length) % 1;
      const r = 0.45 * (1 - k);
      d.position.set(Math.cos(i * 2.4 + t) * r, 1.55 - k * 1.35, Math.sin(i * 2.4 + t) * r);
    });
  });
  return g;
}

/** Bục biểu đồ cột có chuyển động (Phòng Tài chính). */
export function buildChartProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.5, 0.12, 0.8, std(0x3a4350, 0.6), 0, 0.06, 0));
  const colors = [0x43c59e, 0x4f9cf9, 0xf7b32b, 0x8f7bf0, 0xef6f8e];
  const bars: THREE.Mesh[] = [];
  const base = [0.5, 0.75, 0.6, 1.0, 0.85];
  colors.forEach((c, i) => {
    const b = box(0.2, 1, 0.3, std(c, 0.5), -0.56 + i * 0.28, 0.12, 0);
    b.geometry.translate(0, 0.5, 0);
    b.position.y = 0.12;
    bars.push(b);
    g.add(b);
  });
  // Khung lưới phía sau
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.3),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 240, (c) => {
        c.fillStyle = "#f6f4ee";
        c.fillRect(0, 0, 256, 240);
        c.strokeStyle = "rgba(60,70,90,0.25)";
        c.lineWidth = 1;
        for (let y = 30; y < 240; y += 40) {
          c.beginPath();
          c.moveTo(10, y);
          c.lineTo(246, y);
          c.stroke();
        }
        c.fillStyle = "#1f2937";
        c.font = "bold 20px sans-serif";
        c.fillText(T("scene.revenue"), 14, 22);
      }),
    }),
  );
  back.position.set(0, 0.85, -0.36);
  g.add(back);
  animators.push((t) => {
    bars.forEach((b, i) => {
      b.scale.y = Math.max(0.05, base[i] * (0.85 + 0.15 * Math.sin(t * 1.4 + i * 1.3)));
    });
  });
  return g;
}

/** Tủ server có LED nhấp nháy (Phòng Đội AI). */
export function buildServerRackProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.95, 2.0, 0.8, std(0x1c222b, 0.5, 0.4), 0, 1.0, 0));
  const leds: Array<{ mat: THREE.MeshBasicMaterial; phase: number; speed: number; on: THREE.Color; off: THREE.Color }> = [];
  for (let s = 0; s < 7; s++) {
    const y = 0.28 + s * 0.26;
    g.add(box(0.82, 0.2, 0.04, std(0x2d3541, 0.4, 0.5), 0, y, 0.41, false));
    g.add(box(0.5, 0.025, 0.02, std(0x0f1318, 0.8), -0.1, y, 0.435, false));
    for (let k = 0; k < 3; k++) {
      const on = new THREE.Color([0x4ade80, 0x60a5fa, 0xfbbf24][(s + k) % 3]);
      const mat = new THREE.MeshBasicMaterial({ color: on });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), mat);
      led.position.set(0.22 + k * 0.07, y, 0.435);
      g.add(led);
      leds.push({ mat, phase: Math.random() * 10, speed: 2 + Math.random() * 5, on, off: on.clone().multiplyScalar(0.12) });
    }
  }
  animators.push((t) => {
    for (const l of leds) l.mat.color.copy(Math.sin(t * l.speed + l.phase) > -0.2 ? l.on : l.off);
  });
  return g;
}

/** Bảng có nội dung vẽ sẵn: lộ trình dự án / lịch nội dung. */
export function buildBoardArt(kind: "roadmap" | "content", w: number, h: number): THREE.Mesh {
  const tex = canvasTexture(1024, Math.round((1024 * h) / w), (c) => {
    const W = 1024;
    const H = Math.round((1024 * h) / w);
    c.fillStyle = "#f8f6f0";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#1f2937";
    c.font = "bold 54px sans-serif";
    c.textBaseline = "middle";
    if (kind === "roadmap") {
      c.fillText(T("scene.roadmap"), 40, 56);
      const y = H * 0.58;
      c.strokeStyle = "#1f6feb";
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(70, y);
      c.lineTo(W - 70, y);
      c.stroke();
      const items = [
        ["Q1", T("scene.q1"), "#43c59e"],
        ["Q2", T("scene.q2"), "#4f9cf9"],
        ["Q3", T("scene.q3"), "#f7b32b"],
        ["Q4", T("scene.q4"), "#8f7bf0"],
      ];
      items.forEach(([q, label, color], i) => {
        const x = 130 + i * ((W - 260) / 3);
        c.fillStyle = color;
        c.beginPath();
        c.arc(x, y, 34, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.font = "bold 30px sans-serif";
        c.textAlign = "center";
        c.fillText(q, x, y);
        c.fillStyle = "#1f2937";
        c.font = "28px sans-serif";
        c.fillText(label, x, y + 70);
        c.textAlign = "left";
      });
    } else {
      c.fillText(T("scene.contentCal"), 40, 56);
      const colors = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8"];
      const cols = 5;
      const rows = 2;
      const cw = (W - 80) / cols;
      const ch = (H - 130) / rows;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          c.fillStyle = colors[(r * 3 + k) % colors.length];
          c.fillRect(40 + k * cw + 6, 110 + r * ch + 6, cw - 12, ch - 12);
          c.fillStyle = "rgba(31,41,55,0.55)";
          c.fillRect(40 + k * cw + 24, 110 + r * ch + 28, cw - 60, 8);
          c.fillRect(40 + k * cw + 24, 110 + r * ch + 52, cw - 90, 8);
        }
      }
    }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

// ---------------------------------------------------------------------------
// Trang trí trong phòng
// ---------------------------------------------------------------------------

export function makePlant(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.26 * scale, 0.2 * scale, 0.42 * scale, std(0xc9694a, 0.8), 0, 0.21 * scale, 0, 12));
  g.add(cyl(0.24 * scale, 0.24 * scale, 0.03, std(0x4a3a2b), 0, 0.42 * scale, 0, 12, false));
  const leaf = std(0x4f9a4a, 0.85);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.11 * scale, 0.75 * scale, 5), leaf);
    l.position.set(Math.cos(a) * 0.16 * scale, 0.78 * scale, Math.sin(a) * 0.16 * scale);
    l.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    l.castShadow = true;
    g.add(l);
  }
  g.add(cyl(0.03, 0.03, 0.5 * scale, leaf, 0, 0.6 * scale, 0, 5, false));
  g.position.set(x, 0, z);
  return g;
}

export function makeSofa(x: number, z: number, rotY: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const m = std(color, 0.9);
  const dark = std(color, 0.9);
  g.add(box(1.9, 0.3, 0.85, m, 0, 0.25, 0));
  g.add(box(1.9, 0.5, 0.2, dark, 0, 0.62, -0.33));
  g.add(box(0.2, 0.42, 0.85, dark, -0.95, 0.4, 0));
  g.add(box(0.2, 0.42, 0.85, dark, 0.95, 0.4, 0));
  g.add(box(0.8, 0.1, 0.7, std(0xffffff, 0.95), -0.45, 0.45, 0.02, false));
  g.add(box(0.8, 0.1, 0.7, std(0xffffff, 0.95), 0.45, 0.45, 0.02, false));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function makeCoffeeTable(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.9, 0.05, 0.6, std(0xa87f52, 0.6), 0, 0.4, 0));
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.24, 0.24]) g.add(box(0.05, 0.4, 0.05, std(0x30363d, 0.5, 0.6), sx, 0.2, sz, false));
  g.add(cyl(0.05, 0.04, 0.09, std(0xffffff, 0.4), 0.1, 0.47, 0.05, 10, false));
  g.position.set(x, 0, z);
  return g;
}

function makeFilingCabinet(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 1.35, 0.55, std(0x7b8794, 0.5, 0.4), 0, 0.675, 0));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.6, 0.38, 0.02, std(0x93a0ad, 0.5, 0.4), 0, 0.25 + i * 0.42, 0.285, false));
    g.add(box(0.2, 0.03, 0.03, std(0x232a33, 0.4), 0, 0.3 + i * 0.42, 0.31, false));
  }
  g.position.set(x, 0, z);
  return g;
}

function makeTrophy(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.55, 0.5, std(0xf3efe6, 0.5), 0, 0.275, 0));
  const gold = std(0xf2c230, 0.25, 0.7);
  g.add(cyl(0.22, 0.1, 0.3, gold, 0, 0.72, 0, 14));
  g.add(cyl(0.04, 0.04, 0.15, gold, 0, 0.5 + 0.07, 0, 8));
  g.add(cyl(0.14, 0.14, 0.04, gold, 0, 0.57, 0, 12, false));
  g.position.set(x, 0, z);
  return g;
}

function makeRingLight(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const dark = std(0x232a33, 0.5, 0.4);
  g.add(cyl(0.02, 0.02, 1.7, dark, 0, 0.85, 0, 6, false));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.03, 0.5, 0.03, dark, Math.cos(a) * 0.25, 0.22, Math.sin(a) * 0.25, false);
    leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), std(0xffffff, 0.3, 0, 0xfff1d0, 1.2));
  ring.position.set(0, 1.75, 0);
  g.add(ring);
  g.position.set(x, 0, z);
  return g;
}

function makeGlobe(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.25, 0.06, std(0x6b4f33, 0.7), 0, 0.03, 0, 12));
  g.add(cyl(0.03, 0.03, 0.5, std(0x6b4f33, 0.7), 0, 0.3, 0, 6, false));
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 14),
    new THREE.MeshStandardMaterial({
      roughness: 0.5,
      map: canvasTexture(128, 64, (c) => {
        c.fillStyle = "#4f9cf9";
        c.fillRect(0, 0, 128, 64);
        c.fillStyle = "#58b368";
        for (const [px, py, pw, ph] of [[14, 14, 26, 22], [52, 10, 30, 18], [60, 32, 24, 22], [96, 18, 22, 14]]) c.fillRect(px, py, pw, ph);
      }),
    }),
  );
  globe.position.y = 0.88;
  globe.castShadow = true;
  g.add(globe);
  animators.push((t) => {
    globe.rotation.y = t * 0.35;
  });
  g.position.set(x, 0, z);
  return g;
}

const DESK_TOP = 0.78;

/** Băng ghế dài có màn hình cho phòng "Làm việc tự động" (đặt dưới 3 màn hình trôi nổi). */
function makeTerminalBench(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(6.8, 0.06, 0.9, std(0x2b3440, 0.5, 0.2), 0, DESK_TOP - 0.03, 0));
  for (const sx of [-3.3, 0, 3.3]) g.add(box(0.08, DESK_TOP - 0.06, 0.8, std(0x4a5463, 0.5, 0.4), sx, (DESK_TOP - 0.06) / 2, 0, false));
  g.position.set(x, 0, z);
  return g;
}

function makeWaterCooler(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.38, 0.9, 0.38, std(0xe7ecf1, 0.5), 0, 0.45, 0));
  g.add(cyl(0.15, 0.15, 0.42, std(0x7cc4ee, 0.2, 0, 0x4aa3d8, 0.3), 0, 1.11, 0, 14, false));
  g.add(box(0.12, 0.05, 0.1, std(0x3b82c4, 0.4), 0, 0.72, 0.2, false));
  g.position.set(x, 0, z);
  g.rotation.y = -Math.PI / 2;
  return g;
}

export function makeClock(): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 28),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (c) => {
        c.fillStyle = "#faf8f2";
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = "#1f2937";
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          c.fillRect(64 + Math.sin(a) * 52 - 2, 64 - Math.cos(a) * 52 - 2, 4, 4);
        }
      }),
    }),
  );
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.02, 8, 28), std(0x30363d, 0.5, 0.4));
  g.add(rim);
  const hand = (len: number, w: number, color: number): THREE.Group => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color }));
    m.position.y = len / 2;
    p.add(m);
    p.position.z = 0.004;
    g.add(p);
    return p;
  };
  const hour = hand(0.12, 0.02, 0x1f2937);
  const min = hand(0.19, 0.014, 0x1f2937);
  const sec = hand(0.2, 0.006, 0xe0593f);
  animators.push(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    sec.rotation.z = -(s / 60) * Math.PI * 2;
    min.rotation.z = -(m / 60) * Math.PI * 2;
    hour.rotation.z = -(h / 12) * Math.PI * 2;
  });
  return g;
}

export interface RoomLike {
  id: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
  floor: number;
  props: string[];
}

/** Trang trí chung + đặc trưng cho một phòng ban. */
export function buildRoomDecor(scene: THREE.Object3D, room: RoomLike): void {
  const { center: c, size: s } = room;
  // `g`: phần có chuyển động (đồng hồ, địa cầu, tủ server). `st`: phần tĩnh, gộp lại cho nhẹ.
  const g = new THREE.Group();
  g.position.set(c.x, 0, c.z);
  scene.add(g);
  const st = new THREE.Group();
  st.position.set(c.x, 0, c.z);

  const wallH = 3.2;
  const inW = s.w / 2 - 0.08;
  const inD = s.d / 2 - 0.08;
  const trim = std(0x8d836f, 0.8);
  const accent = std(room.floor, 0.9);

  // Len chân tường (tường lưng + 2 bên)
  st.add(box(s.w - 0.2, 0.14, 0.05, trim, 0, 0.07, -inD, false));
  for (const sx of [-1, 1]) st.add(box(0.05, 0.14, s.d - 0.2, trim, sx * inW, 0.07, 0, false));
  // Viền đỉnh tường
  const cap = std(0xb9b1a0, 0.8);
  st.add(box(s.w + 0.1, 0.08, 0.26, cap, 0, wallH + 0.04, -s.d / 2, false));
  for (const sx of [-1, 1]) st.add(box(0.26, 0.08, s.d + 0.1, cap, sx * (s.w / 2), wallH + 0.04, 0, false));
  // Ngưỡng cửa ở mép mở của phòng
  st.add(box(s.w - 0.2, 0.025, 0.14, std(0x1f6feb, 0.6), 0, 0.02, s.d / 2 - 0.1, false));

  // Thảm dưới khu bàn
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(s.w * 0.6, 4.6), Math.min(s.d * 0.55, 3.3)),
    new THREE.MeshStandardMaterial({
      roughness: 1,
      map: canvasTexture(128, 96, (cx) => {
        cx.fillStyle = "#" + new THREE.Color(room.floor).multiplyScalar(0.78).getHexString();
        cx.fillRect(0, 0, 128, 96);
        cx.strokeStyle = "rgba(255,255,255,0.55)";
        cx.lineWidth = 3;
        cx.strokeRect(8, 8, 112, 80);
        cx.strokeStyle = "rgba(255,255,255,0.25)";
        cx.strokeRect(16, 16, 96, 64);
      }),
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.016, 0.55);
  rug.receiveShadow = true;
  st.add(rug);

  // Cửa sổ trên 2 tường bên
  const frame = std(0xf3efe6, 0.6);
  const glass = registerGlow(std(0xbfe0ff, 0.15, 0, 0x7fb4e8, 0.5), 0.5, 1.8);
  for (const sx of [-1, 1]) {
    const x = sx * (inW - 0.02);
    st.add(box(0.08, 1.25, 1.75, frame, x, 1.8, -s.d * 0.1, false));
    st.add(box(0.1, 1.1, 1.6, glass, x, 1.8, -s.d * 0.1, false));
    st.add(box(0.11, 1.1, 0.05, frame, x, 1.8, -s.d * 0.1, false));
    st.add(box(0.11, 0.05, 1.6, frame, x, 1.8, -s.d * 0.1, false));
  }

  // Đồng hồ trên tường lưng
  const clock = makeClock();
  clock.position.set(0, 2.85, -inD + 0.03);
  g.add(clock);

  // Cây cảnh: 2 góc trước (+ góc sau nếu không vướng kệ sách)
  st.add(makePlant(-(inW - 0.4), inD - 0.4, 1.0));
  st.add(makePlant(inW - 0.4, inD - 0.4, 0.9));
  if (!room.props.includes("books") && !room.props.includes("terminal")) {
    st.add(makePlant(-(inW - 0.4), -(inD - 0.4), 1.15));
    st.add(makePlant(inW - 0.4, -(inD - 0.4), 1.05));
  }

  // Đồ đặc trưng từng phòng. Phòng làm việc để trống phía sau hai bàn; sofa chỉ có ở phòng Giám đốc.
  if (room.id !== "executive") st.add(makeWaterCooler(inW - 0.45, -0.7));
  switch (room.id) {
    case "dispatch":
      st.add(makeFilingCabinet(-(inW - 0.55), -(inD - 0.6)));
      break;
    case "sales":
      st.add(makeTrophy(-(inW - 0.9), -(inD - 0.8)));
      break;
    case "marketing":
      st.add(makeRingLight(inW - 0.8, 1.6));
      break;
    case "finance":
      st.add(makeFilingCabinet(-(inW - 0.55), -(inD - 0.6)));
      st.add(makeFilingCabinet(-(inW - 1.35), -(inD - 0.6)));
      break;
    case "ai-team":
      g.add(buildServerRackProp().translateX(inW - 0.9).translateZ(-(inD - 0.7)));
      break;
    case "automation":
      st.add(makeTerminalBench(0, -s.d * 0.34));
      break;
    case "library":
      g.add(makeGlobe(-(inW - 0.9), 1.4));
      break;
    case "executive":
      // Phòng góc của Giám đốc: bộ sofa tiếp khách, cúp, địa cầu, tủ hồ sơ.
      st.add(makeSofa(-(inW - 1.0), 0.0, Math.PI / 2, 0x6b5fc7));
      st.add(makeCoffeeTable(-(inW - 2.1), 0.0));
      st.add(makeTrophy(inW - 0.9, -(inD - 0.8)));
      st.add(makeFilingCabinet(-(inW - 0.55), -(inD - 0.6)));
      g.add(makeGlobe(inW - 0.9, 1.6));
      break;
  }
  mergeStatic(st, scene, true);
  void accent;
}
