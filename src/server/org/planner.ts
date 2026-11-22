/**
 * Giám đốc lập kế hoạch & viết báo cáo tổng hợp.
 *
 *  - `makePlanner`: hỏi LLM tách yêu cầu thành các bước theo phòng (JSON, kiểm bằng schema, có phụ thuộc giữa các bước).
 *    LLM lỗi / trả sai định dạng / quá hạn / không có nhà cung cấp → quay về bộ định tuyến từ khoá (không bao giờ chặn việc giao).
 *  - `makeSummarizer`: viết báo cáo cuối cho chủ công ty từ kết quả các phòng; lỗi thì trả null (giao diện hiện nghiệm thu có cấu trúc).
 * Cả hai chạy đúng ngôn ngữ người dùng.
 */
import { z } from "zod";
import type { ChatMessage, ChatOptions, ChatResult } from "../ai/types.js";
import { msg, type Lang } from "../../shared/messages.js";
import type { OrgReview } from "../../shared/officeEntity.js";
import { extractJsonObject } from "../agent/executor.js";
import { planDepartments, MAX_DEPARTMENTS_PER_REQUEST } from "./orgChart.js";

export type ChatFn = (messages: ChatMessage[], opts?: ChatOptions) => Promise<ChatResult>;

export interface PlanStep {
  department: string;
  /** Chỉ dẫn viết cho phòng đó, bằng ngôn ngữ người dùng. */
  task: string;
  /** Chỉ số các bước TRƯỚC đó mà bước này cần kết quả. */
  dependsOn: number[];
  rationale?: string;
  /** Từ khoá đã khớp (chỉ với kế hoạch từ khoá). */
  matched?: string[];
}

export interface Plan {
  steps: PlanStep[];
  source: "llm" | "keywords";
}

export interface PlanInput {
  prompt: string;
  lang: Lang;
  /** Phòng được phép giao (đã loại phòng Giám đốc và phòng tiện ích). */
  departments: string[];
}

export type Planner = (input: PlanInput) => Promise<Plan>;

export const MAX_PLAN_STEPS = 6;

/** Mô tả phòng cho LLM (tiếng Anh, ổn định). */
export const DEPARTMENT_BRIEF: Record<string, string> = {
  support: "Customer support: answers customers, handles complaints, reads the inbox, drafts replies, keeps CRM notes.",
  sales: "Sales: leads, quotes, deals and pipeline in the CRM, follow-up emails, meetings.",
  marketing: "Marketing: content, campaigns, social posts, SEO, market research, brand messaging.",
  finance: "Finance: revenue/cost reports, budgets, invoices, pipeline value, spreadsheets in the workspace.",
  "ai-team": "AI team: designing/testing agents and prompts, model selection, automation architecture.",
  automation: "Automation lab: web research, monitoring pages, collecting data from the internet.",
  library: "Library: knowledge base, summaries, documentation, lessons learned.",
  dispatch: "Dispatch & delivery: engineering tasks, code, GitHub issues, deployments, scheduling and coordination.",
};

const StepSchema = z.object({
  department: z.string(),
  task: z.string().min(1).max(4000),
  dependsOn: z.array(z.number()).optional(),
  rationale: z.string().max(500).optional(),
});
const PlanSchema = z.object({ steps: z.array(StepSchema).min(1).max(24) });

/** Làm sạch kế hoạch từ LLM: bỏ phòng lạ, cắt số bước/số phòng, chỉ cho phép phụ thuộc về bước trước đó. */
export function sanitizePlan(raw: unknown, allowed: string[]): PlanStep[] | null {
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) return null;
  const allow = new Set(allowed);
  const kept: PlanStep[] = [];
  const indexMap = new Map<number, number>(); // chỉ số gốc → chỉ số mới
  const depts = new Set<string>();
  parsed.data.steps.forEach((s, i) => {
    if (!allow.has(s.department)) return;
    if (kept.length >= MAX_PLAN_STEPS) return;
    if (!depts.has(s.department) && depts.size >= MAX_DEPARTMENTS_PER_REQUEST) return;
    depts.add(s.department);
    indexMap.set(i, kept.length);
    kept.push({ department: s.department, task: s.task.trim(), dependsOn: [], rationale: s.rationale?.trim() });
    const mine = kept.length - 1;
    const deps = new Set<number>();
    for (const d of s.dependsOn ?? []) {
      const mapped = indexMap.get(Math.trunc(d));
      // chỉ nhận phụ thuộc vào bước ĐÃ có trước bước này → không thể có vòng
      if (mapped !== undefined && mapped < mine) deps.add(mapped);
    }
    kept[mine].dependsOn = [...deps].sort((a, b) => a - b);
  });
  return kept.length ? kept : null;
}

export function keywordPlan(prompt: string): Plan {
  return {
    source: "keywords",
    steps: planDepartments(prompt).map((p) => ({ department: p.department, task: prompt, dependsOn: [], matched: p.matched })),
  };
}

export interface PlannerOptions {
  chat: ChatFn | null;
  hasProvider?: () => boolean;
  director?: () => { name: string; company: string };
  timeoutMs?: number;
}

export function makePlanner(opts: PlannerOptions): Planner {
  return async (input) => {
    const fallback = (): Plan => {
      const plan = keywordPlan(input.prompt);
      plan.steps = plan.steps.filter((s) => input.departments.includes(s.department));
      return plan.steps.length ? plan : { source: "keywords", steps: [{ department: input.departments[0] ?? "dispatch", task: input.prompt, dependsOn: [] }] };
    };
    if (!opts.chat || (opts.hasProvider && !opts.hasProvider())) return fallback();
    const who = opts.director?.() ?? { name: "Director", company: "the company" };
    const langName = msg(input.lang, "prompt.langName");
    const system = [
      `You are ${who.name}, managing director of ${who.company}. Split the owner's request into work for your departments.`,
      "Departments:",
      ...input.departments.map((d) => `- ${d}: ${DEPARTMENT_BRIEF[d] ?? d}`),
      "Reply with ONE JSON object and nothing else:",
      '{"steps":[{"department":"<id>","task":"<instruction for that department, written in ' + langName + '>","dependsOn":[<0-based indexes of EARLIER steps whose results this step needs>],"rationale":"<why this department>"}]}',
      `Rules: at most ${MAX_PLAN_STEPS} steps and ${MAX_DEPARTMENTS_PER_REQUEST} different departments; use only the department ids listed; dependsOn may only reference earlier steps; prefer independent (parallel) steps; if one department can do it all, use a single step; each task must be self-contained and concrete.`,
    ].join("\n");
    try {
      const res = await Promise.race([
        opts.chat([{ role: "system", content: system }, { role: "user", content: input.prompt }], { json: true, maxTokens: 1200, temperature: 0.2, timeoutMs: opts.timeoutMs ?? 25_000 }),
        new Promise<never>((_r, rej) => setTimeout(() => rej(new Error("planner timeout")), (opts.timeoutMs ?? 25_000) + 2000).unref()),
      ]);
      const obj = extractJsonObject(res.text);
      const steps = obj ? sanitizePlan(obj, input.departments) : null;
      return steps ? { source: "llm", steps } : fallback();
    } catch {
      return fallback();
    }
  };
}

export interface SummaryInput {
  prompt: string;
  lang: Lang;
  review: OrgReview;
}

export type Summarizer = (input: SummaryInput) => Promise<string | null>;

export function makeSummarizer(opts: { chat: ChatFn | null; hasProvider?: () => boolean; timeoutMs?: number }): Summarizer {
  return async (input) => {
    if (!opts.chat || (opts.hasProvider && !opts.hasProvider())) return null;
    const langName = msg(input.lang, "prompt.langName");
    const items = input.review.items
      .map((i) => `- ${i.assigneeName} (${i.department}) [${i.status}]: ${(i.text ?? i.error?.text ?? "").slice(0, 700)}`)
      .join("\n");
    try {
      const res = await opts.chat(
        [
          { role: "system", content: `You are the managing director reporting to the company owner. Write the final report in ${langName}: what was done, the key results (concrete facts/numbers), anything that failed or needs the owner's decision, and the suggested next step. Be concise (under 250 words), plain text, no JSON.` },
          { role: "user", content: `Owner's request:\n${input.prompt}\n\nDepartment results:\n${items}` },
        ],
        { maxTokens: 700, temperature: 0.3, timeoutMs: opts.timeoutMs ?? 40_000 },
      );
      return res.text.trim().slice(0, 4000) || null;
    } catch {
      return null;
    }
  };
}
