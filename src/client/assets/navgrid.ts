/**
 * Lưới điều hướng A* — nhân vật né tường và đồ đạc.
 *
 * Port sang TypeScript từ `app/src/office/navgrid.js` của dự án Agentes IA 3D
 * (https://github.com/ederland/Agentes_IA_3D) — Copyright (c) 2026 Ederland Studio, giấy phép MIT.
 * Thay đổi: thêm kiểu, `findPath` trả về `Point[]` và dừng ở ô trống gần nhất khi đích bị chặn,
 * thêm `buildOfficeNavGrid` cho bố cục FunnyOVS.
 * Xem NOTICE.md.
 */

export type Point = [number, number];

export class NavGrid {
  readonly w: number;
  readonly h: number;
  readonly blocked: Uint8Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
    readonly cell = 0.2,
  ) {
    this.w = Math.ceil((x1 - x0) / cell);
    this.h = Math.ceil((z1 - z0) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
  }

  toCell(x: number, z: number): Point {
    return [
      Math.min(this.w - 1, Math.max(0, Math.floor((x - this.x0) / this.cell))),
      Math.min(this.h - 1, Math.max(0, Math.floor((z - this.z0) / this.cell))),
    ];
  }

  toWorld(cx: number, cz: number): Point {
    return [this.x0 + (cx + 0.5) * this.cell, this.z0 + (cz + 0.5) * this.cell];
  }

  /** Chặn một hình chữ nhật (tâm, rộng theo x, sâu theo z, góc xoay quanh y) cộng thêm lề `pad`. */
  blockRect(cx: number, cz: number, w: number, d: number, rot = 0, pad = 0.28): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hw = w / 2 + pad;
    const hd = d / 2 + pad;
    const ext = Math.abs(hw * c) + Math.abs(hd * s);
    const ezt = Math.abs(hw * s) + Math.abs(hd * c);
    const [ax, az] = this.toCell(cx - ext, cz - ezt);
    const [bx, bz] = this.toCell(cx + ext, cz + ezt);
    for (let gz = az; gz <= bz; gz++) {
      for (let gx = ax; gx <= bx; gx++) {
        const [wx, wz] = this.toWorld(gx, gz);
        const dx = wx - cx;
        const dz = wz - cz;
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[gz * this.w + gx] = 1;
      }
    }
  }

  free(gx: number, gz: number): boolean {
    return gx >= 0 && gz >= 0 && gx < this.w && gz < this.h && !this.blocked[gz * this.w + gx];
  }

  /** Ô trống gần nhất (tìm theo vòng tròn mở rộng). */
  nearestFree(gx: number, gz: number): Point {
    if (this.free(gx, gz)) return [gx, gz];
    for (let r = 1; r < 25; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.free(gx + dx, gz + dz)) return [gx + dx, gz + dz];
        }
      }
    }
    return [gx, gz];
  }

  /** Đoạn thẳng a→b (toạ độ thế giới) có đi qua ô bị chặn không. */
  lineFree(a: Point, b: Point): boolean {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const [gx, gz] = this.toCell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (!this.free(gx, gz)) return false;
    }
    return true;
  }

  /** Đường đi [x, z] từ `from` tới `to` (không gồm điểm xuất phát). Không có đường thì trả `[to]`. */
  findPath(from: Point, to: Point): Point[] {
    const [sx, sz] = this.nearestFree(...this.toCell(from[0], from[1]));
    const [tx, tz] = this.nearestFree(...this.toCell(to[0], to[1]));
    const W = this.w;
    const start = sz * W + sx;
    const goal = tz * W + tx;
    const g = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const heap: Array<[number, number]> = [[0, start]];
    g[start] = 0;
    const hCost = (i: number): number => Math.hypot((i % W) - tx, Math.floor(i / W) - tz);

    const push = (item: [number, number]): void => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    const dirs: Array<[number, number, number]> = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    let found = start === goal;
    while (heap.length && !found) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % W;
      const cz = Math.floor(cur / W);
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.free(nx, nz)) continue;
        // Không cắt góc: đi chéo chỉ khi hai ô kề đều trống.
        if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          push([ng + hCost(ni), ni]);
        }
      }
    }
    if (!found) return [to];

    const cells: Point[] = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(this.toWorld(c % W, Math.floor(c / W)));
    cells.reverse();

    // Làm mượt: bỏ các điểm trung gian khi vẫn nhìn thẳng được tới điểm xa hơn.
    const pts: Point[] = [from, ...cells];
    const smooth: Point[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i], pts[j])) j--;
      smooth.push(pts[j]);
      i = j;
    }
    // Đích nằm trong ô bị chặn thì dừng ở ô trống gần nhất thay vì đi xuyên vật cản.
    const [ex, ez] = this.toCell(to[0], to[1]);
    smooth.push(this.free(ex, ez) ? to : this.toWorld(tx, tz));
    return smooth.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Bố cục văn phòng FunnyOVS
// ---------------------------------------------------------------------------

export interface NavRoom {
  center: { x: number; z: number };
  size: { w: number; d: number };
}

/** Toạ độ cố định ngoài phòng: đài phun nước và ghế đá (khớp `buildEnvironment` trong decor.ts). */
export const PLAZA = {
  fountain: { x: 0, z: 5.9, half: 1.35 },
  benches: [
    { x: -2.6, z: 5.9, w: 1.5, d: 0.45, rot: 0 },
    { x: 2.6, z: 5.9, w: 1.5, d: 0.45, rot: 0 },
    { x: -7, z: 0.2, w: 1.5, d: 0.45, rot: Math.PI / 2 },
    { x: 7, z: 0.2, w: 1.5, d: 0.45, rot: Math.PI / 2 },
  ],
};

/**
 * Dựng lưới cho cả toà nhà: tường 3 mặt của từng phòng (mặt trước để mở), bàn làm việc,
 * đài phun nước, ghế đá. Ghế ngồi không bị chặn để nhân vật xuất phát được từ chỗ ngồi.
 */
export function buildOfficeNavGrid(rooms: NavRoom[], seats: Array<{ x: number; z: number }>, cell = 0.25): NavGrid {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.center.x - r.size.w / 2);
    maxX = Math.max(maxX, r.center.x + r.size.w / 2);
    minZ = Math.min(minZ, r.center.z - r.size.d / 2);
    maxZ = Math.max(maxZ, r.center.z + r.size.d / 2);
  }
  const grid = new NavGrid(minX - 4, minZ - 4, maxX + 4, maxZ + 6, cell);

  for (const r of rooms) {
    const { center: c, size: s } = r;
    grid.blockRect(c.x, c.z - s.d / 2, s.w, 0.16, 0, 0.12);
    grid.blockRect(c.x - s.w / 2, c.z, 0.16, s.d, 0, 0.12);
    grid.blockRect(c.x + s.w / 2, c.z, 0.16, s.d, 0, 0.12);
  }
  for (const seat of seats) grid.blockRect(seat.x, seat.z + 0.62, 1.7, 0.86, 0, 0.1);
  grid.blockRect(PLAZA.fountain.x, PLAZA.fountain.z, PLAZA.fountain.half * 2, PLAZA.fountain.half * 2, 0, 0.1);
  for (const b of PLAZA.benches) grid.blockRect(b.x, b.z, b.w, b.d, b.rot, 0.1);
  return grid;
}
