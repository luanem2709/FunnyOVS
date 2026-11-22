/**
 * Hành vi của agent trong văn phòng ngoài việc ngồi bàn.
 *
 *  - Khi RẢNH lâu, agent chọn ngẫu nhiên một việc nhỏ từ bảng `IDLE_ACTIONS`: ngồi tại chỗ
 *    (lướt điện thoại, suy nghĩ, dọn bàn, ngủ gật...) hoặc đứng dậy đi pha cà phê ở pantry (nếu gần; không thì ra cửa phòng),
 *    xem bảng tin ở sảnh, dạo quanh đài phun nước, ra ghế đá — rồi đi bộ về chỗ.
 *  - Xong việc: giơ tay ăn mừng tại chỗ (pháo giấy do effects xử lý).
 *  - Nhận/giao việc: phản ứng ngắn tại bàn (giơ tay "em nhận", chỉ tay giao việc) — `react()`.
 *  - Họp: đi tới phòng họp, ngồi/đứng thuyết trình rồi quay về — `attendMeeting()`; không bị trạng thái "đang làm" cắt ngang.
 *  - Có việc mới (rời khỏi trạng thái rảnh) thì bỏ giải lao và quay về bàn ngay.
 *
 * Cấu trúc "bảng hành vi nhàn rỗi theo dữ liệu" (xác suất, thời lượng, địa điểm) lấy ý tưởng từ
 * `public/behavior.js` của agent-office-3d (https://github.com/jefferysha0627/agent-office-3d,
 * Copyright (c) 2026 Jeffery Sha, MIT). Nội dung và mã được viết lại cho FunnyOVS. Xem NOTICE.md.
 *
 * Đi lại cần `NavGrid` (A*) để né bàn/tường; không có lưới thì agent chỉ làm các việc nhỏ tại chỗ.
 * Để văn phòng không lộn xộn: tối đa `MAX_AWAY` người ra ngoài cùng lúc và có công tắc tắt hẳn (`setIdleLife`).
 */
import * as THREE from "three";
import type { Spot } from "../../shared/facilities.js";
import type { AgentVisual } from "./characterFactory.js";
import type { ChibiAnim } from "./chibi.js";
import type { NavGrid, Point } from "./navgrid.js";

export type { Spot };

type Phase = "seated" | "seatAct" | "leaving" | "break" | "returning" | "celebrate" | "react" | "toMeeting" | "meeting";

export type IdleWhere = "seat" | "door" | "fountain" | "bench" | "pantry" | "lobby";

export interface IdleAction {
  id: string;
  /** Trọng số chọn (tương đối). */
  weight: number;
  where: IdleWhere;
  /** Nơi thay thế khi `where` không có hoặc quá xa (vd. cà phê: pantry → cửa phòng). */
  fallbackWhere?: IdleWhere;
  /** Quãng đường tối đa tới `where` (mặc định `MAX_WALK`); nơi thay thế luôn dùng `MAX_WALK`. */
  maxWalk?: number;
  /** Pose của rig chibi (xem chibiRig.js). */
  anim: string;
  /** Thời gian thực hiện (giây), không gồm thời gian đi bộ. */
  secs: [number, number];
  /** Khoá i18n của nhãn (xem office-3d/i18n). */
  label: string;
}

export const IDLE_ACTIONS: IdleAction[] = [
  { id: "phone", weight: 14, where: "seat", anim: "phone", secs: [10, 22], label: "idle.phone" },
  { id: "think", weight: 14, where: "seat", anim: "think", secs: [8, 18], label: "idle.think" },
  { id: "tidy", weight: 10, where: "seat", anim: "tidy", secs: [8, 16], label: "idle.tidy" },
  { id: "sleep", weight: 6, where: "seat", anim: "sleep", secs: [12, 24], label: "idle.sleep" },
  { id: "coffee", weight: 22, where: "pantry", fallbackWhere: "door", maxWalk: 32, anim: "coffee", secs: [6, 12], label: "idle.coffee" },
  { id: "lobby", weight: 6, where: "lobby", maxWalk: 32, anim: "think", secs: [6, 12], label: "idle.lobby" },
  { id: "fountain", weight: 14, where: "fountain", anim: "think", secs: [6, 12], label: "idle.fountain" },
  { id: "bench", weight: 12, where: "bench", anim: "phone", secs: [8, 16], label: "idle.bench" },
];

/** Việc nhỏ có thể làm ở một nơi khả dụng: nơi chính hoặc nơi thay thế đều được tính. */
function usable(a: IdleAction, available: ReadonlySet<IdleWhere>): boolean {
  return available.has(a.where) || (a.fallbackWhere !== undefined && available.has(a.fallbackWhere));
}

/** Chọn một hành động theo trọng số, chỉ trong các địa điểm khả dụng. */
export function pickIdleAction(available: ReadonlySet<IdleWhere>, rand: () => number = Math.random): IdleAction {
  const pool = IDLE_ACTIONS.filter((a) => usable(a, available));
  const total = pool.reduce((s, a) => s + a.weight, 0);
  let r = rand() * total;
  for (const a of pool) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return pool[pool.length - 1] ?? IDLE_ACTIONS[0];
}

export interface BehaviorOptions {
  /** Lưới A*; bỏ trống = chỉ làm việc nhỏ tại chỗ. */
  nav?: NavGrid;
  /**
   * Điểm đứng cho các địa điểm ngoài phòng. Một địa điểm có thể có NHIỀU điểm (vd. 3 chỗ trước quầy cà phê):
   * agent chọn điểm gần nhất chưa có ai đứng, nên hai người không chồng lên nhau.
   */
  spots?: Partial<Record<Exclude<IdleWhere, "seat">, Spot | Spot[]>>;
  rand?: () => number;
}

/** Họp: ghế/chỗ đứng, thuyết trình hay nghe, thời lượng (giây) tại phòng họp. */
export interface MeetingTask {
  spot: Spot;
  present?: boolean;
  secs: number;
}

export type ReactKind = "receive" | "assign";

const WALK_SPEED = 1.15;
/** Quãng đường đi bộ tối đa (đơn vị thế giới) cho một lần ra ngoài. */
export const MAX_WALK = 20;
/** Đi họp được phép xa hơn (việc quan trọng): vẫn có giới hạn để không đi vòng cả toà nhà. */
export const MAX_WALK_MEETING = 48;
/** Số người tối đa được ra ngoài cùng lúc (giữ văn phòng gọn gàng). */
export const MAX_AWAY = 3;
const CELEBRATE_SECONDS = 2.6;
export const REACT_SECONDS = 1.8;
const FIRST_IDLE_DELAY: [number, number] = [30, 70];
const BETWEEN_ACTIONS: [number, number] = [60, 130];

/** Pose khi phản ứng: nhận việc giơ tay "em nhận", giao việc đưa tay chỉ. */
export const REACT_ANIM: Record<ReactKind, string> = { receive: "hand", assign: "board" };
/** Pose khi họp: người thuyết trình đứng chỉ bảng; người nghe luân phiên các tư thế ngồi. */
export const MEETING_PRESENT_ANIM = "board";
export const MEETING_LISTEN_ANIMS = ["think", "idle", "hand", "idle", "laugh", "idle"] as const;
const MEETING_BEAT_SECONDS = 5;

let idleLifeEnabled = true;
/** Bật/tắt toàn bộ hoạt cảnh nhàn rỗi (cài đặt của người dùng). Việc đang diễn ra vẫn kết thúc bình thường. */
export function setIdleLife(on: boolean): void {
  idleLifeEnabled = on;
}
export function isIdleLife(): boolean {
  return idleLifeEnabled;
}

/** Bộ đếm số người đang ở ngoài, dùng chung cho mọi agent trong một cảnh. */
const away = { count: 0 };
/** Điểm đứng đang có người giữ (khoá theo toạ độ), dùng chung cho mọi agent trong một cảnh. */
const claims = new Set<string>();
const spotKey = (s: Spot): string => `${s.x.toFixed(2)},${s.z.toFixed(2)}`;
export function resetAwayCounter(): void {
  away.count = 0;
  claims.clear();
}
export function awayCount(): number {
  return away.count;
}

function between(range: [number, number], rand: () => number): number {
  return range[0] + rand() * (range[1] - range[0]);
}

export class AgentBehavior {
  private phase: Phase = "seated";
  private path: THREE.Vector2[] = [];
  private pos: THREE.Vector2;
  private timer = 0;
  private elapsed = 0;
  private idleFor = 0;
  private nextActionAt: number;
  private yaw = 0;
  private faceYaw = 0;
  private current: IdleAction | null = null;
  private meeting: MeetingTask | null = null;
  private reaction: ReactKind | null = null;
  private holdsAwaySlot = false;
  private claimedSpot: string | null = null;
  private readonly seat: THREE.Vector2;
  private readonly rand: () => number;
  private readonly nav?: NavGrid;
  private readonly spots: Partial<Record<Exclude<IdleWhere, "seat">, Spot | Spot[]>>;

  constructor(
    private readonly visual: AgentVisual,
    seatX: number,
    seatZ: number,
    /** Gọi khi ngồi lại bàn → áp lại pose theo trạng thái hiện tại. */
    private readonly onSeated: () => void,
    opts: BehaviorOptions = {},
  ) {
    this.seat = new THREE.Vector2(seatX, seatZ);
    this.pos = this.seat.clone();
    this.rand = opts.rand ?? Math.random;
    this.nav = opts.nav;
    this.spots = opts.spots ?? {};
    this.nextActionAt = between(FIRST_IDLE_DELAY, this.rand);
  }

  /** Đang ở ngoài chỗ ngồi (đi bộ, nghỉ ở điểm đứng, hoặc đi/ở phòng họp). */
  get away(): boolean {
    return this.phase === "leaving" || this.phase === "break" || this.phase === "returning" || this.phase === "toMeeting" || this.phase === "meeting";
  }

  /** Đang đi họp hoặc đang họp. */
  get inMeeting(): boolean {
    return this.phase === "toMeeting" || this.phase === "meeting";
  }

  /** Đang làm động tác phản ứng nhận/giao việc. */
  get reacting(): ReactKind | null {
    return this.phase === "react" ? this.reaction : null;
  }

  /** Khoá i18n của nhãn bong bóng khi đang làm việc nhàn rỗi; null nếu không. */
  label(): string | null {
    if (this.inMeeting) return "idle.meeting";
    if (this.phase === "leaving" || this.phase === "returning") return this.current?.label ?? "idle.walk";
    if (this.phase === "break" || this.phase === "seatAct") return this.current?.label ?? null;
    return null;
  }

  private releaseSlot(): void {
    if (this.holdsAwaySlot) {
      away.count = Math.max(0, away.count - 1);
      this.holdsAwaySlot = false;
    }
    if (this.claimedSpot) {
      claims.delete(this.claimedSpot);
      this.claimedSpot = null;
    }
  }

  /** Xong việc: ăn mừng tại chỗ. */
  celebrate(): void {
    if ((this.phase !== "seated" && this.phase !== "seatAct" && this.phase !== "react") || !this.visual.chibi) return;
    this.phase = "celebrate";
    this.current = null;
    this.reaction = null;
    this.timer = CELEBRATE_SECONDS;
  }

  /**
   * Phản ứng ngắn tại bàn khi nhận việc (giơ tay) hoặc giao việc (đưa tay chỉ).
   * Chỉ chạy khi đang ngồi tại chỗ — không cắt ngang họp, đi lại hay ăn mừng. Trả về true nếu bắt đầu.
   */
  react(kind: ReactKind): boolean {
    if ((this.phase !== "seated" && this.phase !== "seatAct") || !this.visual.chibi) return false;
    this.phase = "react";
    this.reaction = kind;
    this.current = null;
    this.timer = REACT_SECONDS;
    return true;
  }

  /**
   * Đi họp: tới `spot`, ngồi (hoặc đứng thuyết trình nếu `present`) `secs` giây rồi về chỗ.
   * Từ chối (false) nếu không có lưới đường đi, đang ở ngoài chỗ, hoặc quãng đường vượt `MAX_WALK_MEETING`.
   * Không dùng suất "ra ngoài" của việc nhàn rỗi (họp quan trọng hơn) và không bị trạng thái "đang làm" huỷ.
   */
  attendMeeting(task: MeetingTask): boolean {
    if (!this.nav || !this.visual.chibi) return false;
    if (this.phase !== "seated" && this.phase !== "seatAct" && this.phase !== "react" && this.phase !== "celebrate") return false;
    const path = this.route(new THREE.Vector2(task.spot.x, task.spot.z));
    if (pathLength(this.pos, path) > MAX_WALK_MEETING) return false;
    this.phase = "toMeeting";
    this.meeting = task;
    this.current = null;
    this.reaction = null;
    this.faceYaw = task.spot.yaw;
    this.path = path;
    this.elapsed = 0;
    return true;
  }

  /** Trạng thái agent đổi: không còn rảnh thì bỏ việc nhỏ và về bàn (họp và phản ứng không bị cắt). */
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

  private route(to: THREE.Vector2): THREE.Vector2[] {
    return this.nav!.findPath([this.pos.x, this.pos.y], [to.x, to.y]).map((p: Point) => new THREE.Vector2(p[0], p[1]));
  }

  private goBack(): void {
    this.phase = "returning";
    this.meeting = null;
    this.path = this.route(this.seat);
  }

  /** Nơi đi cho một việc nhỏ: nơi chính nếu có và đủ gần, không thì nơi thay thế. null = không đi được. */
  private plan(action: IdleAction): { spot: Spot; path: THREE.Vector2[] } | null {
    for (const where of [action.where, action.fallbackWhere]) {
      if (!where || where === "seat") continue;
      const entry = this.spots[where];
      if (!entry) continue;
      const free = (Array.isArray(entry) ? [...entry] : [entry]).filter((sp) => !claims.has(spotKey(sp)));
      free.sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.y) - Math.hypot(b.x - this.pos.x, b.z - this.pos.y));
      const limit = where === action.where ? (action.maxWalk ?? MAX_WALK) : MAX_WALK;
      for (const spot of free) {
        const path = this.route(new THREE.Vector2(spot.x, spot.z));
        // Điểm đứng quá xa (phải đi vòng cả toà nhà) thì thử điểm/nơi thay thế.
        if (pathLength(this.pos, path) <= limit) return { spot, path };
      }
    }
    return null;
  }

  private startAction(): void {
    const available = new Set<IdleWhere>(["seat"]);
    if (this.nav && away.count < MAX_AWAY) {
      for (const k of Object.keys(this.spots) as Array<Exclude<IdleWhere, "seat">>) available.add(k);
    }
    const action = pickIdleAction(available, this.rand);
    this.current = action;
    this.idleFor = 0;
    if (action.where === "seat") {
      this.phase = "seatAct";
      this.timer = between(action.secs, this.rand);
      return;
    }
    const plan = this.plan(action);
    if (!plan) {
      // Không có nơi nào đủ gần: đổi sang một việc nhỏ tại chỗ.
      const fallback = IDLE_ACTIONS.find((a) => a.id === "think")!;
      this.current = fallback;
      this.phase = "seatAct";
      this.timer = between(fallback.secs, this.rand);
      return;
    }
    this.faceYaw = plan.spot.yaw;
    this.phase = "leaving";
    this.holdsAwaySlot = true;
    away.count++;
    this.claimedSpot = spotKey(plan.spot);
    claims.add(this.claimedSpot);
    this.path = plan.path;
  }

  /** Gọi khi gỡ khỏi cảnh — trả chỗ "ở ngoài" cho người khác. */
  dispose(): void {
    this.releaseSlot();
  }

  update(dt: number, status: string): void {
    const chibi = this.visual.chibi;
    if (!chibi) return;

    switch (this.phase) {
      case "seated": {
        if (status === "idle" && idleLifeEnabled) {
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
      case "react": {
        chibi.anim = REACT_ANIM[this.reaction ?? "receive"] as ChibiAnim;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = "seated";
          this.reaction = null;
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
      case "meeting": {
        const m = this.meeting;
        this.elapsed += dt;
        this.timer -= dt;
        chibi.sit = !m?.present;
        if (m?.present) {
          chibi.anim = MEETING_PRESENT_ANIM as ChibiAnim;
        } else {
          // Người nghe đổi tư thế theo nhịp, lệch pha giữa các ghế để không đồng loạt cử động.
          const beat = Math.floor(this.elapsed / MEETING_BEAT_SECONDS + (m ? Math.abs(m.spot.x * 3 + m.spot.z) : 0));
          chibi.anim = MEETING_LISTEN_ANIMS[beat % MEETING_LISTEN_ANIMS.length] as ChibiAnim;
        }
        if (this.timer <= 0) this.goBack();
        break;
      }
      case "break": {
        chibi.sit = false;
        chibi.anim = (this.current?.anim ?? "coffee") as ChibiAnim;
        this.timer -= dt;
        if (this.timer <= 0) this.goBack();
        break;
      }
      case "leaving":
      case "returning":
      case "toMeeting": {
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
          } else if (this.phase === "toMeeting") {
            this.phase = "meeting";
            this.timer = this.meeting?.secs ?? 10;
            this.elapsed = 0;
            this.yaw = this.faceYaw;
          } else {
            this.phase = "seated";
            this.yaw = 0;
            this.current = null;
            this.idleFor = 0;
            this.releaseSlot();
            chibi.sit = true;
            this.onSeated();
          }
        }
        break;
      }
    }
    // Di chuyển cả cụm (vòng trạng thái, nhãn tên, bong bóng đi theo); chỉ xoay thân nhân vật.
    this.visual.root.position.set(this.pos.x, 0, this.pos.y);
    const facing = this.phase === "break" || this.phase === "meeting" ? this.faceYaw : this.yaw;
    chibi.root.rotation.y += shortestAngle(facing - chibi.root.rotation.y) * Math.min(1, dt * 10);
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
