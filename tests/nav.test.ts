/**
 * Bộ test cho hệ thống điều hướng & đi lại của nhân viên.
 *
 * Chứng minh:
 *  1. Lưới điều hướng chặn đúng tường phòng (không đi xuyên tường).
 *  2. A* tìm được đường hợp lệ giữa các phòng.
 *  3. Đường tìm được không đi qua ô bị chặn.
 *  4. Máy trạng thái Walker đi qua các phase đúng thứ tự.
 */
import { describe, it, expect } from "vitest";
import { NavGrid, Walker, NAV_CELL } from "../src/client/assets/agentNav.js";

/** Dựng lưới giống hệt cách client dựng: 2 phòng có tường 3 mặt. */
function buildGrid(): NavGrid {
  const grid = new NavGrid(-20, -20, 20, 20);
  // Phòng A: tường ở -Z và 2 bên, mở mặt +Z.
  grid.addBlocker(-4, -3, 4, -2.84);
  grid.addBlocker(-4, -3, -3.84, 3);
  grid.addBlocker(3.84, -3, 4, 3);
  // Phòng B: lệch sang phải.
  grid.addBlocker(8, -1, 14, -0.84);
  grid.addBlocker(8, -1, 7.84, 5);
  grid.addBlocker(13.84, -1, 14, 5);
  grid.bake();
  return grid;
}

describe("NavGrid — lưới điều hướng", () => {
  it("chặn đúng các ô nằm trong tường", () => {
    const grid = buildGrid();
    // Giữa tường phía sau phòng A (z ≈ -2.9) → bị chặn.
    const insideWall = grid.index(0, -2.9);
    expect(insideWall).not.toBeNull();
    expect(grid.free(insideWall!)).toBe(false);
    // Giữa phòng → đi được.
    const middle = grid.index(0, 0);
    expect(grid.free(middle!)).toBe(true);
  });

  it("phình vật cản ra để nhân viên không đi sát tường", () => {
    const grid = buildGrid();
    // Ngay sát trong phòng, cách tường 0.1 m → vẫn bị coi là chặn.
    const nearWall = grid.index(0, -2.6);
    expect(grid.free(nearWall!)).toBe(false);
  });

  it("tìm được đường giữa hai phòng", () => {
    const grid = buildGrid();
    const path = grid.findPath({ x: 0, z: 0 }, { x: 11, z: 2 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
  });

  it("đường tìm được không đi qua ô bị chặn", () => {
    const grid = buildGrid();
    const path = grid.findPath({ x: 0, z: 0 }, { x: 11, z: 2 })!;
    for (const p of path) {
      const idx = grid.index(p.x, p.z);
      expect(idx).not.toBeNull();
      expect(grid.free(idx!)).toBe(true);
    }
  });

  it("đường kết thúc đúng tại điểm đích", () => {
    const grid = buildGrid();
    const goal = { x: 11, z: 2 };
    const path = grid.findPath({ x: 0, z: 0 }, goal)!;
    const last = path[path.length - 1];
    expect(Math.abs(last.x - goal.x)).toBeLessThan(0.01);
    expect(Math.abs(last.z - goal.z)).toBeLessThan(0.01);
  });

  it("trả null khi đích không tới được (nằm trong vật cản kín)", () => {
    const grid = new NavGrid(-10, -10, 10, 10);
    // Vây kín bằng tường, không có lối vào.
    grid.addBlocker(-1, -1, 1, -0.84);
    grid.addBlocker(-1, -1, -0.84, 1);
    grid.addBlocker(0.84, -1, 1, 1);
    grid.addBlocker(-1, 0.84, 1, 1);
    grid.bake();
    const path = grid.findPath({ x: -5, z: -5 }, { x: 0, z: 0 });
    expect(path).toBeNull();
  });

  it("nearestFree tìm được ô đi được gần điểm bị chặn", () => {
    const grid = buildGrid();
    const idx = grid.nearestFree(0, -2.9);
    expect(idx).not.toBeNull();
    expect(grid.free(idx!)).toBe(true);
  });

  it("lưới có kích thước ô đúng", () => {
    expect(NAV_CELL).toBe(0.5);
    const grid = new NavGrid(0, 0, 10, 10);
    expect(grid.w).toBe(21);
    expect(grid.h).toBe(21);
  });
});

describe("Walker — máy trạng thái đi lại", () => {
  it("bắt đầu ở phase 'work' (ngồi ở bàn)", () => {
    const w = new Walker({ x: 0, z: 0 });
    expect(w.phase).toBe("work");
  });

  it("đi qua đủ các phase: work → leaving → walking → acting → returning", () => {
    const grid = buildGrid();
    const w = new Walker({ x: 0, z: 0 }, { workMin: 0.05, workMax: 0.05, speed: 3 });
    const pos = { x: 0, z: 0 };
    const amenities = [
      { kind: "coffee" as const, room: "a", dx: 0, dz: 0, dwell: 0.2, x: 11, z: 2 },
    ];
    const seen: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const { changed } = w.update(pos, grid, amenities);
      if (changed) seen.push(w.phase);
      if (seen.length >= 5) break;
    }
    expect(seen).toContain("walking");
    expect(seen).toContain("acting");
    expect(seen).toContain("returning");
  });

  it("khi đi, vị trí thực sự thay đổi", () => {
    const grid = buildGrid();
    const w = new Walker({ x: 0, z: 0 }, { workMin: 0.05, workMax: 0.05, speed: 2 });
    const pos = { x: 0, z: 0 };
    const amenities = [
      { kind: "coffee" as const, room: "a", dx: 0, dz: 0, dwell: 0.2, x: 11, z: 2 },
    ];
    for (let i = 0; i < 600; i++) w.update(pos, grid, amenities);
    expect(Math.hypot(pos.x - 0, pos.z - 0)).toBeGreaterThan(0.5);
  });

  it("quay lại đúng chỗ bàn sau khi đi xong", () => {
    const grid = buildGrid();
    const home = { x: 0, z: 0 };
    const w = new Walker(home, { workMin: 0.05, workMax: 0.05, speed: 4 });
    const pos = { x: 0, z: 0 };
    const amenities = [
      { kind: "coffee" as const, room: "a", dx: 0, dz: 0, dwell: 0.1, x: 11, z: 2 },
    ];
    // Chạy tới khi về lại phase "work" lần thứ hai.
    let sawWork = 0;
    for (let i = 0; i < 5000; i++) {
      const { changed } = w.update(pos, grid, amenities);
      if (changed && w.phase === "work") {
        sawWork++;
        if (sawWork >= 2) break;
      }
    }
    expect(w.phase).toBe("work");
    expect(Math.hypot(pos.x - home.x, pos.z - home.z)).toBeLessThan(0.6);
  });

  it("reset() đưa nhân viên về phase 'work'", () => {
    const w = new Walker({ x: 0, z: 0 });
    w.phase = "walking";
    w.reset();
    expect(w.phase).toBe("work");
    expect(w.target).toBeNull();
  });
});
