/**
 * Economic Autonomy Layer (EAL) — dịch vụ điều phối. Giai đoạn 1: CHỈ NHẬN tiền; mọi thứ "ra ngoài" hoặc "tốn tiền" là ĐỀ XUẤT chờ người duyệt.
 *
 * Đi qua các cơ chế an toàn sẵn có, không thay đổi chúng:
 *  - Hộp duyệt `ActionGate` (hết hạn 10 phút = từ chối): xuất bản sản phẩm, đề xuất cơ hội của Scout, đề xuất tái đầu tư.
 *  - Nhật ký bảo mật (`AuditLog`) cho mọi quyết định/giao dịch + sổ cái băm nối riêng (`EconomyLedger`) cho dòng tiền.
 *  - Dừng khẩn cấp: `emergency()` bật → không phục vụ (HTTP 503, không thu tiền), không chạy chu kỳ, không nhận đề xuất; `gate.denyAll()` do main.ts lo.
 *  - Scout là nhân viên Phòng Tài chính chạy qua lịch việc lặp lại + TaskRunner (ước lượng token, duyệt, ngân sách như mọi việc khác).
 * Chu kỳ kinh tế: doanh thu − (suy luận + hạ tầng + chi phí người vận hành tự ghi). Lỗ N chu kỳ liên tiếp → tự tạm dừng Scout và báo người vận hành.
 */
import fs from "node:fs";
import path from "node:path";
import type { ActionGate, ActionOutcome } from "../agent/gate.js";
import type { AuditLog } from "../security/audit.js";
import { ValidationError } from "../../shared/validation.js";
import {
  REINVEST_OPTIONS,
  OPPORTUNITY_RISKS,
  TOPIC_RE,
  formatUsd,
  usdToMicro,
  type CycleSummary,
  type EconomyEvent,
  type EconomyEventKind,
  type EconomyState,
  type Opportunity,
  type OpportunityRisk,
  type RailId,
} from "../../shared/economy.js";
import { EconomyLedger } from "./ledger.js";
import { STRIPE_MIN_MICRO, type Headers, type PaymentRail } from "./payment.js";
import { ProductStore, privacyProblem, readTopic } from "./products.js";

export interface EconomyConfig {
  /** Giá tối đa một sản phẩm (micro-USD). Mặc định 5 USD — giai đoạn 1 chỉ số tiền nhỏ. */
  maxPriceMicro: number;
  /** Số chu kỳ lỗ liên tiếp trước khi tự tạm dừng Scout. */
  negativeLimit: number;
  /** Chu kỳ đánh giá (giờ). */
  loopHours: number;
  /** Đơn giá QUY ƯỚC của token (micro-USD / triệu token) — nguồn AI miễn phí không tốn tiền thật nhưng vẫn có chi phí cơ hội. */
  tokenPriceMicroPerMTok: number;
  /** Chi phí hạ tầng quy ước mỗi ngày (điện, máy chạy) — micro-USD. */
  computeMicroPerDay: number;
  /** Tối đa bao nhiêu phần thặng dư được đề xuất tái đầu tư (0..1). */
  reinvestShare: number;
  /** Số đề xuất chờ duyệt tối đa cùng lúc. */
  maxPending: number;
  /** Chỉ đề xuất tái đầu tư khi khoản đề xuất ≥ mức này (micro-USD) — tránh làm phiền người duyệt vì vài xu. */
  reinvestMinMicro: number;
  /** Tối thiểu bao nhiêu giờ giữa hai lần đề xuất tái đầu tư. */
  reinvestCooldownHours: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv): EconomyConfig {
  const num = (v: string | undefined, d: number, min: number, max: number): number => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  return {
    maxPriceMicro: usdToMicro(num(env.ECONOMY_MAX_PRICE_USD, 5, 0.01, 100)),
    negativeLimit: Math.round(num(env.ECONOMY_NEGATIVE_CYCLES, 3, 1, 30)),
    loopHours: num(env.ECONOMY_LOOP_HOURS, 6, 1 / 60, 168),
    tokenPriceMicroPerMTok: usdToMicro(num(env.ECONOMY_TOKEN_PRICE_USD_PER_MTOK, 0.5, 0, 100)),
    computeMicroPerDay: usdToMicro(num(env.ECONOMY_COMPUTE_USD_PER_DAY, 0.1, 0, 100)),
    reinvestShare: num(env.ECONOMY_REINVEST_SHARE, 0.5, 0, 1),
    maxPending: 10,
    reinvestMinMicro: usdToMicro(num(env.ECONOMY_REINVEST_MIN_USD, 1, 0, 1000)),
    reinvestCooldownHours: num(env.ECONOMY_REINVEST_COOLDOWN_HOURS, 24, 0, 720),
  };
}

export interface ScoutControl {
  /** Bật/tắt lịch Scout (qua Scheduler). */
  setActive(on: boolean): void;
  active(): boolean;
}

export interface EconomyDeps {
  dataDir: string;
  workspace: () => string;
  rail?: PaymentRail;
  /** Lý do cấu hình rail sai (hiển thị cho người vận hành). */
  railError?: string;
  gate: ActionGate;
  audit: AuditLog;
  emergency: () => boolean;
  /** Người đại diện Phòng Tài chính trong hộp duyệt (Trưởng phòng Tài chính). */
  desk: () => { id: string; name: string };
  /** Tên/email liên hệ CRM để quét riêng tư trước khi bán. */
  contactTerms: () => string[];
  secretValues?: () => string[];
  /** Số token đã dùng cho Phòng Tài chính từ thời điểm `sinceMs` (từ sổ cái token). */
  tokensSince: (sinceMs: number) => number;
  scouts?: ScoutControl;
  onState?: (s: EconomyState) => void;
  onEvent?: (e: EconomyEvent) => void;
  config: EconomyConfig;
  now?: () => number;
  ledger?: EconomyLedger;
}

interface Persisted {
  paused: boolean;
  pausedReason?: "negative" | "operator";
  negativeStreak: number;
  lastCycleAt?: string;
  lastCycle?: CycleSummary;
  reinvestIdx: number;
  /** Scout có đang bật lúc bị tạm dừng không (để tiếp tục thì bật lại đúng như trước). */
  scoutsBeforePause?: boolean;
  lastReinvestAt?: string;
}

export interface PublicResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const RISK_WEIGHT: Record<OpportunityRisk, number> = { low: 1, medium: 0.6, high: 0.3 };
const short = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class EconomyService {
  readonly ledger: EconomyLedger;
  readonly products: ProductStore;
  private readonly now: () => number;
  private st: Persisted;
  private opportunities: Opportunity[] = [];
  private recent: EconomyEvent[] = [];
  private usedProofs = new Set<string>();
  private lastQuote = new Map<string, number>();
  private lastFailure = 0;
  private evSeq = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly stateFile: string;

  constructor(private readonly d: EconomyDeps) {
    this.now = d.now ?? Date.now;
    this.ledger = d.ledger ?? new EconomyLedger(path.join(d.dataDir, "economy.ledger.jsonl"), d.secretValues ?? (() => []), this.now);
    this.products = new ProductStore(path.join(d.dataDir, "economy-products.json"));
    this.stateFile = path.join(d.dataDir, "economy-state.json");
    this.st = this.loadState();
    for (const r of this.ledger.tail(12).reverse()) this.recent.push({ id: `ev_${++this.evSeq}`, at: r.at, kind: r.kind, amount: r.amount, topic: r.topic, rail: r.rail, ref: r.ref, note: r.note });
  }

  // ------------------------------------------------------------------ trạng thái

  private loadState(): Persisted {
    try {
      const raw = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as Partial<Persisted>;
      return { paused: Boolean(raw.paused), pausedReason: raw.pausedReason, negativeStreak: Number(raw.negativeStreak) || 0, lastCycleAt: raw.lastCycleAt, lastCycle: raw.lastCycle, reinvestIdx: Number(raw.reinvestIdx) || 0, scoutsBeforePause: raw.scoutsBeforePause, lastReinvestAt: raw.lastReinvestAt };
    } catch {
      return { paused: false, negativeStreak: 0, reinvestIdx: 0 };
    }
  }

  private saveState(): void {
    try {
      fs.mkdirSync(this.d.dataDir, { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.st), { encoding: "utf8", mode: 0o600 });
    } catch {
      /* không làm hỏng việc chính */
    }
  }

  get enabled(): boolean {
    return Boolean(this.d.rail);
  }

  /** Tổng chi phí: các chu kỳ đã chốt + chi phí người vận hành ghi sau chu kỳ gần nhất. */
  private totalCost(): number {
    let cost = 0;
    let afterCycle = 0;
    for (const r of this.ledger.all()) {
      if (r.kind === "cycle") {
        cost += r.data?.cost ?? 0;
        afterCycle = 0;
      } else if (r.kind === "cost") {
        afterCycle += r.amount ?? 0;
      }
    }
    return cost + afterCycle;
  }

  state(): EconomyState {
    const received = this.ledger.sum("settled");
    const cost = this.totalCost();
    const v = this.ledger.verify();
    const rail = this.d.rail;
    return {
      enabled: this.enabled,
      rail: rail?.id,
      mode: rail ? rail.mode : "off",
      paused: this.st.paused,
      pausedReason: this.st.paused ? this.st.pausedReason : undefined,
      emergency: this.d.emergency(),
      payTo: rail?.payTo ? `${rail.payTo.slice(0, 6)}…${rail.payTo.slice(-4)}` : undefined,
      receivedMicro: received,
      costMicro: cost,
      netMicro: received - cost,
      negativeStreak: this.st.negativeStreak,
      negativeLimit: this.d.config.negativeLimit,
      lastCycle: this.st.lastCycle,
      scoutsActive: this.d.scouts?.active() ?? false,
      products: this.products.list().map((p) => ({ topic: p.topic, title: p.title, priceMicro: p.priceMicro })),
      pending: this.opportunities.filter((o) => o.status === "pending"),
      approvedCount: this.ledger.all().filter((r) => r.kind === "opportunity" && r.note === "approved").length,
      recent: [...this.recent].reverse().slice(0, 8),
      ledgerOk: v.ok,
      ledgerCount: v.count,
      at: new Date(this.now()).toISOString(),
    };
  }

  private push(): void {
    try {
      this.d.onState?.(this.state());
    } catch {
      /* ignore */
    }
  }

  /** Ghi sổ cái + phát sự kiện kinh tế. */
  private record(kind: EconomyEventKind, f: { amount?: number; topic?: string; rail?: RailId; ref?: string; note?: string; data?: Record<string, number> } = {}): void {
    const rec = this.ledger.append({ kind, ...f });
    this.emit({ kind, at: rec.at, amount: rec.amount, topic: rec.topic, rail: rec.rail, ref: rec.ref, note: rec.note });
  }

  private emit(e: Omit<EconomyEvent, "id">): void {
    const ev: EconomyEvent = { id: `ev_${++this.evSeq}`, ...e };
    this.recent.push(ev);
    if (this.recent.length > 40) this.recent.shift();
    try {
      this.d.onEvent?.(ev);
    } catch {
      /* ignore */
    }
    this.push();
  }

  private requireEnabled(): PaymentRail {
    if (!this.d.rail) throw new ValidationError("val.economy.disabled");
    return this.d.rail;
  }

  // ------------------------------------------------------------------ xuất bản sản phẩm

  /**
   * Kiểm tra đồng bộ rồi xin duyệt. Ném `ValidationError` nếu không hợp lệ; ngược lại trả `done` (kết quả sau khi người dùng quyết định, tối đa 10 phút).
   */
  publish(topic: string, priceUsd: number): { topic: string; title: string; done: Promise<ActionOutcome | "changed"> } {
    const rail = this.requireEnabled();
    if (this.d.emergency()) throw new ValidationError("val.economy.emergency");
    if (!TOPIC_RE.test(topic)) throw new ValidationError("val.economy.topicInvalid");
    if (typeof priceUsd !== "number" || !Number.isFinite(priceUsd) || priceUsd <= 0) throw new ValidationError("val.economy.priceInvalid", { max: formatUsd(this.d.config.maxPriceMicro) });
    const priceMicro = usdToMicro(priceUsd);
    if (priceMicro > this.d.config.maxPriceMicro) throw new ValidationError("val.economy.priceInvalid", { max: formatUsd(this.d.config.maxPriceMicro) });
    if (rail.id === "stripe" && (priceMicro < STRIPE_MIN_MICRO || priceMicro % 10_000 !== 0)) throw new ValidationError("val.economy.stripePrice");
    const t = readTopic(this.d.workspace(), topic);
    if (!t) throw new ValidationError("val.economy.topicMissing", { topic });
    const why = privacyProblem(t.body, this.d.contactTerms(), this.d.secretValues?.() ?? []);
    if (why) throw new ValidationError("val.economy.privacy", { why: `$t:val.economy.why.${why}` });
    const desk = this.d.desk();
    const done = (async (): Promise<ActionOutcome | "changed"> => {
      const outcome = await this.d.gate.request({
        agentId: desk.id,
        agentName: desk.name,
        action: "economy_publish",
        vars: { agent: desk.name, topic, price: formatUsd(priceMicro) },
        detail: `${t.title}\n\n${t.body.slice(0, 900)}`,
      });
      if (outcome !== "approved") {
        this.d.audit.append("economy.publish", "user", { topic, outcome });
        return outcome;
      }
      const again = readTopic(this.d.workspace(), topic);
      if (!again || again.hash !== t.hash) {
        this.d.audit.append("economy.publish", "system", { topic, outcome: "changed" });
        return "changed";
      }
      this.products.set({ topic, title: t.title, priceMicro, contentHash: t.hash, publishedAt: new Date(this.now()).toISOString() });
      this.d.audit.append("economy.publish", "user", { topic, outcome: "approved", priceMicro });
      this.record("published", { amount: priceMicro, topic, rail: rail.id, note: short(t.title, 80) });
      return "approved";
    })();
    return { topic, title: t.title, done };
  }

  unpublish(topic: string): boolean {
    const ok = this.products.remove(topic);
    if (ok) {
      this.d.audit.append("economy.unpublish", "user", { topic });
      this.push();
    }
    return ok;
  }

  catalog(): Array<{ topic: string; title: string; priceUsd: number }> {
    return this.products.list().map((p) => ({ topic: p.topic, title: p.title, priceUsd: p.priceMicro / 1_000_000 }));
  }

  // ------------------------------------------------------------------ phục vụ công khai (paywall)

  /** Xử lý một yêu cầu tới sản phẩm công khai. Không bao giờ thu tiền khi dừng khẩn cấp hoặc khi nội dung đã đổi sau lúc duyệt. */
  async handlePublic(topic: string, headers: Headers, resource: string): Promise<PublicResult> {
    const rail = this.d.rail;
    if (!rail || !TOPIC_RE.test(topic)) return { status: 404, body: { error: "not_found" } };
    if (this.d.emergency()) return { status: 503, body: { error: "unavailable" } };
    const product = this.products.get(topic);
    if (!product) return { status: 404, body: { error: "not_found" } };
    const spec = { topic, resource, description: product.title, priceMicro: product.priceMicro };
    const proof = rail.proofOf(headers);

    if (!proof) {
      let body: unknown;
      try {
        body = await rail.challenge(spec);
      } catch {
        return { status: 502, body: { error: "payment_provider_unavailable" } };
      }
      const t = this.now();
      if (t - (this.lastQuote.get(topic) ?? 0) > 2000) {
        this.lastQuote.set(topic, t);
        this.emit({ kind: "quote", at: new Date(t).toISOString(), amount: product.priceMicro, topic, rail: rail.id });
      }
      return { status: 402, body };
    }

    const ref = rail.proofRef(proof);
    if (this.usedProofs.has(ref) || this.ledger.hasSettledRef(ref)) return { status: 402, body: { error: "payment_already_used" } };
    const v = await rail.verify(spec, proof);
    if (!v.ok) {
      this.failed(topic, rail.id, v.error ?? "invalid payment");
      return { status: 402, body: { error: "payment_invalid", reason: v.error, ...(await this.safeChallenge(rail, spec)) } };
    }
    const content = readTopic(this.d.workspace(), topic);
    if (!content || content.hash !== product.contentHash) return { status: 409, body: { error: "content_changed", hint: "the report changed after it was approved; it is not for sale until re-approved" } };

    this.usedProofs.add(ref);
    const s = await rail.settle(spec, proof);
    if (!s.ok) {
      this.usedProofs.delete(ref);
      this.failed(topic, rail.id, s.error ?? "settlement failed");
      return { status: 402, body: { error: "settlement_failed", reason: s.error } };
    }
    this.record("settled", { amount: product.priceMicro, topic, rail: rail.id, ref: s.proofRef, note: s.txRef ? `tx ${short(s.txRef, 70)}` : undefined });
    this.d.audit.append("economy.sale", "system", { topic, amountMicro: product.priceMicro, rail: rail.id });
    return { status: 200, headers: s.responseHeaders, body: { topic, title: product.title, content: content.body, paidUsd: product.priceMicro / 1_000_000 } };
  }

  private async safeChallenge(rail: PaymentRail, spec: Parameters<PaymentRail["challenge"]>[0]): Promise<Record<string, unknown>> {
    try {
      const c = await rail.challenge(spec);
      return typeof c === "object" && c !== null ? (c as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Ghi giao dịch lỗi vào sổ cái, tối đa một dòng mỗi 5 giây (chống làm đầy đĩa bằng yêu cầu rác). */
  private failed(topic: string, rail: RailId, reason: string): void {
    const t = this.now();
    if (t - this.lastFailure < 5000) return;
    this.lastFailure = t;
    this.record("failed", { topic, rail, note: short(reason, 100) });
  }

  // ------------------------------------------------------------------ đề xuất của Scout

  /** Scout đề xuất một cơ hội: luôn xin người duyệt. Chỉ ghi nhận quyết định — KHÔNG tự đăng ký dịch vụ hay chi tiền. */
  async propose(raw: { title?: unknown; rationale?: unknown; estRevenueUsd?: unknown; estCostUsd?: unknown; risk?: unknown; source?: unknown }, by: { id: string; name: string }): Promise<ActionOutcome> {
    this.requireEnabled();
    if (this.d.emergency()) throw new ValidationError("val.economy.emergency");
    if (this.st.paused) throw new ValidationError("val.economy.paused");
    const title = String(raw.title ?? "").trim().slice(0, 120);
    const rationale = String(raw.rationale ?? "").trim().slice(0, 600);
    if (title.length < 3) throw new ValidationError("val.economy.fieldInvalid", { field: "title" });
    if (rationale.length < 10) throw new ValidationError("val.economy.fieldInvalid", { field: "rationale" });
    const rev = Number(raw.estRevenueUsd);
    const cost = Number(raw.estCostUsd);
    if (!Number.isFinite(rev) || rev < 0 || rev > 1e6) throw new ValidationError("val.economy.fieldInvalid", { field: "estRevenueUsd" });
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e6) throw new ValidationError("val.economy.fieldInvalid", { field: "estCostUsd" });
    const risk = String(raw.risk ?? "") as OpportunityRisk;
    if (!OPPORTUNITY_RISKS.includes(risk)) throw new ValidationError("val.economy.fieldInvalid", { field: "risk" });
    let source: string | undefined;
    if (raw.source !== undefined && String(raw.source).trim()) {
      try {
        const u = new URL(String(raw.source).trim());
        if (u.protocol === "http:" || u.protocol === "https:") source = `${u.origin}${u.pathname}`.slice(0, 200);
      } catch {
        /* bỏ nguồn không hợp lệ */
      }
    }
    if (this.opportunities.filter((o) => o.status === "pending").length >= this.d.config.maxPending) throw new ValidationError("val.economy.tooManyPending", { max: this.d.config.maxPending });

    const op: Opportunity = { id: `opp_${this.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, title, rationale, estRevenue: usdToMicro(rev), estCost: usdToMicro(cost), risk, source, by: by.name, status: "pending", createdAt: new Date(this.now()).toISOString() };
    this.opportunities.push(op);
    this.opportunities = this.sortOpps(this.opportunities).slice(-40);
    this.record("opportunity", { amount: op.estRevenue - op.estCost, topic: short(title, 60), note: "proposed" });
    const net = op.estRevenue - op.estCost;
    const outcome = await this.d.gate.request({
      agentId: by.id,
      agentName: by.name,
      action: "economy_opportunity",
      vars: { agent: by.name, title: short(title, 80), net: formatUsd(net) },
      detail: `${title}\nRisk: ${risk} · est. revenue ${formatUsd(op.estRevenue)} · est. cost ${formatUsd(op.estCost)}${source ? `\nSource: ${source}` : ""}\n\n${rationale}`,
    });
    op.status = outcome === "approved" ? "approved" : outcome === "denied" ? "denied" : "expired";
    op.decidedAt = new Date(this.now()).toISOString();
    this.d.audit.append("economy.opportunity", outcome === "expired" ? "system" : "user", { outcome, agent: by.id, title: short(title, 60), netMicro: net });
    this.record("opportunity", { amount: net, topic: short(title, 60), note: outcome });
    return outcome;
  }

  private sortOpps(list: Opportunity[]): Opportunity[] {
    return [...list].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || (b.estRevenue - b.estCost) * RISK_WEIGHT[b.risk] - (a.estRevenue - a.estCost) * RISK_WEIGHT[a.risk]);
  }

  // ------------------------------------------------------------------ chi phí người vận hành ghi

  recordCost(amountUsd: number, note: string): void {
    this.requireEnabled();
    if (typeof amountUsd !== "number" || !Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 10_000) throw new ValidationError("val.economy.fieldInvalid", { field: "amountUsd" });
    const amount = usdToMicro(amountUsd);
    this.record("cost", { amount, note: note.trim().slice(0, 100) || "operator cost" });
    this.d.audit.append("economy.cost", "user", { amountMicro: amount });
  }

  // ------------------------------------------------------------------ vòng lặp kinh tế

  /** Một chu kỳ: chốt doanh thu − chi phí kể từ chu kỳ trước; lỗ liên tiếp → tạm dừng Scout; lãi → đề xuất tái đầu tư. */
  runCycle(): CycleSummary | null {
    if (!this.enabled || this.d.emergency()) return null;
    const nowMs = this.now();
    const fromMs = this.st.lastCycleAt ? Date.parse(this.st.lastCycleAt) : nowMs - this.d.config.loopHours * 3_600_000;
    if (nowMs <= fromMs) return null;
    const hours = (nowMs - fromMs) / 3_600_000;
    const revenue = this.ledger.sum("settled", fromMs, nowMs + 1);
    const manual = this.ledger.sum("cost", fromMs, nowMs + 1);
    const inference = Math.round((this.d.tokensSince(fromMs) * this.d.config.tokenPriceMicroPerMTok) / 1_000_000);
    const compute = Math.round((this.d.config.computeMicroPerDay * hours) / 24);
    const cost = manual + inference + compute;
    const net = revenue - cost;
    const at = new Date(nowMs).toISOString();
    const summary: CycleSummary = { at, revenue, cost, net };
    this.st.lastCycleAt = at;
    this.st.lastCycle = summary;
    this.st.negativeStreak = net < 0 ? this.st.negativeStreak + 1 : 0;
    this.record("cycle", { amount: net, data: { revenue, cost, inference, compute, manual }, note: `streak ${this.st.negativeStreak}` });
    this.d.audit.append("economy.cycle", "system", { netMicro: net, revenueMicro: revenue, costMicro: cost, streak: this.st.negativeStreak });

    if (net < 0 && this.st.negativeStreak >= this.d.config.negativeLimit && !this.st.paused) {
      this.pause("negative");
    } else if (net > 0 && !this.st.paused) {
      const amount = Math.floor(net * this.d.config.reinvestShare);
      const since = this.st.lastReinvestAt ? nowMs - Date.parse(this.st.lastReinvestAt) : Infinity;
      if (amount >= this.d.config.reinvestMinMicro && since >= this.d.config.reinvestCooldownHours * 3_600_000) {
        this.st.lastReinvestAt = at;
        void this.askReinvest(amount);
      }
    }
    this.saveState();
    this.push();
    return summary;
  }

  /** Tự động (lỗ liên tiếp) hoặc do người vận hành: dừng Scout, từ chối đề xuất mới. Việc BÁN vẫn tiếp tục (để có thể hồi phục). */
  pause(reason: "negative" | "operator"): void {
    if (this.st.paused) return;
    this.st.paused = true;
    this.st.pausedReason = reason;
    this.st.scoutsBeforePause = this.d.scouts?.active() ?? false;
    this.d.scouts?.setActive(false);
    this.saveState();
    this.d.audit.append("economy.paused", reason === "operator" ? "user" : "system", { reason, streak: this.st.negativeStreak });
    this.record("paused", { note: reason === "negative" ? `net < 0 for ${this.st.negativeStreak} cycles in a row — scouts paused, please review` : "paused by operator" });
  }

  resume(): void {
    if (!this.st.paused) return;
    this.st.paused = false;
    this.st.pausedReason = undefined;
    this.st.negativeStreak = 0;
    if (this.st.scoutsBeforePause && !this.d.emergency()) this.d.scouts?.setActive(true); // bật lại đúng như trước khi bị tạm dừng
    this.st.scoutsBeforePause = undefined;
    this.saveState();
    this.d.audit.append("economy.resumed", "user", {});
    this.record("resumed", { note: "resumed by operator" });
  }

  setScouts(on: boolean): void {
    this.requireEnabled();
    if (on && (this.st.paused || this.d.emergency())) throw new ValidationError(this.st.paused ? "val.economy.paused" : "val.economy.emergency");
    this.d.scouts?.setActive(on);
    this.d.audit.append("economy.scouts", "user", { enabled: on });
    this.push();
  }

  private async askReinvest(amount: number): Promise<void> {
    const option = REINVEST_OPTIONS[this.st.reinvestIdx % REINVEST_OPTIONS.length];
    this.st.reinvestIdx++;
    this.saveState();
    const desk = this.d.desk();
    const outcome = await this.d.gate.request({
      agentId: desk.id,
      agentName: desk.name,
      action: "economy_reinvest",
      vars: { agent: desk.name, option, amount: formatUsd(amount) },
      detail: `Surplus this cycle allows reinvesting up to ${formatUsd(amount)} into: ${option}.\nApproving only records the decision — nothing is bought automatically; you carry it out yourself.`,
    });
    this.d.audit.append("economy.reinvest", outcome === "expired" ? "system" : "user", { option, outcome, amountMicro: amount });
    if (outcome === "approved") this.record("reinvest", { amount, note: option });
  }

  // ------------------------------------------------------------------ vòng đời

  start(): void {
    if (this.timer || !this.enabled) return;
    if (!this.st.lastCycleAt) {
      this.st.lastCycleAt = new Date(this.now()).toISOString();
      this.saveState();
    }
    const every = Math.max(60_000, this.d.config.loopHours * 3_600_000);
    this.timer = setInterval(() => {
      try {
        this.runCycle();
      } catch {
        /* chu kỳ lỗi không được làm sập server */
      }
    }, every);
    this.timer.unref();
    this.push();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
