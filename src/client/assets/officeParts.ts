/**
 * Các mảnh dựng cảnh dùng cho renderer React Three Fiber (văn phòng hợp nhất):
 * vỏ phòng, bàn làm việc của agent, màn hình trên bàn, biển tên.
 *
 * Logic giống giao diện cổ điển (src/client/main.ts) — giữ bản cổ điển nguyên vẹn để rollback;
 * khi bỏ bản cổ điển, main.ts nên import lại từ đây.
 */
import * as THREE from "three";
import type { Manifest } from "./manifest.js";
import { buildFurniture, deskLayout, propLayout, DESK_TOP_Y } from "./roomBuilder.js";
import { buildRoomDecor, registerNightLight } from "./decor.js";
import { floorKindFor, floorMaterial } from "./floors.js";
import type { OfficeEntity } from "../../shared/officeEntity.js";
import { paintBadge, type BadgeInfo } from "./workboard.js";

export interface RoomDef {
  id: string;
  name: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
  floor: number;
  props: string[];
}

const WALL_H = 3.2;
const WALL_T = 0.16;
const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.92 });

export function makeSign(text: string, w: number, h: number, color = "#4f9cf9"): THREE.Sprite {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "rgba(13,17,23,0.86)";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 124);
  ctx.fillStyle = color;
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(w, h, 1);
  // Biển phòng: renderer thu nhỏ khi camera ở gần để không che cả màn hình (xem OfficeScene).
  spr.userData.roomSign = [w, h];
  return spr;
}

/** Sàn + 3 bức tường + biển + đèn + đồ đặc trưng + trang trí của một phòng. Trả về group chứa sàn (để raycast). */
export function buildRoomShell(parent: THREE.Object3D, room: RoomDef, manifest: Manifest | null): THREE.Mesh {
  const { center, size } = room;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size.w, size.d),
    // Sàn riêng cho từng khu: gỗ / thảm / gạch (texture sinh sẵn), tông màu theo phòng.
    floorMaterial(floorKindFor(room.id), room.floor, size.w, size.d),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, 0.01, center.z);
  floor.receiveShadow = true;
  floor.userData.roomId = room.id;
  parent.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(size.w, WALL_H, WALL_T), WALL_MAT);
  back.position.set(center.x, WALL_H / 2, center.z - size.d / 2);
  parent.add(back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H, size.d), WALL_MAT);
    w.position.set(center.x + (side * size.w) / 2, WALL_H / 2, center.z);
    parent.add(w);
  }

  const sign = makeSign(room.name.toUpperCase(), Math.min(size.w * 0.78, 7.5), 1.0, "#1f6feb");
  sign.position.set(center.x, WALL_H + 0.75, center.z - size.d / 2);
  parent.add(sign);

  // Đèn phòng: mờ ban ngày, sáng hơn khi trời tối (xem setNight trong decor.ts).
  const lamp = registerNightLight(new THREE.PointLight(0xffe9c4, 0.5, Math.max(size.w, size.d) * 0.8, 2), 0.5, 1.7);
  lamp.position.set(center.x, WALL_H - 0.3, center.z);
  parent.add(lamp);

  for (const p of room.props) {
    const placements = propLayout(p as never, size.w, size.d);
    if (!placements.length) continue;
    const group = new THREE.Group();
    group.position.set(center.x, 0, center.z);
    parent.add(group);
    buildFurniture(group, placements, manifest, 0xb0a08c);
  }
  buildRoomDecor(parent, room);
  return floor;
}

/** Bàn + ghế + màn hình đặt tại vị trí ngồi của một agent. */
export function buildAgentDesk(parent: THREE.Object3D, at: { x: number; z: number }, manifest: Manifest | null): void {
  const l = deskLayout(1, 7)[0];
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  parent.add(group);
  buildFurniture(
    group,
    [
      { ...l.desk, x: 0, z: 0.62 },
      { ...l.chair, x: 0, z: -0.12, rotY: 0 },
      { ...l.screen, x: 0.52, z: 0.72, rotY: Math.PI },
    ],
    manifest,
    0xb0a08c,
  );
}

const STATUS_HEX: Record<string, string> = {
  idle: "#8b949e",
  working: "#3fb950",
  researching: "#4f9cf9",
  learning: "#8f7bf0",
  "pending-approval": "#d29922",
  blocked: "#f85149",
  error: "#f85149",
  offline: "#484f58",
  stopped: "#484f58",
};
export const statusHex = (s: string): string => STATUS_HEX[s] ?? STATUS_HEX.idle;

export interface ScreenLogLine {
  text: string;
  level: "info" | "warn" | "error";
}

/** Màn hình trên bàn agent: vẽ lại bằng canvas, chỉ khi nội dung đổi. */
export class AgentScreen {
  readonly mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private lastKey = "";
  /** Dịch chữ trên màn hình (mặc định trả nguyên khoá; renderer đặt hàm dịch thật). */
  tt: (key: string) => string = (k) => k;

  constructor(x: number, z: number) {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 320;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.4), new THREE.MeshBasicMaterial({ map: this.tex }));
    this.mesh.position.set(x, DESK_TOP_Y + 0.43, z - 0.03);
    this.mesh.rotation.y = Math.PI;
    this.draw(null, []);
  }

  /** `taskText`: nhãn việc đang làm đã dịch (nếu không có thì dùng `metadata.task` nguyên văn). */
  draw(e: OfficeEntity | null, lines: ScreenLogLine[], taskText?: string): void {
    const md = (e?.metadata ?? {}) as Record<string, unknown>;
    const task = taskText ?? (typeof md.task === "string" ? md.task : "");
    const key = [e?.status, task, md.currentUrl, md.currentTitle, lines.map((l) => l.text).join("|")].join("::");
    if (key === this.lastKey) return;
    this.lastKey = key;

    const c = this.ctx;
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, 512, 320);
    if (!e) {
      c.fillStyle = "#30363d";
      c.font = "20px sans-serif";
      c.textAlign = "center";
      c.fillText(this.tt("scene.screenOff"), 256, 160);
      this.tex.needsUpdate = true;
      return;
    }
    c.fillStyle = "#161b22";
    c.fillRect(0, 0, 512, 42);
    c.fillStyle = "#4f9cf9";
    c.font = "bold 20px sans-serif";
    c.textAlign = "left";
    const roleKey = `role.${String(md.agentId ?? "")}`;
    const roleText = this.tt(roleKey);
    c.fillText(`${e.name} — ${roleText === roleKey ? String(md.role ?? "") : roleText}`, 12, 28);
    c.fillStyle = statusHex(e.status);
    c.textAlign = "right";
    c.fillText(e.status.toUpperCase(), 500, 28);

    c.textAlign = "left";
    c.fillStyle = "#e6edf3";
    c.font = "bold 16px sans-serif";
    c.fillText(ell(String(md.currentTitle || task || this.tt("scene.screenIdle")), 40), 12, 68);
    c.fillStyle = "#4f9cf9";
    c.font = "13px monospace";
    c.fillText(ell(String(md.currentUrl ?? "—"), 60), 12, 90);

    let y = 120;
    c.font = "12px monospace";
    for (const l of lines.slice(0, 9)) {
      c.fillStyle = l.level === "info" ? "#3fb950" : l.level === "warn" ? "#d29922" : "#f85149";
      c.fillText(`• ${ell(l.text, 46)}`, 12, y);
      y += 18;
    }
    if (lines.length === 0) {
      c.fillStyle = "#8b949e";
      c.fillText(this.tt("scene.screenNoActivity"), 12, y);
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

/**
 * Huy hiệu số việc đang mở trên bàn của người phụ trách: chấm tròn nhỏ (sprite luôn quay về camera) nằm ở góc phải trên màn hình bàn,
 * cách xa nhân vật nên không che người. Xanh = đang mở, vàng = có việc chờ duyệt, đỏ "!" = có việc vừa lỗi; không có việc thì ẩn.
 */
export class WorkBadge {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private lastKey = "";
  /** Thông tin đang hiển thị (null = chưa đặt lần nào). */
  info: BadgeInfo | null = null;

  constructor(x: number, z: number) {
    const cvs = document.createElement("canvas");
    cvs.width = 128;
    cvs.height = 128;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.sprite.scale.set(0.34, 0.34, 1);
    this.sprite.position.set(x, DESK_TOP_Y + 0.75, z);
    this.sprite.renderOrder = 5;
    this.sprite.visible = false;
  }

  set(info: BadgeInfo): void {
    const key = `${info.tone}:${info.open}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.info = info;
    paintBadge(this.ctx, 128, info);
    this.tex.needsUpdate = true;
    this.sprite.visible = info.tone !== "none";
  }

  dispose(): void {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}

function ell(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Màu chức danh theo tầng: Giám đốc vàng, Trưởng phòng xanh dương, Nhân viên xám. */
export const TIER_COLOR: Record<number, string> = { 1: "#c9961a", 2: "#1f6feb", 3: "#6b7280" };

/** Nhãn tên nổi trên đầu nhân vật; có `title` thì thêm dòng chức danh nhỏ và viền màu theo tầng. */
export function makeNameTag(name: string, title?: string, tier = 3): THREE.Sprite {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 160;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillRect(0, 0, 512, 160);
  if (title) {
    ctx.fillStyle = TIER_COLOR[tier] ?? TIER_COLOR[3];
    ctx.fillRect(0, 0, 512, 12);
  }
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 62px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 256, title ? 66 : 80);
  if (title) {
    ctx.fillStyle = TIER_COLOR[tier] ?? TIER_COLOR[3];
    ctx.font = "bold 36px sans-serif";
    ctx.fillText(title, 256, 122);
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(2.2, 0.69, 1);
  return spr;
}
