/**
 * Cơ sở vật chất của văn phòng: phòng họp, pantry, sảnh lễ tân.
 *
 * Đây là DỮ LIỆU thuần (không three.js) dùng chung cho cảnh 3D, lưới điều hướng A*, hành vi nhân vật và test:
 *  - tâm/kích thước phòng, loại sàn, danh sách đồ đạc (kèm hình chữ nhật chiếm chỗ và cái nào chặn đường đi);
 *  - các điểm đứng/ngồi mà nhân vật tới (ghế phòng họp, chỗ pha cà phê, chỗ xem bảng tin sảnh).
 * Một nguồn duy nhất → hình dựng, lưới đường đi và test không thể lệch nhau.
 *
 * Quy ước toạ độ: x ngang, z sâu; yaw 0 = nhìn về +z. Phòng mở mặt trước (+z), ba tường còn lại.
 * Toạ độ đồ đạc (`items`) là TƯƠNG ĐỐI so với tâm phòng; điểm đứng (`spots`) là TUYỆT ĐỐI.
 *
 * Phòng tiện ích KHÔNG có chỗ ngồi làm việc của agent; không nằm trong danh sách phòng ban của server
 * (nên bộ lập kế hoạch không bao giờ giao việc cho "pantry").
 */

export type FacilityId = "meeting" | "pantry" | "lobby";
export type FloorKind = "wood" | "carpet" | "tile";

/** Hình chữ nhật chiếm chỗ trên sàn: w theo trục x, d theo trục z (không xoay). */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type ItemKind =
  | "table"
  | "seat"
  | "stool"
  | "tv"
  | "plant"
  | "rug"
  | "credenza"
  | "counter"
  | "fridge"
  | "vending"
  | "bin"
  | "menu"
  | "roundtable"
  | "desk"
  | "logo"
  | "sofa"
  | "coffeetable"
  | "lamp"
  | "mat"
  | "clock"
  | "brochures";

export interface FacilityItem extends Rect {
  kind: ItemKind;
  /** Chặn đường đi của nhân vật (đồ treo tường, thảm, ghế ngồi không chặn). */
  solid: boolean;
  /** Hướng mặt trước của vật (yaw), nếu có. Ghế: hướng nhìn của người ngồi. */
  face?: number;
  /** Độ cao treo (tường) hoặc kích thước phụ tuỳ loại. */
  y?: number;
}

export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface FacilityDef {
  id: FacilityId;
  center: { x: number; z: number };
  size: { w: number; d: number };
  floor: FloorKind;
  floorColor: number;
  items: FacilityItem[];
}

const PI = Math.PI;
const item = (kind: ItemKind, x: number, z: number, w: number, d: number, solid: boolean, extra: Partial<FacilityItem> = {}): FacilityItem => ({
  kind,
  x,
  z,
  w,
  d,
  solid,
  ...extra,
});

// ---------------------------------------------------------------- phòng họp
const MEETING_TABLE = { x: 0, z: 0.5, w: 4.4, d: 1.4 };
/** Mép bàn cách gốc nhân vật ~0.19 khi ngồi (khớp bàn làm việc: bàn đặt ở +0.62, sâu 0.86). */
const EDGE = 0.19;

function meetingSeats(): FacilityItem[] {
  const t = MEETING_TABLE;
  const back = t.z - t.d / 2 - EDGE;
  const front = t.z + t.d / 2 + EDGE;
  const endX = t.w / 2 + EDGE;
  return [
    item("seat", -1.5, back, 0.6, 0.6, false, { face: 0 }),
    item("seat", 0, back, 0.6, 0.6, false, { face: 0 }),
    item("seat", 1.5, back, 0.6, 0.6, false, { face: 0 }),
    item("seat", -1.5, front, 0.6, 0.6, false, { face: PI }),
    item("seat", 0, front, 0.6, 0.6, false, { face: PI }),
    item("seat", 1.5, front, 0.6, 0.6, false, { face: PI }),
    item("seat", -endX, t.z, 0.6, 0.6, false, { face: PI / 2 }),
    item("seat", endX, t.z, 0.6, 0.6, false, { face: -PI / 2 }),
  ];
}

// ---------------------------------------------------------------- pantry
const COFFEE_X = [-2.0, -0.8, 0.4];

// ---------------------------------------------------------------- danh sách
export const FACILITIES: FacilityDef[] = [
  {
    id: "meeting",
    center: { x: 21, z: -5 },
    size: { w: 8, d: 6.5 },
    floor: "wood",
    floorColor: 0xc9a77c,
    items: [
      item("rug", 0, 0.5, 6.2, 3.6, false),
      item("table", MEETING_TABLE.x, MEETING_TABLE.z, MEETING_TABLE.w, MEETING_TABLE.d, true),
      ...meetingSeats(),
      item("tv", 0, -3.12, 3.2, 0.1, false, { y: 1.75 }),
      item("credenza", -2.9, -2.85, 1.6, 0.5, true),
      item("plant", 3.4, -2.7, 0.7, 0.7, true),
      item("plant", -3.45, 2.6, 0.7, 0.7, true),
      item("clock", 3.0, -3.14, 0.5, 0.06, false, { y: 2.45 }),
    ],
  },
  {
    id: "pantry",
    center: { x: 21, z: 6 },
    size: { w: 8, d: 6.5 },
    floor: "tile",
    floorColor: 0xdfe6dd,
    items: [
      item("counter", -0.6, -2.8, 5.0, 0.7, true),
      item("fridge", 3.0, -2.75, 0.9, 0.8, true),
      item("vending", 3.5, -0.4, 0.8, 0.9, true, { face: -PI / 2 }),
      item("roundtable", -2.0, 1.3, 1.3, 1.3, true),
      item("roundtable", 1.6, 1.8, 1.3, 1.3, true),
      item("stool", -2.0, 0.45, 0.4, 0.4, false),
      item("stool", -2.0, 2.15, 0.4, 0.4, false),
      item("stool", -2.85, 1.3, 0.4, 0.4, false),
      item("stool", 1.6, 0.95, 0.4, 0.4, false),
      item("stool", 1.6, 2.65, 0.4, 0.4, false),
      item("stool", 2.45, 1.8, 0.4, 0.4, false),
      item("bin", -3.4, -2.4, 0.4, 0.4, true),
      item("plant", 3.4, 2.6, 0.7, 0.7, true),
      item("menu", 1.6, -3.14, 1.6, 0.06, false, { y: 1.7 }),
      item("clock", -3.0, -3.14, 0.5, 0.06, false, { y: 2.45 }),
    ],
  },
  {
    id: "lobby",
    center: { x: -13, z: 15 },
    size: { w: 7, d: 6 },
    floor: "carpet",
    floorColor: 0x8a94b3,
    items: [
      item("rug", 0, 1.0, 5.0, 2.8, false),
      item("desk", 0, -1.15, 3.4, 0.9, true),
      item("logo", -0.4, -2.87, 3.4, 0.1, false, { y: 2.0 }),
      item("tv", 2.5, -2.87, 1.6, 0.1, false, { y: 1.7 }),
      item("sofa", -2.55, 1.1, 0.95, 1.9, true, { face: PI / 2 }),
      item("sofa", 2.55, 1.1, 0.95, 1.9, true, { face: -PI / 2 }),
      item("coffeetable", 0, 1.1, 1.2, 0.8, true),
      item("plant", -3.05, -2.5, 0.7, 0.7, true),
      item("plant", 3.05, 2.5, 0.7, 0.7, true),
      item("plant", -3.05, 2.5, 0.7, 0.7, true),
      item("lamp", 3.2, -1.2, 0.4, 0.4, true),
      item("brochures", -1.9, -2.3, 0.7, 0.4, true),
      item("mat", 0, 2.45, 2.2, 0.8, false),
      item("clock", -2.6, -2.89, 0.5, 0.06, false, { y: 2.45 }),
    ],
  },
];

// ---------------------------------------------------------------- toà nhà liền
/**
 * Vỏ toà nhà bao trọn mọi phòng thành MỘT công trình: tường ngoài (chân tường đặc + kính + cột), một cửa chính ở tường nam ngay trước sảnh lễ tân,
 * hành lang là phần sàn còn lại giữa các phòng, và hai sân trong (vườn) ở phần trống phía bắc. Dữ liệu thuần để hình dựng, lưới đường đi và test
 * dùng chung — phòng KHÔNG đổi chỗ nên đường đi, họp và hành vi cũ giữ nguyên.
 * Toạ độ thế giới; `x0..x1` theo x, `z0..z1` theo z (z1 là tường nam, phía trước).
 */
export interface Courtyard {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const BUILDING = {
  x0: -19.5,
  x1: 28,
  z0: -26.75,
  z1: 21,
  /** Độ dày tường ngoài. */
  wall: 0.35,
  /** Cửa chính ở tường nam: tâm x và bề rộng khoảng trống. */
  door: { x: -13, w: 4.4 },
  courtyards: [
    { x0: -18.5, x1: -5.6, z0: -25.6, z1: -9.8 },
    { x0: 5.6, x1: 15.6, z0: -25.6, z1: -9.8 },
  ] as Courtyard[],
};

export function facilityById(id: string): FacilityDef | undefined {
  return FACILITIES.find((f) => f.id === id);
}

export function itemsOf(def: FacilityDef, kind: ItemKind): FacilityItem[] {
  return def.items.filter((i) => i.kind === kind);
}

/** Chuyển vị trí tương đối (theo tâm phòng) sang toạ độ thế giới. */
export function toWorld(def: FacilityDef, rel: { x: number; z: number }): { x: number; z: number } {
  return { x: def.center.x + rel.x, z: def.center.z + rel.z };
}

/** Hình chữ nhật tuyệt đối của một vật trong phòng. */
export function worldRect(def: FacilityDef, it: Rect): Rect {
  const p = toWorld(def, it);
  return { x: p.x, z: p.z, w: it.w, d: it.d };
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;
}

/** Vật có nằm trọn trong phòng (chừa lề tường) không. */
export function insideRoom(def: FacilityDef, it: Rect, wall = 0.08): boolean {
  return (
    Math.abs(it.x) + it.w / 2 <= def.size.w / 2 - wall + 1e-6 &&
    Math.abs(it.z) + it.d / 2 <= def.size.d / 2 - wall + 1e-6
  );
}

/** Điểm đứng cửa phòng: ngay ngoài mặt trước, thẳng hàng với tâm. */
export function doorSpot(def: FacilityDef): Spot {
  return { x: def.center.x, z: def.center.z + def.size.d / 2 + 1.1, yaw: Math.PI };
}

// ---------------------------------------------------------------- điểm đến cho hành vi

/** Ghế phòng họp (tuyệt đối), theo thứ tự dùng: trưởng phòng ngồi dần từ đầu bàn. */
export function meetingSeatSpots(def: FacilityDef = FACILITIES[0]): Spot[] {
  return itemsOf(def, "seat").map((s) => {
    const p = toWorld(def, s);
    return { x: p.x, z: p.z, yaw: s.face ?? 0 };
  });
}

/** Chỗ người thuyết trình đứng cạnh màn hình (Giám đốc). */
export function presenterSpot(def: FacilityDef = FACILITIES[0]): Spot {
  const tv = itemsOf(def, "tv")[0];
  const p = toWorld(def, { x: (tv?.x ?? 0) + 2.2, z: -1.9 });
  return { x: p.x, z: p.z, yaw: -0.7 }; // quay về phía bàn
}

/** Chỗ đứng pha cà phê trước quầy pantry (mặt hướng quầy). */
export function coffeeSpots(def: FacilityDef = FACILITIES[1]): Spot[] {
  return COFFEE_X.map((x) => {
    const p = toWorld(def, { x, z: -2.0 });
    return { x: p.x, z: p.z, yaw: PI };
  });
}

/** Chỗ đứng xem bảng tin ở sảnh (trước màn hình). */
export function lobbyWatchSpot(def: FacilityDef = FACILITIES[2]): Spot {
  const tv = itemsOf(def, "tv")[0];
  const p = toWorld(def, { x: tv?.x ?? 2.7, z: -1.55 });
  return { x: p.x, z: p.z, yaw: PI };
}

/** Các hình chữ nhật chặn đường đi (toạ độ tuyệt đối). */
export function solidRects(def: FacilityDef): Rect[] {
  return def.items.filter((i) => i.solid).map((i) => worldRect(def, i));
}
