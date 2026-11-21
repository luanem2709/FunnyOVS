/**
 * Hành vi của agent trong văn phòng ngoài việc ngồi bàn:
 *  - Nghỉ giải lao: agent rảnh lâu sẽ đứng dậy, đi ra cửa phòng uống cà phê rồi quay lại.
 *  - Ăn mừng: xong việc thì giơ tay reo hò tại chỗ (kèm pháo giấy do effects xử lý).
 * Gặp việc mới (đổi khỏi trạng thái rảnh) thì bỏ giải lao và quay về bàn ngay.
 */
import * as THREE from "three";
import type { AgentVisual } from "./characterFactory.js";
import type { ChibiAnim } from "./chibi.js";

type Phase = "seated" | "leaving" | "break" | "returning" | "celebrate";

const WALK_SPEED = 1.15;
const BREAK_SECONDS = 5;
const CELEBRATE_SECONDS = 2.6;

export class AgentBehavior {
  private phase: Phase = "seated";
  private path: THREE.Vector2[] = [];
  private pos: THREE.Vector2;
  private timer = 0;
  private idleFor = 0;
  private nextBreakAt: number;
  private yaw = 0;
  private readonly seat: THREE.Vector2;

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
  ) {
    this.seat = new THREE.Vector2(seatX, seatZ);
    this.pos = this.seat.clone();
    this.nextBreakAt = 25 + Math.random() * 35;
  }

  get away(): boolean {
    return this.phase !== "seated" && this.phase !== "celebrate";
  }

  /** Xong việc: ăn mừng tại chỗ. */
  celebrate(): void {
    if (this.phase !== "seated" || !this.visual.chibi) return;
    this.phase = "celebrate";
    this.timer = CELEBRATE_SECONDS;
  }

  /** Trạng thái agent đổi: nếu không còn rảnh thì về bàn. */
  onStatus(status: string): void {
    if (status !== "idle") {
      this.idleFor = 0;
      if (this.phase === "leaving" || this.phase === "break") this.goBack();
    }
  }

  private goBack(): void {
    this.phase = "returning";
    // Đang ở cột lối đi → đi dọc cột về hàng ghế rồi tới ghế; còn ở hàng ghế → đi thẳng về ghế.
    this.path =
      Math.abs(this.pos.x - this.exitX) < 0.05
        ? [new THREE.Vector2(this.exitX, this.seat.y), this.seat.clone()]
        : [this.seat.clone()];
  }

  update(dt: number, status: string): void {
    const chibi = this.visual.chibi;
    if (!chibi) return;

    switch (this.phase) {
      case "seated": {
        if (status === "idle") {
          this.idleFor += dt;
          if (this.idleFor >= this.nextBreakAt) {
            this.phase = "leaving";
            this.path = [new THREE.Vector2(this.exitX, this.seat.y), new THREE.Vector2(this.exitX, this.doorZ)];
          }
        } else {
          this.idleFor = 0;
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
        chibi.anim = "coffee" as ChibiAnim;
        this.timer -= dt;
        if (this.timer <= 0) this.goBack();
        return;
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
            this.timer = BREAK_SECONDS;
            this.yaw = 0;
            this.idleFor = 0;
            this.nextBreakAt = 40 + Math.random() * 50;
          } else {
            this.phase = "seated";
            this.yaw = 0;
            chibi.sit = true;
            this.onSeated();
          }
        }
        break;
      }
    }
    // Di chuyển cả cụm (vòng trạng thái, nhãn tên, bong bóng đi theo); chỉ xoay thân nhân vật.
    this.visual.root.position.set(this.pos.x, 0, this.pos.y);
    // Nhân vật đứng thì nhìn về phía +Z (cửa phòng) khi nghỉ.
    const target = this.phase === "break" ? 0 : this.yaw;
    chibi.root.rotation.y += shortestAngle(target - chibi.root.rotation.y) * Math.min(1, dt * 10);
  }
}

function shortestAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
