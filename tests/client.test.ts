/**
 * Test cho logic phía giao diện 3D không cần WebGL:
 *  - Chu kỳ ngày/đêm
 *  - Hành vi agent nghỉ giải lao: đường đi an toàn, quay về bàn, bị gián đoạn khi có việc
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { nightFactor } from "../src/client/assets/dayNight.js";
import { AgentBehavior } from "../src/client/assets/behavior.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";

describe("chu kỳ ngày/đêm", () => {
  it("ban ngày = 0, nửa đêm = 1", () => {
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(9)).toBe(0);
    expect(nightFactor(0)).toBe(1);
    expect(nightFactor(3)).toBe(1);
    expect(nightFactor(22)).toBe(1);
  });

  it("chuyển mượt, đơn điệu quanh bình minh và hoàng hôn", () => {
    let prev = nightFactor(5);
    for (let h = 5.1; h <= 7; h += 0.1) {
      const v = nightFactor(h);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    prev = nightFactor(17);
    for (let h = 17.1; h <= 20; h += 0.1) {
      const v = nightFactor(h);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it("giờ ngoài 0–24 được chuẩn hoá", () => {
    expect(nightFactor(36)).toBe(nightFactor(12));
    expect(nightFactor(-2)).toBe(nightFactor(22));
  });
});

function fakeVisual() {
  return {
    root: new THREE.Group(),
    chibi: { anim: "idle", sit: true, root: new THREE.Group() },
  } as never;
}

function insideRoom(x: number, z: number, margin = 0): boolean {
  return DEPARTMENTS.some(
    (d) =>
      Math.abs(x - d.center.x) < d.size.w / 2 + margin && Math.abs(z - d.center.z) < d.size.d / 2 + margin,
  );
}

describe("agent nghỉ giải lao", () => {
  const agents = new AgentRegistry().list();

  it("mọi agent đi hết vòng rồi ngồi lại đúng ghế", () => {
    for (const a of agents) {
      const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
      const visual = fakeVisual();
      let seated = 0;
      const b = new AgentBehavior(
        visual,
        a.position.x,
        a.position.z,
        dept.center.z + dept.size.d / 2 + 1.1,
        a.position.x + 1.4,
        () => seated++,
      );
      (b as unknown as { nextBreakAt: number }).nextBreakAt = 0;
      const root = (visual as { root: THREE.Group }).root;
      const phases = new Set<string>();
      for (let i = 0; i < 4000 && !(seated > 0); i++) {
        b.update(0.05, "idle");
        phases.add((b as unknown as { phase: string }).phase);
        // Không xuyên qua bàn: vùng ngay phía trước ghế (±1.15 theo x, +0.2…+1.3 theo z).
        const dx = Math.abs(root.position.x - a.position.x);
        const dz = root.position.z - a.position.z;
        if (phases.has("leaving") || phases.has("returning")) {
          expect(!(dx < 1.1 && dz > 0.25 && dz < 1.35)).toBe(true);
        }
      }
      expect(seated).toBe(1);
      expect([...phases]).toEqual(expect.arrayContaining(["leaving", "break", "returning"]));
      expect(root.position.x).toBeCloseTo(a.position.x, 5);
      expect(root.position.z).toBeCloseTo(a.position.z, 5);
    }
  });

  it("lối đi và điểm đứng uống cà phê không nằm trong phòng nào", () => {
    for (const a of agents) {
      const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
      const exitX = a.position.x + 1.4;
      const doorZ = dept.center.z + dept.size.d / 2 + 1.1;
      expect(Math.abs(exitX - dept.center.x)).toBeLessThan(dept.size.w / 2 - 0.6); // đi trong phòng mình
      expect(insideRoom(exitX, doorZ, 0.4)).toBe(false); // điểm cửa nằm ngoài mọi phòng
      // Đoạn từ mép phòng ra cửa không cắt phòng khác.
      for (let z = dept.center.z + dept.size.d / 2 + 0.3; z <= doorZ; z += 0.2) {
        expect(insideRoom(exitX, z, 0.2)).toBe(false);
      }
    }
  });

  it("có việc mới thì bỏ giải lao và quay về bàn", () => {
    const visual = fakeVisual();
    let seated = 0;
    const b = new AgentBehavior(visual, 0, 0.4, 4, 1.4, () => seated++);
    (b as unknown as { nextBreakAt: number }).nextBreakAt = 0;
    for (let i = 0; i < 40; i++) b.update(0.05, "idle");
    expect(b.away).toBe(true);
    b.onStatus("working");
    for (let i = 0; i < 2000 && seated === 0; i++) b.update(0.05, "working");
    expect(b.away).toBe(false);
    expect(seated).toBe(1);
  });

  it("agent đang bận thì không bao giờ đứng dậy", () => {
    const visual = fakeVisual();
    const b = new AgentBehavior(visual, 0, 0.4, 4, 1.4, () => undefined);
    (b as unknown as { nextBreakAt: number }).nextBreakAt = 0;
    for (let i = 0; i < 2000; i++) b.update(0.05, "working");
    expect(b.away).toBe(false);
  });
});
