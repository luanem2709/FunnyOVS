/**
 * Test cho văn phòng hợp nhất phía client (không cần WebGL/DOM): store, backoff, A*, bảng hành vi nhàn rỗi.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { applyOfficeEvent, emptyData, MAX_LOGS } from "../src/client/office-3d/store/officeStore.js";
import { backoffDelay, BACKOFF_MAX_MS } from "../src/client/office-3d/realtime/useOfficeSocket.js";
import { NavGrid, buildOfficeNavGrid, PLAZA } from "../src/client/assets/navgrid.js";
import { AgentBehavior, IDLE_ACTIONS, pickIdleAction, MAX_WALK, type IdleWhere } from "../src/client/assets/behavior.js";
import { toRigStatus, bubbleFor } from "../src/client/office-3d/renderer/OfficeScene.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import type { OfficeEntity, OfficeEvent } from "../src/shared/officeEntity.js";

const ent = (id: string, patch: Partial<OfficeEntity> = {}): OfficeEntity => ({
  id,
  name: id,
  kind: "agent",
  status: "idle",
  metadata: {},
  updatedAt: "2026-11-21T00:00:00.000Z",
  ...patch,
});
const apply = (d: ReturnType<typeof emptyData>, ...evs: OfficeEvent[]) => evs.reduce(applyOfficeEvent, d);

describe("store (reducer thuần)", () => {
  it("snapshot thay toàn bộ thực thể và đánh dấu đã tải", () => {
    let d = apply(emptyData(), { type: "entity.created", entity: ent("agent:cu") });
    expect(d.loaded).toBe(false);
    d = apply(d, { type: "snapshot", entities: [ent("agent:a"), ent("agent:b")], at: "x" });
    expect(Object.keys(d.entities).sort()).toEqual(["agent:a", "agent:b"]);
    expect(d.loaded).toBe(true);
  });

  it("created/updated/removed; xoá thực thể không tồn tại không tạo object mới", () => {
    let d = apply(emptyData(), { type: "entity.created", entity: ent("agent:a") });
    d = apply(d, { type: "entity.updated", entity: ent("agent:a", { status: "working" }) });
    expect(d.entities["agent:a"].status).toBe("working");
    const same = applyOfficeEvent(d, { type: "entity.removed", id: "nope" });
    expect(same).toBe(d);
    d = apply(d, { type: "entity.removed", id: "agent:a" });
    expect(d.entities["agent:a"]).toBeUndefined();
  });

  it("nhật ký mới nhất ở đầu và bị giới hạn số dòng", () => {
    let d = emptyData();
    for (let i = 0; i < MAX_LOGS + 25; i++) d = apply(d, { type: "log", level: "info", text: `#${i}`, at: "x" });
    expect(d.logs).toHaveLength(MAX_LOGS);
    expect(d.logs[0].text).toBe(`#${MAX_LOGS + 24}`);
  });

  it("yêu cầu duyệt: thêm rồi gỡ khi có quyết định; snapshot gỡ duyệt mồ côi", () => {
    let d = apply(emptyData(), { type: "snapshot", entities: [ent("agent:a")], at: "x" });
    d = apply(d, { type: "approval.requested", id: "p1", entityId: "agent:a", kind: "permission", summary: "s", at: "x" });
    d = apply(d, { type: "approval.requested", id: "p2", entityId: "agent:gone", kind: "token", summary: "s", at: "x" });
    expect(Object.keys(d.approvals)).toEqual(["p1", "p2"]);
    d = apply(d, { type: "snapshot", entities: [ent("agent:a")], at: "y" });
    expect(Object.keys(d.approvals)).toEqual(["p1"]);
    d = apply(d, { type: "approval.decided", id: "p1", decision: "approve", at: "z" });
    expect(d.approvals).toEqual({});
  });

  it("status.changed tăng số thứ tự để hiệu ứng chỉ bắn một lần", () => {
    let d = apply(emptyData(), { type: "status.changed", id: "agent:a", from: "idle", to: "working", at: "x" });
    const first = d.lastChange!.seq;
    d = apply(d, { type: "status.changed", id: "agent:a", from: "working", to: "idle", at: "y" });
    expect(d.lastChange!.seq).toBe(first + 1);
  });
});

describe("backoff kết nối lại", () => {
  it("tăng gấp đôi, có nhiễu ≤ 25% và chặn ở 30 giây", () => {
    expect(backoffDelay(0, () => 0)).toBe(1000);
    expect(backoffDelay(1, () => 0)).toBe(2000);
    expect(backoffDelay(3, () => 0)).toBe(8000);
    expect(backoffDelay(2, () => 1)).toBe(5000);
    expect(backoffDelay(20, () => 0)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(20, () => 1)).toBeLessThanOrEqual(BACKOFF_MAX_MS * 1.25);
    expect(backoffDelay(-5, () => 0)).toBe(1000);
  });
});

describe("ánh xạ trạng thái cho renderer", () => {
  it("trạng thái chung → trạng thái rig", () => {
    expect(toRigStatus("pending-approval")).toBe("waiting");
    expect(toRigStatus("error")).toBe("blocked");
    expect(toRigStatus("offline")).toBe("stopped");
    expect(toRigStatus("learning")).toBe("learning");
  });

  it("bong bóng thoại: có nội dung khi bận/chờ duyệt, không có khi rảnh", () => {
    expect(bubbleFor(ent("a", { status: "idle" }))).toBeNull();
    expect(bubbleFor(ent("a", { status: "pending-approval" }))?.text).toContain("duyệt");
    expect(bubbleFor(ent("a", { status: "researching", metadata: { currentUrl: "https://docs.python.org/3/" } }))?.text).toContain(
      "docs.python.org",
    );
    expect(bubbleFor(ent("a", { status: "researching", metadata: { currentUrl: "không-phải-url" } }))?.text).toContain("không-phải-url");
  });
});

describe("NavGrid A*", () => {
  it("đi vòng qua vật cản, không xuyên ô bị chặn", () => {
    const g = new NavGrid(0, 0, 10, 10, 0.25);
    g.blockRect(5, 5, 0.5, 6, 0, 0); // bức tường dọc ở giữa
    const path = g.findPath([2, 5], [8, 5]);
    expect(path.length).toBeGreaterThan(1);
    let prev: [number, number] = [2, 5];
    for (const p of path) {
      expect(g.lineFree(prev, p)).toBe(true);
      prev = p;
    }
    expect(path[path.length - 1]).toEqual([8, 5]);
    expect(Math.max(...path.map((p) => p[1])) > 8 || Math.min(...path.map((p) => p[1])) < 2).toBe(true); // đi vòng đầu tường
  });

  it("không có đường thì trả về điểm đích (không treo)", () => {
    const g = new NavGrid(0, 0, 10, 10, 0.5);
    g.blockRect(5, 5, 20, 0.5, 0, 0); // chặn kín ngang
    const p = g.findPath([2, 2], [8, 8]);
    expect(p.length).toBeGreaterThan(0);
  });

  it("lưới văn phòng: ra khỏi chỗ ngồi của mọi agent tới điểm cửa mà không xuyên bàn/tường", () => {
    const agents = new AgentRegistry().list();
    const grid = buildOfficeNavGrid(DEPARTMENTS, agents.map((a) => a.position));
    for (const a of agents) {
      const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
      const door: [number, number] = [a.position.x + 1.4, dept.center.z + dept.size.d / 2 + 1.1];
      const path = grid.findPath([a.position.x, a.position.z], door);
      let prev: [number, number] = [a.position.x, a.position.z];
      let len = 0;
      for (const p of path) {
        len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        // Từng chặng nằm trong ô trống (trừ điểm xuất phát nằm ngay mép bàn).
        const [gx, gz] = grid.toCell(p[0], p[1]);
        expect(grid.free(gx, gz)).toBe(true);
        prev = p;
      }
      expect(len).toBeLessThan(MAX_WALK);
    }
  });

  it("đài phun nước và ghế đá bị chặn", () => {
    const grid = buildOfficeNavGrid(DEPARTMENTS, []);
    const [fx, fz] = grid.toCell(PLAZA.fountain.x, PLAZA.fountain.z);
    expect(grid.free(fx, fz)).toBe(false);
    const b = PLAZA.benches[0];
    const [bx, bz] = grid.toCell(b.x, b.z);
    expect(grid.free(bx, bz)).toBe(false);
  });
});

describe("bảng hành vi nhàn rỗi", () => {
  it("chọn theo trọng số và chỉ trong địa điểm khả dụng", () => {
    const only = new Set<IdleWhere>(["seat"]);
    for (let i = 0; i < 50; i++) expect(pickIdleAction(only, Math.random).where).toBe("seat");
    expect(pickIdleAction(new Set<IdleWhere>(["seat", "door"]), () => 0.9999).where).toBe("door");
    expect(IDLE_ACTIONS.every((a) => a.secs[0] > 0 && a.secs[1] >= a.secs[0] && a.weight > 0)).toBe(true);
  });

  function visual() {
    return { root: new THREE.Group(), chibi: { anim: "idle", sit: true, root: new THREE.Group() } } as never;
  }

  it("có lưới A*: agent đi ra điểm đứng, nghỉ, rồi về đúng ghế", () => {
    const a = new AgentRegistry().get("minh")!;
    const grid = buildOfficeNavGrid(DEPARTMENTS, [a.position]);
    const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
    const v = visual();
    let seated = 0;
    const b = new AgentBehavior(v, a.position.x, a.position.z, dept.center.z + dept.size.d / 2 + 1.1, a.position.x + 1.4, () => seated++, {
      nav: grid,
      rand: () => 0.99, // chọn việc cuối: cà phê ở cửa
    });
    (b as unknown as { nextActionAt: number }).nextActionAt = 0;
    const root = (v as { root: THREE.Group }).root;
    let maxZ = a.position.z;
    for (let i = 0; i < 6000 && seated === 0; i++) {
      b.update(0.05, "idle");
      maxZ = Math.max(maxZ, root.position.z);
      // Không bao giờ nằm trong chân bàn.
      const dx = Math.abs(root.position.x - a.position.x);
      const dz = root.position.z - a.position.z;
      if (b.away) expect(dx < 0.85 && dz > 0.25 && dz < 1.0).toBe(false);
    }
    expect(seated).toBe(1);
    expect(maxZ).toBeGreaterThan(dept.center.z + dept.size.d / 2); // đã ra khỏi phòng
    expect(root.position.x).toBeCloseTo(a.position.x, 5);
    expect(root.position.z).toBeCloseTo(a.position.z, 5);
  });

  it("việc nhỏ tại chỗ có nhãn và kết thúc khi có việc thật", () => {
    const v = visual();
    const b = new AgentBehavior(v, 0, 0.4, 4, 1.4, () => undefined, { rand: () => 0 }); // chọn việc đầu tiên: ngồi tại chỗ
    (b as unknown as { nextActionAt: number }).nextActionAt = 0;
    b.update(0.05, "idle");
    expect(b.away).toBe(false);
    expect(b.label()).toBe(IDLE_ACTIONS[0].label);
    b.onStatus("working");
    expect(b.label()).toBeNull();
  });
});
