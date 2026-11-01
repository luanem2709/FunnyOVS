/**
 * Test cho lớp ngân sách token mở rộng (Bước 4 — Phase 3):
 *  - Ước lượng chi phí + ngưỡng hỏi người dùng
 *  - Trần tuần, trần mỗi tác vụ
 *  - Ví học không vượt trần tổng
 *  - Tự hạ cấp model chỉ dùng model trong bucket "auto"
 *  - Bảng giá khớp với số liệu Cursor trả về
 *  - Task runner: không gọi LLM khi chưa được duyệt
 */
import { describe, it, expect } from "vitest";
import { TokenBudget } from "../src/server/budget/tokenBudget.js";
import {
  estimateTask,
  estimateTextTokens,
  pricingFor,
  estimateCost,
  suggestModel,
  THRESHOLDS,
} from "../src/server/budget/estimation.js";
import { TokenLedger } from "../src/server/budget/tokenLedger.js";
import { TaskRunner } from "../src/server/tasks/taskRunner.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("G. Ước lượng chi phí tác vụ", () => {
  it("ước lượng token từ độ dài văn bản", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("a".repeat(320))).toBe(100);
  });

  it("tác vụ nhỏ không cần hỏi người dùng", () => {
    const est = estimateTask({ prompt: "Tóm tắt 3 dòng này" });
    expect(est.needsApproval).toBe(false);
    expect(est.difficulty).toBe("trivial");
  });

  it("tác vụ lớn phải hỏi người dùng trước", () => {
    const est = estimateTask({ prompt: "x ".repeat(200_000) });
    expect(est.needsApproval).toBe(true);
    expect(est.reason).toBeTruthy();
  });

  it("vượt trần mỗi tác vụ thì phải nêu lý do chia nhỏ", () => {
    const est = estimateTask({ prompt: "x ".repeat(600_000) });
    expect(est.needsApproval).toBe(true);
    expect(est.estimatedTokens).toBeGreaterThan(THRESHOLDS.perTaskLimit);
    expect(est.reason).toContain("chia nhỏ");
  });

  it("tác vụ ngắn vẫn ước lượng ≥ chi phí cố định của một lượt CLI", () => {
    const est = estimateTask({ prompt: "xin chào" });
    expect(est.estimatedTokens).toBeGreaterThan(20_000);
    expect(est.needsApproval).toBe(false);
  });

  it("gói Free chỉ được dùng model auto", () => {
    expect(suggestModel("hard", true)).toBe("auto");
    expect(suggestModel("trivial", false)).toBe("composer-2.5");
    expect(suggestModel("normal", false)).toBe("cursor-grok-4.5");
    expect(suggestModel("hard", false)).toBe("grok-4.7");
  });
});

describe("H. Bảng giá Cursor khớp số liệu thật", () => {
  it("tính đúng 6.1694 cents cho lượt đã chạy thật", () => {
    // Lượt đo thật ngày 2026-11-01:
    //   input 22970, cacheRead 25472, output 503 → totalCents 6.1694
    const p = pricingFor("grok-4.7");
    const usd = estimateCost(p, 22970, 503, 25472);
    expect(usd).toBeCloseTo(0.061694, 6);
    // 1 USD = 100 cents → 6.1694 cents
    expect(Math.round(usd * 100 * 10000) / 10000).toBeCloseTo(6.1694, 4);
  });

  it("composer rẻ hơn grok", () => {
    const composer = estimateCost(pricingFor("composer-2.5"), 10_000, 1_000, 5_000);
    const grok = estimateCost(pricingFor("grok-4.7"), 10_000, 1_000, 5_000);
    expect(composer).toBeLessThan(grok);
  });
});

describe("I. Token Budget: trần tuần, trần tác vụ, ví học", () => {
  it("không cho vượt trần tuần", () => {
    const b = new TokenBudget(true);
    const t = b.issueConfigToken();
    b.configure({ dailyLimit: 10_000, weeklyLimit: 15_000 }, t);
    expect(b.spend("normal", 10_000)).toBe(true);
    expect(b.spend("normal", 6_000)).toBe(false);
    expect(b.getWeekly().used).toBe(10_000);
  });

  it("ví học dừng khi tổng đã chạm trần ngày", () => {
    const b = new TokenBudget(true);
    const t = b.issueConfigToken();
    b.configure({ dailyLimit: 1000, learningPercent: 50 }, t);
    expect(b.spend("normal", 600)).toBe(true);
    // Ví học còn 500 theo riêng, nhưng tổng đã 600 + 500 > 1000 → vẫn chặn khi cần 500
    expect(b.spend("learning", 400)).toBe(true);
    expect(b.spend("learning", 100)).toBe(false);
  });

  it("trần 100% thì khoá mọi chi tiêu", () => {
    const b = new TokenBudget(true);
    const t = b.issueConfigToken();
    b.configure({ dailyLimit: 1000 }, t);
    b.spend("normal", 1000);
    expect(b.isLocked()).toBe(true);
    expect(b.canSpend("normal", 1)).toBe(false);
    expect(b.canSpend("learning", 1)).toBe(false);
  });

  it("cảnh báo ở 80% rồi khoá ở 100%", () => {
    const b = new TokenBudget(true);
    const t = b.issueConfigToken();
    b.configure({ dailyLimit: 1000 }, t);
    b.spend("normal", 800);
    expect(b.shouldWarn()).toBe(true);
    expect(b.shouldWarn()).toBe(false); // không spam
    b.spend("normal", 200);
    expect(b.isLocked()).toBe(true);
  });

  it("hoàn tiền khi lượt LLM thất bại", () => {
    const b = new TokenBudget(true);
    const t = b.issueConfigToken();
    b.configure({ dailyLimit: 1000 }, t);
    b.spend("normal", 500);
    b.refund("normal", 500);
    expect(b.getUsage("normal").used).toBe(0);
  });
});

describe("J. Nhật ký chi tiêu (SQLite)", () => {
  it("ghi và tổng hợp theo ví và phòng ban", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-ledger-"));
    const ledger = new TokenLedger(dir);
    ledger.add({
      taskId: "t1",
      department: "support",
      agentId: "mai",
      agentName: "Mai",
      model: "auto",
      backend: "cursor-agent",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 200,
      cacheWriteTokens: 0,
      costCents: 1.5,
      wallet: "normal",
      quotaSource: "cli-usage",
      durationMs: 900,
      ok: true,
    });
    ledger.add({
      taskId: "t2",
      department: "library",
      agentId: "tri",
      agentName: "Tri",
      model: "auto",
      backend: "cursor-agent",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costCents: 0.5,
      wallet: "learning",
      quotaSource: "cli-usage",
      durationMs: 200,
      ok: true,
    });
    const totals = ledger.totalsToday();
    expect(totals.normal).toBe(350);
    expect(totals.learning).toBe(15);
    const byDept = ledger.totalsByDepartment();
    expect(byDept.find((d) => d.department === "support")?.tokens).toBe(350);
    expect(byDept.find((d) => d.department === "library")?.tokens).toBe(15);
    ledger.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("K. Bộ điều phối tác vụ không gọi LLM khi chưa được duyệt", () => {
  it("tác vụ lớn phải chờ duyệt, không chạy", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-task-"));
    const ledger = new TokenLedger(dir);
    const budget = new TokenBudget(true);
    const t = budget.issueConfigToken();
    budget.configure({ dailyLimit: 1_000_000 }, t);

    const approvals: any[] = [];
    const runner = new TaskRunner({
      budget,
      ledger,
      workspace: dir,
      onApprovalNeeded: (r) => approvals.push(r),
    });

    const task = await runner.submit({
      title: "Tác vụ rất lớn",
      prompt: "x ".repeat(600_000),
      agentId: "minh",
      agentName: "Minh",
      department: "dispatch",
    });
    expect(task.status).toBe("awaiting-approval");
    expect(approvals.length).toBe(1);
    // Chưa gọi LLM → chưa có dòng ledger
    expect(ledger.list()).toHaveLength(0);
    ledger.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("từ chối thì tác vụ kết thúc mà không chạy", async () => {    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-task2-"));
    const ledger = new TokenLedger(dir);
    const budget = new TokenBudget(true);
    const t = budget.issueConfigToken();
    budget.configure({ dailyLimit: 1_000_000 }, t);

    const runner = new TaskRunner({ budget, ledger, workspace: dir });
    const task = await runner.submit({
      title: "Tác vụ lớn",
      prompt: "x ".repeat(600_000),
      agentId: "minh",
      agentName: "Minh",
      department: "dispatch",
    });
    const rejected = runner.reject(`apr_${task.id}`);
    expect(rejected?.status).toBe("rejected");
    expect(ledger.list()).toHaveLength(0);
    ledger.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("chế độ tự chủ cao bỏ qua bước duyệt nhưng vẫn kín trần tác vụ", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-task3-"));
    const ledger = new TokenLedger(dir);
    const budget = new TokenBudget(true);
    const t = budget.issueConfigToken();
    budget.configure({ dailyLimit: 1_000_000, perTaskLimit: 200_000 }, t);

    const runner = new TaskRunner({
      budget,
      ledger,
      workspace: dir,
      isAutonomous: () => true,
    });

    const task = await runner.submit({
      title: "Tác vụ rất lớn",
      prompt: "x ".repeat(600_000),
      agentId: "minh",
      agentName: "Minh",
      department: "dispatch",
    });
    // Không hỏi duyệt, nhưng trần cứng 200k vẫn chặn → fail, không gọi LLM.
    expect(task.status).toBe("failed");
    expect(task.error).toContain("trần mỗi tác vụ");
    expect(ledger.list()).toHaveLength(0);
    ledger.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("tự chủ cao với tác vụ vừa phải thì chạy thẳng", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-task4-"));
    const ledger = new TokenLedger(dir);
    const budget = new TokenBudget(true);
    const t = budget.issueConfigToken();
    budget.configure({ dailyLimit: 1_000_000, perTaskLimit: 200_000 }, t);

    const runner = new TaskRunner({
      budget,
      ledger,
      workspace: dir,
      isAutonomous: () => true,
      runLlm: async () => ({
        ok: true,
        text: "kết quả giả",
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 1,
      }),
    });
    const task = await runner.submit({
      title: "Tác vụ nhỏ",
      prompt: "Tóm tắt ngắn",
      agentId: "minh",
      agentName: "Minh",
      department: "dispatch",
    });
    // Không cần duyệt → chạy thẳng và ghi ledger.
    expect(task.status).toBe("done");
    expect(task.tokens).toBe(150);
    expect(ledger.list()).toHaveLength(1);
    ledger.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("L. Bố cục 3D: 9 phòng ban và nhân vật", () => {
  it("có đủ 9 phòng", () => {
    expect(DEPARTMENTS).toHaveLength(9);
  });

  it("mỗi phòng có tâm và kích thước hợp lệ", () => {
    for (const d of DEPARTMENTS) {
      expect(d.size.w).toBeGreaterThan(0);
      expect(d.size.d).toBeGreaterThan(0);
      expect(Number.isFinite(d.center.x)).toBe(true);
    }
  });

  it("các phòng không chồng lấn", () => {
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      for (let j = i + 1; j < DEPARTMENTS.length; j++) {
        const a = DEPARTMENTS[i];
        const b = DEPARTMENTS[j];
        const dx = Math.abs(a.center.x - b.center.x);
        const dz = Math.abs(a.center.z - b.center.z);
        const overlapX = dx < (a.size.w + b.size.w) / 2;
        const overlapZ = dz < (a.size.d + b.size.d) / 2;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });

  it("mỗi phòng có ít nhất một nhân vật trực thuộc", () => {
    const registry = new AgentRegistry();
    for (const d of DEPARTMENTS) {
      if (d.id === "project") continue; // phòng dự phòng, chưa có nhân vật
      expect(registry.listByDepartment(d.id).length).toBeGreaterThan(0);
    }
  });

  it("nhân vật nằm trong ranh giới phòng", () => {
    const registry = new AgentRegistry();
    for (const a of registry.list()) {
      const d = DEPARTMENTS.find((x) => x.id === a.department)!;
      expect(Math.abs(a.position.x - d.center.x)).toBeLessThanOrEqual(d.size.w / 2);
      expect(Math.abs(a.position.z - d.center.z)).toBeLessThanOrEqual(d.size.d / 2);
    }
  });
});
