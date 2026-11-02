/**
 * Dựng phòng ban: sàn, tường, bàn ghế, đồ đạc.
 *
 * Ưu tiên model Kenney thật (Furniture Kit) nếu manifest có; nếu không thì dùng
 * hình dựng thủ công với đúng tỷ lệ chuẩn mà chibi rig kỳ vọng:
 *   mặt bàn ở cao độ 0.75, mặt ghế ở 0.49, màn hình đặt trên bàn.
 *
 * Nhân vật chibi cao ~1.4 đơn vị khi scale = 1 (xương hông 0.58, thân 0.59, đầu 0.33),
 * ngồi trên ghế 0.49 và gõ bàn phím ở cao độ 0.82.
 */
import * as THREE from "three";
import { cloneAsset, peekAsset, placeOnFloor, centerXZ } from "./loader.js";
import type { Manifest } from "./manifest.js";

/** Kích thước vật thể dự phòng (w, h, d) khi không có model. */
export type FallbackSize = [number, number, number];

export interface Placement {
  /** Từ khoá để tìm model (thử lần lượt theo thứ tự). */
  keywords: string[];
  /** Vị trí tương đối trong phòng. */
  x: number;
  z: number;
  /** Góc xoay quanh trục Y (radian). */
  rotY?: number;
  /** Hệ số co giãn. */
  scale?: number;
  /** Kích thước dự phòng (w, h, d) khi không có model. */
  fallback: FallbackSize;
  /** Nâng vật thể lên cao (mặt trên của bàn, chân ghế…). */
  y?: number;
  /** Màu sơn (dùng cho model có texture và cả fallback). */
  tint?: number;
  /** Nhóm instancing: các placement cùng `group` sẽ gộp thành 1 InstancedMesh. */
  group?: string;
  /** Bỏ qua instancing (dùng cho vật thể cần tương tác riêng). */
  unique?: boolean;
}

/** Bố cục đồ đạc cho từng loại phòng (theo `props` của server). */
export type PropKind =
  | "desk"
  | "phone"
  | "funnel"
  | "content"
  | "chart"
  | "router"
  | "terminal"
  | "books"
  | "roadmap";

/** Cao độ chuẩn (đơn vị thế giới) — khớp với chibi rig. */
export const DESK_TOP_Y = 0.78;
export const SEAT_Y = 0.49;

/**
 * Vật liệu dùng chung.
 *
 * Bảng màu lấy cảm hứng từ `references/my-office` (`world/terrace.js`):
 * gỗ nâu ấm, kim loại xám đậm, ghế xanh xám. Trước đây mọi thứ dùng tông
 * kem/trắng nên dưới ánh sáng mạnh cảnh bị "rửa trắng", mất chiều sâu.
 */
const M = {
  // Mặt bàn gỗ ấm (không dùng kem trắng — dễ cháy sáng).
  deskTop: new THREE.MeshStandardMaterial({ color: 0x9a6e48, roughness: 0.62 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x596170, roughness: 0.4, metalness: 0.6 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.88 }),
  screen: new THREE.MeshStandardMaterial({
    color: 0x14181f,
    emissive: 0x1b2430,
    roughness: 0.4,
  }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6e4b32, roughness: 0.68 }),
  prop: new THREE.MeshStandardMaterial({ color: 0x8d7f6b, roughness: 0.78 }),
  // Bảng trắng: vẫn sáng nhưng không trắng tuyệt đối.
  panel: new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.78 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x1f6feb, roughness: 0.5 }),
};

/**
 * Sinh vị trí bàn làm việc cho N nhân vật trong phòng.
 * Mỗi agent có 1 bàn + 1 ghế + 1 màn hình.
 * Nhân vật ngồi ở ghế, quay mặt về phía bàn (hướng -Z).
 */
export function deskLayout(
  count: number,
  roomW: number,
): { desk: Placement; chair: Placement; screen: Placement }[] {
  const out: { desk: Placement; chair: Placement; screen: Placement }[] = [];
  const perRow = Math.max(1, Math.ceil(count / 2));
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const spread = Math.min(roomW * 0.62, perRow * 2.6);
    const step = perRow > 1 ? spread / (perRow - 1) : 0;
    const x = perRow > 1 ? -spread / 2 + col * step : 0;
    const z = row === 0 ? -roomW * 0.1 : roomW * 0.1;
    out.push({
      desk: {
        keywords: ["desk", "table", "workdesk"],
        x,
        z,
        rotY: 0,
        fallback: [1.7, 0.06, 0.86],
      },
      chair: {
        keywords: ["chair", "armchair", "office_chair", "stool"],
        x,
        z: z + 0.95,
        rotY: Math.PI,
        fallback: [0.58, 0.1, 0.54],
      },
      screen: {
        keywords: ["computer", "monitor", "tv", "television", "laptop"],
        x,
        z: z - 0.18,
        y: DESK_TOP_Y + 0.03,
        fallback: [0.74, 0.46, 0.04],
        unique: true,
      },
    });
  }
  return out;
}

/** Bố cục trang trí đặc trưng cho từng phòng (trả về vị trí tương đối). */
export function propLayout(kind: PropKind, roomW: number, roomD: number): Placement[] {
  switch (kind) {
    case "desk":
      return [];
    case "phone":
      return [
        {
          keywords: ["phone", "telephone", "payphone"],
          x: -roomW * 0.32,
          z: -roomD * 0.3,
          fallback: [1.0, 1.4, 0.8],
          unique: true,
        },
      ];
    case "funnel":
      return [
        {
          keywords: ["funnel", "cone", "trafficcone"],
          x: roomW * 0.28,
          z: -roomD * 0.28,
          fallback: [1.2, 1.2, 1.2],
          unique: true,
        },
      ];
    case "content":
      return [
        {
          keywords: ["board", "whiteboard", "sign", "tv", "television"],
          x: 0,
          z: -roomD * 0.42,
          y: 1.7,
          fallback: [3.2, 1.8, 0.12],
          unique: true,
        },
      ];
    case "chart":
      return [
        {
          keywords: ["barrel", "crate", "box", "pallet"],
          x: roomW * 0.3,
          z: -roomD * 0.28,
          fallback: [0.6, 0.8, 0.6],
          unique: true,
        },
      ];
    case "router":
      return [
        {
          keywords: ["router", "tower", "server", "antenna"],
          x: -roomW * 0.3,
          z: -roomD * 0.3,
          fallback: [1.0, 1.6, 1.0],
          unique: true,
        },
      ];
    case "terminal":
      return [-2.2, 0, 2.2].map((x) => ({
        keywords: ["computer", "monitor", "tv", "television"],
        x,
        z: -roomD * 0.34,
        y: DESK_TOP_Y + 0.03,
        fallback: [0.74, 0.46, 0.04],
        unique: true,
      }));
    case "books":
      return [
        {
          keywords: ["bookshelf", "bookcase", "shelf", "cabinet"],
          x: -roomW * 0.28,
          z: -roomD * 0.36,
          fallback: [3.2, 2.6, 0.6],
          unique: true,
        },
        {
          keywords: ["bookshelf", "bookcase", "shelf", "cabinet"],
          x: roomW * 0.28,
          z: -roomD * 0.36,
          fallback: [3.2, 2.6, 0.6],
          unique: true,
        },
      ];
    case "roadmap":
      return [
        {
          keywords: ["board", "whiteboard", "sign", "tv", "television"],
          x: 0,
          z: -roomD * 0.42,
          y: 1.7,
          fallback: [4.2, 1.5, 0.1],
          unique: true,
        },
      ];
    default:
      return [];
  }
}

/** Tìm asset phù hợp cho placement từ manifest. */
function resolveAsset(manifest: Manifest | null, keywords: string[]): string | null {
  if (!manifest) return null;
  const norm = (s: string) =>
    s
      .replace(/\.(glb|gltf)$/i, "")
      .replace(/[\s_\-.]+/g, "")
      .toLowerCase();
  for (const kw of keywords) {
    const target = norm(kw);
    for (const a of manifest.assets) {
      if (norm(a.path.split("/").pop() ?? "") === target) return a.path;
    }
  }
  for (const kw of keywords) {
    const target = norm(kw);
    for (const a of manifest.assets) {
      if (norm(a.path.split("/").pop() ?? "").includes(target)) return a.path;
    }
  }
  return null;
}

/** Áp sơn cho model đã tải (clone material để không ảnh hưởng bản gốc). */
function applyTint(obj: THREE.Object3D, tint: number | undefined): void {
  if (tint === undefined) return;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material | THREE.Material[];
    const apply = (x: THREE.Material): THREE.Material => {
      const c = x.clone();
      const std = c as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(new THREE.Color(tint), 0.65);
      return c;
    };
    m.material = Array.isArray(src) ? src.map(apply) : apply(src);
  });
}

/** Bàn làm việc: mặt bàn + 4 chân + hộp bàn phím. */
function buildDesk(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.86), M.deskTop);
  top.position.y = DESK_TOP_Y;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, DESK_TOP_Y, 0.06), M.metal);
      leg.position.set(sx * 0.78, DESK_TOP_Y / 2, sz * 0.36);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.56), M.wood);
  drawer.position.set(0.6, 0.32, 0);
  drawer.castShadow = true;
  g.add(drawer);

  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.4), M.seat);
  mat.position.set(0, DESK_TOP_Y + 0.04, 0.08);
  g.add(mat);
  return g;
}

/** Ghế văn phòng: chân sao + mặt ghế + lưng. */
function buildChair(): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.3), M.metal);
    leg.position.set(Math.sin(a) * 0.13, 0.06, Math.cos(a) * 0.13);
    leg.rotation.y = a;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.metal);
    foot.position.set(Math.sin(a) * 0.27, 0.04, Math.cos(a) * 0.27);
    g.add(foot);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), M.metal);
  stem.position.y = 0.25;
  g.add(stem);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.54), M.seat);
  // Mặt ghế phải nằm đúng cao độ SEAT_Y (0.49) — chibi ngồi dựa vào đây.
  seat.position.y = SEAT_Y - 0.05;
  seat.castShadow = true;
  seat.receiveShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.1), M.seat);
  back.position.set(0, SEAT_Y + 0.32, -0.27);
  back.rotation.x = -0.12;
  back.castShadow = true;
  g.add(back);
  return g;
}

/** Màn hình máy tính trên bàn. */
function buildMonitor(): THREE.Group {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.18), M.metal);
  stand.position.y = 0.015;
  g.add(stand);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), M.metal);
  neck.position.y = 0.1;
  g.add(neck);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.46, 0.04), M.screen);
  frame.position.y = 0.4;
  frame.castShadow = true;
  g.add(frame);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.4),
    new THREE.MeshBasicMaterial({ color: 0x3a4a5e }),
  );
  panel.position.set(0, 0.4, 0.022);
  g.add(panel);
  return g;
}

/** Bảng trắng / bảng thông tin trên tường. */
function buildBoard(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), M.panel);
  board.castShadow = true;
  g.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), M.accent);
  frame.position.z = -0.03;
  g.add(frame);
  return g;
}

/** Kệ sách. */
function buildShelf(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), M.wood);
  frame.position.y = h / 2;
  frame.castShadow = true;
  g.add(frame);
  const colors = [0x4f9cf9, 0x43c59e, 0xf7b32b, 0xef6f8e, 0x8f7bf0];
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y = 0.28 + r * (h / rows);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.04, 0.44), M.wood);
    shelf.position.y = y;
    g.add(shelf);
    const n = Math.floor((w - 0.3) / 0.16);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.24 + (i % 3) * 0.03, 0.28),
        new THREE.MeshStandardMaterial({ color: colors[(i + r) % colors.length], roughness: 0.85 }),
      );
      b.position.set(-w / 2 + 0.2 + i * 0.16, y + 0.16, 0.04);
      b.castShadow = true;
      g.add(b);
    }
  }
  return g;
}

/** Vật thể dự phòng dạng hộp đơn giản. */
function fallbackBox(p: Placement, color: THREE.ColorRepresentation): THREE.Mesh {
  const [w, h, d] = p.fallback;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: p.tint ?? color, roughness: 0.78 }),
  );
  mesh.position.set(p.x, (p.y ?? 0) + h / 2, p.z);
  if (p.rotY) mesh.rotation.y = p.rotY;
  mesh.scale.setScalar(p.scale ?? 1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Dựng vật thể: ưu tiên model Kenney, không có thì dùng hình dựng thủ công. */
function buildOne(p: Placement, manifest: Manifest | null): THREE.Object3D {
  const assetPath = resolveAsset(manifest, p.keywords);
  if (assetPath && peekAsset(assetPath)) {
    const obj = cloneAsset(assetPath);
    if (obj) {
      obj.scale.setScalar(p.scale ?? 1);
      if (p.rotY) obj.rotation.y = p.rotY;
      applyTint(obj, p.tint);
      placeOnFloor(obj);
      centerXZ(obj);
      obj.position.x += p.x;
      obj.position.z += p.z;
      if (p.y) obj.position.y += p.y;
      return obj;
    }
  }
  return fallbackBox(p, M.prop.color);
}

/**
 * Dựng một danh sách vật thể trong phòng.
 * `parent` là group của phòng (đã đặt tại tâm phòng).
 */
export function buildFurniture(
  parent: THREE.Group,
  placements: Placement[],
  manifest: Manifest | null,
  _fallbackColor = 0xb0a08c,
): THREE.Group {
  const container = new THREE.Group();
  parent.add(container);

  for (const p of placements) {
    // Bàn / ghế / màn hình có hình riêng, chuẩn hơn hộp.
    const kind = p.keywords[0];
    if (kind === "desk") {
      const g = buildDesk();
      g.position.set(p.x, 0, p.z);
      if (p.rotY) g.rotation.y = p.rotY;
      container.add(g);
      continue;
    }
    if (kind === "chair") {
      const g = buildChair();
      g.position.set(p.x, 0, p.z);
      if (p.rotY) g.rotation.y = p.rotY;
      container.add(g);
      continue;
    }
    if (kind === "computer" || kind === "monitor") {
      const g = buildMonitor();
      g.position.set(p.x, p.y ?? DESK_TOP_Y + 0.03, p.z);
      if (p.rotY) g.rotation.y = p.rotY;
      container.add(g);
      continue;
    }
    if (kind === "board" || kind === "whiteboard") {
      const g = buildBoard(p.fallback[0], p.fallback[1]);
      g.position.set(p.x, p.y ?? 1.6, p.z);
      container.add(g);
      continue;
    }
    if (kind === "bookshelf" || kind === "bookcase" || kind === "shelf" || kind === "cabinet") {
      const g = buildShelf(p.fallback[0], p.fallback[1]);
      g.position.set(p.x, 0, p.z);
      container.add(g);
      continue;
    }
    container.add(buildOne(p, manifest));
  }

  return container;
}
