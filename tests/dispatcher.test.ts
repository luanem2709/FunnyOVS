/**
 * Test cho bộ phân công việc tự động.
 *
 * Đảm bảo: không giao trùng việc cho người đang bận, tôn trọng thời gian chờ,
 * và danh mục việc luôn hợp lệ với các agent đã đăng ký.
 */
import { describe, it, expect } from "vitest";
import {
  AUTO_WORK_CATALOG,
  activeHoursLeft,
  estimateItemCost,
  estimateRoundCost,
  governorIntervalMs,
  pickNextWork,
  markDispatched,
  markFree,
  type DispatcherState,
} from "../src/server/agents/workDispatcher.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";

function freshState(): DispatcherState {
  return { busy: new Set<string>(), nextAllowed: new Map<string, number>(), dispatched: 0 };
}

describe("M. Bộ phân công việc tự động", () => {
  it("mỗi mục việc gắn với một nhân viên có thật", () => {
    const registry = new AgentRegistry();
    const ids = new Set(registry.list().map((a) => a.id));
    for (const w of AUTO_WORK_CATALOG) {
      expect(ids.has(w.agentId)).toBe(true);
    }
  });

  it("giao được việc cho nhân viên rảnh", () => {
    const st = freshState();
    const now = 1_000_000;
    const w = pickNextWork(AUTO_WORK_CATALOG, st, "an", now);
    expect(w).not.toBeNull();
    expect(w!.agentId).toBe("an");
  });

  it("không giao việc cho nhân viên đang bận", () => {
    const st = freshState();
    markDispatched(st, AUTO_WORK_CATALOG[0], 1000);
    const w = pickNextWork(AUTO_WORK_CATALOG, st, AUTO_WORK_CATALOG[0].agentId, 2000);
    expect(w).toBeNull();
  });

  it("tôn trọng thời gian chờ giữa hai lần giao", () => {
    const st = freshState();
    const item = AUTO_WORK_CATALOG.find((w) => w.agentId === "an")!;
    markDispatched(st, item, 1000);
    markFree(st, item.agentId);
    // Chưa tới hạn → không giao lại.
    expect(pickNextWork(AUTO_WORK_CATALOG, st, "an", 1000 + item.cooldownSec * 1000 - 1)).toBeNull();
    // Đã tới hạn → giao lại được.
    expect(pickNextWork(AUTO_WORK_CATALOG, st, "an", 1000 + item.cooldownSec * 1000)).not.toBeNull();
  });

  it("đếm số việc đã giao", () => {
    const st = freshState();
    expect(st.dispatched).toBe(0);
    markDispatched(st, AUTO_WORK_CATALOG[0], 1000);
    expect(st.dispatched).toBe(1);
  });

  it("mọi mục việc có thời gian chờ hợp lý", () => {
    for (const w of AUTO_WORK_CATALOG) {
      expect(w.cooldownSec).toBeGreaterThan(0);
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.note.length).toBeGreaterThan(0);
      if (w.kind === "research") expect(w.topic).toBeTruthy();
    }
  });

  it("mọi mục việc đều có chủ đề (việc nội bộ cũng chạy thật)", () => {
    for (const w of AUTO_WORK_CATALOG) {
      expect(w.topic).toBeTruthy();
      expect(w.maxSources).toBeGreaterThan(0);
      expect(w.snippetChars).toBeGreaterThan(500);
    }
  });
});

describe("N. Governor ngân sách tự động", () => {
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const now = dayStart + 10 * 3_600_000; // 10 giờ trong ngày
  const base = {
    baseIntervalMs: 60_000,
    maxIntervalMs: 10 * 60_000,
    activeHoursLeft: 6,
  };

  it("còn nhiều token → nhịp nhanh nhất", () => {
    const iv = governorIntervalMs({ ...base, remaining: 100_000_000, roundCost: 20_000 });
    expect(iv).toBe(60_000);
  });

  it("sắp hết token → nhịp giãn ra nhưng vẫn có giới hạn trên", () => {
    const iv = governorIntervalMs({ ...base, remaining: 80_000, roundCost: 20_000 });
    expect(iv).toBeGreaterThan(60_000);
    expect(iv).toBeLessThanOrEqual(10 * 60_000);
  });

  it("hết token → không giao nữa (Infinity)", () => {
    const iv = governorIntervalMs({ ...base, remaining: 100, roundCost: 20_000 });
    expect(iv).toBe(Number.POSITIVE_INFINITY);
  });

  it("nhịp luôn nằm trong khoảng [base, max]", () => {
    for (const remaining of [20_000, 80_000, 500_000, 5_000_000]) {
      const iv = governorIntervalMs({ ...base, remaining, roundCost: 20_000 });
      if (Number.isFinite(iv)) {
        expect(iv).toBeGreaterThanOrEqual(60_000);
        expect(iv).toBeLessThanOrEqual(10 * 60_000);
      }
    }
  });

  it("ngân sách càng nhiều thì nhịp càng ngắn", () => {
    const small = governorIntervalMs({ ...base, remaining: 500_000, roundCost: 20_000 });
    const large = governorIntervalMs({ ...base, remaining: 5_000_000, roundCost: 20_000 });
    expect(large).toBeLessThan(small);
  });

  it("giờ làm việc còn lại giảm dần theo giờ trong ngày", () => {
    expect(activeHoursLeft(dayStart + 1 * 3_600_000, dayStart)).toBeCloseTo(23, 5);
    expect(activeHoursLeft(dayStart + 20 * 3_600_000, dayStart)).toBeCloseTo(4, 5);
  });

  it("ước lượng chi phí mục việc luôn dương", () => {
    for (const w of AUTO_WORK_CATALOG) {
      expect(estimateItemCost(w)).toBeGreaterThan(0);
    }
  });

  it("chi phí một vòng = tổng chi phí các mục việc", () => {
    const total = estimateRoundCost(AUTO_WORK_CATALOG);
    const sum = AUTO_WORK_CATALOG.reduce((a, w) => a + estimateItemCost(w), 0);
    expect(total).toBe(sum);
    // Ví học chỉ có 1 mục việc.
    const learning = estimateRoundCost(AUTO_WORK_CATALOG, "learning");
    expect(learning).toBeLessThan(total);
    expect(learning).toBeGreaterThan(0);
  });
});
