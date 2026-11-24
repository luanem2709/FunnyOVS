/**
 * Clip kiểu Roblox: nhân vật R6 (6 khối: đầu, thân, 2 tay, 2 chân), thế giới gạch có "stud", chat bubble trắng, phụ đề đốt vào hình.
 * Không dùng tài sản/âm thanh/biểu tượng nào của Roblox — chỉ mượn BỐ CỤC khối của kiểu nhân vật. Mọi hình đều dựng bằng code.
 * Kết xuất theo từng khung: window.renderFrame(i) (render.mjs gọi và chụp ảnh), nên video xuất ra luôn đúng nhịp, không phụ thuộc tốc độ máy.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const FPS = 24;
const W = 1280;
const H = 720;
const CH = 536; // vùng hình 2.39:1 (1280×536), hai dải đen 92 px trên/dưới
const BAR = (H - CH) / 2;
window.FPS = FPS;

// ------------------------------------------------------------------ dữ liệu: timeline (từ giọng đọc thật), shot list, character bible
const load = async (f) => (await fetch(`/${f}`)).json();
const TIMING = await load("timing.json");
const SHOTDATA = await load("shots.json");
const CHARS = await load("characters.json");
const T = TIMING.scenes;
const TOTAL = TIMING.total;
window.TOTAL_FRAMES = Math.ceil(TOTAL * FPS);
const hexInt = (h) => parseInt(String(h).replace("#", ""), 16);
/** Đổi mọi trường màu dạng "#RRGGBB" của một mục character bible sang số cho three.js. */
const look = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? hexInt(v) : v]));

// Phụ đề: chia lời đọc thành cue ≤ 7 từ, thời gian chia theo số ký tự trong đúng khoảng giọng đọc (không phụ thuộc phỏng đoán)
const HILITE = /(tự do|tuần sau anh trả|đã xem)/gi;
const CUES = [];
for (const v of TIMING.voice) {
  if (v.scene === "title" || v.scene === "end") continue;
  const words = v.text.split(/\s+/);
  const chunks = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 7 || /[.:?!,]$/.test(w) && cur.length >= 3) { chunks.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) chunks.push(cur.join(" "));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let at = v.start;
  for (const c of chunks) {
    const d = (c.length / total) * v.dur;
    CUES.push([at, at + d + 0.12, c.replace(HILITE, "<b>$1</b>")]);
    at += d;
  }
}

// ------------------------------------------------------------------ renderer + ánh sáng
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, CH);
renderer.domElement.style.cssText = `position:absolute;left:0;top:${BAR}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("stage").prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, W / CH, 0.1, 500);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
scene.add(hemi, sun, sun.target);
const lamp = new THREE.PointLight(0xffc880, 0, 40, 1.6);
const glow = new THREE.PointLight(0x7fb8ff, 0, 14, 1.8);
scene.add(lamp, glow);

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lc = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(k));

// ------------------------------------------------------------------ vật liệu + khối
const mats = new Map();
function mat(color, o = {}) {
  const key = `${color}|${o.emissive ?? ""}|${o.opacity ?? 1}|${o.rough ?? ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.62, metalness: 0, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissive ? 1.1 : 0, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1 });
    mats.set(key, m);
  }
  return m;
}
function box(parent, w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y, z);
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const floorMats = new Map();
function floorMat(kind, w, d) {
  const key = `${kind}|${w}|${d}`;
  if (floorMats.has(key)) return floorMats.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (kind === "wood") {
    const tones = ["#b98a56", "#c4965f", "#ad7f4c", "#bf8f5a"];
    for (let i = 0; i < 8; i++) { g.fillStyle = tones[i % 4]; g.fillRect(0, i * 32, 256, 32); g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, i * 32, 256, 2); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(((i * 97) % 256), i * 32, 2, 32); }
  } else if (kind === "grass") {
    g.fillStyle = "#6bbf59"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)"; g.fillRect((i * 53) % 256, (i * 97) % 256, 3, 3); }
  } else {
    g.fillStyle = "#b9c3d1"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i++) { g.fillStyle = "rgba(0,0,0,.035)"; g.fillRect((i * 71) % 256, (i * 29) % 256, 2, 2); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / (kind === "grass" ? 8 : 6), d / (kind === "grass" ? 8 : 6));
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === "wood" ? 0.55 : 0.8, metalness: 0 });
  floorMats.set(key, m);
  return m;
}
const rboxGeo = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
function rmesh(parent, w, h, d, color, x, y, z, r = 0.15, o = {}) {
  const m = new THREE.Mesh(rboxGeo(w, h, d, r), mat(color, o));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// ------------------------------------------------------------------ mặt nhân vật (decal)
const faceCache = new Map();
function faceTex(kind) {
  if (faceCache.has(kind)) return faceCache.get(kind);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#1a1a1a";
  g.fillStyle = "#1a1a1a";
  g.lineCap = "round";
  g.lineWidth = 7;
  const eye = (x, y, rx = 7, ry = 11) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  if (kind === "shock") {
    for (const x of [40, 88]) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x, 54, 15, 0, 7); g.fill(); g.lineWidth = 4; g.stroke(); g.fillStyle = "#1a1a1a"; eye(x, 54, 5, 5); }
    g.beginPath(); g.ellipse(64, 98, 11, 15, 0, 0, 7); g.fill();
  } else if (kind === "tired") {
    g.lineWidth = 6;
    for (const x of [40, 88]) { g.beginPath(); g.moveTo(x - 12, 54); g.lineTo(x + 12, 56); g.stroke(); g.globalAlpha = 0.35; g.beginPath(); g.arc(x, 70, 11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.globalAlpha = 1; }
    g.beginPath(); g.moveTo(48, 98); g.lineTo(80, 98); g.stroke();
  } else if (kind === "sad") {
    eye(40, 56); eye(88, 56);
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(26, 36); g.lineTo(52, 28); g.moveTo(102, 36); g.lineTo(76, 28); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.arc(64, 112, 20, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  } else if (kind === "smirk") {
    eye(40, 56); eye(88, 56);
    g.beginPath(); g.moveTo(44, 98); g.quadraticCurveTo(70, 112, 94, 90); g.stroke();
  } else if (kind === "flat") {
    eye(40, 56); eye(88, 56);
    g.beginPath(); g.moveTo(48, 98); g.lineTo(80, 98); g.stroke();
  } else {
    eye(40, 54); eye(88, 54);
    g.beginPath(); g.arc(64, 78, 28, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(kind, t);
  return t;
}

// ------------------------------------------------------------------ nhân vật R6: đầu 1 + thân 2×2×1 + tay 1×2×1 + chân 1×2×1 (đơn vị: stud)
function makeChar(o) {
  const root = new THREE.Group();
  const skin = o.skin ?? 0xe7b98f;
  const torso = box(root, 2, 2, 1, o.shirt, 0, 3, 0);
  const arm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 1.5, 4, 0);
    box(g, 1, 1.15, 1, o.sleeve ?? o.shirt, 0, -0.575, 0);
    box(g, 1, 0.85, 1, skin, 0, -1.575, 0);
    root.add(g);
    return g;
  };
  const leg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.5, 2, 0);
    box(g, 1, 2, 1, o.pants, 0, -1, 0);
    box(g, 1.02, 0.35, 1.02, o.shoes ?? 0x20232b, 0, -1.83, 0.02);
    root.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const legL = leg(-1);
  const legR = leg(1);
  const headG = new THREE.Group();
  headG.position.set(0, 4.62, 0);
  const prof = [];
  const R = 0.64, HH = 0.58, F = 0.26;
  prof.push(new THREE.Vector2(0.0001, -HH));
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - F + Math.sin(a) * F, -HH + F - Math.cos(a) * F)); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - F + Math.cos(a) * F, HH - F + Math.sin(a) * F)); }
  prof.push(new THREE.Vector2(0.0001, HH));
  const head = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), mat(skin));
  head.castShadow = true;
  headG.add(head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: faceTex("smile"), transparent: true }));
  face.position.set(0, 0.0, 0.645);
  headG.add(face);
  if (o.hair === "short") { box(headG, 1.34, 0.4, 1.34, o.hairColor ?? 0x2a1d17, 0, 0.62, 0); box(headG, 1.34, 0.9, 0.3, o.hairColor ?? 0x2a1d17, 0, 0.15, -0.5); }
  if (o.hair === "long") { box(headG, 1.38, 0.42, 1.38, o.hairColor ?? 0x2a1d17, 0, 0.62, 0); box(headG, 1.38, 2.0, 0.34, o.hairColor ?? 0x2a1d17, 0, -0.35, -0.5); box(headG, 0.3, 1.6, 1.0, o.hairColor ?? 0x2a1d17, -0.68, -0.2, -0.1); box(headG, 0.3, 1.6, 1.0, o.hairColor ?? 0x2a1d17, 0.68, -0.2, -0.1); }
  if (o.hair === "bun") { box(headG, 1.34, 0.4, 1.34, o.hairColor ?? 0x3a2a24, 0, 0.62, 0); const bun = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), mat(o.hairColor ?? 0x3a2a24)); bun.position.set(0, 1.05, -0.3); bun.castShadow = true; headG.add(bun); }
  if (o.hair === "cap") { box(headG, 1.4, 0.45, 1.4, o.capColor ?? 0x2f6fdd, 0, 0.62, 0); box(headG, 1.2, 0.12, 0.7, o.capColor ?? 0x2f6fdd, 0, 0.45, 0.85); }
  root.add(headG);
  if (o.tie) box(root, 0.36, 1.35, 0.1, o.tie, 0, 3.15, 0.55);
  if (o.collar) box(root, 1.1, 0.16, 0.1, o.collar, 0, 3.98, 0.54);
  if (o.backpack) box(root, 1.5, 1.7, 0.7, o.backpack, 0, 3.15, -0.85);
  root.traverse((x) => { if (x.isMesh) { x.castShadow = true; } });
  return {
    root, torso, armL, armR, legL, legR, head: headG, face,
    setFace(kind) { face.material.map = faceTex(kind); face.material.needsUpdate = true; },
  };
}

// ------------------------------------------------------------------ nhân vật chính: chibi-plush (đầu to, thân nhỏ, tóc đen rối, vương miện xanh, cánh nhỏ, tim xanh)
const plushFaces = new Map();
function plushFaceTex(kind) {
  if (plushFaces.has(kind)) return plushFaces.get(kind);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.lineCap = "round";
  const eye = (x, y, rx = 22, ry = 30, glow = true) => {
    g.fillStyle = "#101014"; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
    if (glow) { g.fillStyle = "#bfe6ff"; g.beginPath(); g.ellipse(x - 5, y - 8, 6, 8, 0, 0, 7); g.fill(); g.fillStyle = "rgba(90,170,255,.85)"; g.beginPath(); g.ellipse(x + 3, y + 12, 11, 6, 0, 0, 7); g.fill(); }
  };
  const blush = () => { g.fillStyle = "rgba(110,170,255,.55)"; for (const x of [60, 196]) { g.beginPath(); g.ellipse(x, 162, 24, 13, 0, 0, 7); g.fill(); } };
  g.strokeStyle = "#101014"; g.fillStyle = "#101014"; g.lineWidth = 7;
  if (kind === "tired") {
    for (const x of [84, 172]) { g.beginPath(); g.moveTo(x - 20, 118); g.lineTo(x + 20, 122); g.stroke(); g.globalAlpha = 0.35; g.beginPath(); g.arc(x, 142, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.globalAlpha = 1; }
    blush(); g.beginPath(); g.moveTo(112, 178); g.lineTo(144, 178); g.stroke();
  } else if (kind === "shock") {
    for (const x of [84, 172]) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x, 118, 26, 0, 7); g.fill(); g.lineWidth = 5; g.stroke(); g.fillStyle = "#101014"; g.beginPath(); g.arc(x, 118, 9, 0, 7); g.fill(); }
    blush(); g.fillStyle = "#101014"; g.beginPath(); g.ellipse(128, 184, 12, 16, 0, 0, 7); g.fill();
  } else if (kind === "sad") {
    eye(92, 126); eye(164, 126); blush();
    g.lineWidth = 6; g.beginPath(); g.moveTo(58, 82); g.lineTo(104, 70); g.moveTo(198, 82); g.lineTo(152, 70); g.stroke();
    g.beginPath(); g.arc(128, 206, 18, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  } else if (kind === "smirk") {
    eye(92, 124); eye(164, 124); blush();
    g.beginPath(); g.moveTo(108, 180); g.quadraticCurveTo(132, 194, 156, 172); g.stroke();
  } else if (kind === "flat") {
    eye(92, 124); eye(164, 124); blush();
    g.beginPath(); g.moveTo(112, 180); g.lineTo(144, 180); g.stroke();
  } else {
    eye(92, 124); eye(164, 124); blush();
    g.beginPath(); g.arc(128, 168, 18, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  plushFaces.set(kind, t);
  return t;
}
function heartSprite(color = "#8aa6c8") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = color; g.font = "bold 52px 'Segoe UI Symbol', Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♥", 32, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.85 }));
  sp.scale.set(0.55, 0.55, 1);
  return sp;
}
/** Giao diện giống makeChar để dùng chung hàm tư thế; thêm hipY (độ cao hông) và update(t) cho cánh/tim. */
function makePlush(o = {}) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  const S = 1.3;
  inner.scale.setScalar(S);
  root.add(inner);
  const skin = o.skin ?? 0xf3f6fa;
  const shirt = o.shirt ?? 0x17171c;
  const torso = rmesh(inner, 1.25, 1.2, 0.9, shirt, 0, 1.5, 0, 0.3);
  if (o.tie) rmesh(inner, 0.24, 0.8, 0.1, o.tie, 0, 1.52, 0.47, 0.05);
  if (o.collar) rmesh(inner, 0.9, 0.14, 0.12, o.collar, 0, 2.02, 0.44, 0.05);
  const arm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.88, 2.0, 0);
    rmesh(g, 0.5, 0.55, 0.5, o.sleeve ?? shirt, 0, -0.25, 0, 0.2);
    rmesh(g, 0.44, 0.55, 0.44, skin, 0, -0.68, 0, 0.2, { emissive: 0x4a5058 });
    inner.add(g);
    return g;
  };
  const leg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.32, 0.9, 0);
    rmesh(g, 0.56, 0.5, 0.56, o.pants ?? 0x17171c, 0, -0.25, 0, 0.2);
    rmesh(g, 0.46, 0.42, 0.46, skin, 0, -0.62, 0, 0.18, { emissive: 0x4a5058 });
    rmesh(g, 0.54, 0.2, 0.66, 0xf4f4f4, 0, -0.8, 0.06, 0.09);
    inner.add(g);
    return g;
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  const headG = new THREE.Group();
  headG.position.set(0, 2.95, 0);
  const sc = [1.05, 0.95, 1.0];
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 32, 24), mat(skin, { emissive: 0x4a5058 }));
  head.scale.set(...sc); head.castShadow = true; headG.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.955, 32, 20, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.62, 1.3), new THREE.MeshBasicMaterial({ map: plushFaceTex("smile"), transparent: true }));
  face.scale.set(...sc); headG.add(face);
  // tóc đen rối kiểu "manhwa": nắp trên + nắp sau/hai bên (chừa mặt), vài chùm to hơi nhọn quanh đỉnh, mái chẻ trên trán — KHÔNG phủ xuống mặt
  const hairMat = mat(0x0d0d11, { rough: 0.95 });
  const up = new THREE.Vector3(0, 1, 0);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.99, 32, 16, 0, Math.PI * 2, 0, 1.0), hairMat);
  const capBack = new THREE.Mesh(new THREE.SphereGeometry(0.99, 32, 16, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0, 1.5), hairMat);
  for (const c of [capTop, capBack]) { c.scale.set(...sc); c.castShadow = true; headG.add(c); }
  const tuft = (phi, theta, len, rad, droop = 0) => {
    const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta) - droop, Math.sin(phi) * Math.sin(theta)).normalize();
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 6), hairMat);
    m.quaternion.setFromUnitVectors(up, dir);
    m.position.copy(dir).multiplyScalar(0.9 + len / 2 - 0.12);
    m.position.x *= sc[0]; m.position.y *= sc[1];
    m.castShadow = true;
    headG.add(m);
  };
  for (let i = 0; i < 9; i++) tuft(((i + 0.4) / 9) * Math.PI * 2, 0.5 + ((i * 5) % 4) * 0.1, 0.62 + ((i * 3) % 3) * 0.1, 0.3);
  // vương miện xanh nghiêng bên trái
  const crown = new THREE.Group();
  const cm = mat(0x8fd0ff, { emissive: 0x2f86d8 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.2, 14), cm); crown.add(ring);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 4), cm); sp.position.set(Math.cos(a) * 0.38, 0.33, Math.sin(a) * 0.38); crown.add(sp); }
  crown.scale.setScalar(0.8); crown.position.set(-0.42, 0.95, 0.05); crown.rotation.z = 0.38; crown.rotation.x = -0.1;
  headG.add(crown);
  inner.add(headG);
  // cánh nhỏ sau lưng
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.5, 1.75, -0.5);
    for (let i = 0; i < 3; i++) rmesh(w, 0.1, 0.9 - i * 0.18, 0.42 - i * 0.05, 0xd5d9e0, sx * (0.12 + i * 0.28), -i * 0.1, -0.02 * i, 0.04);
    w.rotation.y = sx * 0.55; w.rotation.z = sx * -0.25;
    inner.add(w); wings.push([w, sx]);
  }
  // tim xanh bay quanh
  const hearts = [];
  for (let i = 0; i < 6; i++) { const h = heartSprite(i % 2 ? "#8aa6c8" : "#6f94c9"); root.add(h); hearts.push(h); }
  root.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  return {
    root, torso, armL, armR, legL, legR, head: headG, face, hipY: 0.9 * S,
    setFace(kind) { face.material.map = plushFaceTex(kind); face.material.needsUpdate = true; },
    update(t) {
      for (const [w, sx] of wings) w.rotation.y = sx * (0.55 + Math.sin(t * 3.2) * 0.12);
      hearts.forEach((h, i) => { const a = t * 0.7 + i * 1.05; h.position.set(Math.cos(a) * 2.2, 3.6 + Math.sin(t * 1.3 + i * 2) * 0.7, Math.sin(a) * 1.6); h.visible = root.visible; });
    },
  };
}

function resetPose(c) {
  for (const p of [c.armL, c.armR, c.legL, c.legR]) p.rotation.set(0, 0, 0);
  c.head.rotation.set(0, 0, 0);
  c.torso.rotation.set(0, 0, 0);
  c.root.position.y = 0;
}
function poseWalk(c, t, speed = 7) {
  const s = Math.sin(t * speed);
  c.armL.rotation.x = s * 0.9; c.armR.rotation.x = -s * 0.9;
  c.legL.rotation.x = -s * 0.8; c.legR.rotation.x = s * 0.8;
  c.root.position.y = Math.abs(Math.cos(t * speed)) * 0.12;
}
function poseSit(c, seatY = 1.5) {
  c.legL.rotation.x = c.legR.rotation.x = -Math.PI / 2;
  c.root.position.y = seatY - (c.hipY ?? 2);
}
function poseType(c, t, amp = 1) {
  c.armL.rotation.x = -1.25 + Math.sin(t * 17) * 0.09 * amp;
  c.armR.rotation.x = -1.25 + Math.sin(t * 15 + 1.3) * 0.09 * amp;
  c.armL.rotation.z = 0.12; c.armR.rotation.z = -0.12;
}
function poseIdle(c, t) {
  c.armL.rotation.x = Math.sin(t * 1.6) * 0.06; c.armR.rotation.x = -Math.sin(t * 1.6) * 0.06;
  c.torso.rotation.z = Math.sin(t * 1.2) * 0.01;
}

// ------------------------------------------------------------------ chữ nổi (chat bubble kiểu Roblox, biển chữ)
function textSprite(text, o = {}) {
  const font = `${o.weight ?? 800} ${o.size ?? 44}px "Segoe UI", Arial, sans-serif`;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = font;
  const maxW = o.maxW ?? 620;
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  lines.push(cur);
  const lh = (o.size ?? 44) * 1.25;
  const wpx = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 56;
  const hpx = Math.ceil(lines.length * lh) + 44 + (o.tail === false ? 0 : 22);
  c.width = wpx; c.height = hpx;
  const g2 = c.getContext("2d");
  g2.font = font;
  const bodyH = hpx - (o.tail === false ? 0 : 22);
  g2.fillStyle = o.bg ?? "#ffffff";
  g2.beginPath();
  g2.roundRect(4, 4, wpx - 8, bodyH - 8, 22);
  g2.fill();
  if (o.tail !== false) { g2.beginPath(); g2.moveTo(wpx / 2 - 14, bodyH - 6); g2.lineTo(wpx / 2, hpx - 3); g2.lineTo(wpx / 2 + 14, bodyH - 6); g2.fill(); }
  g2.lineWidth = 3; g2.strokeStyle = o.stroke ?? "rgba(0,0,0,.18)"; g2.beginPath(); g2.roundRect(4, 4, wpx - 8, bodyH - 8, 22); g2.stroke();
  g2.fillStyle = o.color ?? "#1b1b1f";
  g2.textBaseline = "middle"; g2.textAlign = "center";
  lines.forEach((l, i) => g2.fillText(l, wpx / 2, 24 + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const k = o.scale ?? 0.011;
  sp.scale.set(wpx * k, hpx * k, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 10;
  sp.userData.base = sp.scale.clone();
  return sp;
}

// ------------------------------------------------------------------ đồ vật
function makeDesk(parent, x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  box(g, 7, 0.4, 3, 0xb98a56, 0, 3, 0);
  for (const sx of [-3.2, 3.2]) for (const sz of [-1.2, 1.2]) box(g, 0.4, 3, 0.4, 0x6e4e2e, sx, 1.5, sz);
  parent.add(g);
  return g;
}
function makeLaptop(parent, x, y, z, glowColor = 0x6fb4ff) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  box(g, 2.4, 0.16, 1.6, 0x9aa3b2, 0, 0.08, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.16, -0.8); lid.rotation.x = -0.1;
  box(lid, 2.4, 1.5, 0.12, 0x9aa3b2, 0, 0.75, 0);
  const screen = box(lid, 2.1, 1.25, 0.05, glowColor, 0, 0.78, 0.07, { emissive: glowColor, shadow: false });
  g.add(lid);
  g.userData.screen = screen;
  parent.add(g);
  return g;
}
function makeCup(parent, x, y, z, color = 0xf2f2f2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.62, 12), mat(color));
  m.position.set(x, y + 0.31, z); m.castShadow = true; parent.add(m);
  return m;
}
function makeChair(parent, x, z, color = 0x3b5ba8, seatY = 1.5) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(g, 2.2, 0.35, 2.2, color, 0, seatY - 0.2, 0);
  box(g, 2.2, 1.8, 0.3, color, 0, seatY + 0.8, -1.0);
  box(g, 0.35, seatY - 0.4, 0.35, 0x333a48, 0, (seatY - 0.4) / 2, 0);
  box(g, 2.0, 0.2, 0.3, 0x333a48, 0, 0.1, 0); box(g, 0.3, 0.2, 2.0, 0x333a48, 0, 0.1, 0);
  parent.add(g);
  return g;
}
function makePlant(parent, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  box(g, 1.2, 1.0, 1.2, 0xc8643d, 0, 0.5, 0);
  box(g, 1.5, 1.3, 1.5, 0x3fa04b, 0, 1.6, 0); box(g, 1.0, 1.0, 1.0, 0x56b85e, 0.2, 2.5, -0.1);
  parent.add(g); return g;
}
function makeRoom(w, d, wall, floorKind) {
  const g = new THREE.Group();
  const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), floorMat(floorKind, w, d));
  fl.position.y = -0.25; fl.receiveShadow = true; g.add(fl);
  box(g, w, 9, 0.6, wall, 0, 4.5, -d / 2 - 0.3);
  box(g, 0.6, 9, d, wall, -w / 2 - 0.3, 4.5, 0);
  box(g, w, 0.4, 0.8, 0xe8e2d4, 0, 0.2, -d / 2 + 0.2);
  return g;
}
function makeWindow(parent, x, y, z, nightK = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  box(g, 5, 4, 0.3, 0xf2efe6, 0, 0, 0);
  const pane = box(g, 4.2, 3.2, 0.2, 0x9ed4ff, 0, 0, 0.12, { emissive: 0x9ed4ff, shadow: false });
  box(g, 0.2, 3.3, 0.25, 0xf2efe6, 0, 0, 0.2); box(g, 4.3, 0.2, 0.25, 0xf2efe6, 0, 0, 0.2);
  parent.add(g); g.userData.pane = pane; return g;
}

// ------------------------------------------------------------------ chat bảng (DOM) cho tin nhắn
const stage = document.getElementById("stage");
const chat = document.createElement("div");
Object.assign(chat.style, { position: "absolute", right: "40px", top: "90px", width: "340px", display: "none", flexDirection: "column", gap: "10px", font: "700 22px 'Segoe UI', Arial, sans-serif" });
stage.appendChild(chat);
function chatHtml(title, color, msgs) {
  const head = `<div style="background:#1f2430;color:#fff;border-radius:14px 14px 0 0;padding:10px 14px;display:flex;align-items:center;gap:10px"><span style="width:26px;height:26px;border-radius:7px;background:${color};display:inline-block"></span>${title}</div>`;
  const body = msgs.map((m) => `<div style="align-self:${m.me ? "flex-end" : "flex-start"};max-width:260px;background:${m.me ? "#2f6fdd" : "#ffffff"};color:${m.me ? "#fff" : "#1b1b1f"};padding:8px 14px;border-radius:16px;margin-top:8px">${m.text}${m.seen ? '<div style="font-size:14px;opacity:.75;text-align:right;margin-top:2px">Đã xem</div>' : ""}</div>`).join("");
  return `<div style="background:rgba(20,24,34,.88);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.45)">${head}<div style="display:flex;flex-direction:column;padding:6px 12px 14px;min-height:60px">${body}</div></div>`;
}
const chatState = { html: "" };
function setChat(html) {
  if (chatState.html === html) return;
  chatState.html = html;
  chat.innerHTML = html;
  chat.style.display = html ? "flex" : "none";
}

// ------------------------------------------------------------------ dựng thế giới
const world = new THREE.Group();
scene.add(world);

// --- phòng trọ (cảnh 1-5, 7)
const bedsit = new THREE.Group();
world.add(bedsit);
const room1 = makeRoom(26, 18, 0xd9c7a3, "wood");
room1.position.set(0, 0, 0);
bedsit.add(room1);
const win1 = makeWindow(bedsit, -6, 5.5, -8.6);
makeDesk(bedsit, -3, 2.5);
makeChair(bedsit, -3, 0.3, 0x3b5ba8, 2.3);
const laptop = makeLaptop(bedsit, -3, 3.2, 2.1);
laptop.rotation.y = Math.PI; // màn hình quay về phía người ngồi, lưng quay về camera
box(bedsit, 6, 1.2, 9, 0xe9edf5, 8.5, 0.6, -3.4);
box(bedsit, 6, 0.6, 3, 0xf7f7fb, 8.5, 1.5, -6.4);
box(bedsit, 6, 1.4, 6, 0x6b82c9, 8.5, 1.5, -1.4);
box(bedsit, 3.2, 3.6, 0.2, 0xf5d36b, -10.5, 6.5, -8.55); // áp phích
box(bedsit, 2.6, 3.0, 0.1, 0xe3524b, -10.5, 6.5, -8.42);
makePlant(bedsit, -11, -6.5, 1.1);
const calendar = box(bedsit, 2.6, 3.2, 0.12, 0xffffff, 3, 6.4, -8.55);
const cups = [];
for (let i = 0; i < 6; i++) { const cup = makeCup(bedsit, -0.9 + (i % 3) * 0.62, 3.2 + Math.floor(i / 3) * 0.62, 3.0 - Math.floor(i / 3) * 0.2, 0xf2f2f2); cup.visible = false; cups.push(cup); }
const hero = makePlush(look(CHARS.hero));
hero.root.position.set(-3, 0, 0.3);
bedsit.add(hero.root);
const bubbleHero = textSprite("TỰ DO ✨", { size: 46 });
bubbleHero.position.set(-3, 7.4, 0.3);
bedsit.add(bubbleHero);

// mẹ + hộp cơm
const mom = makeChar(look(CHARS.mom));
mom.root.visible = false;
bedsit.add(mom.root);
const lunch = new THREE.Group();
box(lunch, 1.5, 0.9, 1.1, 0xe9a23b, 0, 0.45, 0); box(lunch, 1.6, 0.25, 1.2, 0xc67f1d, 0, 1.0, 0);
lunch.visible = false; bedsit.add(lunch);
// sinh viên
const student = makeChar(look(CHARS.student));
student.root.visible = false;
bedsit.add(student.root);
const studentBubble = textSprite("Anh ơi, cho em làm cùng với.", { size: 40, maxW: 520 });
studentBubble.position.set(-8.2, 6.6, 6);
bedsit.add(studentBubble);

// --- cảnh 6: hàng 12 khách (ngoài trời)
const outdoor = new THREE.Group();
world.add(outdoor);
outdoor.position.set(0, 0, 200);
const ground = new THREE.Group();
const gr = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 40), floorMat("grass", 70, 40));
gr.position.y = -0.25; gr.receiveShadow = true; ground.add(gr);
outdoor.add(ground);
const clients = [];
const clientColors = CHARS.clients.mau_ao.map(hexInt);
for (let i = 0; i < 12; i++) {
  const c = makeChar({ shirt: clientColors[i], pants: 0x23262e, hair: i % 3 === 0 ? "cap" : "short", capColor: clientColors[(i + 5) % 12], hairColor: 0x201814, skin: CHARS.clients.mau_da.map(hexInt)[i % 3], tie: i % 2 ? 0xc0392b : undefined });
  c.root.position.set(-24 + i * 4.4, 0, 0);
  c.root.visible = false;
  c.sign = i >= 3; // 9 người cầm biển
  if (c.sign) { const s = textSprite("TUẦN SAU ANH TRẢ", { size: 36, bg: "#d6403a", color: "#fff", tail: false, maxW: 230, scale: 0.0085 }); s.position.set(0, 6.0, 0.4); c.root.add(s); c.signSprite = s; c.face = c.face; c.setFace("smirk"); }
  else c.setFace("smile");
  outdoor.add(c.root);
  clients.push(c);
}
const heroSmall = makePlush(look(CHARS.hero));
heroSmall.root.position.set(-11, 0, 9); heroSmall.root.rotation.y = 0.35; outdoor.add(heroSmall.root);

// --- cảnh 8: văn phòng nhỏ năm thứ ba
const office = new THREE.Group();
world.add(office);
office.position.set(0, 0, -200);
const room8 = makeRoom(30, 18, 0x9dbbe8, "concrete");
office.add(room8);
makeWindow(office, 6, 5.8, -8.6); makeWindow(office, -8, 5.8, -8.6);
makeDesk(office, -6, 3.0); makeChair(office, -6, 0.2, 0xa83b3b);
makeLaptop(office, -6, 3.2, 2.6, 0x6fe0a3).rotation.y = Math.PI;
makePlant(office, 11, -6, 1.3); makePlant(office, -13, 4, 1.0);
const cups8 = [];
for (let i = 0; i < 4; i++) cups8.push(makeCup(office, -8 + i * 0.7, 3.2, 3.6, 0xf2f2f2));
const stu8 = makeChar(look(CHARS.student));
stu8.root.position.set(-6, 0, 0.2); office.add(stu8.root);
const boss = makePlush(look({ ...CHARS.hero, ...CHARS.hero.bien_the.vest }));
boss.root.position.set(-1.5, 0, -2.2); boss.root.rotation.y = 0.35; office.add(boss.root);
const bossBubble = textSprite("Gấp nhé, tuần sau anh trả.", { size: 44, maxW: 560 });
bossBubble.position.set(-1.5, 7.6, -2.2);
office.add(bossBubble);

// ------------------------------------------------------------------ môi trường theo cảnh
const SKY_DAY = 0xbfe3ff;
const SKY_DUSK = 0xf2b98a;
const SKY_NIGHT = 0x0e1630;
function env(skyHex, dayK, o = {}) {
  scene.background = new THREE.Color(skyHex);
  hemi.color.set(lc(0x3a4a7a, 0xffffff, dayK));
  hemi.groundColor.set(lc(0x1b2236, 0x8899aa, dayK));
  hemi.intensity = lerp(0.55, 1.0, dayK);
  sun.color.set(lc(0x6f86c8, 0xfff2dc, dayK));
  sun.intensity = lerp(0.18, 1.25, dayK);
  sun.position.set(o.sunX ?? -18, o.sunY ?? lerp(26, 42, dayK), o.sunZ ?? 24);
  sun.target.position.set(o.tx ?? -2, 0, o.tz ?? 0);
  lamp.intensity = o.lamp ?? 0; glow.intensity = o.glow ?? 0;
}

// ------------------------------------------------------------------ bảng điều khiển hiển thị
const subEl = document.getElementById("sub");
const titleEl = document.getElementById("title");
const fadeEl = document.getElementById("fade");
const hud = document.getElementById("hud");
const chip = document.getElementById("chip");

function cam() {} // (cũ) máy quay giờ do shots.json điều khiển — xem applyShot
function camOld(from, to, lookFrom, lookTo, k) {
  const e = ease(k);
  camera.position.set(lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e));
  camera.lookAt(lerp(lookFrom[0], lookTo[0], e), lerp(lookFrom[1], lookTo[1], e), lerp(lookFrom[2], lookTo[2], e));
}

function showOnly(name) {
  bedsit.visible = name === "bedsit";
  outdoor.visible = name === "outdoor";
  office.visible = name === "office";
}
function popBubble(sp, k) {
  const e = ease(k * 1.0);
  const over = k < 1 ? 1 + Math.sin(clamp01(k) * Math.PI) * 0.14 : 1;
  sp.visible = k > 0;
  sp.scale.set(sp.userData.base.x * e * over, sp.userData.base.y * e * over, 1);
}

// ------------------------------------------------------------------ từng cảnh
function scene1(t, lt, k) {
  showOnly("bedsit");
  env(SKY_DAY, 1, { tx: -3, tz: 1 });
  win1.userData.pane.material.emissiveIntensity = 0.5;
  resetPose(hero); poseSit(hero, 2.3); poseType(hero, t); hero.setFace(lt < 4 ? "smile" : "flat");
  hero.root.rotation.y = 0.3;
  bubbleHero.visible = true; popBubble(bubbleHero, clamp01((lt - 1.0) / 0.5) * (lt > 5.5 ? 0 : 1));
  cups.forEach((c, i) => (c.visible = i < 1));
  laptop.userData.screen.material.emissiveIntensity = 1;
  mom.root.visible = false; lunch.visible = false; student.root.visible = false; studentBubble.visible = false;
  cam([10, 10, 14.5], [5.5, 9, 11.5], [-3, 3.6, 0.5], [-3, 4.1, 0.5], k);
  setChat("");
  chip.style.display = "block"; chip.textContent = "NĂM THỨ NHẤT";
  hud.style.display = "none";
}
function scene2(t, lt, k) {
  showOnly("bedsit");
  env(SKY_NIGHT, 0.0, { lamp: 14, glow: 22, tx: -3, tz: 1 });
  lamp.position.set(-8, 8, 4); glow.position.set(-3, 5, 4.6);
  win1.userData.pane.material.emissiveIntensity = 0.05;
  resetPose(hero); poseSit(hero, 2.3); poseType(hero, t, 0.4); hero.setFace(lt < 2.2 ? "smile" : lt < 5.3 ? "flat" : "shock");
  hero.root.rotation.y = 0.3;
  bubbleHero.visible = false;
  cups.forEach((c, i) => (c.visible = i < 2));
  student.root.visible = false; studentBubble.visible = false;
  const msgs = [];
  if (lt > 2.2) msgs.push({ text: "Làm gấp giúp anh nhé." });
  if (lt > 5.2) msgs.push({ text: "Tuần sau anh trả." });
  if (lt > 6.8) msgs.push({ text: "Ok anh ạ!", me: true });
  setChat(msgs.length ? chatHtml("Khách VIP", "#c0392b", msgs) : "");
  cam([7, 9.5, 13], [3, 8.6, 10.5], [-3, 4, 0.5], [-3, 4.2, 0.5], k);
  chip.style.display = "block"; chip.textContent = "11 GIỜ ĐÊM";
  hud.style.display = "none";
}
function scene3(t, lt, k) {
  showOnly("bedsit");
  // 3 ngày đêm trôi nhanh
  const cyc = (lt / 6.6) * 3;
  const dayK = clamp01(0.5 + 0.5 * Math.sin(cyc * Math.PI * 2 - Math.PI / 2) * 1.2);
  const dawn = lt > 6.1;
  env(lc(SKY_NIGHT, SKY_DAY, dayK).getHex(), dawn ? 0.75 : dayK, { lamp: (1 - dayK) * 12, glow: (1 - dayK) * 20, tx: -3, tz: 1 });
  lamp.position.set(-8, 8, 4); glow.position.set(-3, 5, 4.6);
  win1.userData.pane.material.emissiveIntensity = 0.1 + dayK * 0.5;
  resetPose(hero); poseSit(hero, 2.3); hero.root.rotation.y = 0.3;
  if (lt < 6.4) poseType(hero, t, 1.2);
  else { hero.armL.rotation.x = -0.4; hero.armR.rotation.x = -0.4; }
  const slump = ease((lt - 3) / 3.4) * 0.45;
  hero.head.rotation.x = slump; hero.torso.rotation.x = slump * 0.2;
  hero.setFace(lt < 1.5 ? "flat" : "tired");
  bubbleHero.visible = false;
  cups.forEach((c, i) => (c.visible = i < Math.min(6, 2 + Math.floor(lt / 1.6))));
  const msgs = [{ text: "Xong rồi anh ạ ✔", me: true }];
  if (lt > 6.3) msgs.push({ text: "👍" });
  setChat(lt > 5.2 ? chatHtml("Khách VIP", "#c0392b", msgs) : "");
  cam([4, 9.5, 12.5], [6.5, 9.8, 13.5], [-3, 4, 0.5], [-2, 4.2, 0.5], k);
  chip.style.display = "block"; chip.textContent = lt < 6.2 ? `ĐÊM THỨ ${Math.min(3, 1 + Math.floor(cyc))}` : "BÌNH MINH";
  hud.style.display = "none";
}
function scene4(t, lt, k) {
  showOnly("bedsit");
  env(SKY_DAY, 0.85, { tx: -3, tz: 1 });
  win1.userData.pane.material.emissiveIntensity = 0.5;
  resetPose(hero); poseSit(hero, 2.3); hero.root.rotation.y = 0.3; hero.armR.rotation.x = -1.35; hero.armL.rotation.x = -0.2;
  hero.head.rotation.x = 0.18 + Math.sin(t * 1.2) * 0.02; hero.setFace(lt < 4 ? "sad" : "tired");
  cups.forEach((c) => (c.visible = true));
  calendar.material = mat(0xffffff);
  const msgs = [{ text: "Anh ơi, tuần này rồi ạ?", me: true, seen: lt > 2.0 }];
  if (lt > 3.0) msgs.push({ text: "Anh ơi?", me: true, seen: lt > 3.6 });
  if (lt > 4.6) msgs.push({ text: "Anh ơi… 🥲", me: true, seen: lt > 5.2 });
  setChat(chatHtml("Khách VIP", "#7a7f8c", msgs));
  cam([1.5, 9, 11], [4.5, 9.4, 12], [-3, 4, 0.5], [-2.5, 4.2, 0.5], k);
  chip.style.display = "block"; chip.textContent = "TUẦN SAU";
  hud.style.display = "none";
}
function scene5(t, lt, k) {
  showOnly("bedsit");
  env(SKY_DUSK, 0.55, { sunX: 22, sunY: 18, sunZ: 18, lamp: 5, tx: -3, tz: 1 });
  lamp.position.set(-8, 8, 4);
  win1.userData.pane.material.emissiveIntensity = 0.35;
  setChat("");
  resetPose(hero); poseSit(hero, 2.3); hero.root.rotation.y = 0.3; hero.head.rotation.x = 0.35; hero.setFace(lt < 4.4 ? "sad" : "smile");
  hero.armL.rotation.x = -0.3; hero.armR.rotation.x = -0.3;
  cups.forEach((c) => (c.visible = true));
  // mẹ đi vào từ bên trái, đặt hộp cơm, vỗ vai, đi ra
  mom.root.visible = true; resetPose(mom);
  const enter = clamp01(lt / 2.4);
  const leave = clamp01((lt - 5.2) / 1.7);
  const mx = lerp(-14, -6.2, ease(enter)) + (lt > 5.2 ? lerp(0, -9, ease(leave)) : 0);
  mom.root.position.set(mx, 0, 3.9);
  mom.root.rotation.y = lt > 5.2 ? -Math.PI / 2 : Math.PI / 2;
  if (lt < 2.4 || lt > 5.2) poseWalk(mom, t, 6); else { poseIdle(mom, t); mom.armR.rotation.x = lt > 3.4 && lt < 4.6 ? -1.2 + Math.sin(t * 5) * 0.2 : 0; }
  mom.setFace("smile");
  lunch.visible = lt > 2.4;
  lunch.position.set(-5.4, 3.2, 3.0);
  student.root.visible = false; studentBubble.visible = false;
  cam([-3, 7.5, 16], [-1, 7, 14.5], [-5, 3.4, 3], [-4.5, 3.8, 3], k);
  chip.style.display = "block"; chip.textContent = "CUỐI THÁNG";
  hud.style.display = "none";
}
function scene6(t, lt, k) {
  showOnly("outdoor");
  env(SKY_DUSK, 0.8, { sunX: -10, sunY: 30, sunZ: 220, tx: 0, tz: 200 });
  setChat("");
  clients.forEach((c, i) => {
    const appear = clamp01((lt - 0.5 - i * 0.28) / 0.35);
    c.root.visible = appear > 0;
    c.root.scale.setScalar(ease(appear) * (1 + Math.sin(appear * Math.PI) * 0.15));
    resetPose(c); poseIdle(c, t + i);
    if (c.sign) { c.armR.rotation.x = -2.9; c.armL.rotation.x = -2.9; c.signSprite.visible = appear > 0.8; }
    c.root.rotation.y = 0;
  });
  resetPose(heroSmall); heroSmall.setFace("tired"); poseIdle(heroSmall, t); heroSmall.head.rotation.x = 0.2;
  const shown = clients.filter((c) => c.root.visible).length;
  const sign = clients.filter((c, i) => c.root.visible && c.sign).length;
  hud.style.display = "block";
  hud.innerHTML = `Khách: ${shown}<small>Đã trả: ${shown - sign} &nbsp;·&nbsp; “Tuần sau anh trả”: ${sign}</small>`;
  cam([-10, 9, 240], [2, 8.5, 240], [-6, 4, 200], [2, 4.2, 200], k);
  chip.style.display = "block"; chip.textContent = "NĂM THỨ HAI";
}
function scene7(t, lt, k) {
  showOnly("bedsit");
  env(SKY_NIGHT, 0.05, { lamp: 12, glow: 14, tx: -3, tz: 1 });
  lamp.position.set(-8, 8, 4); glow.position.set(-3, 5, 4.6);
  win1.userData.pane.material.emissiveIntensity = 0.05;
  setChat("");
  resetPose(hero); poseSit(hero, 2.3); poseIdle(hero, t); hero.armL.rotation.x = -0.3; hero.armR.rotation.x = -0.3;
  hero.setFace(lt < 3.2 ? "flat" : lt < 5.5 ? "smile" : "smirk");
  hero.root.rotation.y = lt > 3.0 ? -0.5 : 0.3; // quay sang TRÁI nhìn cậu sinh viên (cậu ấy nhìn sang PHẢI: khớp hướng nhìn)
  cups.forEach((c) => (c.visible = true));
  mom.root.visible = false; lunch.visible = true; lunch.position.set(-5.4, 3.2, 3.0);
  student.root.visible = true; resetPose(student);
  const enter = clamp01(lt / 2.0);
  student.root.position.set(lerp(-18, -9.5, ease(enter)), 0, 6);
  student.root.rotation.y = 0.85;
  if (enter < 1) poseWalk(student, t, 6.5); else { poseIdle(student, t); student.armR.rotation.x = -0.1; }
  student.setFace("smile");
  studentBubble.visible = true; popBubble(studentBubble, clamp01((lt - 2.2) / 0.5) * (lt > 6.6 ? 0 : 1));
  cam([0, 9.5, 19], [3, 9.2, 17], [-6, 4.6, 3], [-5, 4.8, 3], k);
  chip.style.display = "block"; chip.textContent = "NĂM THỨ BA";
  hud.style.display = "none";
}
function scene8(t, lt, k) {
  showOnly("office");
  env(SKY_DAY, 0.95, { tx: -4, tz: -200, sunZ: -176 });
  sun.position.set(-18, 40, -178);
  setChat("");
  resetPose(stu8); poseSit(stu8); poseType(stu8, t, 1);
  stu8.setFace(lt < 4 ? "smile" : "tired");
  stu8.root.position.set(-6, 0, 0.2);
  resetPose(boss); poseIdle(boss, t); boss.setFace(lt < 8 ? "smile" : "shock");
  boss.armR.rotation.x = lt > 4.0 && lt < 6.5 ? -0.9 + Math.sin(t * 6) * 0.12 : 0;
  bossBubble.visible = true; popBubble(bossBubble, clamp01((lt - 4.0) / 0.5) * (lt > 9.2 ? 0 : 1));
  cups8.forEach((c, i) => (c.visible = i < Math.min(4, 1 + Math.floor(lt / 2.5))));
  chip.style.display = "block"; chip.textContent = "VĂN PHÒNG NHỎ";
  hud.style.display = "none";
}

// ------------------------------------------------------------------ vòng khung hình
const SCENES = [["s1", scene1], ["s2", scene2], ["s3", scene3], ["s4", scene4], ["s5", scene5], ["s6", scene6], ["s7", scene7], ["s8", scene8]];

/** Áp shot đang chạy của cảnh: cỡ cảnh/góc/chuyển động lấy từ shots.json (cắt cứng giữa các shot, chuyển động mượt trong shot). */
function applyShot(name, k) {
  const list = SHOTDATA.shots.filter((x) => x.scene === name);
  const sh = list.find((x) => k >= x.f[0] && k < x.f[1]) ?? list[list.length - 1];
  const kk = clamp01((k - sh.f[0]) / (sh.f[1] - sh.f[0]));
  const e = sh.to ? ease(kk) : 0;
  const mix = (a, b) => a.map((v, i) => lerp(v, (b ?? a)[i], e));
  const pos = mix(sh.from, sh.to);
  const look = mix(sh.lookFrom, sh.lookTo);
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.fov = lerp(sh.fov?.[0] ?? 42, sh.fov?.[1] ?? sh.fov?.[0] ?? 42, e);
  camera.updateProjectionMatrix();
  window.__shot = sh.id;
}

function card(show, h1, p) {
  titleEl.style.display = show ? "flex" : "none";
  if (show) { titleEl.querySelector("h1").textContent = h1; titleEl.querySelector("p").textContent = p; }
}

window.renderFrame = (frame) => {
  const t = frame / FPS;
  let fade = 0;
  subEl.innerHTML = "";
  bubbleHero.visible = false; studentBubble.visible = false; bossBubble.visible = false;
  if (t < T.title[1]) {
    card(true, "TẠI SAO THẬT TỆ KHI LÀM FREELANCER?", "Phiên bản khối · kể theo ngôi “bạn”");
    chip.style.display = "none"; hud.style.display = "none"; setChat("");
    fade = t > T.title[1] - 0.4 ? (t - (T.title[1] - 0.4)) / 0.4 : t < 0.3 ? 1 - t / 0.3 : 0;
  } else if (t >= T.end[0]) {
    card(true, "Vòng lặp không cần ác ý.", "Nó chỉ cần một người mệt.");
    chip.style.display = "none"; hud.style.display = "none"; setChat("");
    fade = t < T.end[0] + 0.5 ? 1 - (t - T.end[0]) / 0.5 : t > TOTAL - 0.8 ? (t - (TOTAL - 0.8)) / 0.8 : 0;
  } else {
    card(false);
    for (const [name, fn] of SCENES) {
      const [a, b] = T[name];
      if (t >= a && t < b) {
        fn(t, t - a, (t - a) / (b - a));
        applyShot(name, (t - a) / (b - a));
        fade = t - a < 0.3 ? 1 - (t - a) / 0.3 : b - t < 0.3 ? 1 - (b - t) / 0.3 : 0;
      }
    }
    for (const pl of [hero, heroSmall, boss]) pl.update(t);
    const s = CUES.find(([a, b]) => t >= a && t < b);
    if (s) subEl.innerHTML = `<span>${s[2]}</span>`; // bọc span: flex sẽ không nuốt dấu cách trước <b>
  }
  fadeEl.style.opacity = String(clamp01(fade));
  renderer.render(scene, camera);
};
window.sceneReady = true;
renderFrame(0);
