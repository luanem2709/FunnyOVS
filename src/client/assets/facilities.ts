/**
 * Dựng cơ sở vật chất 3D: phòng họp, pantry, sảnh lễ tân.
 *
 * Mọi vị trí lấy từ `src/shared/facilities.ts` (cùng nguồn với lưới đường đi A* và test), nên hình dựng, vùng chặn và điểm
 * đứng/ngồi của nhân vật luôn khớp nhau. Phần tĩnh được gộp mesh theo vật liệu; phần chuyển động (đồng hồ, LED máy pha cà phê)
 * và các màn hình canvas (bảng họp, bảng tin sảnh, logo công ty) nằm ngoài khối gộp để cập nhật được.
 */
import * as THREE from "three";
import { itemsOf, type FacilityDef, type FacilityItem } from "../../shared/facilities.js";
import {
  addAnimator,
  ball,
  box,
  canvasTexture,
  cyl,
  makeClock,
  makeCoffeeTable,
  makePlant,
  makeSofa,
  addWainscot,
  mergeStatic,
  registerGlow,
  registerNightLight,
  std,
} from "./decor.js";
import { softBox } from "./chibiProps.js";
import { floorMaterial } from "./floors.js";
import { makeSign } from "./officeParts.js";
import { ROADMAP_BOARD, buildChair } from "./roomBuilder.js";

const WALL_H = 3.2;
const WALL_T = 0.16;
const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.92 });

type Vars = Record<string, string | number>;
export type Translate = (key: string, vars?: Vars) => string;

export interface FacilityContext {
  /** Hàm dịch chữ trên biển/bảng (theo ngôn ngữ hiện tại). */
  t: Translate;
  /** Tên công ty hiện trên logo sảnh. */
  company: string;
}

/** Màn hình canvas vẽ lại khi nội dung đổi (khoá `key` khác lần trước). */
export class LiveScreen {
  readonly mesh: THREE.Mesh;
  readonly width: number;
  readonly height: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private lastKey = "";

  constructor(width: number, height: number, private readonly px = 512) {
    this.width = width;
    this.height = height;
    const py = Math.round((px * height) / width);
    const cvs = document.createElement("canvas");
    cvs.width = px;
    cvs.height = py;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.tex }));
  }

  /** Khoá nội dung đang hiển thị (để kiểm tra bảng đang vẽ gì mà không cần đọc pixel). */
  get key(): string {
    return this.lastKey;
  }

  /** Vẽ lại nếu `key` đổi. `paint` nhận ngữ cảnh 2D và kích thước canvas (px). */
  draw(key: string, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.lastKey) return;
    this.lastKey = key;
    const c = this.ctx;
    paint(c, c.canvas.width, c.canvas.height);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

export interface FacilityHandles {
  def: FacilityDef;
  group: THREE.Group;
  floor: THREE.Mesh;
  /** Bảng trên tường phòng họp (hiện kế hoạch đang họp). */
  meetingBoard?: LiveScreen;
  /** Bảng tin sảnh (số liệu văn phòng). */
  lobbyBoard?: LiveScreen;
  /** Logo công ty sau quầy lễ tân. */
  logo?: LiveScreen;
  dispose(): void;
}

const ACCENT: Record<string, string> = { meeting: "#8f7bf0", pantry: "#3fb950", lobby: "#e5c158" };

// ---------------------------------------------------------------------------
// Vật dụng dùng chung
// ---------------------------------------------------------------------------

function windows(st: THREE.Group, def: FacilityDef): void {
  const inW = def.size.w / 2 - 0.08;
  const frame = std(0xf3efe6, 0.6);
  const glass = registerGlow(std(0xbfe0ff, 0.15, 0, 0x7fb4e8, 0.5), 0.5, 1.8);
  for (const sx of [-1, 1]) {
    const x = sx * (inW - 0.02);
    st.add(box(0.08, 1.25, 1.75, frame, x, 1.8, -def.size.d * 0.1, false));
    st.add(box(0.1, 1.1, 1.6, glass, x, 1.8, -def.size.d * 0.1, false));
    st.add(box(0.11, 1.1, 0.05, frame, x, 1.8, -def.size.d * 0.1, false));
    st.add(box(0.11, 0.05, 1.6, frame, x, 1.8, -def.size.d * 0.1, false));
  }
}

function trim(st: THREE.Group, def: FacilityDef): void {
  const s = def.size;
  const inW = s.w / 2 - 0.08;
  const inD = s.d / 2 - 0.08;
  const skirting = std(0x8d836f, 0.8);
  st.add(box(s.w - 0.2, 0.14, 0.05, skirting, 0, 0.07, -inD, false));
  for (const sx of [-1, 1]) st.add(box(0.05, 0.14, s.d - 0.2, skirting, sx * inW, 0.07, 0, false));
  const cap = std(0xb9b1a0, 0.8);
  st.add(box(s.w + 0.1, 0.08, 0.26, cap, 0, WALL_H + 0.04, -s.d / 2, false));
  for (const sx of [-1, 1]) st.add(box(0.26, 0.08, s.d + 0.1, cap, sx * (s.w / 2), WALL_H + 0.04, 0, false));
  st.add(box(s.w - 0.2, 0.025, 0.14, std(0x1f6feb, 0.6), 0, 0.02, s.d / 2 - 0.1, false));
}

function wallClock(g: THREE.Group, it: FacilityItem): void {
  const clock = makeClock();
  clock.position.set(it.x, it.y ?? 2.45, it.z + 0.04);
  g.add(clock);
}

function rugOf(st: THREE.Group, it: FacilityItem, base: string, edge: string): void {
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(it.w, it.d),
    new THREE.MeshStandardMaterial({
      roughness: 1,
      map: canvasTexture(128, 96, (c) => {
        c.fillStyle = base;
        c.fillRect(0, 0, 128, 96);
        c.strokeStyle = edge;
        c.lineWidth = 4;
        c.strokeRect(7, 7, 114, 82);
        c.strokeStyle = "rgba(255,255,255,0.25)";
        c.lineWidth = 2;
        c.strokeRect(15, 15, 98, 66);
      }),
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(it.x, 0.024, it.z);
  rug.receiveShadow = true;
  st.add(rug);
}

function tvFrame(st: THREE.Group, it: FacilityItem): void {
  st.add(softBox(it.w, it.w * 0.5625 + 0.1, 0.06, 0.025, std(0x14181f, 0.4, 0.3), it.x, it.y ?? 1.75, it.z, false));
}

/** Gắn một màn hình canvas lên tường tại vị trí của `it` (nhô ra khỏi khung 3 cm). */
function wallScreen(g: THREE.Group, it: FacilityItem): LiveScreen {
  const w = it.w - 0.12;
  const screen = new LiveScreen(w, w * 0.5625);
  screen.mesh.position.set(it.x, it.y ?? 1.75, it.z + 0.04);
  g.add(screen.mesh);
  return screen;
}

function chairAt(st: THREE.Group, seat: FacilityItem): void {
  const face = seat.face ?? 0;
  const chair = buildChair();
  // Gốc nhân vật nằm trên ghế lệch 0.12 về phía trước (giống ghế bàn làm việc).
  chair.position.set(seat.x - Math.sin(face) * 0.12, 0, seat.z - Math.cos(face) * 0.12);
  chair.rotation.y = face;
  st.add(chair);
}

// ---------------------------------------------------------------------------
// Phòng họp
// ---------------------------------------------------------------------------

function buildMeeting(def: FacilityDef, st: THREE.Group, g: THREE.Group, ctx: FacilityContext): Partial<FacilityHandles> {
  const wood = std(0xb88550, 0.45);
  const woodDark = std(0x7a5636, 0.5);
  const table = itemsOf(def, "table")[0];
  const topLen = table.w - table.d;
  st.add(softBox(topLen, 0.06, table.d, 0.025, wood, table.x, 0.76, table.z));
  for (const sx of [-1, 1]) st.add(cyl(table.d / 2, table.d / 2, 0.06, wood, table.x + (sx * topLen) / 2, 0.76, table.z, 28));
  // tấm chân giữa bàn mỏng: người ngồi hai bên vẫn có chỗ để chân
  st.add(box(3.0, 0.62, 0.12, woodDark, table.x, 0.43, table.z));
  for (const sx of [-1, 1]) st.add(box(0.5, 0.05, table.d * 0.62, woodDark, table.x + sx * 1.5, 0.03, table.z, false));

  const pad = std(0xf6f4ee, 0.8);
  const ink = std(0x2f5fb3, 0.7);
  for (const seat of itemsOf(def, "seat")) {
    chairAt(st, seat);
    const face = seat.face ?? 0;
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    const px = seat.x + fx * 0.5;
    const pz = seat.z + fz * 0.5;
    const notepad = box(0.22, 0.012, 0.3, pad, px, 0.797, pz, false);
    notepad.rotation.y = face;
    st.add(notepad);
    const pen = box(0.012, 0.012, 0.13, ink, px + 0.16 * fz, 0.805, pz - 0.16 * fx, false);
    pen.rotation.y = face;
    st.add(pen);
  }
  // giữa bàn: điện thoại hội nghị + bình nước + hai ly
  st.add(cyl(0.13, 0.15, 0.035, std(0x22262b, 0.4, 0.3), table.x, 0.815, table.z, 20, false));
  st.add(cyl(0.09, 0.09, 0.28, std(0xbfe6ff, 0.15, 0, 0x7ec4f2, 0.2), table.x + 0.9, 0.93, table.z, 14, false));
  for (const dx of [0.65, 1.15]) st.add(cyl(0.035, 0.03, 0.09, std(0xdbeeff, 0.2), table.x + dx, 0.84, table.z + 0.25, 10, false));

  for (const it of itemsOf(def, "rug")) rugOf(st, it, "#3f5f73", "rgba(245,235,205,0.75)");
  for (const it of itemsOf(def, "credenza")) {
    st.add(softBox(it.w, 0.8, it.d, 0.05, woodDark, it.x, 0.4, it.z));
    st.add(softBox(it.w + 0.04, 0.04, it.d + 0.04, 0.018, wood, it.x, 0.82, it.z));
    st.add(cyl(0.1, 0.1, 0.3, std(0xbfe6ff, 0.15, 0, 0x7ec4f2, 0.2), it.x - 0.4, 1.0, it.z, 14, false));
    for (let i = 0; i < 3; i++) st.add(cyl(0.035, 0.03, 0.09, std(0xf3efe6, 0.5), it.x + 0.1 + i * 0.14, 0.89, it.z, 10, false));
  }
  for (const it of itemsOf(def, "plant")) st.add(makePlant(it.x, it.z, 1.1));
  for (const it of itemsOf(def, "clock")) wallClock(g, it);

  const tv = itemsOf(def, "tv")[0];
  tvFrame(st, tv);
  const meetingBoard = wallScreen(g, tv);
  void ctx;
  return { meetingBoard };
}

// ---------------------------------------------------------------------------
// Pantry
// ---------------------------------------------------------------------------

function buildPantry(def: FacilityDef, st: THREE.Group, g: THREE.Group, ctx: FacilityContext): Partial<FacilityHandles> {
  const white = std(0xf1efe8, 0.6);
  const top = std(0x3b4048, 0.35, 0.1);
  const steel = std(0xaab3bd, 0.35, 0.7);
  const dark = std(0x22262b, 0.4, 0.3);

  const counter = itemsOf(def, "counter")[0];
  const back = counter.z - counter.d / 2;
  st.add(softBox(counter.w, 0.88, counter.d, 0.05, white, counter.x, 0.44, counter.z));
  for (let i = 0; i < 6; i++) st.add(box(0.015, 0.78, 0.01, std(0xc9c6bb, 0.8), counter.x - counter.w / 2 + 0.4 + i * (counter.w / 5.5), 0.45, counter.z + counter.d / 2 + 0.003, false));
  st.add(softBox(counter.w + 0.04, 0.05, counter.d + 0.06, 0.02, top, counter.x, 0.905, counter.z));
  st.add(box(counter.w, 0.5, 0.04, std(0xe6e9e4, 0.4), counter.x, 1.18, back + 0.02, false));
  for (const cx of [-2.0, -0.5, 1.0, 2.2]) st.add(softBox(1.25, 0.7, 0.36, 0.05, white, counter.x + cx + 0.2, 1.95, back + 0.2));

  // máy pha cà phê (đứng trước nó là điểm "cà phê" ở giữa)
  const machineX = -0.8;
  const topY = 0.93;
  st.add(box(0.46, 0.52, 0.4, dark, machineX, topY + 0.26, counter.z));
  st.add(box(0.4, 0.14, 0.34, std(0x7cc4ee, 0.2, 0, 0x4aa3d8, 0.15), machineX, topY + 0.59, counter.z, false));
  st.add(box(0.36, 0.05, 0.3, steel, machineX, topY + 0.05, counter.z + 0.07, false));
  st.add(cyl(0.025, 0.025, 0.1, steel, machineX, topY + 0.36, counter.z + 0.2, 8, false));
  st.add(cyl(0.05, 0.04, 0.09, std(0xffffff, 0.4), machineX, topY + 0.12, counter.z + 0.2, 12, false));
  const led = registerGlow(std(0xff5040, 0.4, 0, 0xff3b30, 1.2), 1.2, 1.8);
  const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), led);
  ledMesh.position.set(machineX + 0.14, topY + 0.42, counter.z + 0.205);
  g.add(ledMesh);
  addAnimator((t) => {
    led.emissiveIntensity = (Math.sin(t * 2.6) > 0 ? 1.2 : 0.35) * (1 + 0);
  });
  // bồn rửa + vòi
  st.add(box(0.7, 0.04, 0.4, dark, machineX - 1.5, topY + 0.02, counter.z, false));
  st.add(cyl(0.025, 0.025, 0.3, steel, machineX - 1.5, topY + 0.17, counter.z - 0.12, 8, false));
  st.add(cyl(0.02, 0.02, 0.18, steel, machineX - 1.5, topY + 0.31, counter.z - 0.03, 8, false).rotateX(Math.PI / 2));
  // lò vi sóng
  st.add(softBox(0.52, 0.3, 0.38, 0.05, white, machineX + 1.8, topY + 0.15, counter.z));
  st.add(box(0.34, 0.22, 0.01, dark, machineX + 1.74, topY + 0.15, counter.z + 0.195, false));
  st.add(box(0.09, 0.2, 0.01, registerGlow(std(0x203020, 0.4, 0, 0x4dff7a, 0.6), 0.6, 1.4), machineX + 1.96, topY + 0.15, counter.z + 0.195, false));
  // bát trái cây
  st.add(cyl(0.18, 0.1, 0.08, std(0xd8cfc0, 0.6), machineX + 2.7, topY + 0.04, counter.z, 14, false));
  for (const [dx, c] of [[-0.06, 0xe5622e], [0.05, 0xd6372f], [0, 0xf2c230]] as const) st.add(ball(0.06, std(c, 0.6), machineX + 2.7 + dx, topY + 0.12, counter.z + dx * 0.4, false, 8));

  const fr = itemsOf(def, "fridge")[0];
  st.add(softBox(fr.w, 1.9, fr.d, 0.09, std(0xe9edf0, 0.35, 0.2), fr.x, 0.95, fr.z));
  st.add(box(fr.w - 0.06, 0.012, 0.01, std(0x8d949e, 0.5), fr.x, 1.32, fr.z + fr.d / 2 + 0.004, false));
  for (const y of [1.55, 0.95]) st.add(box(0.03, 0.4, 0.04, steel, fr.x + 0.32, y, fr.z + fr.d / 2 + 0.03, false));
  for (const [dx, c] of [[-0.2, 0xef6f8e], [0, 0xf7b32b], [0.18, 0x43c59e]] as const) st.add(box(0.07, 0.07, 0.01, std(c, 0.6), fr.x + dx, 1.62, fr.z + fr.d / 2 + 0.008, false));

  const vend = itemsOf(def, "vending")[0];
  const vg = new THREE.Group();
  vg.position.set(vend.x, 0, vend.z);
  vg.rotation.y = vend.face ?? 0;
  vg.add(softBox(0.8, 1.9, 0.9, 0.08, std(0x30415d, 0.4, 0.3), 0, 0.95, 0));
  vg.add(box(0.62, 1.2, 0.02, registerGlow(std(0x9fd6ff, 0.2, 0, 0x6ab6ee, 0.4), 0.4, 1.8), -0.03, 1.12, 0.46, false));
  const goods = [0xe5622e, 0x43c59e, 0xf7b32b, 0xef6f8e, 0x4f9cf9];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) vg.add(box(0.11, 0.17, 0.05, std(goods[(r + c) % goods.length], 0.6), -0.22 + c * 0.14, 1.55 - r * 0.27, 0.43, false));
  vg.add(box(0.5, 0.12, 0.04, dark, 0, 0.32, 0.46, false));
  st.add(vg);

  // bàn tròn + ghế đẩu
  for (const it of itemsOf(def, "roundtable")) {
    st.add(cyl(0.66, 0.66, 0.05, std(0xefe6d4, 0.5), it.x, 0.74, it.z, 28));
    st.add(cyl(0.06, 0.06, 0.72, steel, it.x, 0.37, it.z, 10, false));
    st.add(cyl(0.3, 0.32, 0.03, steel, it.x, 0.02, it.z, 18, false));
    st.add(cyl(0.05, 0.04, 0.08, std(0xffffff, 0.4), it.x + 0.2, 0.81, it.z - 0.1, 10, false));
  }
  for (const it of itemsOf(def, "stool")) {
    st.add(cyl(0.2, 0.2, 0.06, std(0x4f6fd0, 0.7), it.x, 0.45, it.z, 16));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      st.add(cyl(0.015, 0.015, 0.45, steel, it.x + Math.cos(a) * 0.13, 0.22, it.z + Math.sin(a) * 0.13, 6, false));
    }
  }
  for (const it of itemsOf(def, "bin")) st.add(cyl(0.18, 0.15, 0.5, std(0x5b6670, 0.6), it.x, 0.25, it.z, 14));
  for (const it of itemsOf(def, "plant")) st.add(makePlant(it.x, it.z, 1.1));
  for (const it of itemsOf(def, "clock")) wallClock(g, it);

  // bảng menu trên tường
  const menu = itemsOf(def, "menu")[0];
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(menu.w, 0.9),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(512, 288, (c) => {
        c.fillStyle = "#2b3a2e";
        c.fillRect(0, 0, 512, 288);
        c.strokeStyle = "#d8c9a0";
        c.lineWidth = 8;
        c.strokeRect(6, 6, 500, 276);
        c.fillStyle = "#f3e7c2";
        c.font = "bold 70px sans-serif";
        c.textAlign = "center";
        c.fillText(ctx.t("facility.pantry"), 256, 110);
        c.font = "34px sans-serif";
        c.fillStyle = "#cfe3cf";
        c.fillText(ctx.t("facility.pantryMenu"), 256, 180);
        c.font = "70px sans-serif";
        c.fillText("☕  🍵  💧", 256, 255);
      }),
    }),
  );
  board.position.set(menu.x, menu.y ?? 1.7, menu.z + 0.04);
  g.add(board);
  return {};
}

// ---------------------------------------------------------------------------
// Sảnh lễ tân
// ---------------------------------------------------------------------------

function paintLogo(c: CanvasRenderingContext2D, w: number, h: number, company: string): void {
  const grad = c.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1b2a55");
  grad.addColorStop(1, "#2c3f86");
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "#e5c158";
  c.lineWidth = 6;
  c.strokeRect(6, 6, w - 12, h - 12);
  // biểu tượng khối lục giác như logo ứng dụng
  const cx = h * 0.5;
  const cy = h * 0.5;
  const r = h * 0.3;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r * 0.95, cy - r * 0.5);
  c.lineTo(cx + r * 0.95, cy + r * 0.5);
  c.lineTo(cx, cy + r);
  c.lineTo(cx - r * 0.95, cy + r * 0.5);
  c.lineTo(cx - r * 0.95, cy - r * 0.5);
  c.closePath();
  c.fill();
  c.strokeStyle = "#2c3f86";
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx, cy + r);
  c.moveTo(cx - r * 0.95, cy - r * 0.5);
  c.lineTo(cx, cy);
  c.lineTo(cx + r * 0.95, cy - r * 0.5);
  c.stroke();
  c.fillStyle = "#ffffff";
  c.textBaseline = "middle";
  c.textAlign = "left";
  let size = h * 0.34;
  c.font = `bold ${size}px sans-serif`;
  const maxW = w - h * 1.1;
  while (c.measureText(company).width > maxW && size > 14) {
    size -= 2;
    c.font = `bold ${size}px sans-serif`;
  }
  c.fillText(company, h * 1.0, cy);
}

function buildLobby(def: FacilityDef, st: THREE.Group, g: THREE.Group, ctx: FacilityContext): Partial<FacilityHandles> {
  const brand = std(0x27407f, 0.45);
  const ledge = std(0xf2ede1, 0.4);
  const steel = std(0xaab3bd, 0.35, 0.7);
  const dark = std(0x22262b, 0.4, 0.3);

  const desk = itemsOf(def, "desk")[0];
  st.add(softBox(desk.w, 1.05, desk.d, 0.1, brand, desk.x, 0.525, desk.z));
  st.add(softBox(desk.w + 0.1, 0.06, desk.d + 0.12, 0.028, ledge, desk.x, 1.08, desk.z + 0.04));
  st.add(softBox(desk.w - 0.2, 0.04, desk.d * 0.5, 0.018, std(0x6b4f33, 0.6), desk.x, 0.8, desk.z - 0.1, false));
  // màn hình + bàn phím + chuông phía sau quầy
  st.add(box(0.5, 0.3, 0.03, dark, desk.x + 0.7, 1.28, desk.z - 0.12, false));
  st.add(box(0.1, 0.12, 0.08, steel, desk.x + 0.7, 1.15, desk.z - 0.12, false));
  st.add(box(0.36, 0.015, 0.12, dark, desk.x + 0.7, 0.83, desk.z + 0.02, false));
  st.add(cyl(0.05, 0.06, 0.04, std(0xf2c230, 0.3, 0.7), desk.x - 0.9, 1.13, desk.z + 0.15, 14, false));
  st.add(makePlant(desk.x + desk.w / 2 - 0.15, desk.z + 0.1, 0.55).translateY(1.11));

  // logo công ty trên tường lưng
  const logoItem = itemsOf(def, "logo")[0];
  const logo = new LiveScreen(logoItem.w, 0.9, 1024);
  logo.mesh.position.set(logoItem.x, logoItem.y ?? 2.0, logoItem.z + 0.04);
  g.add(logo.mesh);
  logo.draw(`logo:${ctx.company}`, (c, w, h) => paintLogo(c, w, h, ctx.company));
  st.add(box(logoItem.w + 0.14, 1.04, 0.05, std(0x14181f, 0.4, 0.3), logoItem.x, logoItem.y ?? 2.0, logoItem.z, false));

  // khu chờ: hai sofa đối diện + bàn nước + tạp chí
  const sofaColors = [0x6b5fc7, 0x3f7f8f];
  itemsOf(def, "sofa").forEach((it, i) => st.add(makeSofa(it.x, it.z, it.face ?? 0, sofaColors[i % 2])));
  for (const it of itemsOf(def, "coffeetable")) {
    st.add(makeCoffeeTable(it.x, it.z));
    for (const [dx, c] of [[-0.18, 0xef6f8e], [0.12, 0x4f9cf9]] as const) st.add(box(0.2, 0.012, 0.26, std(c, 0.7), it.x + dx, 0.43, it.z + 0.05, false));
  }
  for (const it of itemsOf(def, "rug")) rugOf(st, it, "#5b6286", "rgba(229,193,88,0.75)");
  for (const it of itemsOf(def, "plant")) st.add(makePlant(it.x, it.z, 1.25));
  for (const it of itemsOf(def, "clock")) wallClock(g, it);

  // đèn cây: chao đèn phát sáng, sáng hơn ban đêm
  for (const it of itemsOf(def, "lamp")) {
    st.add(cyl(0.04, 0.06, 1.55, steel, it.x, 0.78, it.z, 8, false));
    st.add(cyl(0.2, 0.12, 0.3, registerGlow(std(0xfff2c4, 0.5, 0, 0xffe08a, 0.25), 0.25, 2.4), it.x, 1.65, it.z, 14, false));
    st.add(cyl(0.16, 0.16, 0.03, steel, it.x, 0.02, it.z, 14, false));
  }
  // kệ tờ rơi
  for (const it of itemsOf(def, "brochures")) {
    st.add(softBox(it.w, 1.1, it.d, 0.05, std(0x7a5636, 0.6), it.x, 0.55, it.z));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) st.add(box(0.12, 0.2, 0.02, std([0xef6f8e, 0x4f9cf9, 0xf7b32b, 0x43c59e][(r + c) % 4], 0.7), it.x - 0.24 + c * 0.16, 0.35 + r * 0.28, it.z + it.d / 2 + 0.01, false));
  }
  // thảm chùi chân "WELCOME"
  for (const it of itemsOf(def, "mat")) {
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(it.w, it.d),
      new THREE.MeshStandardMaterial({
        roughness: 1,
        map: canvasTexture(256, 96, (c) => {
          c.fillStyle = "#3b3b3f";
          c.fillRect(0, 0, 256, 96);
          c.strokeStyle = "#e5c158";
          c.lineWidth = 4;
          c.strokeRect(5, 5, 246, 86);
          c.fillStyle = "#f3e7c2";
          c.font = "bold 44px sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(ctx.t("facility.welcome"), 128, 50);
        }),
      }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(it.x, 0.03, it.z);
    st.add(mat);
  }

  const tv = itemsOf(def, "tv")[0];
  tvFrame(st, tv);
  const lobbyBoard = wallScreen(g, tv);
  return { logo, lobbyBoard };
}

// ---------------------------------------------------------------------------
// Vỏ phòng + lắp ráp
// ---------------------------------------------------------------------------

/**
 * Dựng một phòng tiện ích vào `parent`: sàn (đúng loại), 3 tường, biển, đèn, đồ đạc.
 * Trả về các tay cầm để cập nhật màn hình và gỡ bỏ.
 */
export function buildFacility(parent: THREE.Object3D, def: FacilityDef, ctx: FacilityContext): FacilityHandles {
  const { center, size } = def;
  const group = new THREE.Group();
  group.name = `facility:${def.id}`;
  parent.add(group);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.d), floorMaterial(def.floor, def.floorColor, size.w, size.d));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, 0.01, center.z);
  floor.receiveShadow = true;
  floor.userData.roomId = def.id;
  group.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(size.w, WALL_H, WALL_T), WALL_MAT);
  back.position.set(center.x, WALL_H / 2, center.z - size.d / 2);
  group.add(back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H, size.d), WALL_MAT);
    w.position.set(center.x + (side * size.w) / 2, WALL_H / 2, center.z);
    group.add(w);
  }

  const sign = makeSign(ctx.t(`facility.${def.id}`).toUpperCase(), Math.min(size.w * 0.78, 7.5), 1.0, ACCENT[def.id] ?? "#4f9cf9");
  sign.position.set(center.x, WALL_H + 0.75, center.z - size.d / 2);
  group.add(sign);

  // Đèn phòng: mờ ban ngày, sáng hơn khi trời tối.
  const lamp = registerNightLight(new THREE.PointLight(0xffe9c4, 0.5, Math.max(size.w, size.d) * 0.8, 2), 0.5, 1.7);
  lamp.position.set(center.x, WALL_H - 0.3, center.z);
  group.add(lamp);

  // Đồ đạc: `st` (tĩnh, gộp theo vật liệu) và `g` (chuyển động/màn hình), cùng đặt tại tâm phòng.
  const g = new THREE.Group();
  g.position.set(center.x, 0, center.z);
  group.add(g);
  const st = new THREE.Group();
  st.position.set(center.x, 0, center.z);
  trim(st, def);
  addWainscot(st, def.size, parseInt((ACCENT[def.id] ?? "#6b7280").slice(1), 16));
  windows(st, def);

  const parts: Partial<FacilityHandles> =
    def.id === "meeting" ? buildMeeting(def, st, g, ctx) : def.id === "pantry" ? buildPantry(def, st, g, ctx) : buildLobby(def, st, g, ctx);
  mergeStatic(st, group, true);

  return {
    def,
    group,
    floor,
    ...parts,
    dispose: () => {
      parts.meetingBoard?.dispose();
      parts.lobbyBoard?.dispose();
      parts.logo?.dispose();
      parent.remove(group);
    },
  };
}

// ---------------------------------------------------------------------------
// Nội dung màn hình
// ---------------------------------------------------------------------------

export interface MeetingInfo {
  /** Tiêu đề yêu cầu đang họp; rỗng = phòng trống. */
  title: string;
  /** Tên người tham dự. */
  attendees: string[];
}

/** Bảng phòng họp: trống thì hiện "Phòng họp sẵn sàng", đang họp thì hiện chủ đề và người tham dự. */
export function paintMeetingBoard(screen: LiveScreen, t: Translate, info: MeetingInfo | null): void {
  const key = info ? `m:${info.title}|${info.attendees.join(",")}` : "m:free";
  screen.draw(key, (c, w, h) => {
    c.fillStyle = "#0e1624";
    c.fillRect(0, 0, w, h);
    c.fillStyle = info ? "#3fb950" : "#8b949e";
    c.fillRect(0, 0, w, 14);
    c.fillStyle = "#e6edf3";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `bold ${h * 0.17}px sans-serif`;
    c.fillText(t("facility.meeting"), w / 2, h * 0.22);
    if (!info) {
      c.fillStyle = "#8b949e";
      c.font = `${h * 0.12}px sans-serif`;
      c.fillText(t("facility.meetingFree"), w / 2, h * 0.58);
      return;
    }
    c.fillStyle = "#4f9cf9";
    c.font = `bold ${h * 0.12}px sans-serif`;
    const title = info.title.length > 46 ? `${info.title.slice(0, 45)}…` : info.title;
    c.fillText(title, w / 2, h * 0.42);
    c.fillStyle = "#c9d1d9";
    c.font = `${h * 0.095}px sans-serif`;
    const line = info.attendees.join(" · ");
    c.fillText(line.length > 60 ? `${line.slice(0, 59)}…` : line, w / 2, h * 0.65);
    c.fillStyle = "#3fb950";
    c.font = `bold ${h * 0.09}px sans-serif`;
    c.fillText(`● ${t("facility.meetingLive")}`, w / 2, h * 0.86);
  });
}

export interface LobbyStats {
  working: number;
  idle: number;
  pending: number;
  errors: number;
  ai: string;
  time: string;
}

/** Bảng tin sảnh: số liệu văn phòng theo thời gian thực. */
export function paintLobbyBoard(screen: LiveScreen, t: Translate, s: LobbyStats): void {
  screen.draw(`l:${s.working}|${s.idle}|${s.pending}|${s.errors}|${s.ai}|${s.time}`, (c, w, h) => {
    c.fillStyle = "#0e1624";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e5c158";
    c.fillRect(0, 0, w, 12);
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillStyle = "#e6edf3";
    c.font = `bold ${h * 0.13}px sans-serif`;
    c.fillText(t("facility.lobbyBoard"), w * 0.05, h * 0.2);
    c.textAlign = "right";
    c.fillStyle = "#8b949e";
    c.font = `bold ${h * 0.12}px monospace`;
    c.fillText(s.time, w * 0.95, h * 0.2);
    const cells: Array<[string, number, string]> = [
      [t("facility.statWorking"), s.working, "#3fb950"],
      [t("facility.statIdle"), s.idle, "#8b949e"],
      [t("facility.statPending"), s.pending, s.pending > 0 ? "#d29922" : "#8b949e"],
      [t("facility.statErrors"), s.errors, s.errors > 0 ? "#f85149" : "#8b949e"],
    ];
    cells.forEach(([label, value, color], i) => {
      const x = w * (0.05 + (i % 2) * 0.47);
      const y = h * (0.4 + Math.floor(i / 2) * 0.28);
      c.textAlign = "left";
      c.fillStyle = color;
      c.font = `bold ${h * 0.21}px sans-serif`;
      c.fillText(String(value), x, y);
      c.fillStyle = "#c9d1d9";
      c.font = `${h * 0.085}px sans-serif`;
      c.fillText(label, x + w * 0.13, y);
    });
    c.textAlign = "left";
    c.fillStyle = "#4f9cf9";
    c.font = `${h * 0.09}px sans-serif`;
    c.fillText(s.ai, w * 0.05, h * 0.93);
  });
}

/**
 * Bảng việc sống của phòng Giao việc: màn hình canvas phủ lên mặt bảng roadmap (cùng toạ độ với `propLayout("roadmap")`,
 * nhích ra trước mặt tranh tĩnh). Nội dung do `paintWorkBoard` (workboard.ts) vẽ từ cây giao việc.
 */
export function buildWorkBoard(parent: THREE.Object3D, room: { center: { x: number; z: number }; size: { d: number } }): LiveScreen {
  const screen = new LiveScreen(ROADMAP_BOARD.w - 0.16, ROADMAP_BOARD.h - 0.16, 1024);
  screen.mesh.position.set(room.center.x, ROADMAP_BOARD.y, room.center.z + room.size.d * ROADMAP_BOARD.zFrac + 0.062);
  parent.add(screen.mesh);
  return screen;
}

/** Vẽ lại logo khi đổi tên công ty. */
export function repaintLogo(logo: LiveScreen, company: string): void {
  logo.draw(`logo:${company}`, (c, w, h) => paintLogo(c, w, h, company));
}
