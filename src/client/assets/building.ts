/**
 * Vỏ toà nhà liền: tường ngoài bao trọn mọi phòng, cửa chính ngay trước sảnh lễ tân, sàn hành lang, hai sân trong (vườn) và thảm chỉ đường màu phòng
 * trước cửa từng phòng. Kích thước/vị trí lấy từ `BUILDING` (src/shared/facilities.ts) — cùng nguồn với lưới đường đi A* và test.
 *
 * Kiểu "nhà búp bê" để vẫn nhìn rõ bên trong từ camera: chân tường đặc cao 1,15 m; tường bắc/tây/đông có thêm kính trong suốt, cột chia ô và dầm,
 * tường nam (phía camera) chỉ có chân tường thấp; không có mái. Toàn bộ phần cứng được gộp theo vật liệu (vài lệnh vẽ).
 */
import * as THREE from "three";
import { BUILDING, FACILITIES } from "../../shared/facilities.js";
import { DEPT_COLORS } from "../../shared/personas.js";
import { box, canvasTexture, makePlant, makeTree, mergeStatic, std } from "./decor.js";
import { pastel } from "./chibiProps.js";

export const WALL_BASE_H = 1.15;
export const WALL_TOP_H = 3.2;
const FACILITY_ACCENT: Record<string, number> = { meeting: 0x8f7bf0, pantry: 0x3fb950, lobby: 0xe5c158 };

export interface BuildingRoom {
  id: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
}

/** Các đoạn tường ngoài [x1, z1, x2, z2] (trục song song), tường nam chừa khoảng trống cho cửa chính. */
export function wallSegments(): Array<[number, number, number, number]> {
  const { x0, x1, z0, z1, door } = BUILDING;
  const dl = door.x - door.w / 2;
  const dr = door.x + door.w / 2;
  return [
    [x0, z0, x1, z0], // bắc
    [x0, z1, dl, z1], // nam, bên trái cửa
    [dr, z1, x1, z1], // nam, bên phải cửa
    [x0, z0, x0, z1], // tây
    [x1, z0, x1, z1], // đông
  ];
}

export function buildBuilding(scene: THREE.Object3D, rooms: BuildingRoom[]): THREE.Group {
  const { x0, x1, z0, z1, wall: T, door, courtyards } = BUILDING;
  const g = new THREE.Group();
  g.name = "building-shell";

  const cream = std(0xefe8d8, 0.8);
  const cap = std(0xb9b1a0, 0.8);
  const frame = std(0x6b778c, 0.5, 0.3);
  const pave = std(0xd2cbbb, 0.9);
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.13, depthWrite: false });
  const glassH = WALL_TOP_H - WALL_BASE_H - 0.08;

  // ---- tường ngoài: chân đặc + gờ + kính + cột chia ô + dầm
  for (const [ax, az, bx, bz] of wallSegments()) {
    const horizontal = az === bz;
    const len = horizontal ? bx - ax : bz - az;
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const dim = (along: number, across: number): [number, number] => (horizontal ? [along, across] : [across, along]);
    const [bw, bd] = dim(len, T);
    g.add(box(bw, WALL_BASE_H, bd, cream, cx, WALL_BASE_H / 2, cz, false));
    const [cw, cd] = dim(len, T + 0.14);
    g.add(box(cw, 0.08, cd, cap, cx, WALL_BASE_H + 0.04, cz, false));
    // tường nam (phía camera nhìn vào) chỉ có chân tường thấp để không che các phòng; ba mặt còn lại có kính + dầm
    if (horizontal && az === z1) continue;
    const [gw, gd] = dim(len, 0.05);
    g.add(box(gw, glassH, gd, glass, cx, WALL_BASE_H + 0.08 + glassH / 2, cz, false));
    const [tw, td] = dim(len, 0.26);
    g.add(box(tw, 0.14, td, frame, cx, WALL_TOP_H, cz, false));
    const n = Math.max(1, Math.round(len / 3.2));
    for (let i = 1; i < n; i++) {
      const t = -len / 2 + (len * i) / n;
      const [mx, mz] = horizontal ? [cx + t, cz] : [cx, cz + t];
      g.add(box(0.1, glassH, 0.14, frame, mx, WALL_BASE_H + 0.08 + glassH / 2, mz, false));
    }
  }
  // cột góc
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) g.add(box(0.42, WALL_TOP_H + 0.1, 0.42, frame, x, (WALL_TOP_H + 0.1) / 2, z, false));

  // ---- cửa chính: hai trụ, dầm cửa, lối lát và hai chậu cây
  for (const sx of [-1, 1]) g.add(box(0.3, WALL_TOP_H, 0.42, frame, door.x + (sx * door.w) / 2, WALL_TOP_H / 2, z1, false));
  g.add(box(door.w + 0.3, 0.3, 0.42, frame, door.x, WALL_TOP_H - 0.15, z1, false));
  g.add(box(door.w, 0.03, 1.7, pave, door.x, 0.02, z1 + 0.95, false));
  for (const sx of [-1, 1]) g.add(box(0.12, 0.035, 1.7, cap, door.x + (sx * (door.w + 0.12)) / 2, 0.022, z1 + 0.95, false));
  for (const sx of [-1, 1]) g.add(makePlant(door.x + sx * (door.w / 2 + 0.9), z1 + 0.9, 1.5));

  // ---- thảm chỉ đường màu phòng trước cửa từng phòng (mặt trước mở về +z)
  const accents: Array<{ x: number; z: number; color: number }> = [];
  for (const r of rooms) accents.push({ x: r.center.x, z: r.center.z + r.size.d / 2 + 0.55, color: parseInt((DEPT_COLORS[r.id] ?? "#6b7280").slice(1), 16) });
  for (const f of FACILITIES) accents.push({ x: f.center.x, z: f.center.z + f.size.d / 2 + 0.55, color: FACILITY_ACCENT[f.id] ?? 0x6b7280 });
  for (const a of accents) {
    g.add(box(2.6, 0.012, 0.6, std(pastel(a.color, 0.35), 0.9), a.x, 0.0135, a.z, false));
    g.add(box(2.6, 0.012, 0.08, std(a.color, 0.8), a.x, 0.0145, a.z + 0.34, false));
  }

  // ---- sân trong (vườn): cỏ, viền đá, cây và bụi
  const bush = std(0x4a8a48, 0.95);
  let variant = 0;
  for (const c of courtyards) {
    const w = c.x1 - c.x0;
    const d = c.z1 - c.z0;
    const cx = (c.x0 + c.x1) / 2;
    const cz = (c.z0 + c.z1) / 2;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x8db077, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.0085, cz);
    lawn.receiveShadow = true;
    scene.add(lawn);
    for (const [bw, bd, bx, bz] of [[w, 0.22, cx, c.z0], [w, 0.22, cx, c.z1], [0.22, d, c.x0, cz], [0.22, d, c.x1, cz]] as const) g.add(box(bw, 0.14, bd, cap, bx, 0.07, bz, false));
    const cols = Math.max(2, Math.round(w / 4.2));
    const rows = Math.max(2, Math.round(d / 4.6));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = c.x0 + ((i + 0.5) * w) / cols + (j % 2 ? 0.7 : -0.5);
        const z = c.z0 + ((j + 0.5) * d) / rows;
        g.add(makeTree(x, z, 0.9 + ((i + j) % 3) * 0.16, variant++));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bush).translateX(x + 1.3).translateY(0.35).translateZ(z + 0.4));
      }
    }
  }

  mergeStatic(g, scene, false);

  // ---- sàn hành lang (đá sáng, ô lớn) phủ cả toà nhà; sàn từng phòng và sân trong nằm đè lên
  const tex = canvasTexture(128, 128, (c) => {
    c.fillStyle = "#e9e3d5";
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${150 + Math.floor(Math.random() * 60)},${140 + Math.floor(Math.random() * 50)},${120 + Math.floor(Math.random() * 40)},0.12)`;
      c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    c.strokeStyle = "rgba(150,140,120,0.5)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 126, 126);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const w = x1 - x0;
  const d = z1 - z0;
  tex.repeat.set(w / 2.4, d / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0.0065, (z0 + z1) / 2);
  floor.receiveShadow = true;
  floor.name = "building-floor";
  scene.add(floor);
  return g;
}
