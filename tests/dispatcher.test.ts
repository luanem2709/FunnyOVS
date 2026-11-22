/**
 * Test cho điều phối theo tầng: kế hoạch LLM + dự phòng từ khoá, phụ thuộc, thử lại, nghiệm thu có cấu trúc, báo cáo tổng hợp.
 */
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { OrgDispatcher } from "../src/server/org/dispatcher.js";
import { makePlanner, makeSummarizer, sanitizePlan, MAX_PLAN_STEPS, type ChatFn, type Planner, type Summarizer } from "../src/server/org/planner.js";
import { isOfficeEvent, type OrgNode } from "../src/shared/officeEntity.js";
import type { TaskRecord } from "../src/server/tasks/taskRunner.js";

function setup(opts: { planner?: Planner; summarizer?: Summarizer; maxRetries?: number } = {}) {
  const reg = new AgentRegistry();
  const emitted: OrgNode[] = [];
  const submitted: Array<{ agentId: string; ref: string; title: string; prompt: string; lang: string }> = [];
  const records = new Map<string, TaskRecord>();
  let failSubmit = false;
  const d = new OrgDispatcher({
    registry: reg,
    planner: opts.planner,
    summarizer: opts.summarizer,
    maxRetries: opts.maxRetries,
    submit: async (input) => {
      if (failSubmit) throw new Error("boom");
      submitted.push(input);
      const t = {
        id: `task_${submitted.length}`,
        title: input.title,
        prompt: input.prompt,
        agentId: input.agentId,
        agentName: input.agentName,
        department: input.department,
        status: "pending",
        createdAt: "2026-11-21T00:00:00.000Z",
        wallet: "normal",
        ref: input.ref,
      } as TaskRecord;
      records.set(input.ref, t);
      return t;
    },
    openTasksOf: () => 0,
    emit: (n) => emitted.push(JSON.parse(JSON.stringify(n))),
  });
  const finish = (ref: string, patch: Partial<TaskRecord>) => {
    const t = { ...records.get(ref)!, ...patch } as TaskRecord;
    records.set(ref, t);
    d.onTaskUpdate(t);
  };
  return { reg, d, emitted, submitted, finish, setFail: (v: boolean) => (failSubmit = v) };
}

const workOf = (d: OrgDispatcher, rootId: string) => d.tree(rootId).filter((n) => n.kind === "work");

describe("OrgDispatcher", () => {
  it("giao cho Giám đốc → trưởng phòng từng phòng → nhân viên; mọi nút hợp lệ theo schema", async () => {
    const { d, submitted, emitted } = setup();
    const root = await d.assign({ prompt: "Chiến dịch marketing và báo cáo chi phí", toAgentId: "giamdoc" });
    const tree = d.tree(root.id);
    expect(root.level).toBe(1);
    expect(root.planSource).toBe("keywords");
    const heads = tree.filter((n) => n.level === 2 && n.kind === "delegation");
    expect(heads.map((h) => h.department).sort()).toEqual(["finance", "marketing"]);
    const work = workOf(d, root.id);
    expect(work.map((w) => w.assigneeId).sort()).toEqual(["ha", "phuc"]);
    expect(work.every((w) => w.level === 3)).toBe(true);
    expect(submitted.map((s) => s.agentId).sort()).toEqual(["ha", "phuc"]);
    for (const n of emitted) expect(isOfficeEvent({ type: "org.node", node: n })).toBe(true);
  });

  it("mỗi lần cha có thêm con, cha được phát lại kèm danh sách con mới — người nhận không giữ childIds cũ", async () => {
    const { d, emitted } = setup();
    const root = await d.assign({ prompt: "Chiến dịch marketing và báo cáo chi phí", toAgentId: "giamdoc" });
    // Với MỖI nút con có một lần phát lại của cha chứa đúng con đó (và mọi con trước nó).
    const kids = d.tree(root.id).filter((n) => n.parentId);
    expect(kids.length).toBeGreaterThanOrEqual(4); // 2 trưởng phòng + 2 nhân viên
    for (const kid of kids) {
      const parentSnapshots = emitted.filter((n) => n.id === kid.parentId);
      expect(parentSnapshots.some((p) => p.childIds.includes(kid.id)), `${kid.id} (cha ${kid.parentId})`).toBe(true);
    }
    // Bản phát cuối của cha khớp bản hiện tại (không còn bản nào "cũ hơn" ghi đè).
    const lastOfRoot = [...emitted].reverse().find((n) => n.id === root.id)!;
    expect(lastOfRoot.childIds).toEqual(d.get(root.id)!.childIds);
  });

  it("nghiệm thu CÓ CẤU TRÚC từng cấp (E3): đếm xong/lỗi và từng mục; kết quả gộp lên nút cha", async () => {
    const { d, finish } = setup();
    const root = await d.assign({ prompt: "báo cáo doanh thu và nội dung bài đăng", toAgentId: "giamdoc" });
    const work = workOf(d, root.id);
    finish(work[0].id, { status: "running" });
    expect(d.get(root.id)!.status).toBe("running");
    finish(work[0].id, { status: "done", result: "Kết quả A" });
    expect(d.get(root.id)!.status).toBe("running"); // còn việc khác chưa xong
    finish(work[1].id, { status: "done", result: "Kết quả B" });
    const done = d.get(root.id)!;
    expect(done.status).toBe("done");
    expect(done.review).toMatchObject({ done: 2, failed: 0, rejected: 0 });
    expect(done.review!.items.map((i) => i.text).sort()).toEqual(["Kết quả A", "Kết quả B"]);
    expect(done.result).toContain("Kết quả A");
    expect(d.tree(root.id).filter((n) => n.kind === "delegation").every((n) => n.status === "done")).toBe(true);
  });

  it("lỗi: thử lại MỘT lần với người khác; bản thất bại bị thay thế không làm cha báo lỗi (A4)", async () => {
    const { d, finish, submitted } = setup();
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    const first = workOf(d, root.id)[0];
    expect(first.assigneeId).toBe("ha");
    finish(first.id, { status: "failed", error: "Mọi nhà cung cấp AI đều lỗi", errorKey: "err.ai.allFailed", errorVars: { detail: "HTTP 500" } });
    expect(d.get(first.id)!.superseded).toBe(true);
    const retry = d.tree(root.id).find((n) => n.retryOf === first.id)!;
    expect(retry.assigneeId).toBe("huy"); // người khác trong phòng (trưởng phòng)
    expect(submitted.map((s) => s.agentId)).toEqual(["ha", "huy"]);
    expect(d.get(root.id)!.status).toBe("running");
    finish(retry.id, { status: "done", result: "Làm xong ở lần thử lại" });
    const r = d.get(root.id)!;
    expect(r.status).toBe("done");
    expect(r.review!.failed).toBe(0);
    expect(r.review!.done).toBe(1);
  });

  it("thử lại cũng lỗi → báo lỗi có cấu trúc (khoá i18n giữ nguyên); không thử lần ba", async () => {
    const { d, finish, submitted } = setup();
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    const first = workOf(d, root.id)[0];
    finish(first.id, { status: "failed", error: "lỗi 1", errorKey: "err.ai.allFailed", errorVars: { detail: "x" } });
    const retry = d.tree(root.id).find((n) => n.retryOf === first.id)!;
    finish(retry.id, { status: "failed", error: "lỗi 2", errorKey: "err.ai.allFailed", errorVars: { detail: "y" } });
    expect(submitted).toHaveLength(2);
    const r = d.get(root.id)!;
    expect(r.status).toBe("failed");
    expect(r.review).toMatchObject({ done: 0, failed: 1 });
    expect(r.review!.items[0].error?.key).toBe("err.ai.allFailed");
  });

  it("lỗi xác định (ngân sách, chưa có AI, đã huỷ) KHÔNG thử lại", async () => {
    for (const key of ["err.budget.insufficient", "err.ai.noProvider", "err.task.cancelled"]) {
      const { d, finish, submitted } = setup();
      const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
      finish(workOf(d, root.id)[0].id, { status: "failed", error: "x", errorKey: key });
      expect(submitted, key).toHaveLength(1);
      expect(d.get(root.id)!.status, key).toBe("failed");
    }
  });

  it("chờ duyệt phản ánh lên các cấp trên; từ chối hết → rejected", async () => {
    const { d, finish } = setup();
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    const w = workOf(d, root.id)[0];
    finish(w.id, { status: "awaiting-approval" });
    expect(d.get(root.id)!.status).toBe("awaiting-approval");
    finish(w.id, { status: "rejected", error: "Đã hủy.", errorKey: "err.task.cancelled" });
    expect(d.get(root.id)!.status).toBe("rejected");
  });

  it("giao thẳng cho trưởng phòng: bỏ qua giám đốc; giao cho nhân viên: tự làm; ngôn ngữ truyền xuống", async () => {
    const { d, submitted } = setup();
    const head = await d.assign({ prompt: "việc của phòng", toAgentId: "huy", lang: "en" });
    expect(head.level).toBe(2);
    expect(d.tree(head.id).map((n) => n.assigneeId)).toEqual(["huy", "ha"]);
    const staff = await d.assign({ prompt: "tự làm", toAgentId: "nam" });
    expect(staff.kind).toBe("work");
    expect(staff.parentId).toBeUndefined();
    expect(submitted.map((s) => `${s.agentId}:${s.lang}`)).toEqual(["ha:en", "nam:vi"]);
  });

  it("agent không tồn tại → lỗi; nộp việc thất bại → nút failed, cha cập nhật", async () => {
    const { d, setFail } = setup({ maxRetries: 0 });
    await expect(d.assign({ prompt: "x", toAgentId: "khongco" })).rejects.toThrow();
    setFail(true);
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    await new Promise((r) => setTimeout(r, 10));
    expect(workOf(d, root.id)[0].status).toBe("failed");
    expect(d.get(root.id)!.status).toBe("failed");
  });

  it("việc không thuộc cây giao việc bị bỏ qua; prune xoá gốc đã xong cũ", async () => {
    const { d, finish } = setup();
    d.onTaskUpdate({ id: "x", status: "done" } as TaskRecord);
    expect(d.list()).toHaveLength(0);
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    finish(workOf(d, root.id)[0].id, { status: "done", result: "ok" });
    expect(d.prune(1000 * 60 * 60 * 24 * 365)).toBe(0);
    expect(d.prune(-1)).toBeGreaterThan(0);
    expect(d.list()).toHaveLength(0);
  });

  it("kế hoạch LLM có bước phụ thuộc: bước sau chờ, nhận kết quả bước trước, chạy đúng thứ tự (A6)", async () => {
    const planner: Planner = async () => ({
      source: "llm",
      steps: [
        { department: "automation", task: "Tìm giá đối thủ", dependsOn: [], rationale: "cần dữ liệu" },
        { department: "marketing", task: "Viết bài dựa trên giá đối thủ", dependsOn: [0] },
        { department: "finance", task: "Tính chi phí chiến dịch", dependsOn: [] },
      ],
    });
    const { d, finish, submitted } = setup({ planner });
    const root = await d.assign({ prompt: "Làm chiến dịch", toAgentId: "giamdoc" });
    expect(root.planSource).toBe("llm");
    expect(submitted.map((s) => s.agentId).sort()).toEqual(["bao", "phuc"]); // 2 bước độc lập chạy ngay
    const waitingHead = d.tree(root.id).find((n) => n.department === "marketing" && n.kind === "delegation")!;
    expect(waitingHead.status).toBe("pending");
    expect(waitingHead.waitingFor).toHaveLength(1);

    const research = workOf(d, root.id).find((n) => n.assigneeId === "bao")!;
    finish(research.id, { status: "done", result: "Đối thủ A bán 99k, đối thủ B bán 120k" });
    const mk = submitted.find((s) => s.agentId === "ha")!;
    expect(mk).toBeDefined();
    expect(mk.prompt).toContain("Viết bài dựa trên giá đối thủ");
    expect(mk.prompt).toContain("Kết quả các bước trước");
    expect(mk.prompt).toContain("Đối thủ A bán 99k");
    expect(d.get(waitingHead.id)!.waitingFor).toBeUndefined();
    expect(d.get(waitingHead.id)!.status).toBe("running");
  });

  it("bước phụ thuộc bị lỗi → bước chờ không chạy, báo lỗi rõ (err.dep.failed)", async () => {
    const planner: Planner = async () => ({
      source: "llm",
      steps: [
        { department: "automation", task: "A", dependsOn: [] },
        { department: "marketing", task: "B", dependsOn: [0] },
      ],
    });
    const { d, finish, submitted } = setup({ planner, maxRetries: 0 });
    const root = await d.assign({ prompt: "x", toAgentId: "giamdoc" });
    finish(workOf(d, root.id)[0].id, { status: "failed", error: "lỗi", errorKey: "err.ai.allFailed" });
    expect(submitted.map((s) => s.agentId)).toEqual(["bao"]);
    const b = d.tree(root.id).find((n) => n.department === "marketing")!;
    expect(b.status).toBe("failed");
    expect(b.error?.key).toBe("err.dep.failed");
    expect(d.get(root.id)!.status).toBe("failed");
  });

  it("báo cáo tổng hợp của Giám đốc (A5): gọi summarizer một lần khi cả cây xong; lỗi summarizer không ảnh hưởng", async () => {
    const calls: string[] = [];
    const summarizer: Summarizer = async (i) => {
      calls.push(`${i.lang}:${i.review.done}`);
      return "BÁO CÁO: đã xong hết";
    };
    const { d, finish } = setup({ summarizer });
    const root = await d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc", lang: "en" });
    finish(workOf(d, root.id)[0].id, { status: "done", result: "ok" });
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toEqual(["en:1"]);
    expect(d.get(root.id)!.summary).toBe("BÁO CÁO: đã xong hết");

    const bad = setup({
      summarizer: async () => {
        throw new Error("llm down");
      },
    });
    const root2 = await bad.d.assign({ prompt: "viết bài đăng facebook", toAgentId: "giamdoc" });
    bad.finish(workOf(bad.d, root2.id)[0].id, { status: "done", result: "ok" });
    await new Promise((r) => setTimeout(r, 5));
    expect(bad.d.get(root2.id)!.status).toBe("done");
    expect(bad.d.get(root2.id)!.summary).toBeUndefined();
  });

  it("planner ném lỗi → quay về từ khoá; kế hoạch rỗng → báo không có phòng phù hợp", async () => {
    const boom = setup({
      planner: async () => {
        throw new Error("x");
      },
    });
    const root = await boom.d.assign({ prompt: "báo cáo doanh thu", toAgentId: "giamdoc" });
    expect(root.planSource).toBe("keywords");
    expect(boom.d.tree(root.id).some((n) => n.department === "finance")).toBe(true);

    const empty = setup({ planner: async () => ({ source: "llm", steps: [{ department: "khong-co", task: "x", dependsOn: [] }] }) });
    const r2 = await empty.d.assign({ prompt: "x", toAgentId: "giamdoc" });
    expect(r2.status).toBe("failed");
    expect(r2.error?.key).toBe("err.org.noDepartment");
  });
});

describe("lập kế hoạch bằng LLM (A1, A2, A3, A7)", () => {
  const depts = ["support", "sales", "marketing", "finance", "ai-team", "automation", "library", "dispatch"];
  const reply = (text: string): ChatFn => async () => ({ text, usage: { inputTokens: 10, outputTokens: 10 }, providerId: "mock", model: "m", latencyMs: 1 });

  it("A1: nhận kế hoạch JSON hợp lệ từ LLM, kiểm bằng schema", async () => {
    const planner = makePlanner({
      chat: reply('```json\n{"steps":[{"department":"marketing","task":"Viết kế hoạch chiến dịch","dependsOn":[],"rationale":"nội dung"},{"department":"finance","task":"Dự toán ngân sách","dependsOn":[0]}]}\n```'),
    });
    const plan = await planner({ prompt: "Làm chiến dịch", lang: "vi", departments: depts });
    expect(plan.source).toBe("llm");
    expect(plan.steps.map((s) => s.department)).toEqual(["marketing", "finance"]);
    expect(plan.steps[1].dependsOn).toEqual([0]);
    expect(plan.steps[0].rationale).toBe("nội dung");
  });

  it("A2: LLM lỗi / trả sai định dạng / quá hạn / không có AI → quay về từ khoá", async () => {
    const input = { prompt: "báo cáo chi phí quảng cáo", lang: "vi" as const, departments: depts };
    const failing: ChatFn[] = [
      reply("Xin lỗi, tôi không thể."),
      reply('{"steps": "không phải mảng"}'),
      reply('{"steps":[]}'),
      reply('{"steps":[{"department":"khong-co","task":"x"}]}'),
      async () => {
        throw new Error("HTTP 500");
      },
      () => new Promise(() => undefined),
    ];
    for (const chat of failing) {
      const plan = await makePlanner({ chat, timeoutMs: 30 })(input);
      expect(plan.source).toBe("keywords");
      expect(plan.steps.map((s) => s.department)).toContain("finance");
    }
    expect((await makePlanner({ chat: null })(input)).source).toBe("keywords");
    expect((await makePlanner({ chat: reply("{}"), hasProvider: () => false })(input)).source).toBe("keywords");
  });

  it("A3: lời nhắc gửi LLM yêu cầu đúng ngôn ngữ người dùng", async () => {
    const seen: string[] = [];
    const chat: ChatFn = async (m) => {
      seen.push(m[0].content);
      return { text: '{"steps":[{"department":"sales","task":"x"}]}', usage: { inputTokens: 1, outputTokens: 1 }, providerId: "m", model: "m", latencyMs: 1 };
    };
    await makePlanner({ chat })({ prompt: "p", lang: "en", departments: depts });
    await makePlanner({ chat })({ prompt: "p", lang: "vi", departments: depts });
    expect(seen[0]).toContain("written in English");
    expect(seen[1]).toContain("written in tiếng Việt");
  });

  it("A7: giới hạn — bỏ phòng lạ/phòng Giám đốc, tối đa số bước và số phòng, phụ thuộc chỉ về bước trước, không vòng", () => {
    const steps = [
      { department: "executive", task: "không được", dependsOn: [] },
      { department: "marketing", task: "m", dependsOn: [5, -1, 0, 0] },
      { department: "finance", task: "f", dependsOn: [1, 2] },
      { department: "sales", task: "s", dependsOn: [1] },
      { department: "support", task: "s2", dependsOn: [] },
      { department: "library", task: "vượt quá 4 phòng", dependsOn: [] },
      { department: "marketing", task: "cùng phòng thêm bước", dependsOn: [3] },
      { department: "sales", task: "bước thứ 7 vượt giới hạn 6", dependsOn: [] },
    ];
    const out = sanitizePlan({ steps }, depts)!;
    expect(out.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
    expect(new Set(out.map((s) => s.department)).size).toBeLessThanOrEqual(4);
    expect(out.some((s) => s.department === "executive")).toBe(false);
    out.forEach((s, i) => s.dependsOn.forEach((dep) => expect(dep).toBeLessThan(i)));
    expect(out[0].dependsOn).toEqual([]);
    expect(sanitizePlan({ steps: [] }, depts)).toBeNull();
    expect(sanitizePlan("rác", depts)).toBeNull();
    expect(sanitizePlan({ steps: [{ department: "marketing" }] }, depts)).toBeNull();
  });

  it("summarizer: dùng LLM theo ngôn ngữ; lỗi/không có AI → null", async () => {
    const review = { done: 1, failed: 0, rejected: 0, items: [{ assigneeId: "ha", assigneeName: "Hà", department: "marketing", status: "done" as const, text: "bài viết xong" }] };
    const seen: string[] = [];
    const s = makeSummarizer({
      chat: async (m) => {
        seen.push(m[0].content + m[1].content);
        return { text: "  Báo cáo ngắn  ", usage: { inputTokens: 1, outputTokens: 1 }, providerId: "m", model: "m", latencyMs: 1 };
      },
    });
    expect(await s({ prompt: "Làm bài", lang: "en", review })).toBe("Báo cáo ngắn");
    expect(seen[0]).toContain("English");
    expect(seen[0]).toContain("bài viết xong");
    expect(await makeSummarizer({ chat: null })({ prompt: "x", lang: "vi", review })).toBeNull();
    expect(
      await makeSummarizer({
        chat: async () => {
          throw new Error("x");
        },
      })({ prompt: "x", lang: "vi", review }),
    ).toBeNull();
  });
});
