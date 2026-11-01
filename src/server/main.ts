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
import { DEPARTMENTS } from "./agents/departments.js";
import { TaskRunner } from "./tasks/taskRunner.js";
import { ActivityLog } from "./activity/activityLog.js";
import { policyForLevel, type AutomationLevel } from "./automation/automationPolicy.js";
import { loadLlmConfig } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

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
app.use(express.json({ limit: "2mb" }));

// ---- Realtime bus ----
type Listener = (event: string, data: unknown) => void;
const listeners = new Set<Listener>();

function broadcast(event: string, data: unknown): void {
  for (const l of listeners) {
    try {
      l(event, data);
    } catch {
      /* ignore */
    }
  }
}

// ---- Task runner (điều phối tác vụ + duyệt trước khi tốn nhiều token) ----
const tasks = new TaskRunner({
  budget,
  ledger,
  workspace: config.workspace,
  defaultModel: config.cursorModel,
  freeTierOnly: config.freeTierOnly,
  isAutonomous: () => configStore.get().automationLevel === "autonomous",
  getCursorPercentUsed: () => budget.getQuota()?.totalPercentUsed,
  onUpdate: (t) => {
    broadcast("task:update", t);
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
  if (!a) return res.status(404).json({ error: "Không tìm thấy nhân vật." });
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
  if (!decided) return res.status(404).json({ error: "Yêu cầu không tồn tại hoặc đã xử lý." });
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
  if (emergencyStop) return res.status(423).json({ error: "Đang bật chế độ dừng khẩn cấp." });
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
  if (emergencyStop) return res.status(423).json({ error: "Đang bật chế độ dừng khẩn cấp." });
  const body = req.body as any;
  const agent = registry.get(body.agentId);
  const task = await tasks.submit({
    title: body.title ?? "Tác vụ mới",
    prompt: body.prompt ?? "",
    agentId: body.agentId ?? "minh",
    agentName: agent?.name ?? body.agentName ?? "Agent",
    department: body.department ?? agent?.department ?? "dispatch",
    context: body.context,
    toolSteps: body.toolSteps,
    mode: body.mode,
    wallet: body.wallet,
  });
  res.json(task);
});

app.post("/api/tasks/:id/approve", async (req, res) => {
  // Id yêu cầu duyệt có dạng "apr_<taskId>".
  const t = await tasks.approve(`apr_${req.params.id}`);
  if (!t) return res.status(404).json({ error: "Không tìm thấy yêu cầu duyệt." });
  res.json(t);
});

app.post("/api/tasks/:id/reject", (req, res) => {
  const t = tasks.reject(`apr_${req.params.id}`);
  if (!t) return res.status(404).json({ error: "Không tìm thấy yêu cầu duyệt." });
  res.json(t);
});

app.post("/api/tasks/:id/cancel", (req, res) => {
  const t = tasks.cancel(req.params.id);
  if (!t) return res.status(404).json({ error: "Không tìm thấy tác vụ." });
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
  } else {
    for (const a of registry.list()) {
      registry.setStatus(a.id, "idle");
      broadcast("agent:update", registry.get(a.id));
    }
  }
  broadcast("emergency", { emergencyStop });
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

// --- Static client ---
const clientDist = path.join(ROOT, "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const listener: Listener = (event, data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
  };
  listeners.add(listener);
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
server.listen(PORT, () => {
  console.log(`[office3d] server: http://localhost:${PORT}`);
  console.log(`[office3d] workspace: ${config.workspace}`);
  console.log(`[office3d] llm: ${loadLlmConfig() ? "yes" : "no (rule-based mode)"}`);
});

process.on("SIGINT", async () => {
  await browser.close();
  kb.close();
  process.exit(0);
});
