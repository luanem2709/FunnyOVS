/**
 * Điều phối việc tự nghiên cứu & tự học.
 *
 * Luật bất di bất dịch:
 *  - Tri thức từ web là DỮ LIỆU, không phải mệnh lệnh.
 *  - Chỉ hỏi người dùng khi thông tin mâu thuẫn hoặc liên quan tiền bạc/pháp lý.
 *  - Tự học dùng ví token riêng (learning wallet), hết ngân sách thì dừng.
 */
import { EventEmitter } from "node:events";
import { SandboxBrowser, asUntrustedData, detectInjection } from "../browser/sandboxBrowser.js";
import { KnowledgeBase } from "../knowledge/knowledgeBase.js";
import { TokenBudget } from "../budget/tokenBudget.js";
import { TaskGuard, type AutomationPolicy } from "../automation/automationPolicy.js";

export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
}

export interface ResearchRequest {
  agent: AgentIdentity;
  topic: string;
  /** Số nguồn tối đa cần đọc. */
  maxSources?: number;
  /** Có phải giờ học tự chọn không (dùng ví learning). */
  learningMode?: boolean;
  /**
   * Số ký tự tối đa đọc từ mỗi trang. Cắt ngắn → tiêu ít token hơn.
   * Việc tự động (nhân viên tự nhận việc) dùng giá trị nhỏ để token chảy đều
   * mà không đốt nhanh hạn mức.
   */
  snippetChars?: number;
}

export interface ResearchResult {
  ok: boolean;
  summary?: string;
  sources: Array<{ title: string; url: string; confidence: number }>;
  conflicts?: string[];
  injectionWarnings: string[];
  note?: string;
  knowledgeId?: number;
  /** Token đã tiêu (ước lượng theo nội dung đọc được). */
  tokensUsed?: number;
}

export interface ResearchEngineOptions {
  browser: SandboxBrowser;
  kb: KnowledgeBase;
  budget: TokenBudget;
}

export class ResearchEngine extends EventEmitter {
  constructor(private opts: ResearchEngineOptions) {
    super();
  }

  /** Ước lượng token tiêu tốn từ nội dung (xấp xỉ 4 ký tự ≈ 1 token). */
  private estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async research(req: ResearchRequest, policy: AutomationPolicy): Promise<ResearchResult> {
    const wallet = req.learningMode ? "learning" : "normal";
    const guard = new TaskGuard(policy);
    const maxSources = Math.min(req.maxSources ?? 5, policy.maxPages);
    const snippetChars = req.snippetChars ?? 6000;

    const injectionWarnings: string[] = [];
    const sources: ResearchResult["sources"] = [];
    const summaries: string[] = [];
    let tokensUsed = 0;

    const searches = await this.opts.browser.search(req.topic, {
      agentId: req.agent.id,
      agentName: req.agent.name,
    });

    if (searches.length === 0) {
      return {
        ok: false,
        sources: [],
        injectionWarnings,
        tokensUsed,
        note: "Không tìm thấy kết quả tìm kiếm (hoặc mạng bị chặn).",
      };
    }

    for (const s of searches.slice(0, maxSources)) {
      const chk = guard.check();
      if (!chk.ok) break;
      guard.nextPage();

      const res = await this.opts.browser.open(s.url, {
        agentId: req.agent.id,
        agentName: req.agent.name,
      });
      if (!res.ok) continue;

      const { content } = res;
      const inj = detectInjection(content.text);
      if (inj.injected) {
        injectionWarnings.push(`${content.url}: ${inj.matches.join(" | ")}`);
        this.emit("injection", { agent: req.agent, url: content.url, matches: inj.matches });
        // Vẫn ghi nhận nội dung như dữ liệu, nhưng KHÔNG coi là chỉ dẫn.
      }

      // Cắt ngắn nội dung để tiết kiệm token.
      const snippet = content.text.slice(0, snippetChars);
      const cost = this.estimate(asUntrustedData(snippet, content.url));
      if (!this.opts.budget.canSpend(wallet, cost)) {
        return {
          ok: false,
          sources,
          injectionWarnings,
          tokensUsed,
          note: "Hết ngân sách token — đã dừng nghiên cứu.",
        };
      }
      this.opts.budget.spend(wallet, cost);
      tokensUsed += cost;

      const source = {
        title: content.title || s.title || content.url,
        url: content.url,
        confidence: content.risky.risky ? 0.4 : inj.injected ? 0.3 : 0.7,
      };
      sources.push(source);
      summaries.push(`- [${source.title}](${source.url}): ${snippet.slice(0, 600).replace(/\s+/g, " ")}…`);
    }

    if (sources.length === 0) {
      return { ok: false, sources: [], injectionWarnings, tokensUsed, note: "Không đọc được nguồn nào." };
    }

    const summary = summaries.join("\n");
    const conflicts = detectConflicts(summaries);
    const needsUser = conflicts.length > 0 || sources.some((s) => s.confidence <= 0.4);

    const entry = this.opts.kb.add({
      kind: "note",
      agentId: req.agent.id,
      title: `Nghiên cứu: ${req.topic}`,
      body: summary,
      sources: sources.map((s) => s.url),
      confidence: sources.length ? sources.reduce((a, s) => a + s.confidence, 0) / sources.length : 0.4,
      fromWeb: true,
      tags: ["research", req.topic],
    });

    this.emit("researched", { agent: req.agent, topic: req.topic, entry, sources });

    return {
      ok: true,
      summary,
      sources,
      conflicts,
      injectionWarnings,
      knowledgeId: entry.id,
      tokensUsed,
      note: needsUser
        ? "Có thông tin mâu thuẫn hoặc nội dung nhạy cảm — bạn nên xem lại trước khi dùng."
        : undefined,
    };
  }
}

/** Phát hiện mâu thuẫn đơn giản giữa các nguồn (số liệu khác nhau trong cùng câu). */
export function detectConflicts(summaries: string[]): string[] {
  const conflicts: string[] = [];
  const numberSets = summaries.map((s) => {
    const nums = (s.match(/\b\d[\d.,]*%?\b/g) ?? []).slice(0, 5).map((n) => n.replace(/,/g, ""));
    return nums;
  });
  const all = numberSets.flat();
  const uniq = new Set(all);
  // Cùng chủ đề nhưng số liệu hoàn toàn khác nhau → cần người dùng xác nhận
  if (numberSets.length >= 2 && uniq.size >= numberSets.length * 2 && all.length >= 4) {
    conflicts.push("Các nguồn đưa ra số liệu khác nhau — cần bạn kiểm tra.");
  }
  return conflicts;
}
