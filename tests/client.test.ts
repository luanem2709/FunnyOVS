/**
 * Test cho logic phía giao diện 3D không cần WebGL:
 *  - Chu kỳ ngày/đêm
 *  - Hành vi agent nghỉ giải lao: đường đi an toàn, quay về bàn, bị gián đoạn khi có việc
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { nightFactor } from "../src/client/assets/dayNight.js";
import { AgentBehavior, MAX_AWAY, awayCount, resetAwayCounter, setIdleLife } from "../src/client/assets/behavior.js";
import { buildOfficeNavGrid } from "../src/client/assets/navgrid.js";
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

describe("hành vi nhàn rỗi (có lưới A*)", () => {
  const agents = new AgentRegistry().list();
  const grid = buildOfficeNavGrid(DEPARTMENTS, agents.map((a) => a.position));

  function make(a: (typeof agents)[number], rand = () => 0.99) {
    const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
    const visual = fakeVisual();
    let seated = 0;
    const b = new AgentBehavior(visual, a.position.x, a.position.z, () => seated++, {
      nav: grid,
      rand,
      spots: { door: { x: a.position.x, z: dept.center.z + dept.size.d / 2 + 1.1, yaw: 0 } },
    });
    (b as unknown as { nextActionAt: number }).nextActionAt = 0;
    const root = (visual as { root: THREE.Group }).root;
    root.position.set(a.position.x, 0, a.position.z);
    return { b, root, seated: () => seated, dept };
  }

  it("mọi agent ra cửa phòng rồi về đúng ghế", () => {
    resetAwayCounter();
    for (const a of agents) {
      const { b, root, seated, dept } = make(a);
      let maxZ = a.position.z;
      for (let i = 0; i < 8000 && seated() === 0; i++) {
        b.update(0.05, "idle");
        maxZ = Math.max(maxZ, root.position.z);
      }
      expect(seated(), a.id).toBe(1);
      expect(maxZ, a.id).toBeGreaterThan(dept.center.z + dept.size.d / 2);
      expect(root.position.x).toBeCloseTo(a.position.x, 5);
      expect(root.position.z).toBeCloseTo(a.position.z, 5);
      expect(awayCount()).toBe(0);
    }
  });

  it("có việc mới thì bỏ giải lao và quay về bàn", () => {
    resetAwayCounter();
    const { b, seated } = make(agents.find((a) => a.id === "huy")!);
    for (let i = 0; i < 60; i++) b.update(0.05, "idle");
    expect(b.away).toBe(true);
    b.onStatus("working");
    for (let i = 0; i < 4000 && seated() === 0; i++) b.update(0.05, "working");
    expect(b.away).toBe(false);
    expect(seated()).toBe(1);
    expect(awayCount()).toBe(0);
  });

  it("agent đang bận thì không bao giờ đứng dậy", () => {
    const { b } = make(agents[0]);
    for (let i = 0; i < 2000; i++) b.update(0.05, "working");
    expect(b.away).toBe(false);
  });

  it("giới hạn số người ra ngoài cùng lúc", () => {
    resetAwayCounter();
    const group = agents.slice(0, 8).map((a) => make(a));
    for (let i = 0; i < 40; i++) for (const g of group) g.b.update(0.05, "idle");
    expect(awayCount()).toBeLessThanOrEqual(MAX_AWAY);
    expect(group.filter((g) => g.b.away).length).toBeLessThanOrEqual(MAX_AWAY);
  });

  it("tắt hoạt cảnh nhàn rỗi thì không ai đứng dậy", () => {
    resetAwayCounter();
    setIdleLife(false);
    try {
      const { b } = make(agents[1]);
      for (let i = 0; i < 400; i++) b.update(0.05, "idle");
      expect(b.away).toBe(false);
      expect(b.label()).toBeNull();
    } finally {
      setIdleLife(true);
    }
  });
});
