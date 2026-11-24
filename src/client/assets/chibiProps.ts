/**
 * Đồ đạc phong cách CHIBI: khối bo tròn mềm (thay cho hộp góc vuông) để khớp với nhân vật chibi.
 *
 * `softBox` dùng `RoundedBoxGeometry` của three. Hình học được cache theo kích thước (nhiều bàn/ghế dùng chung) và có hai mức chi tiết:
 * mức "thấp" (máy yếu) bo bằng một nấc để giữ ngân sách tam giác. Gọi `resetPropCache()` khi dựng lại cả cảnh.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

let LOW = false;
/** Đặt mức chi tiết cho đồ đạc dựng SAU lệnh này (xem OfficeScene: cùng nguồn với `setChibiDetail` của nhân vật). */
export function setPropDetail(low: boolean): void {
  LOW = low;
}
export const isLowPropDetail = (): boolean => LOW;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Số nấc bo theo kích thước: vật lớn (mặt bàn, sofa) mịn hơn vật nhỏ; mức thấp luôn một nấc. */
export function softSegments(w: number, h: number, d: number, low = LOW): number {
  if (low) return 1;
  return Math.min(w, h, d) > 0.18 ? 2 : 1;
}

export function softGeometry(w: number, h: number, d: number, r: number, segments = softSegments(w, h, d)): THREE.BufferGeometry {
  const radius = Math.max(0.002, Math.min(r, Math.min(w, h, d) / 2 - 0.001));
  const key = `${w}|${h}|${d}|${radius}|${segments}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, radius);
    geoCache.set(key, g);
  }
  return g;
}

/** Hộp bo tròn mềm: kích thước (w, h, d), bán kính bo `r`, đặt tại (x, y, z) — tâm hộp. */
export function softBox(w: number, h: number, d: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(softGeometry(w, h, d, r), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function resetPropCache(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

/** Số hình học đang cache (để test). */
export function propCacheSize(): number {
  return geoCache.size;
}

/** Trộn màu về phía trắng (0 = giữ nguyên, 1 = trắng) — màu phấn dịu đi kèm màu nhấn của phòng. */
export function pastel(color: number, amount = 0.65): number {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), amount).getHex();
}

/** Đậm hơn (trộn về phía đen). */
export function deepen(color: number, amount = 0.35): number {
  return new THREE.Color(color).lerp(new THREE.Color(0x000000), amount).getHex();
}

/**
 * Gộp các mesh con TRỰC TIẾP của một nhóm theo vật liệu, giữ nguyên toạ độ cục bộ của nhóm (khác `mergeStatic` bake theo toạ độ thế giới).
 * Dùng cho đồ đạc dựng rời rồi mới đặt vào phòng (ghế, kệ sách): hàng chục mesh → vài mesh, người gọi vẫn đặt vị trí/xoay nhóm như thường.
 * Hình học có/không có chỉ mục được thống nhất (RoundedBoxGeometry không có chỉ mục, hộp/trụ/cầu thì có).
 */
export function bakeGroup(src: THREE.Group): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of src.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) continue;
    m.updateMatrix();
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrix);
    const list = buckets.get(m.material) ?? [];
    list.push(geo);
    buckets.set(m.material, list);
  }
  const out = new THREE.Group();
  for (const [mat, raw] of buckets) {
    const mixed = raw.some((g) => g.index) && raw.some((g) => !g.index);
    const list = mixed ? raw.map((g) => (g.index ? g.toNonIndexed() : g)) : raw;
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
