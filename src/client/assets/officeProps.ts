/**
 * Đồ đạc văn phòng chi tiết: quầy cà phê, tủ server, máy in, bảng duty.
 *
 * Port từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   - `world/furniture/coffee.js` → quầy cà phê (tủ + máy pha + cốc + bánh)
 *   - `world/furniture/server-racks.js` → tủ server (LED + quạt)
 *   - `world/props/printer.js` → máy in
 *
 * Các vật thể này làm phòng bớt trống và tạo điểm nhấn thị giác, đồng thời
 * gợi ý chức năng của từng phòng ban (phòng IT có tủ server, phòng dùng chung
 * có quầy cà phê…).
 */
import * as THREE from "three";

/** Vật liệu dùng chung. */
const MATS = {
  cabinet: new THREE.MeshStandardMaterial({ color: 0xe6e1d8, roughness: 0.72 }),
  counter: new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.36 }),
  door: new THREE.MeshStandardMaterial({ color: 0xd9d2c6, roughness: 0.72 }),
  metal: new THREE.MeshStandardMaterial({
    color: 0x8d949e,
    roughness: 0.4,
    metalness: 0.6,
  }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.36, metalness: 0.4 }),
  rack: new THREE.MeshStandardMaterial({ color: 0x1e2229, roughness: 0.72 }),
  rackShelf: new THREE.MeshStandardMaterial({ color: 0x2c323b, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),
  cupA: new THREE.MeshStandardMaterial({ color: 0xffe787, roughness: 0.6 }),
  cupB: new THREE.MeshStandardMaterial({ color: 0xbfddf7, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xbfd8ee,
    transparent: true,
    opacity: 0.14,
    roughness: 0.06,
    metalness: 0.2,
    depthWrite: false,
  }),
};

/** Vật liệu tờ giấy ghim dùng chung. */
const NOTE_MAT_CACHE = new Map<number, THREE.MeshStandardMaterial>();

function noteMaterial(color: number): THREE.MeshStandardMaterial {
  let m = NOTE_MAT_CACHE.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    NOTE_MAT_CACHE.set(color, m);
  }
  return m;
}

/** Vật liệu bánh donut dùng chung. */
const DONUT_MAT_CACHE = new Map<number, THREE.MeshStandardMaterial>();

function donutMaterial(color: number): THREE.MeshStandardMaterial {
  let m = DONUT_MAT_CACHE.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    DONUT_MAT_CACHE.set(color, m);
  }
  return m;
}

/**
 * Cache geometry của hộp bo góc.
 *
 * `rbox` được gọi nhiều chục lần với cùng kích thước → dùng chung geometry
 * để giảm số buffer GPU (trước đó 1.235 geometry).
 */
const RBOX_GEO_CACHE = new Map<string, THREE.BufferGeometry>();

/** Hộp có góc bo (rounded box) — giống helper `rbox` của repo tham khảo. */
function rbox(
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  r = 0.03,
): THREE.Mesh {
  const key = `${w}|${h}|${d}|${r}`;
  let geo = RBOX_GEO_CACHE.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    // Bo mềm các đỉnh: co kéo về tâm theo khoảng cách tới cạnh.
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ex = Math.abs(v.x) - (w / 2 - r);
      const ey = Math.abs(v.y) - (h / 2 - r);
      const ez = Math.abs(v.z) - (d / 2 - r);
      const mx = Math.max(ex, 0);
      const my = Math.max(ey, 0);
      const mz = Math.max(ez, 0);
      const len = Math.hypot(mx, my, mz);
      if (len > 0 && len < r * 1.6) {
        const k = (r * 1.6 - len) / (r * 1.6);
        pos.setXYZ(
          i,
          v.x - Math.sign(v.x) * mx * k,
          v.y - Math.sign(v.y) * my * k,
          v.z - Math.sign(v.z) * mz * k,
        );
      }
    }
    geo.computeVertexNormals();
    RBOX_GEO_CACHE.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  m: THREE.Material,
  seg = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  return mesh;
}

/** Đặt mesh vào group tại vị trí. */
function put(g: THREE.Group, m: THREE.Object3D, x: number, y: number, z: number): void {
  m.position.set(x, y, z);
  g.add(m);
}

/**
 * Quầy cà phê: tủ + máy pha espresso + cốc + đĩa bánh.
 * @returns group đặt tại gốc, quay mặt +Z
 */
export function coffeeStation(): THREE.Group {
  const g = new THREE.Group();

  // Tủ dưới + 3 cánh cửa.
  put(g, rbox(2.9, 0.92, 0.75, MATS.cabinet, 0.04), 0, 0.46, 0);
  for (const x of [-1, 0, 1]) {
    put(g, rbox(0.9, 0.7, 0.02, MATS.door, 0.02), x, 0.47, 0.38);
    put(g, rbox(0.2, 0.03, 0.03, MATS.metal, 0.01), x, 0.7, 0.4);
  }
  // Mặt quầy.
  put(g, rbox(3.0, 0.07, 0.84, MATS.counter, 0.03), 0, 0.955, 0);

  // Máy pha espresso.
  put(g, rbox(0.52, 0.62, 0.46, MATS.dark, 0.06), -0.85, 1.3, 0.08);
  put(g, rbox(0.3, 0.05, 0.14, MATS.metal, 0.02), -0.85, 1.17, -0.2);
  put(g, cyl(0.06, 0.06, 0.08, MATS.white), -0.85, 1.06, -0.18);
  // Đèn báo trạng thái máy.
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6b4a }),
  );
  put(g, led, -0.69, 1.5, -0.15);

  // Cốc trên quầy.
  for (let k = 0; k < 3; k++) {
    put(g, cyl(0.065, 0.06, 0.13, k === 0 ? MATS.white : k === 1 ? MATS.cupA : MATS.cupB), -0.05 + k * 0.22, 1.06, 0.12);
  }

  // Đĩa + bánh.
  put(g, cyl(0.25, 0.25, 0.03, MATS.white, 24), 0.95, 1.005, 0);
  const donutColors = [0xe8a0b4, 0x8b5a3c, 0xffd166];
  const donutGeo = new THREE.TorusGeometry(0.075, 0.04, 8, 16);
  for (let k = 0; k < 3; k++) {
    const dn = new THREE.Mesh(donutGeo, donutMaterial(donutColors[k]));
    dn.rotation.x = Math.PI / 2;
    dn.castShadow = true;
    put(g, dn, 0.89 + k * 0.11, 1.05, -0.06 + (k % 2) * 0.12);
  }

  return g;
}

/**
 * Tủ server: vỏ, kệ, đèn LED nhấp nháy, cửa kính.
 * @returns group đặt tại gốc
 */
export function serverRack(): THREE.Group {
  const g = new THREE.Group();

  put(g, rbox(0.95, 2.4, 0.8, MATS.rack, 0.04), 0, 1.2, 0);

  // Kệ + LED (mỗi kệ 4 đèn, dùng InstancedMesh để gọn draw call).
  const ledGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
  const ledColors = [0x5be37d, 0xffb347, 0x4fb6ff, 0x5be37d];
  const ledCount = 7 * 4;
  const leds = new THREE.InstancedMesh(
    ledGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    ledCount,
  );
  let idx = 0;
  const m4 = new THREE.Matrix4();
  for (let r = 0; r < 7; r++) {
    put(g, rbox(0.8, 0.22, 0.03, MATS.rackShelf, 0.01), 0, 0.34 + r * 0.29, 0.41);
    for (let k = 0; k < 4; k++) {
      m4.makeTranslation(-0.24 + k * 0.16, 0.34 + r * 0.29, 0.434);
      leds.setMatrixAt(idx, m4);
      leds.setColorAt(
        idx,
        new THREE.Color(ledColors[k]).multiplyScalar(1.6),
      );
      idx++;
    }
  }
  leds.instanceMatrix.needsUpdate = true;
  if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  g.add(leds);

  // Cửa kính trước.
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.3, 0.02), MATS.glass), 0, 1.2, 0.43);

  // Tấm trên + quạt.
  put(g, rbox(1.0, 0.06, 0.85, MATS.metal, 0.01), 0, 2.43, 0);
  for (const fx of [-0.22, 0.22]) {
    put(g, cyl(0.15, 0.15, 0.03, new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6 }), 24), fx, 2.47, 0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 28), MATS.metal);
    ring.rotation.x = Math.PI / 2;
    put(g, ring, fx, 2.49, 0.2);
    // Cánh quạt (xoay được bằng update).
    const bladeGeo = new THREE.BoxGeometry(0.11, 0.008, 0.04);
    const blades = new THREE.Group();
    for (let b = 0; b < 5; b++) {
      const blade = new THREE.Mesh(bladeGeo, MATS.metal);
      blade.position.x = 0.065;
      blade.rotation.y = (b * 2 * Math.PI) / 5;
      blades.add(blade);
    }
    blades.position.set(fx, 2.48, 0.2);
    blades.userData.fan = true;
    g.add(blades);
  }

  return g;
}

/**
 * Vách kính chia phòng server (kính mờ + khung).
 */
export function glassPartition(w = 2.1, h = 2.6): THREE.Group {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.03, h, w), MATS.glass), 0, h / 2, 0);
  for (const z of [-w / 2, 0, w / 2]) {
    put(g, rbox(0.06, h, 0.06, MATS.metal, 0.01), 0, h / 2, z);
  }
  put(g, rbox(0.06, 0.06, w + 0.1, MATS.metal, 0.01), 0, h, 0);
  return g;
}

/** Máy in đặt trên bàn (kèm khay giấy). */
export function printer(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.62, 0.34, 0.46, MATS.dark, 0.04), 0, 0.17, 0);
  put(g, rbox(0.58, 0.1, 0.4, MATS.cabinet, 0.03), 0, 0.39, 0);
  // Khay giấy phía trước.
  put(g, rbox(0.46, 0.03, 0.24, MATS.white, 0.01), 0, 0.2, 0.3);
  // Đèn báo.
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x5be37d }),
  );
  put(g, led, 0.22, 0.3, 0.235);
  return g;
}

/**
 * Bảng trực ca (duty board): bảng ghim tờ giấy + khung.
 * W,H = kích thước bảng.
 */
export function dutyBoard(w = 2.2, h = 1.3): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(w, h, 0.06, MATS.rack, 0.03), 0, 0, 0);
  put(g, rbox(w - 0.1, h - 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.85 }), 0.02), 0, 0, 0.04);
  // Các tờ giấy ghim.
  const noteColors = [0xffe08a, 0xa8e6cf, 0xf4b8c4, 0xbfd8ee];
  const noteGeo = new THREE.PlaneGeometry(0.28, 0.28);
  for (let i = 0; i < 6; i++) {
    const note = new THREE.Mesh(noteGeo, noteMaterial(noteColors[i % noteColors.length]));
    const col = i % 3;
    const row = Math.floor(i / 3);
    note.position.set(-w / 2 + 0.34 + col * 0.62, h / 2 - 0.36 - row * 0.44, 0.055);
    g.add(note);
  }
  return g;
}

/**
 * Cập nhật hoạt động: quạt tủ server quay, LED nhấp nháy.
 * @param t thời gian (giây)
 */
export function updateProps(group: THREE.Group, t: number): void {
  group.traverse((o) => {
    if (o.userData.fan) o.rotation.y = t * 3.4;
  });
}

/**
 * Đồ đạc đặc trưng cho từng phòng ban — gợi ý chức năng của phòng.
 *
 * @param deptId id phòng ban
 * @param roomW bề rộng phòng
 * @param roomD chiều sâu phòng
 * @returns group đồ đạc (đặt tại gốc phòng) hoặc null nếu phòng không có
 */
export function signatureProp(
  deptId: string,
  roomW: number,
  roomD: number,
): THREE.Group | null {
  switch (deptId) {
    case "ai-team": {
      // Phòng Đội AI: tủ server + vách kính.
      const g = new THREE.Group();
      const racks = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const r = serverRack();
        r.position.x = -0.6 + i * 1.2;
        racks.add(r);
      }
      racks.position.set(roomW * 0.3, 0, -roomD * 0.32);
      racks.rotation.y = Math.PI;
      g.add(racks);

      const glass = glassPartition(2.2, 2.6);
      glass.position.set(roomW * 0.3 + 1.9, 0, -roomD * 0.32);
      glass.rotation.y = Math.PI / 2;
      g.add(glass);
      return g;
    }
    case "automation": {
      // Phòng Tự động: quầy cà phê + máy in (nơi chạy script dài).
      const g = new THREE.Group();
      const coffee = coffeeStation();
      coffee.position.set(-roomW * 0.24, 0, -roomD * 0.3);
      coffee.rotation.y = 0.3;
      g.add(coffee);

      const p = printer();
      p.position.set(roomW * 0.28, 0.78, -roomD * 0.3);
      g.add(p);
      return g;
    }
    case "marketing": {
      // Phòng Marketing: bảng trực ca ghim ý tưởng.
      const g = new THREE.Group();
      const board = dutyBoard(2.2, 1.3);
      board.position.set(roomW * 0.3, 1.5, -roomD * 0.42);
      g.add(board);
      return g;
    }
    case "support": {
      // Phòng Khách hàng: quầy lễ tân với máy in.
      const g = new THREE.Group();
      const p = printer();
      p.position.set(roomW * 0.3, 0.78, -roomD * 0.3);
      g.add(p);
      return g;
    }
    default:
      return null;
  }
}
