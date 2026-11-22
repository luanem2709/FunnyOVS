/**
 * OrgDispatcher — đẩy việc xuống theo tầng và nghiệm thu ngược lên.
 *
 *   Người dùng ──► Giám đốc ──► Trưởng phòng (mỗi phòng liên quan) ──► Nhân viên (ít việc nhất)
 *                    ▲                │                                  │
 *                    └── nghiệm thu ◄─┴────────── kết quả ◄───────────────┘
 *
 *  - Giám đốc lập kế hoạch bằng LLM (có dự phòng từ khoá); kế hoạch có thể có bước phụ thuộc (kết quả bước trước đưa vào bước sau).
 *  - Nút `delegation` (Giám đốc/Trưởng phòng) chỉ phân việc: không gọi LLM để chạy việc, không tốn token thực thi.
 *  - Nút `work` là việc thật, nộp qua TaskRunner → mọi chốt chặn cũ vẫn áp dụng (ước lượng, duyệt, ngân sách, dừng khẩn cấp).
 *  - Việc lỗi (không phải do ngân sách/chưa có AI) được thử lại MỘT lần với người khác trong phòng; bản bị thay thế không tính vào nghiệm thu.
 *  - Độ sâu cố định 3 tầng, chỉ đi xuống: không có vòng lặp giao việc.
 *  - Mỗi cấp nghiệm thu có CẤU TRÚC (client định dạng theo ngôn ngữ); khi cả cây xong, Giám đốc viết báo cáo tổng hợp (LLM, tuỳ chọn).
 */
import type { AgentRegistry, AgentState } from "../agents/agentRegistry.js";
import type { TaskRecord } from "../tasks/taskRunner.js";
import { OrgNode as OrgNodeSchema, type I18nMessage, type OrgNode, type OrgReview, type OrgStatus } from "../../shared/officeEntity.js";
import { msg, normalizeLang, type Lang } from "../../shared/messages.js";
import { directorOf, headOf, pickAssignee } from "./orgChart.js";
import { keywordPlan, type Planner, type PlanStep, type Summarizer } from "./planner.js";

export interface DispatcherDeps {
  registry: Pick<AgentRegistry, "list" | "get">;
  /** Nộp một việc thật cho agent. `ref` = id nút để ghép lại khi TaskRecord cập nhật. */
  submit(input: {
    title: string;
    prompt: string;
    agentId: string;
    agentName: string;
    department: string;
    ref: string;
    lang: Lang;
  }): Promise<TaskRecord>;
  /** Số việc đang mở của một agent (ngoài cây giao việc này cũng tính). */
  openTasksOf(agentId: string): number;
  /** Phát một nút đã tạo/đổi. */
  emit(node: OrgNode): void;
  now?: () => Date;
  planner?: Planner;
  summarizer?: Summarizer;
  /** Số lần thử lại tối đa cho mỗi việc (mặc định 1). */
  maxRetries?: number;
  /** Phòng được phép nhận việc từ Giám đốc. Mặc định: mọi phòng có trưởng phòng, trừ phòng Giám đốc. */
  departments?: () => string[];
}

const TERMINAL: ReadonlySet<OrgStatus> = new Set(["done", "failed", "rejected"]);
/** Lỗi mang tính xác định — thử lại với người khác cũng vô ích. */
const NO_RETRY_KEYS = ["err.budget", "err.ai.noProvider", "err.task.cancelled", "err.cursor.notFound", "err.cursor.notLoggedIn"];

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

interface Meta {
  prompt: string;
  lang: Lang;
  attempts: number;
  /** Với nút gốc: yêu cầu gốc của người dùng (dùng cho báo cáo). */
  original?: string;
}

interface Waiting {
  headNode: OrgNode;
  head: AgentState;
  step: PlanStep;
  deps: string[]; // id các nút trưởng phòng mà bước này chờ
  planSource: "llm" | "keywords";
  director: AgentState;
  lang: Lang;
}

export class OrgDispatcher {
  private nodes = new Map<string, OrgNode>();
  private meta = new Map<string, Meta>();
  private waiting = new Map<string, Waiting>();
  private summarized = new Set<string>();
  private seq = 0;

  constructor(private readonly deps: DispatcherDeps) {}

  list(): OrgNode[] {
    return [...this.nodes.values()];
  }

  get(id: string): OrgNode | undefined {
    return this.nodes.get(id);
  }

  /** Cây của một gốc (gốc + mọi hậu duệ), theo thứ tự duyệt sâu. */
  tree(rootId: string): OrgNode[] {
    const out: OrgNode[] = [];
    const walk = (id: string): void => {
      const n = this.nodes.get(id);
      if (!n) return;
      out.push(n);
      n.childIds.forEach(walk);
    };
    walk(rootId);
    return out;
  }

  private now(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private create(input: Partial<OrgNode> & Pick<OrgNode, "level" | "kind" | "assigneeId" | "assigneeName" | "department" | "title">): OrgNode {
    const at = this.now();
    const node: OrgNode = { status: "pending", ...input, id: `org_${++this.seq}`, childIds: [], createdAt: at, updatedAt: at };
    this.nodes.set(node.id, node);
    const parent = node.parentId ? this.nodes.get(node.parentId) : undefined;
    parent?.childIds.push(node.id);
    this.deps.emit(node);
    // Cha vừa có thêm con: phát lại cha (sau con) để người nhận không giữ danh sách `childIds` cũ — nếu không, bảng việc / bộ phát hiện họp
    // phía client chỉ thấy con của cha khi trạng thái cha đổi lần kế tiếp. Nhãn "đang làm" của cha cũng chuyển từ "lập kế hoạch" sang "phân việc" đúng lúc.
    if (parent) this.deps.emit(parent);
    return node;
  }

  private update(node: OrgNode, patch: Partial<OrgNode>): void {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify((node as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)) {
        (node as unknown as Record<string, unknown>)[k] = v;
        changed = true;
      }
    }
    if (!changed) return;
    node.updatedAt = this.now();
    this.deps.emit(node);
  }

  private allowedDepartments(): string[] {
    if (this.deps.departments) return this.deps.departments();
    const agents = this.deps.registry.list();
    return [...new Set(agents.filter((a) => a.tier === 2).map((a) => a.department))];
  }

  /**
   * Giao việc cho một agent bất kỳ (ai cũng có thể được giao trực tiếp):
   *  - Giám đốc: lập kế hoạch → trưởng phòng từng phòng → nhân viên.
   *  - Trưởng phòng: giao xuống nhân viên của phòng mình.
   *  - Nhân viên: tự làm.
   * Trả về nút gốc sau khi kế hoạch đã được dựng; các việc thật chạy ngầm (không chờ xong).
   */
  async assign(input: { title?: string; prompt: string; toAgentId: string; lang?: string }): Promise<OrgNode> {
    const agent = this.deps.registry.get(input.toAgentId);
    if (!agent) throw new Error(`Không có nhân viên "${input.toAgentId}".`);
    const lang = normalizeLang(input.lang);
    const title = clip(input.title?.trim() || input.prompt, 70);
    const agents = this.deps.registry.list();

    if (agent.tier === 3) return this.startWork(undefined, agent, title, input.prompt, lang);

    if (agent.tier === 2) {
      const root = this.create({ level: 2, kind: "delegation", assigneeId: agent.id, assigneeName: agent.name, department: agent.department, title });
      this.meta.set(root.id, { prompt: input.prompt, lang, attempts: 0, original: input.prompt });
      this.update(root, { status: "running" });
      this.delegateToStaff(root, agent, title, input.prompt, lang, agents);
      this.rollup(root.id);
      return root;
    }

    // Giám đốc
    const root = this.create({ level: 1, kind: "delegation", assigneeId: agent.id, assigneeName: agent.name, department: agent.department, title });
    this.meta.set(root.id, { prompt: input.prompt, lang, attempts: 0, original: input.prompt });
    this.update(root, { status: "running" });

    const departments = this.allowedDepartments();
    let plan;
    try {
      plan = await (this.deps.planner ?? (async () => keywordPlan(input.prompt)))({ prompt: input.prompt, lang, departments });
    } catch {
      plan = keywordPlan(input.prompt);
    }
    plan.steps = plan.steps.filter((s) => headOf(agents, s.department));
    this.update(root, { planSource: plan.source });

    const headNodes: OrgNode[] = [];
    plan.steps.forEach((step, i) => {
      const head = headOf(agents, step.department)!;
      const headNode = this.create({
        parentId: root.id,
        level: 2,
        kind: "delegation",
        assigneeId: head.id,
        assigneeName: head.name,
        department: head.department,
        title: clip(step.task, 70),
        rationale: step.rationale,
      });
      this.meta.set(headNode.id, { prompt: step.task, lang, attempts: 0 });
      headNodes.push(headNode);
      const deps = step.dependsOn.filter((d) => d >= 0 && d < i).map((d) => headNodes[d].id);
      const w: Waiting = { headNode, head, step, deps, planSource: plan.source, director: agent, lang };
      if (deps.length) {
        this.update(headNode, { waitingFor: deps });
        this.waiting.set(headNode.id, w);
      } else {
        this.startStep(w, "");
      }
    });

    if (root.childIds.length === 0) {
      this.update(root, { status: "failed", error: { key: "err.org.noDepartment", text: msg("vi", "err.org.noDepartment") } });
      return root;
    }
    this.rollup(root.id);
    return root;
  }

  /** Bắt đầu một bước của kế hoạch: trưởng phòng nhận và giao xuống nhân viên. */
  private startStep(w: Waiting, previousResults: string): void {
    const { headNode, head, step, lang } = w;
    this.update(headNode, { status: "running", waitingFor: undefined });
    const matched = step.matched?.length ? msg(lang, "prompt.matched", { kw: step.matched.join(", ") }) : "";
    const prompt =
      `${step.task}\n\n` +
      msg(lang, "prompt.delegated", { director: w.director.name, tier: msg(lang, "tier.1"), dept: msg(lang, `dept.${step.department}`), matched }) +
      (previousResults ? `\n\n${msg(lang, "prompt.prevResults")}\n${previousResults}` : "");
    this.meta.set(headNode.id, { prompt, lang, attempts: 0 });
    this.delegateToStaff(headNode, head, headNode.title, prompt, lang, this.deps.registry.list());
    this.rollup(headNode.id);
  }

  /** Mở các bước đang chờ khi phụ thuộc của chúng đã kết thúc. */
  private kick(): void {
    for (const [id, w] of [...this.waiting]) {
      const deps = w.deps.map((d) => this.nodes.get(d)).filter((n): n is OrgNode => Boolean(n));
      if (!deps.every((d) => TERMINAL.has(d.status))) continue;
      this.waiting.delete(id);
      if (deps.some((d) => d.status !== "done")) {
        this.update(w.headNode, { status: "failed", waitingFor: undefined, error: { key: "err.dep.failed", text: msg("vi", "err.dep.failed") } });
        this.rollup(w.headNode.parentId!);
        continue;
      }
      const prev = deps.map((d) => `• ${d.assigneeName}: ${clip(d.result ?? "", 800)}`).join("\n");
      this.startStep(w, prev);
    }
  }

  /** Trưởng phòng chọn nhân viên ít việc nhất (hoặc tự làm) rồi nộp việc thật. */
  private delegateToStaff(headNode: OrgNode, head: AgentState, title: string, prompt: string, lang: Lang, agents: AgentState[]): void {
    const who = pickAssignee(agents, head.department, (id) => this.load(id));
    this.startWork(headNode, who, title, prompt, lang);
  }

  private load(id: string): number {
    let pending = 0;
    for (const n of this.nodes.values()) if (n.kind === "work" && n.assigneeId === id && !TERMINAL.has(n.status) && !n.superseded) pending++;
    return this.deps.openTasksOf(id) + pending;
  }

  private startWork(parent: OrgNode | undefined, who: AgentState, title: string, prompt: string, lang: Lang, retryOf?: OrgNode): OrgNode {
    const node = this.create({ parentId: parent?.id, level: who.tier, kind: "work", assigneeId: who.id, assigneeName: who.name, department: who.department, title, retryOf: retryOf?.id });
    this.meta.set(node.id, { prompt, lang, attempts: (retryOf ? (this.meta.get(retryOf.id)?.attempts ?? 0) + 1 : 0) });
    this.deps
      .submit({ title, prompt, agentId: who.id, agentName: who.name, department: who.department, ref: node.id, lang })
      .then((t) => this.onTaskUpdate(t))
      .catch((err: unknown) => {
        const text = err instanceof Error ? err.message : String(err);
        this.update(node, { status: "failed", error: { text } });
        if (node.parentId) this.rollup(node.parentId);
        this.kick();
      });
    return node;
  }

  /** Gọi mỗi khi một TaskRecord đổi (TaskRunner.onUpdate). Bỏ qua việc không thuộc cây giao việc. */
  onTaskUpdate(t: TaskRecord): void {
    const ref = t.ref;
    if (!ref) return;
    const node = this.nodes.get(ref);
    if (!node || node.kind !== "work") return;
    const status: OrgStatus =
      t.status === "done" ? "done" : t.status === "failed" ? "failed" : t.status === "rejected" ? "rejected" : t.status === "awaiting-approval" ? "awaiting-approval" : t.status === "running" ? "running" : "pending";
    const error: I18nMessage | undefined = t.error ? { key: t.errorKey, vars: t.errorVars, text: t.error } : undefined;
    this.update(node, { status, taskId: t.id, result: t.status === "done" && t.result ? clip(t.result, 3000) : node.result, error });
    if (status === "failed" && this.maybeRetry(node, t)) return;
    if (node.parentId) this.rollup(node.parentId);
    this.kick();
  }

  /** Thử lại một lần với người khác trong phòng. Trả true nếu đã tạo bản thử lại (cha chưa cần nghiệm thu). */
  private maybeRetry(node: OrgNode, t: TaskRecord): boolean {
    const meta = this.meta.get(node.id);
    const max = this.deps.maxRetries ?? 1;
    if (!meta || !node.parentId || meta.attempts >= max || node.superseded) return false;
    if (t.errorKey && NO_RETRY_KEYS.some((k) => t.errorKey!.startsWith(k))) return false;
    const agents = this.deps.registry.list();
    const failedAgent = agents.find((a) => a.id === node.assigneeId);
    if (!failedAgent) return false;
    const pool = agents.filter((a) => a.department === failedAgent.department && a.tier >= 2 && a.id !== failedAgent.id);
    const who = pool.sort((a, b) => this.load(a.id) - this.load(b.id))[0] ?? failedAgent;
    this.update(node, { superseded: true });
    this.startWork(this.nodes.get(node.parentId), who, node.title, meta.prompt, meta.lang, node);
    return true;
  }

  /** Tính lại trạng thái của nút cha từ các nút con; nghiệm thu khi tất cả đã kết thúc; rồi đi tiếp lên trên. */
  private rollup(id: string): void {
    const node = this.nodes.get(id);
    if (!node || node.kind !== "delegation") return;
    const kids = node.childIds.map((c) => this.nodes.get(c)).filter((k): k is OrgNode => Boolean(k) && !k!.superseded);
    if (kids.length === 0) return;

    const wasTerminal = TERMINAL.has(node.status);
    if (kids.every((k) => TERMINAL.has(k.status))) {
      const failed = kids.filter((k) => k.status === "failed").length;
      const rejected = kids.filter((k) => k.status === "rejected").length;
      const done = kids.filter((k) => k.status === "done").length;
      const review: OrgReview = {
        done,
        failed,
        rejected,
        items: kids.map((k) => ({
          assigneeId: k.assigneeId,
          assigneeName: k.assigneeName,
          department: k.department,
          status: k.status,
          text: k.result ? clip(k.result, 1200) : undefined,
          error: k.error,
        })),
      };
      const status: OrgStatus = failed > 0 ? "failed" : done === 0 && rejected > 0 ? "rejected" : "done";
      const result = kids
        .filter((k) => k.status === "done" && k.result)
        .map((k) => k.result as string)
        .join("\n\n");
      // Nút cha lỗi mang theo nguyên nhân từ nút con lỗi đầu tiên để các cấp trên thấy được lỗi gốc.
      const cause = status === "failed" ? kids.find((k) => k.status === "failed")?.error : undefined;
      this.update(node, { status, review, result: result ? clip(result, 3000) : undefined, error: cause });
      if (!node.parentId && !wasTerminal) this.maybeSummarize(node, review);
    } else if (kids.some((k) => k.status === "awaiting-approval") && kids.every((k) => k.status === "awaiting-approval" || TERMINAL.has(k.status))) {
      this.update(node, { status: "awaiting-approval" });
    } else {
      this.update(node, { status: "running" });
    }
    if (node.parentId) this.rollup(node.parentId);
  }

  private maybeSummarize(root: OrgNode, review: OrgReview): void {
    if (!this.deps.summarizer || this.summarized.has(root.id)) return;
    this.summarized.add(root.id);
    const meta = this.meta.get(root.id);
    void this.deps
      .summarizer({ prompt: meta?.original ?? root.title, lang: meta?.lang ?? "vi", review })
      .then((s) => {
        if (s) this.update(root, { summary: s });
      })
      .catch(() => undefined);
  }

  /**
   * Nạp lại cây đã lưu (sau khi khởi động lại). Nút sai schema bị bỏ; nút còn đang chạy được đánh dấu
   * "lỗi do gián đoạn" vì tiến trình chạy việc không còn. Trả số nút đã nạp.
   */
  restore(raw: unknown): number {
    if (!Array.isArray(raw)) return 0;
    let maxSeq = this.seq;
    let loaded = 0;
    for (const item of raw.slice(-2000)) {
      const parsed = OrgNodeSchema.safeParse(item);
      if (!parsed.success) continue;
      const n = parsed.data as OrgNode;
      if (!TERMINAL.has(n.status)) {
        n.status = "failed";
        n.waitingFor = undefined;
        n.error = n.error ?? { key: "err.org.interrupted", text: msg("vi", "err.org.interrupted") };
      }
      this.nodes.set(n.id, n);
      const num = Number(/^org_(\d+)$/.exec(n.id)?.[1] ?? 0);
      if (num > maxSeq) maxSeq = num;
      loaded++;
    }
    this.seq = maxSeq;
    for (const n of this.nodes.values()) n.childIds = n.childIds.filter((c) => this.nodes.has(c));
    return loaded;
  }

  /** Còn nút chưa kết thúc (đang chờ/chạy/chờ duyệt)? Khôi phục sao lưu bị từ chối khi đang có việc chạy. */
  busy(): boolean {
    for (const n of this.nodes.values()) if (!TERMINAL.has(n.status) && !n.superseded) return true;
    return false;
  }

  /** Thay TOÀN BỘ cây bằng bản đã lưu (khôi phục sao lưu). Trả số nút đã nạp. */
  replaceAll(raw: unknown): number {
    this.nodes.clear();
    this.meta.clear();
    this.waiting.clear();
    this.summarized.clear();
    this.seq = 0;
    return this.restore(raw);
  }

  /** Dùng để dọn cây cũ: xoá gốc đã xong quá `maxAgeMs`. Trả số nút đã xoá. */
  prune(maxAgeMs: number): number {
    const cutoff = (this.deps.now?.() ?? new Date()).getTime() - maxAgeMs;
    let removed = 0;
    for (const n of [...this.nodes.values()]) {
      if (n.parentId || !TERMINAL.has(n.status) || new Date(n.updatedAt).getTime() > cutoff) continue;
      for (const t of this.tree(n.id)) {
        this.nodes.delete(t.id);
        this.meta.delete(t.id);
        removed++;
      }
    }
    return removed;
  }

  /** Giám đốc hiện tại (tiện cho API). */
  director(): AgentState | undefined {
    return directorOf(this.deps.registry.list());
  }
}
