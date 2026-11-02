/**
 * Cây xanh trong chậu, đèn sàn và đèn trần — bổ sung cho đồ đạc.
 *
 * Port từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   - `world/terrace.js` → potPlant (monstera, snake, bush, tree)
 *   - `world/furniture/plants-lamps.js` → floorLamp
 *
 * Ở đây cây được rút gọn cho phòng 9–11 đơn vị: vẫn có lá, thân, chậu,
 * đủ để phòng không trống trơn.
 */
import * as THREE from "three";

/** Vật liệu lá dùng chung (4 sắc xanh). */
const LEAF_MATS = ["#4E8A3A", "#62A04A", "#3C7432", "#78B256"].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }),
);

const POT_MAT = new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.45 });
const SOIL_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: 0.95 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0xd3cbbc, roughness: 0.5 });
const METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x2b2f36,
  roughness: 0.35,
  metalness: 0.65,
});
const SHADE_MAT = new THREE.MeshStandardMaterial({
  color: 0xf6e3be,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
const BULB_MAT = new THREE.MeshBasicMaterial({ color: 0xede6d6 });

export type PlantKind = "monstera" | "snake" | "bush" | "tree";

/** Số ngẫu nhiên có seed để cây trông tự nhiên nhưng ổn định giữa các lần tải. */
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
 * Cây trong chậu.
 * @param kind loại cây
 * @param scale kích thước (1 = cao ~1m)
 */
export function potPlant(kind: PlantKind = "bush", scale = 1, seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  const rand = rng(seed * 2654435761);

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.4, 20), POT_MAT);
  pot.position.y = 0.2;
  pot.castShadow = true;
  pot.receiveShadow = true;
  g.add(pot);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 20), RIM_MAT);
  rim.position.y = 0.4;
  g.add(rim);

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 16), SOIL_MAT);
  soil.position.y = 0.415;
  g.add(soil);

  const leaf = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    px: number,
    py: number,
    pz: number,
    rx: number,
    ry: number,
    rz: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ): THREE.Mesh => {
    const l = new THREE.Mesh(geo, m);
    l.position.set(px, py, pz);
    l.rotation.set(rx, ry, rz);
    l.scale.set(sx, sy, sz);
    l.castShadow = true;
    g.add(l);
    return l;
  };

  if (kind === "monstera") {
    const lg = new THREE.SphereGeometry(0.22, 14, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand() * 0.4 - 0.2;
      const h = 0.5 + rand() * 0.5;
      const r = 0.1 + h * 0.33;
      leaf(
        new THREE.CylinderGeometry(0.012, 0.016, h, 5),
        LEAF_MATS[2],
        Math.sin(a) * r * 0.45,
        0.42 + h / 2,
        Math.cos(a) * r * 0.45,
        Math.cos(a) * 0.4,
        0,
        -Math.sin(a) * 0.4,
      );
      leaf(
        lg,
        LEAF_MATS[i % 2],
        Math.sin(a) * r,
        0.42 + h,
        Math.cos(a) * r,
        Math.cos(a) * 0.7,
        a,
        -Math.sin(a) * 0.15,
        1,
        0.1,
        0.78,
      );
    }
  } else if (kind === "snake") {
    for (let i = 0; i < 11; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.12;
      const h = 0.5 + rand() * 0.5;
      leaf(
        new THREE.ConeGeometry(0.055, h, 4),
        LEAF_MATS[i % 3],
        Math.sin(a) * r,
        0.42 + h / 2,
        Math.cos(a) * r,
        (rand() - 0.5) * 0.36,
        a,
        (rand() - 0.5) * 0.36,
        1,
        1,
        0.35,
      );
    }
  } else if (kind === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 1.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x6e4b32, roughness: 0.6 }),
    );
    trunk.position.y = 1.05;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      leaf(
        new THREE.IcosahedronGeometry(0.42, 1),
        LEAF_MATS[i % 4],
        Math.sin(a) * (0.05 + rand() * 0.25),
        1.75 + rand() * 0.2,
        Math.cos(a) * (0.05 + rand() * 0.25),
        rand() * 3,
        rand() * 3,
        0,
        1,
        0.85,
        1,
      );
    }
  } else {
    // bush
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaf(
        new THREE.IcosahedronGeometry(0.2, 1),
        LEAF_MATS[i % 4],
        Math.sin(a) * 0.15,
        0.62 + (i % 2) * 0.12,
        Math.cos(a) * 0.15,
        a,
        a,
        0,
        1,
        1.2,
        1,
      );
    }
    leaf(new THREE.IcosahedronGeometry(0.22, 1), LEAF_MATS[1], 0, 0.86, 0, 0, 0, 0);
  }

  return g;
}

/** Đèn sàn: đế + cọng + chụp + bóng đèn phát sáng. */
export function floorLamp(height = 2.1): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 16), METAL_MAT);
  base.position.y = 0.03;
  base.castShadow = true;
  g.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, height, 8), METAL_MAT);
  pole.position.y = height / 2;
  pole.castShadow = true;
  g.add(pole);

  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.36, 0.38, 24, 1, true),
    SHADE_MAT,
  );
  shade.position.y = height + 0.1;
  shade.castShadow = true;
  g.add(shade);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), BULB_MAT);
  bulb.position.y = height - 0.02;
  g.add(bulb);

  return g;
}

/**
 * Bố trí cây + đèn cho một phòng.
 * @param roomW bề rộng phòng
 * @param roomD chiều sâu phòng
 * @param seed hạt ngẫu nhiên (theo id phòng) để mỗi phòng khác nhau
 */
export function furnishRoom(
  group: THREE.Group,
  roomW: number,
  roomD: number,
  seed = 1,
): { lamps: THREE.PointLight[] } {
  const lamps: THREE.PointLight[] = [];

  // Cây ở hai góc trước phòng.
  const spots: Array<[number, number, PlantKind, number]> = [
    [-roomW * 0.34, roomD * 0.3, "monstera", 0.95],
    [roomW * 0.34, roomD * 0.3, "snake", 0.8],
    [-roomW * 0.38, -roomD * 0.26, "bush", 0.75],
    [roomW * 0.36, -roomD * 0.28, "monstera", 0.85],
  ];
  spots.forEach(([x, z, kind, s], i) => {
    const plant = potPlant(kind, s, seed + i);
    plant.position.set(x, 0, z);
    group.add(plant);
  });

  // Đèn sàn ở một góc, kèm đèn thật.
  const lamp = floorLamp(1.9);
  lamp.position.set(-roomW * 0.28, 0, -roomD * 0.3);
  group.add(lamp);
  const light = new THREE.PointLight(0xffc27a, 0.7, 7.5, 1.4);
  light.position.set(-roomW * 0.28, 1.9, -roomD * 0.3);
  group.add(light);
  lamps.push(light);

  return { lamps };
}
