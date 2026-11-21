/**
 * Hành vi của agent trong văn phòng ngoài việc ngồi bàn.
 *
 *  - Khi RẢNH lâu, agent chọn ngẫu nhiên một việc nhỏ từ bảng `IDLE_ACTIONS`: ngồi tại chỗ
 *    (lướt điện thoại, suy nghĩ, dọn bàn, ngủ gật...) hoặc đứng dậy đi ra cửa phòng uống cà phê,
 *    dạo quanh đài phun nước, ra ghế đá — rồi đi bộ về chỗ.
 *  - Xong việc: giơ tay ăn mừng tại chỗ (pháo giấy do effects xử lý).
 *  - Có việc mới (rời khỏi trạng thái rảnh) thì bỏ giải lao và quay về bàn ngay.
 *
 * Cấu trúc "bảng hành vi nhàn rỗi theo dữ liệu" (xác suất, thời lượng, địa điểm) lấy ý tưởng từ
 * `public/behavior.js` của agent-office-3d (https://github.com/jefferysha0627/agent-office-3d,
 * Copyright (c) 2026 Jeffery Sha, MIT). Nội dung và mã được viết lại cho FunnyOVS. Xem NOTICE.md.
 *
 * Có `NavGrid` (A*) thì đường đi né bàn/tường; không có thì đi theo cột lối đi cố định (giao diện cổ điển).
 */
import * as THREE from "three";
import type { AgentVisual } from "./characterFactory.js";
import type { ChibiAnim } from "./chibi.js";
import type { NavGrid, Point } from "./navgrid.js";

type Phase = "seated" | "seatAct" | "leaving" | "break" | "returning" | "celebrate";

export type IdleWhere = "seat" | "door" | "fountain" | "bench";

export interface IdleAction {
  id: string;
  /** Trọng số chọn (tương đối). */
  weight: number;
  where: IdleWhere;
  /** Pose của rig chibi (xem chibiRig.js). */
  anim: string;
  /** Thời gian thực hiện (giây), không gồm thời gian đi bộ. */
  secs: [number, number];
  label: string;
}

export const IDLE_ACTIONS: IdleAction[] = [
  { id: "phone", weight: 14, where: "seat", anim: "phone", secs: [10, 22], label: "📱 Lướt điện thoại" },
  { id: "think", weight: 14, where: "seat", anim: "think", secs: [8, 18], label: "💭 Đang suy nghĩ" },
  { id: "tidy", weight: 10, where: "seat", anim: "tidy", secs: [8, 16], label: "🧹 Dọn bàn" },
  { id: "sleep", weight: 6, where: "seat", anim: "sleep", secs: [12, 24], label: "💤 Ngủ gật" },
  { id: "coffee", weight: 22, where: "door", anim: "coffee", secs: [6, 12], label: "☕ Uống cà phê" },
  { id: "fountain", weight: 14, where: "fountain", anim: "think", secs: [6, 12], label: "⛲ Ngắm đài phun nước" },
  { id: "bench", weight: 12, where: "bench", anim: "phone", secs: [8, 16], label: "🪑 Nghỉ ở ghế đá" },
];

/** Chọn một hành động theo trọng số, chỉ trong các địa điểm khả dụng. */
export function pickIdleAction(available: ReadonlySet<IdleWhere>, rand: () => number = Math.random): IdleAction {
  const pool = IDLE_ACTIONS.filter((a) => available.has(a.where));
  const total = pool.reduce((s, a) => s + a.weight, 0);
  let r = rand() * total;
  for (const a of pool) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return pool[pool.length - 1] ?? IDLE_ACTIONS[0];
}

/** Điểm đứng ngoài phòng. `yaw` là hướng mặt khi tới nơi. */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface BehaviorOptions {
  /** Lưới A*; bỏ trống = đường cố định theo cột lối đi. */
  nav?: NavGrid;
  /** Điểm đứng cho các địa điểm ngoài phòng. `door` luôn có. */
  spots?: Partial<Record<Exclude<IdleWhere, "seat">, Spot>>;
  rand?: () => number;
}

const WALK_SPEED = 1.15;
/** Quãng đường đi bộ tối đa (đơn vị thế giới) cho một lần ra ngoài. */
export const MAX_WALK = 20;
const CELEBRATE_SECONDS = 2.6;
const FIRST_IDLE_DELAY: [number, number] = [12, 25];
const BETWEEN_ACTIONS: [number, number] = [20, 45];

function between(range: [number, number], rand: () => number): number {
  return range[0] + rand() * (range[1] - range[0]);
}

export class AgentBehavior {
  private phase: Phase = "seated";
  private path: THREE.Vector2[] = [];
  private pos: THREE.Vector2;
  private timer = 0;
  private idleFor = 0;
  private nextActionAt: number;
  private yaw = 0;
  private faceYaw = 0;
  private current: IdleAction | null = null;
  private readonly seat: THREE.Vector2;
  private readonly rand: () => number;
  private readonly nav?: NavGrid;
  private readonly spots: Partial<Record<Exclude<IdleWhere, "seat">, Spot>>;

  constructor(
    private readonly visual: AgentVisual,
    seatX: number,
    seatZ: number,
    /** Cao độ z của cửa phòng (nơi đứng uống cà phê, trên cột lối đi). */
    private readonly doorZ: number,
    /** Cột x đi vòng qua bàn. */
    private readonly exitX: number,
    /** Gọi khi ngồi lại bàn → áp lại pose theo trạng thái hiện tại. */
    private readonly onSeated: () => void,
    opts: BehaviorOptions = {},
  ) {
    this.seat = new THREE.Vector2(seatX, seatZ);
    this.pos = this.seat.clone();
    this.rand = opts.rand ?? Math.random;
    this.nav = opts.nav;
    this.spots = { door: { x: exitX, z: doorZ, yaw: 0 }, ...(opts.spots ?? {}) };
    this.nextActionAt = between(FIRST_IDLE_DELAY, this.rand);
  }

  /** Đang ở ngoài chỗ ngồi (đi bộ hoặc nghỉ ở điểm đứng). */
  get away(): boolean {
    return this.phase === "leaving" || this.phase === "break" || this.phase === "returning";
  }

  /** Nhãn hiển thị trong bong bóng khi đang làm việc nhàn rỗi; null nếu không. */
  label(): string | null {
    if (this.phase === "leaving" || this.phase === "returning") return this.current ? this.current.label : "🚶 Đi bộ";
    if (this.phase === "break" || this.phase === "seatAct") return this.current?.label ?? null;
    return null;
  }

  /** Xong việc: ăn mừng tại chỗ. */
  celebrate(): void {
    if ((this.phase !== "seated" && this.phase !== "seatAct") || !this.visual.chibi) return;
    this.phase = "celebrate";
    this.current = null;
    this.timer = CELEBRATE_SECONDS;
  }

  /** Trạng thái agent đổi: không còn rảnh thì bỏ việc nhỏ và về bàn. */
  onStatus(status: string): void {
    if (status === "idle") return;
    this.idleFor = 0;
    if (this.phase === "seatAct") {
      this.phase = "seated";
      this.current = null;
      this.onSeated();
    } else if (this.phase === "leaving" || this.phase === "break") {
      this.goBack();
    }
  }

  private route(from: THREE.Vector2, to: THREE.Vector2, viaColumn: boolean): THREE.Vector2[] {
    if (this.nav) {
      return this.nav.findPath([from.x, from.y], [to.x, to.y]).map((p: Point) => new THREE.Vector2(p[0], p[1]));
    }
    // Không có lưới: đi theo cột lối đi bên cạnh bàn.
    if (viaColumn) {
      return Math.abs(from.x - this.exitX) < 0.05
        ? [new THREE.Vector2(this.exitX, to.y)]
        : [new THREE.Vector2(this.exitX, from.y), new THREE.Vector2(this.exitX, to.y)];
    }
    return [to.clone()];
  }

  private goBack(): void {
    this.phase = "returning";
    if (this.nav) {
      this.path = this.route(this.pos, this.seat, false);
      return;
    }
    // Đang ở cột lối đi → đi dọc cột về hàng ghế rồi tới ghế; còn ở hàng ghế → đi thẳng về ghế.
    this.path =
      Math.abs(this.pos.x - this.exitX) < 0.05
        ? [new THREE.Vector2(this.exitX, this.seat.y), this.seat.clone()]
        : [this.seat.clone()];
  }

  private startAction(): void {
    const available = new Set<IdleWhere>(["seat"]);
    for (const k of Object.keys(this.spots) as Array<Exclude<IdleWhere, "seat">>) available.add(k);
    // Không có lưới: chỉ dùng điểm cửa (đường cố định không biết đường tới nơi khác).
    if (!this.nav) for (const k of ["fountain", "bench"] as const) available.delete(k);
    const action = pickIdleAction(available, this.rand);
    this.current = action;
    this.idleFor = 0;
    if (action.where === "seat") {
      this.phase = "seatAct";
      this.timer = between(action.secs, this.rand);
      return;
    }
    const spot = this.spots[action.where as Exclude<IdleWhere, "seat">]!;
    const path = this.route(this.pos, new THREE.Vector2(spot.x, spot.z), true);
    // Điểm đứng quá xa (phải đi vòng cả toà nhà) thì đổi sang một việc nhỏ tại chỗ.
    if (pathLength(this.pos, path) > MAX_WALK) {
      const fallback = IDLE_ACTIONS.find((a) => a.id === "think")!;
      this.current = fallback;
      this.phase = "seatAct";
      this.timer = between(fallback.secs, this.rand);
      return;
    }
    this.faceYaw = spot.yaw;
    this.phase = "leaving";
    this.path = path;
  }

  update(dt: number, status: string): void {
    const chibi = this.visual.chibi;
    if (!chibi) return;

    switch (this.phase) {
      case "seated": {
        if (status === "idle") {
          this.idleFor += dt;
          if (this.idleFor >= this.nextActionAt) this.startAction();
        } else {
          this.idleFor = 0;
        }
        return;
      }
      case "seatAct": {
        chibi.anim = (this.current?.anim ?? "idle") as ChibiAnim;
        this.timer -= dt;
        if (this.timer <= 0 || status !== "idle") {
          this.phase = "seated";
          this.current = null;
          this.nextActionAt = between(BETWEEN_ACTIONS, this.rand);
          this.onSeated();
        }
        return;
      }
      case "celebrate": {
        this.timer -= dt;
        chibi.anim = "celebrate" as ChibiAnim;
        if (this.timer <= 0) {
          this.phase = "seated";
          this.onSeated();
        }
        return;
      }
      case "break": {
        chibi.sit = false;
        chibi.anim = (this.current?.anim ?? "coffee") as ChibiAnim;
        this.timer -= dt;
        if (this.timer <= 0) this.goBack();
        break;
      }
      case "leaving":
      case "returning": {
        chibi.sit = false;
        chibi.anim = "walk";
        const next = this.path[0];
        if (!next) break;
        const dx = next.x - this.pos.x;
        const dz = next.y - this.pos.y;
        const dist = Math.hypot(dx, dz);
        const step = WALK_SPEED * dt;
        if (dist <= step) {
          this.pos.copy(next);
          this.path.shift();
        } else {
          this.pos.x += (dx / dist) * step;
          this.pos.y += (dz / dist) * step;
          this.yaw = Math.atan2(dx, dz);
        }
        if (this.path.length === 0) {
          if (this.phase === "leaving") {
            this.phase = "break";
            this.timer = between(this.current?.secs ?? [6, 12], this.rand);
            this.yaw = this.faceYaw;
            this.nextActionAt = between(BETWEEN_ACTIONS, this.rand);
          } else {
            this.phase = "seated";
            this.yaw = 0;
            this.current = null;
            this.idleFor = 0;
            chibi.sit = true;
            this.onSeated();
          }
        }
        break;
      }
    }
    // Di chuyển cả cụm (vòng trạng thái, nhãn tên, bong bóng đi theo); chỉ xoay thân nhân vật.
    this.visual.root.position.set(this.pos.x, 0, this.pos.y);
    const target = this.phase === "break" ? this.faceYaw : this.yaw;
    chibi.root.rotation.y += shortestAngle(target - chibi.root.rotation.y) * Math.min(1, dt * 10);
  }
}

function pathLength(from: THREE.Vector2, path: THREE.Vector2[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += prev.distanceTo(p);
    prev = p;
  }
  return len;
}

function shortestAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
