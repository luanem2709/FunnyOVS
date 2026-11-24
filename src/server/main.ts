/**
 * Server chính: HTTP API + WebSocket realtime cho cảnh 3D.
 */
import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { ConfigStore } from "./config.js";
import { PermissionManager } from "./security/permissions.js";
import { GuardedFs } from "./security/guardedFs.js";
import { TokenBudget } from "./budget/tokenBudget.js";
import { TokenLedger } from "./budget/tokenLedger.js";
import { fetchCursorQuota, fetchPlanInfo } from "./budget/cursorQuota.js";
import { describeCursorAuth } from "./budget/cursorAuth.js";
import { resolveAgentExe } from "./budget/cursorAgent.js";
import { SandboxBrowser } from "./browser/sandboxBrowser.js";
import { KnowledgeBase } from "./knowledge/knowledgeBase.js";
import { ResearchEngine } from "./learning/researchEngine.js";
import { ProposalStore } from "./selfdev/proposalStore.js";
import { AgentRegistry } from "./agents/agentRegistry.js";
import { DEPARTMENTS, departmentById } from "./agents/departments.js";
import { TaskRunner } from "./tasks/taskRunner.js";
import { ActivityLog } from "./activity/activityLog.js";
import { policyForLevel, type AutomationLevel } from "./automation/automationPolicy.js";
import { loadLlmConfig } from "./llm.js";
import { MachineProbe } from "./office/machine.js";
import { OfficeBridge } from "./office/entityAdapter.js";
import { OrgDispatcher } from "./org/dispatcher.js";
import { AiHub } from "./ai/hub.js";
import { OfficeDb } from "./crm/store.js";
import { MailService } from "./agent/mail.js";
import { ActionGate } from "./agent/gate.js";
import { buildTools } from "./agent/tools.js";
import { createRunLlm } from "./agent/backend.js";
import { makePlanner, makeSummarizer, type ChatFn } from "./org/planner.js";
import { registerBusinessRoutes, apiError } from "./routes/business.js";
import { AuditLog } from "./security/audit.js";
import { EconomyService, configFromEnv, type ScoutControl } from "./economy/service.js";
import { railFromEnv } from "./economy/payment.js";
import { startPublicServer } from "./economy/publicServer.js";
import { registerEconomyRoutes } from "./routes/economy.js";
import { StudioService } from "./studio/service.js";
import { createRunner, findKitDir } from "./studio/runner.js";
import { registerStudioRoutes } from "./routes/studio.js";
import { Scheduler } from "./schedule/scheduler.js";
import { runCursorAgent } from "./budget/cursorAgent.js";
import { getCursorAuth } from "./budget/cursorAuth.js";
import { msg, normalizeLang } from "../shared/messages.js";
import pkg from "../../package.json" with { type: "json" };
import { OFFICE3D_CSP, isAllowedHost, parseAllowedHosts, verifyWsClient } from "./security/httpGuard.js";
import { AuthManager } from "./security/auth.js";
import { lanAddresses, readNetwork, writeNetwork } from "./security/network.js";
import { OFFICE_WS_EVENT, type OfficeEvent } from "../shared/officeEntity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// OFFICE_HOME: ứng dụng desktop đặt thư mục gốc ghi được (workspace, đề xuất) ra ngoài thư mục cài đặt.
const ROOT = process.env.OFFICE_HOME ? path.resolve(process.env.OFFICE_HOME) : path.resolve(__dirname, "..", "..");

const DATA_DIR = process.env.OFFICE_DATA_DIR ?? path.join(ROOT, ".data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, "workspace"), { recursive: true });

const configStore = new ConfigStore(CONFIG_PATH, DATA_DIR, ROOT);
const config = configStore.get();
process.env.OFFICE_WORKSPACE = config.workspace;

const perms = new PermissionManager(DATA_DIR);
const fsGuard = new GuardedFs(perms);
const ledger = new TokenLedger(DATA_DIR);
const budget = new TokenBudget(true);
const budgetToken = budget.issueConfigToken();
budget.configure(
  {
    dailyLimit: config.dailyTokenLimit,
    weeklyLimit: config.weeklyTokenLimit,
    learningPercent: config.learning.learningPercent,
    perTaskLimit: config.perTaskTokenLimit,
    warnRatio: config.warnRatio,
  },
  budgetToken,
);
// Khôi phục số liệu hôm nay từ ledger (server khởi động lại không mất số).
budget.restoreFromLedger(ledger);

const browser = new SandboxBrowser({ dataDir: DATA_DIR, policy: config.browser });
const kb = new KnowledgeBase(DATA_DIR);
const research = new ResearchEngine({ browser, kb, budget });
const proposals = new ProposalStore(ROOT);
const registry = new AgentRegistry();
const activity = new ActivityLog();

let emergencyStop = false;

const app = express();
app.disable("x-powered-by");

// Chốt chặn: chỉ nhận Host là loopback (chống DNS rebinding) + header an toàn cơ bản.
const EXTRA_HOSTS = parseAllowedHosts(process.env.OFFICE_ALLOW_HOSTS);
const NETWORK = readNetwork(DATA_DIR);
const auth = new AuthManager({ dataDir: DATA_DIR });
app.use((req, res, next) => {
  if (!isAllowedHost(req.headers.host, EXTRA_HOSTS, NETWORK.lan)) {
    res.status(403).json({ error: "Host không được phép. Đặt OFFICE_ALLOW_HOSTS nếu bạn cố ý truy cập từ máy khác." });
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/office-3d")) res.setHeader("Content-Security-Policy", OFFICE3D_CSP);
  next();
});
// Truy cập từ ngoài máy (LAN) bắt buộc token; từ chính máy này thì không.
app.use(auth.middleware());
app.use(express.json({ limit: "2mb" }));

// ---- Realtime bus ----
type Listener = (event: string, data: unknown) => void;
const listeners = new Set<Listener>();

function fanout(event: string, data: unknown): void {
  for (const l of listeners) {
    try {
      l(event, data);
    } catch {
      /* ignore */
    }
  }
}

/** Cây giao việc theo tầng (khởi tạo sau khi registry/tasks sẵn sàng). */
let orgDispatcher: OrgDispatcher | null = null;

/** Cầu nối sang schema chung (khởi tạo sau khi registry/tasks sẵn sàng). */
let officeBridge: OfficeBridge | null = null;

function broadcastOffice(events: OfficeEvent[]): void {
  for (const ev of events) fanout(OFFICE_WS_EVENT, ev);
}

/** Phát sự kiện cũ cho client cổ điển và đồng thời dịch sang `OfficeEvent` cho văn phòng hợp nhất. */
function broadcast(event: string, data: unknown): void {
  fanout(event, data);
  if (officeBridge) broadcastOffice(officeBridge.translate(event, data));
}

// ---- Kết nối AI tự động + công cụ thật + cổng duyệt hành động ----
const STARTED_AT = Date.now();
const hub = new AiHub({ dataDir: DATA_DIR });
// Nhật ký bảo mật chỉ-ghi-thêm (không chứa bí mật; che cả khoá đang lưu nếu lỡ lọt vào).
const audit = new AuditLog(path.join(DATA_DIR, "audit.log"), () => hub.secrets.allValues());
const officeDb = new OfficeDb(DATA_DIR);
const mail = new MailService(DATA_DIR, hub.secrets);
const gate = new ActionGate();

// ---- Lớp kinh tế tự trị (EAL): tắt trừ khi đặt ECONOMY_RAIL. Chỉ NHẬN tiền; mọi thứ ra ngoài/tốn tiền là đề xuất chờ duyệt.
const SCOUT_TITLE = "EAL scouting";
const SCOUT_PROMPT =
  "Economic scouting round. Find ONE or TWO realistic ways this office could earn a small amount of money using ONLY public information and the skills it already has " +
  "(for example: a short public research report to sell, a fitting GitHub bounty, an affiliate programme). Use web research (Automation Lab / Library), have Finance estimate " +
  "revenue, cost and risk, then submit each viable idea with the economy_propose tool. NEVER sign up for anything, spend or move money, or use customer/CRM/email data. " +
  "If nothing is worth proposing, say so.";
const scouts: ScoutControl = {
  active: () => scheduler.raw().some((x) => x.title === SCOUT_TITLE && x.enabled),
  setActive: (on) => {
    const cur = scheduler.raw().find((x) => x.title === SCOUT_TITLE);
    if (on) {
      if (cur) scheduler.setEnabled(cur.id, true);
      else scheduler.create({ title: SCOUT_TITLE, prompt: SCOUT_PROMPT, frequency: "daily", at: "09:30", lang: "vi" });
    } else if (cur) scheduler.setEnabled(cur.id, false);
  },
};
const railCfg = railFromEnv(process.env);
if (railCfg.error) console.warn(`[economy] disabled: ${railCfg.error}`);
const ECONOMY_DEPTS = new Set(["finance", "automation", "library"]);
const economy = new EconomyService({
  dataDir: DATA_DIR,
  workspace: () => configStore.get().workspace,
  rail: railCfg.rail,
  railError: railCfg.error,
  gate,
  audit,
  emergency: () => emergencyStop,
  desk: () => {
    const lead = registry.get(departmentById("finance")?.leadId ?? "thu");
    return { id: lead?.id ?? "thu", name: lead?.name ?? "Finance" };
  },
  contactTerms: () => officeDb.listContacts(500).flatMap((c) => [c.name, c.email ?? "", c.company ?? ""].filter(Boolean)),
  secretValues: () => hub.secrets.allValues(),
  // Chi phí suy luận quy ước: token của các phòng có công cụ economy_propose (xấp xỉ — xem docs/economy-layer.md).
  tokensSince: (sinceMs) => ledger.list(1000).filter((e) => ECONOMY_DEPTS.has(e.department) && Date.parse(e.ts) >= sinceMs).reduce((n, e) => n + e.totalTokens, 0),
  scouts,
  onState: (state) => broadcastOffice([{ type: "economy.state", state, at: new Date().toISOString() }]),
  onEvent: (event) => broadcastOffice([{ type: "economy.event", event }]),
  config: configFromEnv(process.env),
});

// ---- Studio dựng clip khối: dự án nằm trong workspace; gửi lời đọc ra dịch vụ giọng online luôn qua hộp duyệt (ActionGate).
const studioKit = findKitDir(path.dirname(fileURLToPath(import.meta.url)));
const studio = studioKit
  ? new StudioService({
      workspace: () => configStore.get().workspace,
      kitDir: studioKit,
      gate,
      audit,
      emergency: () => emergencyStop,
      runner: createRunner(studioKit),
      secretValues: () => hub.secrets.allValues(),
      desk: () => {
        const lead = registry.get(departmentById("marketing")?.leadId ?? "giamdoc");
        return { id: lead?.id ?? "giamdoc", name: lead?.name ?? "Studio" };
      },
      onState: (state) => broadcastOffice([{ type: "studio.state", state, at: new Date().toISOString() }]),
    })
  : null;

const agentTools = buildTools({
  studio: studio ? { save: (p, k, d, by) => studio.save(p, k, d, by), start: (p, o, by) => studio.start(p, o, by), state: () => studio.state() } : undefined,
  economy: { propose: (raw, by) => economy.propose(raw, by) },
  onEmailSent: ({ to, agent }) => audit.append("email.sent", "agent", { to, agent }),
  fs: fsGuard,
  perms,
  kb,
  db: officeDb,
  mail,
  gate,
  secrets: hub.secrets,
  policy: () => configStore.get().browser,
  emergency: () => emergencyStop,
});
const runLlm = createRunLlm({
  hub,
  tools: agentTools,
  registry,
  cursor: (o) => runCursorAgent(o),
  cursorAvailable: () => Boolean(resolveAgentExe() && getCursorAuth().token),
  setting: () => configStore.get().llmBackend,
  company: () => process.env.OFFICE_COMPANY ?? "FunnyOVS Corp",
});

/** Gọi AI cho việc điều phối (lập kế hoạch/báo cáo) và ghi sổ cái + trừ ngân sách như mọi lần gọi khác. */
function chatWithLedger(label: "plan" | "summary"): ChatFn {
  return async (messages, opts) => {
    const r = await hub.chat(messages, opts);
    try {
      ledger.add({
        taskId: `${label}_${Date.now().toString(36)}`,
        department: "executive",
        agentId: "giamdoc",
        agentName: registry.get("giamdoc")?.name ?? "Director",
        model: r.model,
        backend: `router:${r.providerId}`,
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costCents: 0,
        wallet: "normal",
        quotaSource: "provider-usage",
        durationMs: r.latencyMs,
        ok: true,
      });
      budget.spend("normal", r.usage.inputTokens + r.usage.outputTokens);
    } catch {
      /* ghi sổ lỗi không được làm hỏng việc chính */
    }
    return r;
  };
}

// ---- Task runner (điều phối tác vụ + duyệt trước khi tốn nhiều token) ----
const tasks = new TaskRunner({
  runLlm,
  budget,
  ledger,
  workspace: config.workspace,
  defaultModel: config.cursorModel,
  freeTierOnly: config.freeTierOnly,
  isAutonomous: () => configStore.get().automationLevel === "autonomous",
  getCursorPercentUsed: () => budget.getQuota()?.totalPercentUsed,
  onUpdate: (t) => {
    broadcast("task:update", t);
    orgDispatcher?.onTaskUpdate(t);
    const agent = registry.get(t.agentId);
    if (t.status === "running") {
      activity.record({ kind: "task", actor: t.agentName, message: `Bắt đầu: ${t.title}` });
    } else if (t.status === "done") {
      activity.record({
        kind: "task",
        actor: t.agentName,
        message: `Xong: ${t.title}`,
        detail: `${t.tokens ?? 0} token · ${((t.costCents ?? 0) / 100).toFixed(4)} USD`,
      });
    } else if (t.status === "failed") {
      activity.record({
        kind: "task",
        actor: t.agentName,
        message: `Lỗi: ${t.title}`,
        detail: t.error,
        level: "danger",
      });
    }
    if (agent) {
      if (t.status === "running") registry.setStatus(t.agentId, "working", t.title);
      else if (t.status === "awaiting-approval") registry.setStatus(t.agentId, "waiting", t.title);
      else if (t.status === "done" || t.status === "failed") {
        registry.setStatus(t.agentId, "idle");
        registry.recordUsage(t.agentId, t.tokens ?? 0);
        broadcast("agent:update", registry.get(t.agentId));
      }
    }
  },
  onApprovalNeeded: (req) => {
    broadcast("task:approval", req);
    activity.record({
      kind: "approval",
      actor: req.agentName,
      message: `Cần duyệt: ${req.title}`,
      detail: req.reason,
      level: "warn",
    });
    registry.setStatus(req.agentId, "waiting", req.reason);
    broadcast("agent:update", registry.get(req.agentId));
  },
  onSelfPropose: (p) => {
    // Self-dev: chỉ TẠO đề xuất, không tự sửa mã nguồn.
    const prop = proposals.create({
      agentId: p.agentId,
      agentName: p.agentName,
      title: p.title,
      rationale: p.rationale,
      files: [],
    });
    activity.record({
      kind: "proposal",
      actor: p.agentName,
      message: `Tự đề xuất sửa lỗi: ${p.title}`,
      detail: prop.id,
      level: "warn",
    });
  },
});

perms.on("request", (req) => broadcast("permission:request", req));
perms.on("decided", (req) => broadcast("permission:decided", req));
perms.on("log", (entry) => broadcast("access:log", entry));
perms.on("state", (state) => broadcast("permissions:state", state));
browser.on("log", (entry) => broadcast("browser:log", entry));
research.on("injection", (payload) => broadcast("injection", payload));
research.on("researched", (payload) => broadcast("researched", payload));
proposals.on("proposal", (p) => broadcast("proposal", p));
proposals.on("applied", (p) => broadcast("proposal:applied", p));
proposals.on("reverted", (p) => broadcast("proposal:reverted", p));
proposals.on("rejected", (p) => broadcast("proposal:rejected", p));
budget.onChange((s) => broadcast("budget", s));
activity.on("activity", (e) => broadcast("activity", e));

// Ghi nhật ký cho các sự kiện quan trọng
perms.on("decided", (req) =>
  activity.record({
    kind: "permission",
    actor: req.agentName,
    message: `Quyền "${req.reason}" cho ${req.path} → ${req.status}`,
    level: req.status === "denied" ? "warn" : "info",
  }),
);
browser.on("log", (e) =>
  activity.record({
    kind: "browser",
    actor: e.agentName,
    message: `Mở ${e.url}`,
    detail: e.title,
    level: e.status === "blocked" ? "warn" : "info",
  }),
);
research.on("injection", (p) =>
  activity.record({
    kind: "browser",
    actor: "hệ thống",
    message: `Chặn prompt injection tại ${p.url}`,
    level: "danger",
  }),
);
proposals.on("proposal", (p) =>
  activity.record({
    kind: "proposal",
    actor: p.agentName,
    message: `Đề xuất mới: ${p.title}`,
    level: "info",
  }),
);

// ---- Đọc hạn mức Cursor (API nội bộ, có fallback) ----
async function pollCursorQuota(): Promise<void> {
  if (!configStore.get().cursorQuotaEnabled) return;
  const q = await fetchCursorQuota();
  const plan = await fetchPlanInfo();
  budget.setQuota({
    available: q.available,
    planName: plan.planName ?? q.planName,
    autoPercentUsed: q.autoPercentUsed,
    apiPercentUsed: q.apiPercentUsed,
    totalPercentUsed: q.totalPercentUsed,
    cycleEnd: q.cycleEnd,
    includedLimitZero: q.includedLimitZero,
    error: q.error ?? plan.error,
    readAt: new Date().toISOString(),
  });
  broadcast("quota", { ...q, planName: plan.planName });
}

let quotaTimer: NodeJS.Timeout | null = null;
function startQuotaLoop(): void {
  if (quotaTimer) clearInterval(quotaTimer);
  void pollCursorQuota();
  quotaTimer = setInterval(() => void pollCursorQuota(), configStore.get().cursorQuotaPollMs);
}
startQuotaLoop();

// ---- API ----
app.get("/api/state", (_req, res) => {
  res.json({
    agents: registry.list(),
    departments: DEPARTMENTS,
    config: configStore.get(),
    emergencyStop,
    budget: budget.snapshot(),
    quota: budget.getQuota(),
    permissions: perms.getState(),
    pendingRequests: perms.listPending(),
    proposals: proposals.list(),
    tasks: tasks.list(),
    approvals: tasks.listApprovals(),
  });
});

app.get("/api/agents", (_req, res) => res.json(registry.list()));

app.get("/api/departments", (_req, res) =>
  res.json(
    DEPARTMENTS.map((d) => ({
      ...d,
      agents: registry.listByDepartment(d.id),
      spend: ledger.totalsByDepartment().find((t) => t.department === d.id) ?? {
        department: d.id,
        tokens: 0,
        cents: 0,
        calls: 0,
      },
    })),
  ),
);

app.post("/api/agents/:id/status", (req, res) => {
  const a = registry.setStatus(req.params.id, req.body.status ?? "idle", req.body.task);
  if (!a) return apiError(res, 404, "unknownAgent", { id: String(req.params.id).slice(0, 40) });
  broadcast("agent:update", a);
  res.json(a);
});

// --- Quyền truy cập ---
app.get("/api/permissions", (_req, res) =>
  res.json({ state: perms.getState(), logs: perms.getLogs(300), pending: perms.listPending() }),
);

app.post("/api/permissions/decide", (req, res) => {
  const { requestId, mode } = req.body as { requestId: string; mode: "once" | "read" | "readwrite" | "deny" };
  const decided = perms.decide(requestId, mode);
  if (!decided) return apiError(res, 404, "requestGone");
  res.json(decided);
});

app.post("/api/permissions/revoke", (req, res) => {
  const { grantId } = req.body as { grantId: string };
  const ok = perms.revokeGrant(grantId);
  res.json({ ok });
});

app.post("/api/permissions/revoke-all", (_req, res) => {
  perms.revokeAll();
  res.json({ ok: true });
});

app.post("/api/permissions/manual-unlock", (req, res) => {
  const { path: p } = req.body as { path: string };
  res.json(perms.manualUnlock(p));
});

// --- File an toàn (mọi đường đi qua GuardedFs) ---
app.post("/api/files/read", async (req, res) => {
  const { agentId, agentName, path: p, purpose } = req.body as any;
  const r = await fsGuard.readFile(agentId, agentName, p, purpose);
  res.status(r.ok ? 200 : 403).json(r);
});

app.post("/api/files/write", async (req, res) => {
  const { agentId, agentName, path: p, content, purpose } = req.body as any;
  const r = await fsGuard.writeFile(agentId, agentName, p, content, purpose);
  res.status(r.ok ? 200 : 403).json(r);
});

app.post("/api/files/list", async (req, res) => {
  const { agentId, agentName, path: p, purpose } = req.body as any;
  const r = await fsGuard.listDir(agentId, agentName, p, purpose);
  res.status(r.ok ? 200 : 403).json(r);
});

app.post("/api/files/delete", async (req, res) => {
  const { agentId, agentName, path: p, purpose } = req.body as any;
  const r = await fsGuard.deletePath(agentId, agentName, p, purpose);
  res.status(r.ok ? 200 : 403).json(r);
});

// --- Trình duyệt sandbox ---
app.post("/api/browser/open", async (req, res) => {
  const { agentId, agentName, url } = req.body as any;
  const agent = registry.get(agentId);
  const r = await browser.open(url, { agentId, agentName: agentName ?? agent?.name ?? agentId });
  if (r.ok && agent) {
    registry.setBrowsing(agentId, r.content.url, r.content.title);
    broadcast("agent:update", registry.get(agentId));
  }
  res.json(r);
});

app.post("/api/browser/search", async (req, res) => {
  const { agentId, agentName, query } = req.body as any;
  const agent = registry.get(agentId);
  const results = await browser.search(query, { agentId, agentName: agentName ?? agent?.name ?? agentId });
  res.json({ results });
});

app.get("/api/browser/logs", (_req, res) => res.json(browser.getLogs(300)));
app.get("/api/browser/policy", (_req, res) => res.json(browser.getPolicy()));
app.put("/api/browser/policy", (req, res) => res.json(browser.setPolicy(req.body ?? {})));

// --- Thư viện tri thức ---
app.get("/api/kb", (req, res) => {
  const { kind, agentId, q } = req.query as any;
  res.json(kb.list({ kind, agentId, query: q, limit: 200 }));
});

app.post("/api/kb", (req, res) => {
  const body = req.body as any;
  const entry = kb.add({
    kind: body.kind ?? "note",
    agentId: body.agentId ?? "system",
    title: body.title ?? "Ghi chú",
    body: body.body ?? "",
    sources: body.sources ?? [],
    confidence: body.confidence ?? 0.6,
    fromWeb: !!body.fromWeb,
    tags: body.tags ?? [],
  });
  broadcast("kb:changed", entry);
  res.json(entry);
});

app.delete("/api/kb/:id", (req, res) => {
  const ok = kb.remove(Number(req.params.id));
  res.json({ ok });
});

app.get("/api/kb/retrospectives", (_req, res) => res.json(kb.listRetrospectives(100)));
app.post("/api/kb/retrospectives", (req, res) => {
  const r = kb.saveRetrospective(req.body);
  broadcast("kb:retrospective", r);
  res.json(r);
});

// --- Nghiên cứu / tự học ---
app.post("/api/research", async (req, res) => {
  const { agentId, topic, learningMode } = req.body as any;
  const agent = registry.get(agentId) ?? { id: agentId, name: agentId, role: "" };
  const policy = policyForLevel(configStore.get().automationLevel);
  if (emergencyStop) return apiError(res, 423, "emergency");
  registry.setStatus(agentId, learningMode ? "learning" : "researching", topic);
  const result = await research.research({ agent, topic, learningMode }, policy);
  registry.setStatus(agentId, "idle");
  res.json(result);
});

// --- Nhật ký hoạt động ---
app.get("/api/activity", (req, res) => {
  const { limit, kind } = req.query as any;
  res.json(activity.list(Number(limit ?? 120), kind));
});

// --- Ngân sách token ---
app.get("/api/budget", (_req, res) => res.json(budget.snapshot()));

app.post("/api/budget", (req, res) => {
  const { dailyLimit, weeklyLimit, learningPercent, perTaskLimit, warnRatio } = req.body as any;
  budget.configure(
    { dailyLimit, weeklyLimit, learningPercent, perTaskLimit, warnRatio },
    budgetToken,
  );
  const c = configStore.get();
  configStore.update({
    dailyTokenLimit: dailyLimit ?? c.dailyTokenLimit,
    weeklyTokenLimit: weeklyLimit ?? c.weeklyTokenLimit,
    perTaskTokenLimit: perTaskLimit ?? c.perTaskTokenLimit,
    warnRatio: warnRatio ?? c.warnRatio,
    learning: { ...c.learning, learningPercent: learningPercent ?? c.learning.learningPercent },
  });
  res.json(budget.snapshot());
});

// --- Nhật ký chi tiêu token ---
app.get("/api/budget/ledger", (req, res) => {
  const { limit, wallet, agentId } = req.query as any;
  res.json({
    entries: ledger.list(Number(limit ?? 100), { wallet, agentId }),
    totals: ledger.totalsToday(),
    byDepartment: ledger.totalsByDepartment(),
  });
});

// --- Hạn mức Cursor (đọc trực tiếp từ API của Cursor) ---
app.get("/api/quota", async (_req, res) => {
  const q = await fetchCursorQuota();
  const plan = await fetchPlanInfo();
  res.json({ ...q, plan });
});

app.post("/api/quota/refresh", async (_req, res) => {
  await pollCursorQuota();
  res.json(budget.getQuota() ?? { available: false });
});

// --- Tác vụ ---
app.get("/api/tasks", (_req, res) => res.json(tasks.list()));

app.post("/api/tasks", async (req, res) => {
  if (emergencyStop) return apiError(res, 423, "emergency");
  const body = req.body as any;
  const agent = registry.get(body.agentId);
  const task = await tasks.submit({
    title: body.title ?? msg(normalizeLang(body.lang), "task.untitled"),
    prompt: body.prompt ?? "",
    agentId: body.agentId ?? "minh",
    agentName: agent?.name ?? body.agentName ?? "Agent",
    department: body.department ?? agent?.department ?? "dispatch",
    context: body.context,
    toolSteps: body.toolSteps,
    mode: body.mode,
    wallet: body.wallet,
    lang: normalizeLang(body.lang),
  });
  res.json(task);
});

app.post("/api/tasks/:id/approve", async (req, res) => {
  // Id yêu cầu duyệt có dạng "apr_<taskId>".
  const t = await tasks.approve(`apr_${req.params.id}`);
  if (!t) return apiError(res, 404, "approvalGone");
  res.json(t);
});

app.post("/api/tasks/:id/reject", (req, res) => {
  const t = tasks.reject(`apr_${req.params.id}`);
  if (!t) return apiError(res, 404, "approvalGone");
  res.json(t);
});

app.post("/api/tasks/:id/cancel", (req, res) => {
  const t = tasks.cancel(req.params.id);
  if (!t) return apiError(res, 404, "taskNotFound");
  res.json(t);
});

/** Trạng thái hệ thống LLM: đã đăng nhập Cursor chưa, CLI có tồn tại không. */
app.get("/api/llm/status", (_req, res) => {
  res.json({
    cursorCli: !!resolveAgentExe(),
    cursorAuth: describeCursorAuth(),
    backend: configStore.get().llmBackend,
    model: configStore.get().cursorModel,
    freeTierOnly: configStore.get().freeTierOnly,
  });
});

// --- Đề xuất thay đổi ---
app.get("/api/proposals", (_req, res) => res.json(proposals.list()));
app.post("/api/proposals", (req, res) => {
  const { agentId, agentName, title, rationale, files } = req.body as any;
  const p = proposals.create({ agentId, agentName, title, rationale, files });
  res.json(p);
});
app.post("/api/proposals/:id/apply", (req, res) => {
  const r = proposals.apply(req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
app.post("/api/proposals/:id/revert", (req, res) => {
  const r = proposals.revert(req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
app.post("/api/proposals/:id/reject", (req, res) => {
  const r = proposals.reject(req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});

// --- Cấu hình / chế độ tự động ---
app.get("/api/config", (_req, res) => res.json(configStore.get()));
app.put("/api/config", (req, res) => {
  const c = configStore.update(req.body ?? {});
  browser.setPolicy(c.browser);
  budget.configure(
    {
      dailyLimit: c.dailyTokenLimit,
      weeklyLimit: c.weeklyTokenLimit,
      learningPercent: c.learning.learningPercent,
      perTaskLimit: c.perTaskTokenLimit,
      warnRatio: c.warnRatio,
    },
    budgetToken,
  );
  broadcast("config", c);
  res.json(c);
});

app.post("/api/automation-level", (req, res) => {
  const level = req.body?.level as AutomationLevel;
  const c = configStore.update({ automationLevel: level });
  broadcast("config", c);
  res.json(c);
});

// --- Dừng khẩn cấp ---
app.post("/api/emergency-stop", (_req, res) => {
  emergencyStop = !emergencyStop;
  audit.append(emergencyStop ? "emergency.on" : "emergency.off", "user", {});
  if (emergencyStop) {
    // Dừng mọi agent: về trạng thái stopped và huỷ tác vụ đang chờ duyệt.
    for (const a of registry.list()) {
      registry.setStatus(a.id, "stopped");
      broadcast("agent:update", registry.get(a.id));
    }
    for (const t of tasks.list()) {
      if (t.status === "pending" || t.status === "awaiting-approval" || t.status === "running") {
        tasks.cancel(t.id);
      }
    }
    gate.denyAll(); // mọi yêu cầu duyệt hành động ra bên ngoài (email, issue...) bị từ chối
    studio?.abortAll(); // huỷ việc dựng clip đang chạy (giết cả Chrome/ffmpeg con)
  } else {
    for (const a of registry.list()) {
      registry.setStatus(a.id, "idle");
      broadcast("agent:update", registry.get(a.id));
    }
  }
  broadcast("emergency", { emergencyStop });
  broadcastOffice([{ type: "economy.state", state: economy.state(), at: new Date().toISOString() }]); // EAL ngừng phục vụ/chạy chu kỳ ngay
  activity.record({
    kind: "emergency",
    actor: "bạn",
    message: emergencyStop ? "DỪNG KHẨN CẤP" : "Tiếp tục hoạt động",
    level: emergencyStop ? "danger" : "info",
  });
  res.json({ emergencyStop });
});

// --- Tự học định kỳ ---
// Tự học đi qua TaskRunner để: (1) dùng ví "learning" riêng, (2) được ghi
// vào ledger, (3) vẫn phải ước lượng và hỏi nếu vượt ngưỡng.
let learningTimer: NodeJS.Timeout | null = null;

function startLearningLoop(): void {
  if (learningTimer) clearInterval(learningTimer);
  const minutes = Math.max(5, configStore.get().learning.intervalMinutes);
  learningTimer = setInterval(() => {
    const c = configStore.get();
    if (!c.learning.enabled || emergencyStop) return;
    if (c.automationLevel === "ask") return; // Chỉ hỏi → không tự học
    const agent = registry.leadOf("library") ?? registry.list()[0];
    if (!agent) return;
    const topic = c.learning.topics[Math.floor(Math.random() * c.learning.topics.length)];

    void tasks
      .submit({
        title: `Tự học: ${topic}`,
        prompt:
          `Nghiên cứu chủ đề "${topic}" bằng công cụ duyệt web sandbox, ` +
          `tóm tắt thành 5 gạch đầu dòng và ghi vào Thư viện Tri thức.`,
        agentId: agent.id,
        agentName: agent.name,
        department: agent.department,
        mode: "ask",
        wallet: "learning",
      })
      .then(async (t) => {
        if (t.status !== "done") return;
        registry.update(agent.id, { learned: (registry.get(agent.id)?.learned ?? 0) + 1 });
        const ret = kb.saveRetrospective({
          taskId: t.id,
          agentId: agent.id,
          agentName: agent.name,
          didWell: `Nghiên cứu "${topic}" và lưu vào Thư viện Tri thức.`,
          didWrong: "Có thể cần đối chiếu thêm nguồn.",
          nextTime: "Tìm thêm 2 nguồn độc lập trước khi kết luận.",
        });
        broadcast("kb:retrospective", ret);
        kb.add({
          kind: "note",
          agentId: agent.id,
          title: topic,
          body: String(t.result ?? "").slice(0, 4000),
          sources: [],
          confidence: 0.55,
          fromWeb: true,
          tags: ["tự học"],
        });
      })
      .catch(() => {});
  }, minutes * 60_000);
}
startLearningLoop();

// --- Phân tầng: Giám đốc → Trưởng phòng → Nhân viên ---
orgDispatcher = new OrgDispatcher({
  registry,
  planner: makePlanner({
    chat: chatWithLedger("plan"),
    hasProvider: () => hub.hasProvider(),
    director: () => ({ name: registry.get("giamdoc")?.name ?? "Director", company: process.env.OFFICE_COMPANY ?? "FunnyOVS Corp" }),
  }),
  summarizer: makeSummarizer({ chat: chatWithLedger("summary"), hasProvider: () => hub.hasProvider() }),
  submit: (input) =>
    tasks.submit({
      title: input.title,
      prompt: input.prompt,
      agentId: input.agentId,
      agentName: input.agentName,
      department: input.department,
      ref: input.ref,
      lang: input.lang,
    }),
  openTasksOf: (agentId) =>
    tasks.list().filter((t) => t.agentId === agentId && (t.status === "pending" || t.status === "running" || t.status === "awaiting-approval")).length,
  emit: (node) => {
    // Người phân việc hiện "đang làm" trong lúc cấp dưới chạy; xong thì về rảnh (nếu không còn việc khác).
    if (node.kind === "delegation") {
      const busy = node.status === "running" || node.status === "awaiting-approval";
      const a = registry.get(node.assigneeId);
      const planning = node.level === 1 && node.childIds.length === 0;
      if (a && busy) {
        registry.setStatus(node.assigneeId, "working", `${planning ? "Đang lập kế hoạch" : "Phân việc"}: ${node.title}`, {
          key: planning ? "task.planning" : "task.delegating",
          vars: { title: node.title },
        });
      }
      else if (a && a.status === "working" && !tasks.list().some((t) => t.agentId === a.id && t.status === "running")) registry.setStatus(node.assigneeId, "idle");
      if (a) broadcast("agent:update", registry.get(node.assigneeId));
    }
    broadcast("org:node", node);
    saveOrg();
  },
});

// Lưu cây giao việc ra đĩa (ghi gộp, nguyên tử) và nạp lại khi khởi động.
const ORG_FILE = path.join(DATA_DIR, "org.json");
try {
  const loaded = orgDispatcher.restore(JSON.parse(fs.readFileSync(ORG_FILE, "utf8")));
  if (loaded) console.log(`[office3d] đã nạp ${loaded} nút giao việc`);
} catch {
  /* chưa có file hoặc file hỏng: bắt đầu trống */
}
let orgSaveTimer: NodeJS.Timeout | null = null;
function saveOrg(): void {
  if (orgSaveTimer) return;
  orgSaveTimer = setTimeout(() => {
    orgSaveTimer = null;
    try {
      const tmp = `${ORG_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(orgDispatcher!.list()), "utf8");
      fs.renameSync(tmp, ORG_FILE);
    } catch (err) {
      console.error("[office3d] không lưu được org.json:", err instanceof Error ? err.message : err);
    }
  }, 500);
  orgSaveTimer.unref();
}
// Dọn cây cũ (đã xong > 7 ngày) mỗi giờ để file không phình ra.
setInterval(() => {
  if (orgDispatcher!.prune(7 * 24 * 3600 * 1000) > 0) saveOrg();
}, 3600_000).unref();

// --- Văn phòng hợp nhất: bảng máy + cầu nối OfficeEntity ---
const machineProbe = new MachineProbe();
officeBridge = new OfficeBridge({
  listAgents: () => registry.list(),
  listTasks: () => tasks.list(),
  machine: () => machineProbe.current,
  pendingPermissions: () => perms.listPending(),
  pendingTokenApprovals: () => tasks.listApprovals(),
  pendingActions: () => gate.list(),
});
machineProbe.start(5000, (sample) => {
  if (officeBridge && listeners.size > 0) broadcastOffice(officeBridge.onMachine(sample));
});

// --- Truy cập mạng & token (chỉ từ chính máy này) ---
function loopbackOnly(req: express.Request, res: express.Response): boolean {
  if (auth.isLoopback(req)) return true;
  apiError(res, 403, "loopbackOnly");
  return false;
}
app.get("/api/auth/info", (req, res) => {
  if (!loopbackOnly(req, res)) return;
  const port = Number(process.env.PORT ?? 8787);
  res.json({
    lan: NETWORK.lan,
    tokenRequiredHere: auth.required(req),
    token: auth.currentToken(),
    urls: NETWORK.lan ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [],
    restartRequired: readNetwork(DATA_DIR).lan !== NETWORK.lan,
  });
});
app.post("/api/auth/rotate", (req, res) => {
  if (!loopbackOnly(req, res)) return;
  const token = auth.rotate();
  audit.append("auth.rotate", "user", {});
  res.json({ token });
});
app.post("/api/network", (req, res) => {
  if (!loopbackOnly(req, res)) return;
  const lan = (req.body as { lan?: unknown } | undefined)?.lan === true;
  writeNetwork(DATA_DIR, { lan });
  audit.append("network.lan", "user", { lan });
  res.json({ lan, restartRequired: lan !== NETWORK.lan });
});

app.get("/api/org", (_req, res) => {
  res.json({
    agents: registry.list().map((a) => ({ id: a.id, name: a.name, role: a.role, department: a.department, tier: a.tier, reportsTo: a.reportsTo ?? null, status: a.status })),
    nodes: orgDispatcher!.list(),
  });
});

app.post("/api/org/assign", async (req, res) => {
  if (emergencyStop) return apiError(res, 423, "emergency");
  const body = (req.body ?? {}) as { prompt?: string; title?: string; toAgentId?: string; lang?: string };
  const prompt = String(body.prompt ?? "").trim().slice(0, 8000);
  if (!prompt) return apiError(res, 400, "noPrompt");
  const toAgentId = body.toAgentId ?? orgDispatcher!.director()?.id ?? "giamdoc";
  if (!registry.get(toAgentId)) return apiError(res, 404, "unknownAgent", { id: toAgentId.slice(0, 40) });
  try {
    const root = await orgDispatcher!.assign({ title: body.title, prompt, toAgentId, lang: normalizeLang(body.lang) });
    res.json({ root, tree: orgDispatcher!.tree(root.id) });
  } catch (err) {
    apiError(res, 500, "badRequest", undefined, err instanceof Error ? err.message : undefined);
  }
});

// Lịch giao việc lặp lại: đến giờ thì giao cho người nhận như khi bạn tự giao (qua đúng ước lượng/duyệt/ngân sách).
const scheduler = new Scheduler({
  file: path.join(DATA_DIR, "schedules.json"),
  run: async (s) => {
    const root = await orgDispatcher!.assign({ title: s.title, prompt: s.prompt, toAgentId: s.toAgentId, lang: s.lang });
    return { rootId: root.id };
  },
  paused: () => emergencyStop,
  agentExists: (id) => Boolean(registry.get(id)),
  defaultAgent: () => orgDispatcher!.director()?.id ?? "giamdoc",
  onEvent: (kind, detail) => audit.append(kind, kind === "schedule.run" ? "system" : "user", detail),
});
scheduler.start();
economy.start();

registerBusinessRoutes(app, {
  audit,
  scheduler,
  dataDir: DATA_DIR,
  org: {
    list: () => orgDispatcher!.list(),
    replaceAll: (raw) => orgDispatcher!.replaceAll(raw),
    busy: () => orgDispatcher!.busy() || tasks.list().some((t) => t.status === "running" || t.status === "awaiting-approval"),
    onReplaced: () => {
      saveOrg();
      broadcastOffice([{ type: "org.snapshot", nodes: orgDispatcher!.list(), at: new Date().toISOString() }]);
    },
  },
  hub,
  db: officeDb,
  mail,
  gate,
  isLoopback: (req) => auth.isLoopback(req),
  version: pkg.version,
  emergency: () => emergencyStop,
  lan: NETWORK.lan,
  startedAt: STARTED_AT,
});
registerEconomyRoutes(app, { economy, isLoopback: (req) => auth.isLoopback(req) });
if (studio) registerStudioRoutes(app, { studio, isLoopback: (req) => auth.isLoopback(req) });
gate.on("request", (r) => broadcast("action:request", r));
gate.on("decided", (r) => {
  broadcast("action:decided", r);
  audit.append(r.outcome === "approved" ? "action.approved" : r.outcome === "denied" ? "action.denied" : "action.expired", r.outcome === "expired" ? "system" : "user", {
    action: r.action,
    agent: r.agentId,
    ...(typeof r.vars.to === "string" ? { to: r.vars.to } : {}),
    ...(typeof r.vars.repo === "string" ? { repo: r.vars.repo } : {}),
  });
});

app.get("/api/office/entities", (_req, res) => {
  const snap = officeBridge!.snapshot();
  res.json(snap.type === "snapshot" ? snap.entities : []);
});

// --- Static client ---
const clientDist = process.env.OFFICE_CLIENT_DIST ? path.resolve(process.env.OFFICE_CLIENT_DIST) : path.join(ROOT, "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", verifyClient: (info: { origin: string; req: http.IncomingMessage }) => verifyWsClient(info, EXTRA_HOSTS, NETWORK.lan) && auth.verifyWs(info.req) });

wss.on("connection", (ws) => {
  const listener: Listener = (event, data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
  };
  listeners.add(listener);
  // Ảnh chụp đầy đủ theo schema chung cho client văn phòng hợp nhất.
  ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: officeBridge!.snapshot() }));
  ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: { type: "org.snapshot", nodes: orgDispatcher!.list(), at: new Date().toISOString() } }));
  for (const ev of officeBridge!.pendingApprovals()) ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: ev }));
  ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: { type: "emergency", active: emergencyStop, at: new Date().toISOString() } }));
  ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: { type: "economy.state", state: economy.state(), at: new Date().toISOString() } }));
  if (studio) ws.send(JSON.stringify({ event: OFFICE_WS_EVENT, data: { type: "studio.state", state: studio.state(), at: new Date().toISOString() } }));
  ws.send(
    JSON.stringify({
      event: "state",
      data: {
        agents: registry.list(),
        departments: DEPARTMENTS,
        config: configStore.get(),
        budget: budget.snapshot(),
      },
    }),
  );
  ws.on("close", () => listeners.delete(listener));
});

const PORT = Number(process.env.PORT ?? 8787);
// OFFICE_HOST: ứng dụng desktop chỉ lắng nghe 127.0.0.1; mặc định giữ nguyên hành vi cũ.
// Bật LAN trong cấu hình → lắng nghe mọi giao diện (token bắt buộc cho máy khác); ngược lại theo OFFICE_HOST (mặc định cũ).
const HOST = NETWORK.lan ? "0.0.0.0" : process.env.OFFICE_HOST;
const onListening = () => {
  console.log(`[office3d] server: http://localhost:${PORT}`);
  console.log(`[office3d] workspace: ${config.workspace}`);
  console.log(`[office3d] llm: ${loadLlmConfig() ? "yes" : "no (rule-based mode)"}`);
};
if (HOST) server.listen(PORT, HOST, onListening);
else server.listen(PORT, onListening);

// Cổng công khai RIÊNG cho sản phẩm trả phí (chỉ khi bật EAL và đặt ECONOMY_PUBLIC_PORT). Chỉ có /api/public/insights* — xem economy/publicServer.ts.
let publicServer: http.Server | null = null;
const publicPort = Number(process.env.ECONOMY_PUBLIC_PORT);
if (economy.enabled && Number.isInteger(publicPort) && publicPort > 0 && publicPort < 65536) {
  publicServer = startPublicServer(economy, { port: publicPort, host: process.env.ECONOMY_PUBLIC_HOST, baseUrl: process.env.ECONOMY_PUBLIC_BASE_URL, trustProxy: process.env.ECONOMY_TRUST_PROXY === "1" });
  publicServer.on("error", (e) => console.error("[economy] public server:", e.message));
  console.log(`[economy] public paywall server on port ${publicPort} (${process.env.ECONOMY_PUBLIC_HOST ?? "127.0.0.1"})`);
}

process.on("uncaughtException", (err) => console.error("[office3d] uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("[office3d] unhandledRejection:", err));

async function shutdown(): Promise<void> {
  try {
    fs.writeFileSync(ORG_FILE, JSON.stringify(orgDispatcher!.list()), "utf8");
  } catch {
    /* bỏ qua */
  }
  machineProbe.stop();
  scheduler.stop();
  economy.stop();
  studio?.abortAll();
  publicServer?.close();
  officeDb.close();
  await browser.close();
  kb.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Khi chạy dưới Electron (fork), kênh IPC đóng = ứng dụng đã thoát → tự dừng, không để tiến trình mồ côi.
process.on("disconnect", shutdown);
process.on("message", (m) => {
  if (m === "shutdown") void shutdown();
});
