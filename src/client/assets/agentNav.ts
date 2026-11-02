/**
 * Điều hướng & đi lại của nhân viên trong văn phòng 3D.
 *
 * Port ý tưởng từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   - `people/navigation.js` → lưới ô vuông, `route()` tìm đường ngắn nhất
 *     (Dijkstra/A*), `standBy()` tìm chỗ đứng cạnh vật thể.
 *   - `people/breaks.js` → giờ nghỉ trưa, hàng chờ pha cà phê.
 *   - `people/workers.js` → máy trạng thái: ngồi làm việc → đứng dậy →
 *     đi tới chỗ → làm việc ở chỗ → quay lại bàn.
 *
 * Ở đây đơn giản hoá cho quy mô 9 phòng:
 *   - Lưới điều hướng 0.5 m, vật cản là tường phòng (tường thấp 1.35 m).
 *   - A* 8 hướng, sau đó rút gọn đường thành các đoạn thẳng (string pulling).
 *   - `Walker` là máy trạng thái cho từng nhân viên: làm việc ở bàn → đi
 *     nghỉ (pha cà phê, xem bảng, đi vòng) → quay lại bàn.
 */

/** Kích thước ô lưới điều hướng (mét). */
export const NAV_CELL = 0.5;

/** Bán kính người (phình vật cản ra, tránh đi xuyên tường). */
const AGENT_RADIUS = 0.36;

/** Một hình chữ nhật vật cản trên mặt sàn. */
interface Blocker {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Lề an toàn thêm vào (mặc định bán kính người). */
  pad: number;
}

/** Vị trí trên mặt sàn. */
export interface Spot {
  x: number;
  z: number;
}

/** Lưới điều hướng: biết chỗ nào đi được, tìm đường ngắn nhất. */
export class NavGrid {
  /** Gốc lưới (toạ độ thế giới của ô [0][0]). */
  readonly ox: number;
  readonly oz: number;
  readonly w: number;
  readonly h: number;
  /** 1 = ô bị chặn. */
  readonly blocked: Uint8Array;
  private blockers: Blocker[] = [];

  constructor(minX: number, minZ: number, maxX: number, maxZ: number) {
    this.ox = minX;
    this.oz = minZ;
    this.w = Math.ceil((maxX - minX) / NAV_CELL) + 1;
    this.h = Math.ceil((maxZ - minZ) / NAV_CELL) + 1;
    this.blocked = new Uint8Array(this.w * this.h);
  }

  /** Thêm vật cản (tường). */
  addBlocker(x0: number, z0: number, x1: number, z1: number, pad = AGENT_RADIUS): void {
    this.blockers.push({
      x0: Math.min(x0, x1),
      z0: Math.min(z0, z1),
      x1: Math.max(x0, x1),
      z1: Math.max(z0, z1),
      pad,
    });
  }

  /** Đánh dấu các ô bị chặn sau khi đã biết hết vật cản. */
  bake(): void {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.ox + i * NAV_CELL;
        const z = this.oz + j * NAV_CELL;
        let hit = 0;
        for (const b of this.blockers) {
          if (
            x >= b.x0 - b.pad &&
            x <= b.x1 + b.pad &&
            z >= b.z0 - b.pad &&
            z <= b.z1 + b.pad
          ) {
            hit = 1;
            break;
          }
        }
        this.blocked[j * this.w + i] = hit;
      }
    }
  }

  /** Ô chứa toạ độ thế giới, hoặc null nếu ngoài lưới. */
  index(x: number, z: number): number | null {
    const i = Math.round((x - this.ox) / NAV_CELL);
    const j = Math.round((z - this.oz) / NAV_CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return null;
    return j * this.w + i;
  }

  /** Toạ độ thế giới của ô. */
  world(idx: number): Spot {
    const i = idx % this.w;
    const j = Math.floor(idx / this.w);
    return { x: this.ox + i * NAV_CELL, z: this.oz + j * NAV_CELL };
  }

  /** Ô có đi được không. */
  free(idx: number): boolean {
    return idx >= 0 && idx < this.blocked.length && this.blocked[idx] === 0;
  }

  /**
   * Tìm ô đi được gần nhất với toạ độ cho trước (tối đa `maxR` ô).
   * Dùng khi điểm đích nằm sát vật cản.
   */
  nearestFree(x: number, z: number, maxR = 14): number | null {
    const start = this.index(x, z);
    if (start !== null && this.free(start)) return start;
    const ci = Math.round((x - this.ox) / NAV_CELL);
    const cj = Math.round((z - this.oz) / NAV_CELL);
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const idx = j * this.w + i;
          if (this.free(idx)) return idx;
        }
      }
    }
    return null;
  }

  /**
   * Đường đi từ `from` tới `to` (A* 8 hướng), rút gọn thành các đoạn thẳng.
   * Trả về mảng toạ độ (không gồm điểm bắt đầu) hoặc null nếu không tìm được.
   */
  findPath(from: Spot, to: Spot): Spot[] | null {
    const start = this.nearestFree(from.x, from.z);
    const goal = this.nearestFree(to.x, to.z);
    if (start === null || goal === null) return null;
    if (start === goal) return [{ x: to.x, z: to.z }];

    const n = this.w * this.h;
    const gScore = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gx = goal % this.w;
    const gz = Math.floor(goal / this.w);

    const h = (idx: number): number => {
      const i = idx % this.w;
      const j = Math.floor(idx / this.w);
      const dx = Math.abs(i - gx);
      const dz = Math.abs(j - gz);
      // Khoảng cách Chebyshev + thành phần chéo → heuristic không quá hơn
      // chi phí thật nên A* vẫn tìm được đường ngắn nhất.
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };

    gScore[start] = 0;
    const open: number[] = [start];
    const inOpen = new Uint8Array(n);
    inOpen[start] = 1;

    while (open.length) {
      let bi = 0;
      let bf = gScore[open[0]] + h(open[0]);
      for (let k = 1; k < open.length; k++) {
        const f = gScore[open[k]] + h(open[k]);
        if (f < bf) {
          bf = f;
          bi = k;
        }
      }
      const cur = open.splice(bi, 1)[0];
      inOpen[cur] = 0;
      if (cur === goal) break;
      closed[cur] = 1;

      const ci = cur % this.w;
      const cj = Math.floor(cur / this.w);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          const nIdx = nj * this.w + ni;
          if (!this.free(nIdx) || closed[nIdx]) continue;
          // Không đi chéo qua góc vật cản.
          if (di !== 0 && dj !== 0) {
            if (!this.free(cj * this.w + ni) || !this.free(nj * this.w + ci)) continue;
          }
          const step = di !== 0 && dj !== 0 ? Math.SQRT2 : 1;
          const tentative = gScore[cur] + step;
          if (tentative >= gScore[nIdx]) continue;
          gScore[nIdx] = tentative;
          cameFrom[nIdx] = cur;
          if (!inOpen[nIdx]) {
            open.push(nIdx);
            inOpen[nIdx] = 1;
          }
        }
      }
    }

    if (cameFrom[goal] === -1 && goal !== start) return null;

    // Truy vết đường.
    const cells: number[] = [];
    let cur = goal;
    while (cur !== -1) {
      cells.unshift(cur);
      cur = cameFrom[cur];
    }

    // Rút gọn: bỏ các ô trung gian nếu đi thẳng tới ô sau không vướng.
    const pts: Spot[] = [];
    let anchor = 0;
    for (let k = 1; k < cells.length; k++) {
      const a = this.world(cells[anchor]);
      const b = this.world(cells[k]);
      if (!this.lineClear(a, b)) {
        pts.push(this.world(cells[k - 1]));
        anchor = k - 1;
      }
    }
    pts.push(this.world(cells[cells.length - 1]));
    pts[pts.length - 1] = { x: to.x, z: to.z };
    return pts;
  }

  /** Đường thẳng giữa hai điểm có sạch vật cản không. */
  lineClear(a: Spot, b: Spot): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const steps = Math.ceil(Math.hypot(dx, dz) / (NAV_CELL * 0.5));
    if (steps === 0) return true;
    for (let s = 0; s <= steps; s++) {
      const x = a.x + (dx * s) / steps;
      const z = a.z + (dz * s) / steps;
      const idx = this.index(x, z);
      if (idx === null || !this.free(idx)) return false;
    }
    return true;
  }
}

/** Loại công việc nhân viên đi làm khi rảnh tay. */
export type ErrandKind = "coffee" | "board" | "printer" | "water";

/** Một chỗ nhân viên có thể đi tới. */
export interface Amenity {
  kind: ErrandKind;
  /** Id phòng ban chứa chỗ này. */
  room: string;
  /** Toạ độ tương đối so với tâm phòng. */
  dx: number;
  dz: number;
  /** Thời gian đứng lại (giây). */
  dwell: number;
  /** Toạ độ tuyệt đối (gán lúc khởi tạo). */
  x: number;
  z: number;
}

/**
 * Các chỗ nghỉ trong văn phòng, định vị theo tâm phòng ban.
 * Khớp với đồ đạc dựng trong `officeProps.ts`.
 */
export const AMENITIES: Amenity[] = [
  // Quầy cà phê ở phòng Tự động (khớp với coffeeStation đặt ở -0.24w, -0.3d).
  { kind: "coffee", room: "automation", dx: -2.16, dz: -1.65, dwell: 9, x: 0, z: 0 },
  { kind: "coffee", room: "automation", dx: -1.4, dz: -1.65, dwell: 9, x: 0, z: 0 },
  // Bảng trực ca ở phòng Marketing (dutyBoard đặt ở 0.3w, -0.42d).
  { kind: "board", room: "marketing", dx: 2.1, dz: -2.0, dwell: 11, x: 0, z: 0 },
  { kind: "board", room: "marketing", dx: 1.2, dz: -2.0, dwell: 11, x: 0, z: 0 },
  // Máy in ở phòng Khách hàng và Tự động.
  { kind: "printer", room: "support", dx: 2.1, dz: -1.5, dwell: 6, x: 0, z: 0 },
  { kind: "printer", room: "automation", dx: 2.52, dz: -1.4, dwell: 6, x: 0, z: 0 },
  // Bình nước: góc trước phòng, ở mọi phòng đều có.
  { kind: "water", room: "dispatch", dx: -3.4, dz: 2.4, dwell: 5, x: 0, z: 0 },
  { kind: "water", room: "sales", dx: -2.4, dz: 2.0, dwell: 5, x: 0, z: 0 },
  { kind: "water", room: "finance", dx: -2.4, dz: 2.0, dwell: 5, x: 0, z: 0 },
  { kind: "water", room: "ai-team", dx: -3.4, dz: 1.6, dwell: 5, x: 0, z: 0 },
  { kind: "water", room: "library", dx: -3.4, dz: 1.6, dwell: 5, x: 0, z: 0 },
];

/**
 * Gán toạ độ tuyệt đối cho các chỗ nghỉ dựa trên danh sách phòng.
 * @param amenities danh sách chỗ nghỉ
 * @param rooms danh sách phòng { id, center }
 */
export function bindAmenities(
  amenities: Amenity[],
  rooms: { id: string; center: { x: number; z: number } }[],
): void {
  for (const a of amenities) {
    const r = rooms.find((d) => d.id === a.room);
    a.x = (r?.center.x ?? 0) + a.dx;
    a.z = (r?.center.z ?? 0) + a.dz;
  }
}

/** Trạng thái của nhân viên đang di chuyển. */
export type WalkerPhase =
  | "work" // ngồi ở bàn
  | "leaving" // đứng dậy
  | "walking" // đang đi
  | "acting" // đang làm việc ở chỗ đến
  | "returning"; // đang quay lại bàn

/** Cấu hình hành vi đi lại. */
export interface WalkerOptions {
  /** Tốc độ đi (m/s). */
  speed?: number;
  /** Thời gian ngồi làm việc trước khi đi (giây) — ngẫu nhiên trong khoảng này. */
  workMin?: number;
  workMax?: number;
}

/** Máy trạng thái điều khiển một nhân viên. */
export class Walker {
  phase: WalkerPhase = "work";
  /** Điểm đến hiện tại (null = đi vòng ngẫu nhiên). */
  target: Amenity | null = null;
  /** Đường đi còn lại. */
  path: Spot[] = [];
  /** Chỉ số điểm đang hướng tới trong `path`. */
  private pathIndex = 0;
  /** Bàn của nhân viên (điểm về). */
  home: Spot;
  /** Thời gian chờ hiện tại (giây). */
  timer = 0;
  /** Thời gian đứng ở chỗ đến (giây). */
  private dwellLeft = 0;
  /** Thời gian đứng dậy (giây). */
  private leaveLeft = 0;

  private readonly speed: number;
  private readonly workMin: number;
  private readonly workMax: number;

  constructor(home: Spot, opts: WalkerOptions = {}) {
    this.home = home;
    this.speed = opts.speed ?? 1.15;
    this.workMin = opts.workMin ?? 18;
    this.workMax = opts.workMax ?? 55;
    this.timer = this.workMin + Math.random() * (this.workMax - this.workMin);
  }

  /** Đặt lại về bàn (dùng khi nhân viên được giao việc mới). */
  reset(): void {
    this.phase = "work";
    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.timer = this.workMin + Math.random() * (this.workMax - this.workMin);
  }

  /**
   * Gọi nhân viên về bàn (nhận việc mới) — vẫn đi bộ về, không dịch chuyển tức thì.
   * @param pos vị trí hiện tại
   * @param grid lưới điều hướng
   */
  recall(pos: { x: number; z: number }, grid: NavGrid): void {
    this.target = null;
    this.startPath(pos, grid, null);
    this.phase = this.path.length ? "returning" : "work";
    if (this.phase === "work") this.reset();
  }

  /**
   * Cập nhật trạng thái.
   * @param pos vị trí hiện tại (được cập nhật tại chỗ)
   * @param grid lưới điều hướng
   * @param amenities các chỗ nghỉ có thể đến
   * @returns true nếu vừa chuyển phase (để đổi animation), góc quay nếu đang đi
   */
  update(
    pos: { x: number; z: number },
    grid: NavGrid,
    amenities: Amenity[],
  ): { changed: boolean; facing: number | null } {
    const prev = this.phase;
    let facing: number | null = null;

    switch (this.phase) {
      case "work": {
        this.timer -= 1 / 60;
        if (this.timer <= 0) {
          const pick = this.pickAmenity(amenities, pos);
          if (pick) {
            this.target = pick;
            this.startPath(pos, grid, pick);
            if (this.path.length) {
              this.phase = "leaving";
              this.leaveLeft = 0.5;
            } else {
              this.timer = this.workMin;
            }
          } else {
            this.timer = this.workMin;
          }
        }
        break;
      }

      case "leaving": {
        // Đứng dậy khỏi ghế trước khi đi.
        this.leaveLeft -= 1 / 60;
        if (this.leaveLeft <= 0) this.phase = "walking";
        break;
      }

      case "walking": {
        facing = this.step(pos);
        if (this.pathIndex >= this.path.length) {
          this.phase = "acting";
          this.dwellLeft = this.target?.dwell ?? 6;
        }
        break;
      }

      case "acting": {
        this.dwellLeft -= 1 / 60;
        if (this.dwellLeft <= 0) {
          this.startPath(pos, grid, null);
          if (this.path.length) {
            this.phase = "returning";
          } else {
            this.phase = "work";
            this.target = null;
            this.timer = this.workMin + Math.random() * (this.workMax - this.workMin);
          }
        }
        break;
      }

      case "returning": {
        facing = this.step(pos);
        if (this.pathIndex >= this.path.length) {
          this.phase = "work";
          this.target = null;
          this.timer = this.workMin + Math.random() * (this.workMax - this.workMin);
        }
        break;
      }
    }

    return { changed: prev !== this.phase, facing };
  }

  /** Chọn một chỗ nghỉ ngẫu nhiên (có thể ở phòng khác). */
  private pickAmenity(amenities: Amenity[], pos: Spot): Amenity | null {
    if (amenities.length === 0) return null;
    // 60% chọn chỗ ở gần, 40% chọn chỗ xa để văn phòng "sống" hơn.
    const sorted = [...amenities].sort(
      (a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z),
    );
    const near = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6)));
    const pool = Math.random() < 0.6 ? near : sorted;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Tính và lưu đường đi tới đích (null = quay về bàn). */
  private startPath(pos: Spot, grid: NavGrid, target: Amenity | null): void {
    const dest: Spot = target ? { x: target.x, z: target.z } : this.home;
    const path = grid.findPath(pos, dest);
    this.path = path ?? [];
    this.pathIndex = 0;
  }

  /** Tiến một bước trên đường. Trả về góc quay nếu đang di chuyển. */
  private step(pos: { x: number; z: number }): number | null {
    if (this.pathIndex >= this.path.length) return null;
    const tgt = this.path[this.pathIndex];
    const dx = tgt.x - pos.x;
    const dz = tgt.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      this.pathIndex++;
      return this.pathIndex < this.path.length ? this.step(pos) : null;
    }
    const k = Math.min(1, this.speed * (1 / 60) / dist);
    pos.x += dx * k;
    pos.z += dz * k;
    return Math.atan2(dx, dz);
  }
}
