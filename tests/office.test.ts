/**
 * Test cho lớp dữ liệu của văn phòng hợp nhất: schema, adapter, cầu nối sự kiện, bảng máy.
 */
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import type { TaskRecord } from "../src/server/tasks/taskRunner.js";
import {
  OfficeBridge,
  agentToEntity,
  taskToEntity,
  machineToEntity,
  MACHINE_ID,
} from "../src/server/office/entityAdapter.js";
import { cpuPercentBetween, parsePs, parseTasklist, type MachineSample } from "../src/server/office/machine.js";
import { OfficeEntity, isOfficeEvent, simplifyStatus, ENTITY_STATUSES } from "../src/shared/officeEntity.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";

function task(patch: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "t1",
    title: "Tóm tắt SEO",
    prompt: "…",
    agentId: "mai",
    agentName: "Mai",
    department: "support",
    status: "pending",
    createdAt: "2026-11-21T00:00:00.000Z",
    wallet: "task",
    ...patch,
  } as TaskRecord;
}

const sample: MachineSample = {
  host: "PC",
  platform: "win32",
  cpuPercent: 10,
  ramUsedMb: 8000,
  ramTotalMb: 16000,
  ramPercent: 50,
  uptimeSec: 100,
  topProcesses: [],
  at: "2026-11-21T00:00:00.000Z",
};

function makeBridge(state: { tasks: TaskRecord[]; machine: MachineSample | null }) {
  const reg = new AgentRegistry();
  return {
    reg,
    bridge: new OfficeBridge({ listAgents: () => reg.list(), listTasks: () => state.tasks, machine: () => state.machine }),
  };
}

describe("schema OfficeEntity", () => {
  it("mọi agent của FunnyOVS đều hợp lệ và dùng id có tiền tố", () => {
    for (const a of new AgentRegistry().list()) {
      const e = agentToEntity(a);
      expect(OfficeEntity.safeParse(e).success).toBe(true);
      expect(e.id).toBe(`agent:${a.id}`);
      expect(e.kind).toBe("agent");
    }
  });

  it("waiting → pending-approval; các trạng thái khác giữ nguyên", () => {
    const reg = new AgentRegistry();
    reg.setStatus("mai", "waiting", "x");
    expect(agentToEntity(reg.get("mai")!).status).toBe("pending-approval");
    reg.setStatus("mai", "researching");
    expect(agentToEntity(reg.get("mai")!).status).toBe("researching");
  });

  it("simplifyStatus gộp 9 trạng thái về 5 và không bỏ sót trạng thái nào", () => {
    const five = ["idle", "working", "error", "offline", "pending-approval"];
    for (const s of ENTITY_STATUSES) expect(five).toContain(simplifyStatus(s));
    expect(simplifyStatus("learning")).toBe("working");
    expect(simplifyStatus("blocked")).toBe("error");
    expect(simplifyStatus("stopped")).toBe("offline");
  });

  it("isOfficeEvent từ chối dữ liệu sai hình dạng", () => {
    expect(isOfficeEvent(null)).toBe(false);
    expect(isOfficeEvent({ type: "nope" })).toBe(false);
    expect(isOfficeEvent({ type: "entity.updated", entity: { id: "" } })).toBe(false);
    expect(isOfficeEvent({ type: "status.changed", id: "a", from: "idle", to: "bogus", at: "x" })).toBe(false);
    expect(isOfficeEvent({ type: "log", level: "shout", text: "x", at: "x" })).toBe(false);
    expect(isOfficeEvent({ type: "entity.removed", id: "agent:mai" })).toBe(true);
  });
});

describe("OfficeBridge", () => {
  it("snapshot gồm agent, tác vụ đang chạy và máy; không gồm tác vụ đã xong", () => {
    const { bridge } = makeBridge({
      tasks: [task({ status: "running" }), task({ id: "t2", status: "done" })],
      machine: sample,
    });
    const snap = bridge.snapshot();
    expect(snap.type).toBe("snapshot");
    if (snap.type !== "snapshot") return;
    expect(snap.entities.filter((e) => e.kind === "agent")).toHaveLength(8);
    expect(snap.entities.filter((e) => e.kind === "task").map((e) => e.id)).toEqual(["task:t1"]);
    expect(snap.entities.some((e) => e.id === MACHINE_ID)).toBe(true);
    for (const e of snap.entities) expect(isOfficeEvent({ type: "entity.updated", entity: e })).toBe(true);
  });

  it("agent:update → entity.updated, kèm status.changed khi đổi trạng thái", () => {
    const { bridge, reg } = makeBridge({ tasks: [], machine: null });
    reg.setStatus("long", "working", "việc");
    const evs = bridge.translate("agent:update", reg.get("long"));
    expect(evs.map((e) => e.type)).toEqual(["entity.updated", "status.changed"]);
    const sc = evs[1];
    expect(sc.type === "status.changed" && sc.from === "idle" && sc.to === "working").toBe(true);
    expect(bridge.translate("agent:update", reg.get("long")).map((e) => e.type)).toEqual(["entity.updated"]);
  });

  it("vòng đời tác vụ: created → updated → (duyệt) → removed + log", () => {
    const { bridge } = makeBridge({ tasks: [], machine: null });
    expect(bridge.translate("task:update", task({ status: "awaiting-approval" })).map((e) => e.type)).toEqual(["entity.created"]);
    const running = bridge.translate("task:update", task({ status: "running" }));
    expect(running.map((e) => e.type)).toEqual(["entity.updated", "status.changed", "approval.decided"]);
    const done = bridge.translate("task:update", task({ status: "done", tokens: 1200 }));
    expect(done.map((e) => e.type)).toEqual(["entity.removed", "log"]);
  });

  it("tác vụ bị từ chối khi đang chờ duyệt → approval.decided = deny", () => {
    const { bridge } = makeBridge({ tasks: [], machine: null });
    bridge.translate("task:update", task({ status: "awaiting-approval" }));
    const evs = bridge.translate("task:update", task({ status: "rejected" }));
    const decided = evs.find((e) => e.type === "approval.decided");
    expect(decided && decided.type === "approval.decided" && decided.decision).toBe("deny");
  });

  it("yêu cầu quyền và duyệt token → approval.requested đúng loại", () => {
    const { bridge } = makeBridge({ tasks: [], machine: null });
    const perm = bridge.translate("permission:request", {
      id: "p1",
      agentId: "an",
      agentName: "An",
      reason: "đọc thư mục",
      path: "C:/x",
    })[0];
    expect(perm.type === "approval.requested" && perm.kind === "permission" && perm.entityId === "agent:an").toBe(true);
    const tok = bridge.translate("task:approval", {
      id: "a1",
      taskId: "t9",
      title: "Học",
      agentId: "tri",
      agentName: "Tri",
      department: "library",
      reason: "tốn token",
      estimation: { estimatedTokens: 90000 },
      createdAt: "x",
    })[0];
    expect(tok.type === "approval.requested" && tok.kind === "token" && tok.id === "t9").toBe(true);
  });

  it("sự kiện lạ bị bỏ qua, nhật ký duyệt web được dịch", () => {
    const { bridge } = makeBridge({ tasks: [], machine: null });
    expect(bridge.translate("budget", {})).toEqual([]);
    const log = bridge.translate("browser:log", {
      id: 1,
      ts: "t",
      agentId: "an",
      agentName: "An",
      url: "https://a.b",
      title: "A",
      status: "blocked",
    })[0];
    expect(log.type === "log" && log.level === "warn").toBe(true);
  });

  it("máy: sự kiện đầu là created, sau đó updated; RAM cao → error", () => {
    const { bridge } = makeBridge({ tasks: [], machine: null });
    expect(bridge.onMachine(sample).map((e) => e.type)).toEqual(["entity.created"]);
    const hot = bridge.onMachine({ ...sample, ramPercent: 95 });
    expect(hot.map((e) => e.type)).toEqual(["entity.updated", "status.changed"]);
  });

  it("máy nằm trong phòng Đội AI; tác vụ mang metadata agent", () => {
    const m = machineToEntity(sample);
    const dept = DEPARTMENTS.find((d) => d.id === "ai-team")!;
    expect(Math.abs(m.position!.x - dept.center.x)).toBeLessThan(dept.size.w / 2);
    expect(Math.abs(m.position!.z - dept.center.z)).toBeLessThan(dept.size.d / 2);
    expect(taskToEntity(task({ status: "running" })).metadata.agentName).toBe("Mai");
  });
});

describe("đọc máy", () => {
  it("cpuPercentBetween", () => {
    expect(cpuPercentBetween({ idle: 0, total: 0 }, { idle: 50, total: 100 })).toBe(50);
    expect(cpuPercentBetween({ idle: 10, total: 100 }, { idle: 10, total: 100 })).toBe(0);
    expect(cpuPercentBetween({ idle: 0, total: 0 }, { idle: 0, total: 100 })).toBe(100);
  });

  it("parseTasklist (Windows)", () => {
    const out = [
      '"chrome.exe","1234","Console","1","1,234,567 K"',
      '"System Idle Process","0","Services","0","8 K"',
      "dong rac",
    ].join("\r\n");
    const rows = parseTasklist(out);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "chrome.exe", pid: 1234, memMb: 1206 });
  });

  it("parsePs (macOS/Linux)", () => {
    const rows = parsePs("  10 204800 /usr/bin/node\n  11 1024 bash\nbad line\n");
    expect(rows).toEqual([
      { pid: 10, memMb: 200, name: "node" },
      { pid: 11, memMb: 1, name: "bash" },
    ]);
  });
});
