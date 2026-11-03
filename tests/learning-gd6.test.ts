/**
 * GĐ 6 — TEST TỰ HỌC TRONG NGÂN SÁCH & TÌM KIẾM TRI THỨC.
 *
 * Mục tiêu:
 *  1. LearningEngine không bao giờ vượt ngân sách ví học.
 *  2. Chọn chủ đề: ưu tiên chưa học / học lâu rồi; bỏ qua chủ đề hỏng.
 *  3. Chủ đề hỏng 3 lần → tạm dừng, không tốn token nữa.
 *  4. Tìm kiếm tri thức xếp hạng đúng (tiêu đề > body, cụm từ > từ rời).
 *
 * KHÔNG gọi LLM thật, KHÔNG điều khiển máy.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LearningEngine } from "../src/server/learning/learningEngine.js";
import { TokenBudget } from "../src/server/budget/tokenBudget.js";
import { KnowledgeBase } from "../src/server/knowledge/knowledgeBase.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "office-gd6-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/** Tạo budget với hạn mức học cụ thể. */
function makeBudget(opts: { daily: number; learningPercent: number }): { budget: TokenBudget; token: symbol } {
  const budget = new TokenBudget(true);
  const token = budget.issueConfigToken();
  budget.configure(
    {
      dailyLimit: opts.daily,
      weeklyLimit: opts.daily * 5,
      learningPercent: opts.learningPercent,
      perTaskLimit: 200_000,
      warnRatio: 0.8,
    },
    token,
  );
  return { budget, token };
}

const TOPICS = ["TypeScript", "SQLite", "Prompt injection"];

describe("GĐ 6 · Tự học trong ngân sách", () => {
  it("không học khi chưa cấu hình chủ đề", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => [] });
    const plan = eng.planSession(30);
    expect(plan.shouldLearn).toBe(false);
    expect(plan.topics.length).toBe(0);
  });

  it("lập kế hoạch khi ví học còn đủ", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 12_000 });
    const plan = eng.planSession(30);
    expect(plan.shouldLearn).toBe(true);
    expect(plan.topics.length).toBeGreaterThan(0);
    expect(plan.topics.length).toBeLessThanOrEqual(2);
    expect(plan.tokenBudget).toBeLessThanOrEqual(30_000);
  });

  it("KHÔNG học khi ví học đã cạn", () => {
    const { budget, token } = makeBudget({ daily: 100_000, learningPercent: 30 });
    // Ví học = 30% của 100k = 30k. Tiêu hết (spend tự chặn vượt hạn mức).
    expect(budget.spend("learning", 40_000)).toBe(false);
    expect(budget.spend("learning", 30_000)).toBe(true);
    expect(budget.getUsage("learning").used).toBe(30_000);

    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 12_000 });
    const plan = eng.planSession(30);
    expect(plan.shouldLearn).toBe(false);
    expect(plan.reason).toContain("cạn");
  });

  it("KHÔNG học khi ví học không đủ cho 1 chủ đề", () => {
    const { budget, token } = makeBudget({ daily: 100_000, learningPercent: 30 });
    budget.spend("learning", 28_000); // còn 2.000 < 12.000
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 12_000 });
    const plan = eng.planSession(30);
    expect(plan.shouldLearn).toBe(false);
    expect(plan.reason).toContain("chưa đủ");
  });

  it("kế hoạch KHÔNG BAO GIỜ vượt số token còn lại trong ví học", () => {
    const { budget, token } = makeBudget({ daily: 100_000, learningPercent: 30 });
    budget.spend("learning", 20_000); // còn 10.000
    const eng = new LearningEngine({
      budget,
      getTopics: () => TOPICS,
      tokensPerTopic: 12_000,
      maxTopicsPerSession: 5,
    });
    const plan = eng.planSession(30);
    if (plan.shouldLearn) {
      expect(plan.tokenBudget).toBeLessThanOrEqual(10_000);
    } else {
      expect(plan.tokenBudget).toBe(0);
    }
  });

  it("số chủ đề mỗi phiên không vượt maxTopicsPerSession", () => {
    const { budget } = makeBudget({ daily: 1_000_000, learningPercent: 50 });
    const eng = new LearningEngine({
      budget,
      getTopics: () => TOPICS,
      tokensPerTopic: 1_000,
      maxTopicsPerSession: 2,
    });
    const plan = eng.planSession(50);
    expect(plan.topics.length).toBeLessThanOrEqual(2);
  });

  it("độ sâu (số nguồn) tăng khi ví rộng hơn, nhưng có trần", () => {
    const { budget: b1 } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const e1 = new LearningEngine({ budget: b1, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const p1 = e1.planSession(30);

    const { budget: b2 } = makeBudget({ daily: 10_000_000, learningPercent: 90 });
    const e2 = new LearningEngine({ budget: b2, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const p2 = e2.planSession(90);

    expect(p2.maxSources).toBeGreaterThanOrEqual(p1.maxSources);
    expect(p2.maxSources).toBeLessThanOrEqual(5);
  });
});

describe("GĐ 6 · Chọn chủ đề & tiến độ", () => {
  it("ưu tiên chủ đề chưa học lần nào", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const first = eng.selectTopics(1);
    eng.recordOutcome(first[0], true);
    const second = eng.selectTopics(1);
    expect(second[0]).not.toBe(first[0]);
  });

  it("chủ đề hỏng 3 lần → tạm dừng (không học lại nữa)", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const t = TOPICS[0];
    eng.recordOutcome(t, false);
    eng.recordOutcome(t, false);
    expect(eng.progressOf(t).paused).toBe(false);
    eng.recordOutcome(t, false);
    expect(eng.progressOf(t).paused).toBe(true);

    // Không còn được chọn.
    const chosen = eng.selectTopics(3);
    expect(chosen).not.toContain(t);
  });

  it("bỏ tạm dừng → chủ đề được chọn lại", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const t = TOPICS[0];
    eng.recordOutcome(t, false);
    eng.recordOutcome(t, false);
    eng.recordOutcome(t, false);
    eng.resumeTopic(t);
    expect(eng.progressOf(t).paused).toBe(false);
    expect(eng.selectTopics(3)).toContain(t);
  });

  it("thành công thì reset bộ đếm lỗi", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS, tokensPerTopic: 1_000 });
    const t = TOPICS[0];
    eng.recordOutcome(t, false);
    eng.recordOutcome(t, false);
    eng.recordOutcome(t, true);
    expect(eng.progressOf(t).failures).toBe(0);
    expect(eng.progressOf(t).paused).toBe(false);
  });

  it("ghi nhận số phiên học", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS });
    expect(eng.sessionCount).toBe(0);
    eng.recordSession();
    eng.recordSession();
    expect(eng.sessionCount).toBe(2);
  });

  it("tỉ lệ sử dụng ví học được theo dõi", () => {
    const { budget } = makeBudget({ daily: 100_000, learningPercent: 30 });
    const eng = new LearningEngine({ budget, getTopics: () => TOPICS });
    expect(eng.usageRatio()).toBe(0);
    budget.spend("learning", 15_000); // 30% của 100k = 30k
    expect(eng.usageRatio()).toBeCloseTo(0.5, 2);
  });
});

describe("GĐ 6 · Tìm kiếm tri thức", () => {
  it("tìm theo tiêu đề và xếp hạng khớp tiêu đề cao hơn", async () => {
    const kb = new KnowledgeBase(tmpRoot);
    kb.add({
      kind: "note",
      agentId: "a",
      title: "SQLite indexing",
      body: "Ghi chú ngắn về index.",
      sources: [],
      confidence: 0.8,
      fromWeb: false,
      tags: [],
    });
    kb.add({
      kind: "note",
      agentId: "a",
      title: "Ghi chú chung",
      body: "Bài viết dài nói về SQLite và index của nó.",
      sources: [],
      confidence: 0.8,
      fromWeb: false,
      tags: [],
    });

    const results = searchKb(kb, "SQLite");
    expect(results.length).toBe(2);
    // Khớp tiêu đề đứng trước.
    expect(results[0].title).toBe("SQLite indexing");
    kb.close();
  });

  it("khớp cụm từ mạnh hơn khớp từ rời", () => {
    const kb = new KnowledgeBase(tmpRoot);
    kb.add({
      kind: "note",
      agentId: "a",
      title: "prompt injection",
      body: "Một ghi chú về an toàn.",
      sources: [],
      confidence: 0.8,
      fromWeb: false,
      tags: [],
    });
    kb.add({
      kind: "note",
      agentId: "a",
      title: "Ghi chú linh tinh",
      body: "Bài này nhắc tới injection một cách thoáng qua, và prompt ở nơi khác.",
      sources: [],
      confidence: 0.8,
      fromWeb: false,
      tags: [],
    });
    const results = searchKb(kb, "prompt injection");
    expect(results[0].title).toBe("prompt injection");
    kb.close();
  });

  it("không tìm thấy → danh sách rỗng", () => {
    const kb = new KnowledgeBase(tmpRoot);
    kb.add({
      kind: "note",
      agentId: "a",
      title: "ABC",
      body: "XYZ",
      sources: [],
      confidence: 0.5,
      fromWeb: false,
      tags: [],
    });
    expect(searchKb(kb, "khong-ton-tai-abcxyz").length).toBe(0);
    kb.close();
  });

  it("ký tự đặc biệt trong từ khoá không làm hỏng regex", () => {
    const kb = new KnowledgeBase(tmpRoot);
    kb.add({
      kind: "note",
      agentId: "a",
      title: "C++ (ngôn ngữ)",
      body: "Nội dung về C++.",
      sources: [],
      confidence: 0.5,
      fromWeb: false,
      tags: [],
    });
    const results = searchKb(kb, "C++");
    expect(results.length).toBeGreaterThan(0);
    kb.close();
  });
});

/** Tái tạo logic xếp hạng của API /api/kb/search (để test độc lập server). */
function searchKb(kb: KnowledgeBase, query: string): any[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const candidates = kb.list({ limit: 500 });
  return candidates
    .map((e) => {
      const title = e.title.toLowerCase();
      const body = e.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 10;
        if (body.includes(t)) score += 3;
        const rx = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (rx.test(e.title)) score += 6;
        if (rx.test(e.body)) score += 2;
      }
      if (title.includes(query.toLowerCase())) score += 15;
      else if (body.includes(query.toLowerCase())) score += 5;
      score *= 0.5 + e.confidence;
      return { ...e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}
