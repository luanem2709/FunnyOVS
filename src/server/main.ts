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
import { SandboxBrowser } from "./browser/sandboxBrowser.js";
import { KnowledgeBase } from "./knowledge/knowledgeBase.js";
import { ResearchEngine } from "./learning/researchEngine.js";
import { ProposalStore } from "./selfdev/proposalStore.js";
import { AgentRegistry } from "./agents/agentRegistry.js";
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
const budget = new TokenBudget(true);
budget.configure({
  dailyLimit: config.dailyTokenLimit,
  learningPercent: config.learning.learningPercent,
});

const browser = new SandboxBrowser({ dataDir: DATA_DIR, policy: config.browser });
const kb = new KnowledgeBase(DATA_DIR);
const research = new ResearchEngine({ browser, kb, budget });
const proposals = new ProposalStore(ROOT);
const registry = new AgentRegistry();

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

// ---- API ----
app.get("/api/state", (_req, res) => {
  res.json({
    agents: registry.list(),
    config: configStore.get(),
    emergencyStop,
    budget: { total: budget.getUsage("normal"), learning: budget.getUsage("learning") },
    permissions: perms.getState(),
    pendingRequests: perms.listPending(),
    proposals: proposals.list(),
  });
});

app.get("/api/agents", (_req, res) => res.json(registry.list()));

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

// --- Ngân sách token ---
app.get("/api/budget", (_req, res) =>
  res.json({ total: budget.getUsage("normal"), learning: budget.getUsage("learning") }),
);

app.post("/api/budget", (req, res) => {
  const { dailyLimit, learningPercent } = req.body as any;
  budget.configure({ dailyLimit, learningPercent });
  const c = configStore.get();
  configStore.update({
    dailyTokenLimit: dailyLimit ?? c.dailyTokenLimit,
    learning: { ...c.learning, learningPercent: learningPercent ?? c.learning.learningPercent },
  });
  res.json({ total: budget.getUsage("normal"), learning: budget.getUsage("learning") });
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
  budget.configure({ dailyLimit: c.dailyTokenLimit, learningPercent: c.learning.learningPercent });
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
  broadcast("emergency", { emergencyStop });
  res.json({ emergencyStop });
});

// --- Tự học định kỳ ---
let learningTimer: NodeJS.Timeout | null = null;

function startLearningLoop(): void {
  if (learningTimer) clearInterval(learningTimer);
  const minutes = Math.max(5, configStore.get().learning.intervalMinutes);
  learningTimer = setInterval(() => {
    const c = configStore.get();
    if (!c.learning.enabled || emergencyStop) return;
    if (c.automationLevel === "ask") return; // Chỉ hỏi → không tự học
    const agent = registry.list()[0];
    if (!agent) return;
    const topic = c.learning.topics[Math.floor(Math.random() * c.learning.topics.length)];
    void research
      .research({ agent, topic, learningMode: true }, policyForLevel(c.automationLevel))
      .then(() => {
        registry.update(agent.id, { learned: (registry.get(agent.id)?.learned ?? 0) + 1 });
        const ret = kb.saveRetrospective({
          taskId: `learn_${Date.now()}`,
          agentId: agent.id,
          agentName: agent.name,
          didWell: `Nghiên cứu "${topic}" và lưu vào Thư viện Tri thức.`,
          didWrong: "Có thể cần đối chiếu thêm nguồn.",
          nextTime: "Tìm thêm 2 nguồn độc lập trước khi kết luận.",
        });
        broadcast("kb:retrospective", ret);
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
  ws.send(JSON.stringify({ event: "state", data: { agents: registry.list(), config: configStore.get() } }));
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
