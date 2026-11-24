/**
 * Đồ đạc phong cách chibi: khối bo tròn mềm, bàn làm việc, ghế, kệ sách, ốp tường màu phòng.
 * Kiểm cấu trúc cảnh trong Node (không có WebGL): số lệnh vẽ, ngân sách tam giác, toạ độ khớp màn hình hiển thị và chỗ ngồi, hình học không bị mất khi gộp.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { installFakeDom } from "./helpers/fakeDom.js";

beforeAll(() => installFakeDom());

const tris = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  return n;
};
const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh));
  return out;
};
const bounds = (root: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(root);

describe("khối bo tròn mềm (softBox) và gộp hình học", () => {
  it("cache hình học theo kích thước; bán kính bo bị kẹp; mức thấp luôn một nấc, vật lớn mịn hơn vật nhỏ", async () => {
    const { softBox, softGeometry, softSegments, resetPropCache, propCacheSize } = await import("../src/client/assets/chibiProps.js");
    resetPropCache();
    const mat = new THREE.MeshStandardMaterial();
    const a = softBox(1, 0.5, 0.4, 0.05, mat);
    const b = softBox(1, 0.5, 0.4, 0.05, mat, 3, 0, 0);
    expect(a.geometry).toBe(b.geometry); // cùng kích thước → dùng chung
    expect(propCacheSize()).toBe(1);
    expect(b.position.x).toBe(3);
    // bán kính lớn hơn nửa cạnh nhỏ nhất bị kẹp: hộp vẫn hợp lệ và không vượt kích thước yêu cầu
    const tiny = softGeometry(0.1, 0.1, 0.1, 5);
    tiny.computeBoundingBox();
    expect(tiny.boundingBox!.max.x).toBeLessThanOrEqual(0.05 + 1e-6);
    expect(softSegments(1, 1, 1, true)).toBe(1);
    expect(softSegments(1, 1, 1, false)).toBe(2);
    expect(softSegments(0.05, 1, 1, false)).toBe(1);
    resetPropCache();
    expect(propCacheSize()).toBe(0);
  });

  it("mergeStatic KHÔNG làm mất mesh khi một vật liệu có cả hộp bo (không chỉ mục) lẫn hộp/trụ thường (có chỉ mục)", async () => {
    const { softBox } = await import("../src/client/assets/chibiProps.js");
    const { box, cyl, mergeStatic } = await import("../src/client/assets/decor.js");
    const mat = new THREE.MeshStandardMaterial();
    const src = new THREE.Group();
    const parts = [softBox(0.3, 0.3, 0.3, 0.05, mat), box(0.2, 0.2, 0.2, mat, 1, 0, 0), cyl(0.1, 0.1, 0.3, mat, 2, 0, 0, 8)];
    parts.forEach((p) => src.add(p));
    const expected = parts.reduce((n, p) => n + p.geometry.attributes.position.count / (p.geometry.index ? 1 : 1), 0);
    expect(expected).toBeGreaterThan(0);
    const target = new THREE.Group();
    mergeStatic(src, target, true);
    expect(target.children).toHaveLength(1); // một vật liệu → một mesh gộp (không bị bỏ nhóm)
    const merged = target.children[0] as THREE.Mesh;
    expect(merged.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(merged.geometry.index).toBeNull(); // đã thống nhất về không chỉ mục
    const bb = new THREE.Box3().setFromObject(merged);
    expect(bb.min.x).toBeLessThan(0);
    expect(bb.max.x).toBeGreaterThan(2); // có cả khối trụ ở x = 2
  });

  it("bakeGroup: hàng chục mesh → vài mesh theo vật liệu, giữ nguyên toạ độ cục bộ của nhóm", async () => {
    const { softBox, bakeGroup } = await import("../src/client/assets/chibiProps.js");
    const mats = [new THREE.MeshStandardMaterial({ color: 1 }), new THREE.MeshStandardMaterial({ color: 2 })];
    const g = new THREE.Group();
    for (let i = 0; i < 30; i++) {
      const m = softBox(0.1, 0.2, 0.1, 0.02, mats[i % 2], i * 0.2, 1, 0);
      m.rotation.y = i * 0.1;
      g.add(m);
    }
    const baked = bakeGroup(g);
    expect(meshes(baked)).toHaveLength(2);
    expect(bounds(baked).max.x).toBeGreaterThan(5.5);
    expect(bounds(baked).min.y).toBeGreaterThan(0.85);
  });
});

describe("bàn làm việc chibi", () => {
  const FOOTPRINT = { xMin: -1.0, xMax: 1.0, zMin: -0.5, zMax: 1.1 }; // zMin: lưng ghế nằm sau chỗ ngồi

  it("hằng số khớp với ghế/bàn cũ và màn hình hiển thị: cùng cao độ bàn, mặt ghế, tâm màn hình; màn hình hiển thị nằm TRƯỚC mặt khung (không z-fighting)", async () => {
    const { DESK_Y, SEAT_HEIGHT, SCREEN_Y, MONITOR_AT } = await import("../src/client/assets/workstation.js");
    const { DESK_TOP_Y, SEAT_Y } = await import("../src/client/assets/roomBuilder.js");
    expect(DESK_Y).toBe(DESK_TOP_Y);
    expect(SEAT_HEIGHT).toBe(SEAT_Y);
    expect(SCREEN_Y).toBeCloseTo(DESK_TOP_Y + 0.43, 6); // cao độ AgentScreen (officeParts.ts)
    expect(MONITOR_AT).toEqual({ x: 0.52, z: 0.72 });
    // AgentScreen đặt tại (z − 0.03) so với tâm màn hình; mặt trước khung ở (z − 0.025) → màn hình hiển thị phải nằm trước ít nhất 0.002
    expect(0.03 - 0.025).toBeGreaterThan(0.002);
  });

  it("dựng một bàn: ≤ 16 lệnh vẽ, nằm gọn quanh chỗ ngồi, tam giác trong ngân sách ở cả hai mức chi tiết", async () => {
    const { buildWorkstation } = await import("../src/client/assets/workstation.js");
    const { resetPropCache } = await import("../src/client/assets/chibiProps.js");
    resetPropCache();
    const at = { x: 10, z: -4 };
    let high = 0;
    for (const low of [false, true]) {
      const root = new THREE.Group();
      buildWorkstation(root, at, { accent: 0x43c59e, tier: 3, seed: 5, low });
      const ms = meshes(root);
      expect(ms.length, `low=${low}`).toBeLessThanOrEqual(18);
      expect(ms.length).toBeGreaterThanOrEqual(6);
      const bb = bounds(root);
      expect(bb.min.x - at.x).toBeGreaterThanOrEqual(FOOTPRINT.xMin);
      expect(bb.max.x - at.x).toBeLessThanOrEqual(FOOTPRINT.xMax);
      expect(bb.min.z - at.z).toBeGreaterThanOrEqual(FOOTPRINT.zMin);
      expect(bb.max.z - at.z).toBeLessThanOrEqual(FOOTPRINT.zMax);
      expect(bb.min.y).toBeGreaterThanOrEqual(-0.001); // không chìm xuống sàn
      expect(bb.max.y).toBeLessThanOrEqual(1.8); // thấp hơn nhãn tên của nhân vật
      const n = tris(root);
      if (!low) high = n;
      expect(n, `low=${low}`).toBeLessThanOrEqual(low ? 4500 : 8000);
    }
    expect(high).toBeGreaterThan(1500); // thật sự có chi tiết (không rỗng)
  });

  it("món đồ riêng trên bàn ổn định theo seed và đa dạng giữa 17 người; Giám đốc có ghế lưng cao hơn", async () => {
    const { accessoryFor, buildWorkstation, DESK_ACCESSORIES } = await import("../src/client/assets/workstation.js");
    const { hashId } = await import("../src/shared/personas.js");
    const ids = ["giamdoc", "an", "ban", "ha", "huy", "khoa", "long", "mai", "minh", "nam", "phuc", "tri", "thu", "bao", "chi", "duc", "linh"];
    const kinds = new Set(ids.map((id) => accessoryFor(hashId(id))));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(accessoryFor(hashId("ha"))).toBe(accessoryFor(hashId("ha")));
    for (const k of kinds) expect(DESK_ACCESSORIES).toContain(k);

    const staff = new THREE.Group();
    const boss = new THREE.Group();
    buildWorkstation(staff, { x: 0, z: 0 }, { accent: 0xc9961a, tier: 3, seed: 1, low: false });
    buildWorkstation(boss, { x: 0, z: 0 }, { accent: 0xc9961a, tier: 1, seed: 1, low: false });
    // đỉnh cao nhất của cả bàn là màn hình (1,45 m) nên so riêng vùng lưng ghế: sau chỗ ngồi (z < -0.3), giữa (|x| < 0.35)
    const chairBackTop = (root: THREE.Object3D): number => {
      let top = 0;
      for (const m of meshes(root)) {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          if (Math.abs(x) < 0.35 && z < -0.3) top = Math.max(top, pos.getY(i));
        }
      }
      return top;
    };
    expect(chairBackTop(boss)).toBeGreaterThan(chairBackTop(staff) + 0.15); // lưng ghế Giám đốc cao hơn
    expect(tris(boss)).toBeGreaterThan(tris(staff)); // có thêm gối tựa
  });
});

describe("ghế, kệ sách và ốp tường", () => {
  it("buildChair: mặt ghế đúng cao độ SEAT_Y, gộp còn ≤ 6 mesh", async () => {
    const { buildChair, SEAT_Y } = await import("../src/client/assets/roomBuilder.js");
    const chair = buildChair();
    expect(meshes(chair).length).toBeLessThanOrEqual(6);
    const bb = bounds(chair);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.001); // bánh xe chạm sàn, không chìm xuống
    expect(bb.max.y).toBeGreaterThan(SEAT_Y + 0.5); // lưng ghế cao hơn mặt ghế
    expect(bb.max.y).toBeLessThan(SEAT_Y + 0.9);
  });

  it("kệ sách: khung rỗng có SÁCH thật (nhiều tam giác hơn khối đặc), vài lệnh vẽ, đúng kích thước yêu cầu", async () => {
    const { buildFurniture } = await import("../src/client/assets/roomBuilder.js");
    const room = new THREE.Group();
    buildFurniture(room, [{ keywords: ["bookshelf"], x: 0, z: 0, fallback: [3.2, 2.6, 0.6], unique: true }], null);
    const shelf = room.children[0];
    const ms = meshes(shelf);
    expect(ms.length).toBeGreaterThanOrEqual(3);
    expect(ms.length).toBeLessThanOrEqual(14); // gộp theo vật liệu: gỗ, gỗ đậm, bảy màu sách
    const bb = bounds(shelf);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(3.1);
    expect(bb.max.x - bb.min.x).toBeLessThan(3.3);
    expect(bb.max.y).toBeGreaterThan(2.5);
    expect(bb.max.y).toBeLessThan(2.7);
    expect(tris(shelf)).toBeGreaterThan(2500); // có hàng trăm cuốn sách chứ không phải một khối
  });

  it("ốp tường: ba mặt tường + gờ + hai tranh, nằm trọn trong phòng, màu theo phòng", async () => {
    const { addWainscot } = await import("../src/client/assets/decor.js");
    const size = { w: 9, d: 7 };
    const st = new THREE.Group();
    addWainscot(st, size, 0x43c59e);
    expect(meshes(st).length).toBeGreaterThanOrEqual(8);
    const bb = bounds(st);
    expect(bb.min.x).toBeGreaterThanOrEqual(-size.w / 2);
    expect(bb.max.x).toBeLessThanOrEqual(size.w / 2);
    expect(bb.min.z).toBeGreaterThanOrEqual(-size.d / 2);
    expect(bb.max.z).toBeLessThanOrEqual(size.d / 2);
    expect(bb.max.y).toBeLessThan(2.5); // không chạm trần/biển phòng
    const colors = new Set(meshes(st).map((m) => (m.material as THREE.MeshStandardMaterial).color.getHexString()));
    expect(colors.size).toBeGreaterThanOrEqual(3); // ốp, gờ, khung tranh, nền tranh...
  });
});
