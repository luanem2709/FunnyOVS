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
import { LearningEngine } from "./learning/learningEngine.js";
import { ProposalStore } from "./selfdev/proposalStore.js";
import { AgentRegistry } from "./agents/agentRegistry.js";
import { DEPARTMENTS } from "./agents/departments.js";
import {
  AUTO_WORK_CATALOG,
  activeHoursLeft,
  estimateItemCost,
  estimateRoundCost,
  governorIntervalMs,
  markDispatched,
  markFree,
  pickNextWork,
  type AutoWorkItem,
  type DispatcherState,
} from "./agents/workDispatcher.js";
import { TaskRunner } from "./tasks/taskRunner.js";
import { ActivityLog } from "./activity/activityLog.js";
import { policyForLevel, type AutomationLevel } from "./automation/automationPolicy.js";
import { loadLlmConfig } from "./llm.js";
import { ActionLog } from "./executor/actionLog.js";
import { Executor, deviceFromController, type DeviceDriver } from "./executor/executor.js";
import { LoopGuard } from "./executor/loopGuard.js";
import { planActions } from "./executor/planner.js";
import { runActionLoop } from "./executor/actionLoop.js";
import { ACTION_DOCS, PERMISSION_LABELS, type PermissionLevel } from "./executor/actionSchema.js";
import { PermissionLevelManager, FULL_CONFIRM_PHRASE } from "./security/permissionLevel.js";
import {
  GuardedInputController,
  PowerShellInputController,
  RecordingInputController,
} from "./executor/inputController.js";

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

// Bộ điều phối tự học trong ngân sách (GĐ 6).
const learning = new LearningEngine({
  budget,
  getTopics: () => configStore.get().learning.topics,
  tokensPerTopic: 12_000,
  maxTopicsPerSession: 2,
  intervalMinutes: configStore.get().learning.intervalMinutes,
});
learning.on("progress", (p) => broadcast("learning:progress", p));
learning.on("topic-paused", (p) =>
  activity.record({
    kind: "system",
    actor: "hệ thống",
    message: `Tạm dừng chủ đề "${p.topic}" sau ${p.failures} lần thất bại.`,
    level: "warn",
  }),
);
const proposals = new ProposalStore(ROOT);
const registry = new AgentRegistry();
// Khôi phục token/số tác vụ đã dùng của từng nhân viên từ ledger,
// để HUD không bị reset 0 mỗi lần server khởi động lại.
for (const row of ledger.totalsByAgent()) {
  registry.update(row.agentId, { tokensUsed: row.tokens, tasksDone: row.calls });
}
const activity = new ActivityLog();

// ---- GĐ 4: Executor + 3 cấp quyền ----
// Nhật ký hành động CHỈ GHI THÊM (append-only) + chuỗi hash chống sửa file.
const actionLog = new ActionLog(path.join(DATA_DIR, "action-log.jsonl"));

// Quản lý 3 cấp quyền (Sandbox / Được cấp / Toàn quyền).
const permLevel = new PermissionLevelManager((s) => {
  broadcast("perm:level", { ...s, remainingSeconds: permLevel.remainingSeconds() });
  activity.record({
    kind: "permission",
    actor: "hệ thống",
    message: `Cấp quyền: ${PERMISSION_LABELS[s.level]}`,
    level: s.level === "full" ? "danger" : "info",
  });
});

// Driver thiết bị (GĐ 5): có "đèn báo" overlay + nút hủy khẩn cấp.
// Mặc định dùng controller GHI LẠI (không đụng máy thật) — an toàn khi phát triển.
// Muốn bật thật: đặt OFFICE_INPUT_REAL=1 (chỉ nên dùng khi đang ở Cấp 3).
const inputReal = process.env.OFFICE_INPUT_REAL === "1";
const inputController = new GuardedInputController(
  inputReal ? new PowerShellInputController() : new RecordingInputController(),
);
inputController.on("overlay", (o) => broadcast("input:overlay", o));
inputController.on("aborted", () => {
  activity.record({
    kind: "emergency",
    actor: "bạn",
    message: "Đã hủy thao tác chuột/bàn phím khẩn cấp.",
    level: "danger",
  });
});
let deviceDriver: DeviceDriver | undefined = deviceFromController(inputController);

const executor = new Executor({
  workspace: config.workspace,
  log: actionLog,
  device: deviceDriver,
  getLevel: () => permLevel.level(),
  isTainted: () => permLevel.isTainted(),
  trashDir: path.join(config.workspace, ".trash"),
  // Hỏi người dùng: tạo yêu cầu duyệt 4 lựa chọn rồi chờ quyết định.
  askUser: async (action, reason) => {
    const req = perms.requestApproval({
      agentId: "executor",
      agentName: "Executor",
      label: action.type,
      purpose: `${reason} — ${action.description}`,
    });
    broadcast("perm:request", req);
    return await waitForDecision(req.id);
  },
  checkPathPermission: (agentId, target, need) => {
    const res = perms.check({
      agentId,
      agentName: "Executor",
      target,
      reason: need,
      purpose: "Executor thực thi hành động",
    });
    if (res.allowed) return { allowed: true };
    if (res.needsRequest) return { allowed: false, reason: "Cần bạn cấp quyền cho đường dẫn này.", needsApproval: true };
    return { allowed: false, reason: res.reason, needsApproval: false };
  },
});

/** Chờ người dùng quyết định một yêu cầu quyền (tối đa 5 phút). */
function waitForDecision(requestId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      perms.off("decided", onDecided);
      resolve(false);
    }, 5 * 60 * 1000);
    const onDecided = (r: { id: string; status: string }) => {
      if (r.id !== requestId) return;
      clearTimeout(timer);
      perms.off("decided", onDecided);
      resolve(r.status === "approved");
    };
    perms.on("decided", onDecided);
  });
}

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

// ---- Bộ phân công việc tự động ----
// Giữ văn phòng "sống": nhân viên tự nhận việc, tự tiêu token, tự ghi ledger.
// Chỉ chạy ở mức tự động "balanced"/"autonomous" (mức "ask" thì không tự làm).
const dispatchState: DispatcherState = {
  busy: new Set<string>(),
  nextAllowed: new Map<string, number>(),
  dispatched: 0,
};

/** Chạy một mục việc tự động cho nhân viên. */
async function runAutoWork(item: AutoWorkItem): Promise<void> {
  const agent = registry.get(item.agentId);
  if (!agent) return;
  const policy = policyForLevel(configStore.get().automationLevel);

  activity.record({
    kind: "task",
    actor: agent.name,
    message: `Bắt đầu: ${item.title}`,
    detail: item.note,
  });

  if (item.kind === "research" || item.kind === "internal") {
    // Cả "việc nội bộ" cũng chạy THẬT: duyệt web, đọc nội dung, ghi vào Thư viện
    // tri thức và trừ ví token. Trước đây việc nội bộ chỉ "ngủi 2,5 giây rồi
    // báo Xong" → nhân viên đứng yên, thanh token không nhúc nhích, người dùng
    // tưởng hệ thống chết.
    const learningMode = item.wallet === "learning";
    registry.setStatus(agent.id, learningMode ? "learning" : "researching", item.title);
    broadcast("agent:update", registry.get(agent.id));
    try {
      const result = await research.research(
        {
          agent,
          topic: item.topic ?? item.title,
          learningMode,
          maxSources: item.maxSources,
          snippetChars: item.snippetChars,
        },
        policy,
      );
      const spent = result.tokensUsed ?? 0;
      if (spent > 0) {
        ledger.add({
          taskId: `auto_${Date.now().toString(36)}`,
          department: agent.department,
          agentId: agent.id,
          agentName: agent.name,
          model: "sandbox-web",
          backend: "sandbox-browser",
          inputTokens: spent,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costCents: 0,
          wallet: item.wallet,
          cursorPercentUsed: budget.getQuota()?.totalPercentUsed,
          quotaSource: "estimated",
          durationMs: 0,
          ok: result.ok,
          error: result.ok ? undefined : result.note,
        });
        registry.recordUsage(agent.id, spent);
        broadcast("agent:update", registry.get(agent.id));
        if (learningMode) {
          registry.update(agent.id, { learned: (registry.get(agent.id)?.learned ?? 0) + 1 });
        }
      }
      activity.record({
        kind: "task",
        actor: agent.name,
        message: result.ok ? `Xong: ${item.title}` : `Không xong: ${item.title}`,
        detail: `${spent.toLocaleString("vi-VN")} token · ${result.sources.length} nguồn${
          result.ok ? "" : ` · ${result.note ?? ""}`
        }`,
        level: result.ok ? "info" : "warn",
      });
    } catch (err) {
      activity.record({
        kind: "task",
        actor: agent.name,
        message: `Lỗi: ${item.title}`,
        detail: (err as Error).message,
        level: "danger",
      });
    } finally {
      registry.setStatus(agent.id, "idle");
      const updated = registry.get(agent.id);
      if (updated) broadcast("agent:update", updated);
      markFree(dispatchState, agent.id);
    }
    return;
  }
}

let dispatchTimer: NodeJS.Timeout | null = null;
/** Mốc bắt đầu ngày (để governor san đều ngân sách theo giờ còn lại). */
const dayStartMs = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
/** Nhịp giao việc hiện tại (ms) — do governor điều chỉnh theo ngân sách còn lại. */
let dispatchIntervalMs = 60_000;
/** Thời điểm bắt đầu vòng giao việc gần nhất (toàn văn phòng). */
let lastRoundAt = 0;

/** Chi phí ước lượng của một mục việc (dùng cho governor). */
function itemCost(item: AutoWorkItem): number {
  return estimateItemCost(item);
}

function startDispatchLoop(): void {
  if (dispatchTimer) clearInterval(dispatchTimer);
  const tick = (): void => {
    if (emergencyStop) return;
    const level = configStore.get().automationLevel;
    if (level === "ask") return; // Chỉ hỏi → không tự làm
    const now = Date.now();

    // Governor: nhịp VÒNG giao việc tính theo ngân sách ngày còn lại.
    // Mỗi vòng = cả văn phòng cùng nhận việc (song song).
    const snap = budget.snapshot();
    const remaining = snap.total.limit - snap.total.used - snap.learning.used;
      const interval = governorIntervalMs({
        remaining,
        roundCost: estimateRoundCost(AUTO_WORK_CATALOG),
        baseIntervalMs: 60_000,
        // Tối đa 8 phút giữa hai vòng ⇒ người dùng luôn thấy văn phòng chuyển
        // động. Thực tế mỗi vòng tiêu ~4k token nên 8 phút/vòng vẫn nằm trong
        // hạn mức ngày; governor sẽ tự giãn nhịp khi ví cạn.
        maxIntervalMs: 8 * 60_000,
        activeHoursLeft: activeHoursLeft(now, dayStartMs),
      });
    dispatchIntervalMs = Number.isFinite(interval) ? interval : 30 * 60_000;
    // Chưa tới nhịp → bỏ qua vòng này.
    if (now - lastRoundAt < dispatchIntervalMs) return;
    lastRoundAt = now;

    for (const item of AUTO_WORK_CATALOG) {
      const picked = pickNextWork(AUTO_WORK_CATALOG, dispatchState, item.agentId, now);
      if (!picked) continue;
      // Ví của việc này đã cạn thì dừng (không tự tăng hạn mức).
      if (!budget.canSpend(picked.wallet, itemCost(picked))) continue;
      markDispatched(dispatchState, picked, now);
      void runAutoWork(picked);
    }
  };
  void tick();
  dispatchTimer = setInterval(tick, 5_000);
}
startDispatchLoop();

// ---- API ----
app.get("/api/state", (_req, res) => {
  res.json({
    agents: registry.list(),
    // Phòng ban kèm số liệu chi tiêu THẬT từ ledger. Trước đây gửi
    // `DEPARTMENTS` (hằng tĩnh) ⇒ client không có `spend` ⇒ panel hiện "0 token"
    // trong khi thanh ngân sách lại hiện số thật ⇒ hai nơi lệch nhau.
    departments: DEPARTMENTS.map((d) => ({
      ...d,
      agents: registry.listByDepartment(d.id),
      spend: ledger.totalsByDepartment().find((t) => t.department === d.id) ?? {
        department: d.id,
        tokens: 0,
        cents: 0,
        calls: 0,
      },
    })),
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

/** Trạng thái bộ phân công việc tự động (để HUD hiện "nhân viên đang bận"). */
app.get("/api/dispatch", (_req, res) => {
  const snap = budget.snapshot();
  res.json({
    dispatched: dispatchState.dispatched,
    busy: [...dispatchState.busy],
    catalog: AUTO_WORK_CATALOG.map((w) => ({ agentId: w.agentId, title: w.title, kind: w.kind })),
    // Nhịp giao việc hiện tại (ms) — do governor tính theo ngân sách còn lại.
    intervalMs: dispatchIntervalMs,
    remainingTokens: snap.total.limit - snap.total.used,
    remainingLearningTokens: snap.learning.limit - snap.learning.used,
  });
});

/** Giao việc ngay cho một nhân viên (dùng để thử nhanh từ UI). */
app.post("/api/dispatch/run", async (req, res) => {
  if (emergencyStop) return res.status(423).json({ error: "Đang bật chế độ dừng khẩn cấp." });
  const agentId = String(req.body?.agentId ?? "");
  const item = AUTO_WORK_CATALOG.find((w) => w.agentId === agentId);
  if (!item) return res.status(404).json({ error: "Nhân viên này không có việc tự động." });
  markDispatched(dispatchState, item, Date.now());
  void runAutoWork(item);
  res.json({ ok: true, item: { agentId: item.agentId, title: item.title } });
});

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

// --- GĐ 4: Executor ---
// Schema hành động (để LLM biết hợp đồng và để UI hiển thị).
app.get("/api/executor/schema", (_req, res) =>
  res.json({ actions: ACTION_DOCS, levels: PERMISSION_LABELS }),
);

// Cấp quyền hiện hành + taint + đếm ngược.
app.get("/api/executor/level", (_req, res) =>
  res.json({
    ...permLevel.get(),
    remainingSeconds: permLevel.remainingSeconds(),
    taint: permLevel.taintState(),
    running: executor.runningCount,
  }),
);

// Bước 1 xác nhận Cấp 3: nhập cụm "TOAN QUYEN".
app.post("/api/executor/level/request-full", (req, res) => {
  const { phrase } = req.body as { phrase: string };
  res.json(permLevel.requestFullAccess(phrase ?? ""));
});

// Bước 2: bật Cấp 3 với thời lượng (ms). 0 = không hết hạn.
app.post("/api/executor/level/confirm-full", (req, res) => {
  const { durationMs } = req.body as { durationMs: number };
  res.json(permLevel.confirmFullAccess(Number(durationMs ?? 0)));
});

// Tắt Cấp 3 (quay về Sandbox).
app.post("/api/executor/level/disable-full", (_req, res) => {
  res.json(permLevel.disableFullAccess());
});

// Cấp 2: nâng lên "Được cấp" sau khi người dùng duyệt yêu cầu.
app.post("/api/executor/level/granted", (_req, res) => {
  res.json({ ok: true, state: permLevel.setGranted() });
});

// Taint: đánh dấu phiên bị nhiễm / làm sạch.
app.post("/api/executor/taint", (req, res) => {
  const { source, clear } = req.body as { source?: string; clear?: boolean };
  res.json(clear ? permLevel.clearTaint() : permLevel.markTainted(source ?? "nội dung không tin cậy"));
});

// --- GĐ 5: Thùng rác (xóa = khôi phục được) ---
app.get("/api/executor/trash", (_req, res) => {
  const items = executor.trash.list();
  res.json({
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      original: i.original,
      trashed: i.trashed,
      ts: i.ts,
      size: i.size,
      restored: i.restored,
    })),
  });
});

// Khôi phục một mục từ thùng rác về vị trí cũ.
app.post("/api/executor/trash/restore", async (req, res) => {
  const { id } = req.body as { id: string };
  const r = await executor.trash.restore(id);
  res.status(r.ok ? 200 : 400).json(r);
});

// Dọn rác THẬT (không khôi phục được) — cần xác nhận.
app.post("/api/executor/trash/purge", async (req, res) => {
  const { id, all } = req.body as { id?: string; all?: boolean };
  const r = all ? await executor.trash.purgeAll() : await executor.trash.purge(id ?? "");
  res.status(r.ok ? 200 : 400).json(r);
});

// --- GĐ 5: Overlay điều khiển chuột/bàn phím + hủy khẩn cấp ---
app.get("/api/executor/overlay", (_req, res) => res.json(inputController.overlayState));

// Hủy thao tác chuột/bàn phím đang chạy (nút hủy khẩn cấp trên overlay).
app.post("/api/executor/overlay/abort", (_req, res) => {
  inputController.abort();
  activity.record({
    kind: "emergency",
    actor: "bạn",
    message: "Đã hủy thao tác chuột/bàn phím.",
    level: "danger",
  });
  res.json(inputController.overlayState);
});

// Bật lại sau khi hủy.
app.post("/api/executor/overlay/reset", (_req, res) => {
  inputController.reset();
  res.json(inputController.overlayState);
});

// Nhật ký hành động (chỉ ghi thêm) — màn hình xem lại.
app.get("/api/executor/log", (req, res) => {
  const limit = Math.min(1000, Number((req.query.limit as string) ?? 200));
  res.json({ entries: actionLog.list(limit), total: actionLog.size, chain: actionLog.verifyChain() });
});

// Chạy thử một hành động (dùng để kiểm thử + cho UI "thử").
app.post("/api/executor/run", async (req, res) => {
  const { action, agentId, agentName } = req.body as {
    action: unknown;
    agentId?: string;
    agentName?: string;
  };
  const guard = new LoopGuard({ maxRepeats: 3, maxSteps: 20, maxDurationMs: 120_000 });
  const r = await executor.execute(
    agentId ?? "executor",
    agentName ?? "Executor",
    action,
    guard,
  );
  broadcast("executor:result", r);
  res.status(r.ok ? 200 : 403).json(r);
});

// LLM đề xuất hành động → Executor thực thi (vòng lặp có giới hạn).
app.post("/api/executor/plan", async (req, res) => {
  const { goal, context, agentId, agentName } = req.body as {
    goal: string;
    context?: string;
    agentId?: string;
    agentName?: string;
  };
  const plan = await planActions(goal, context ?? "", permLevel.isTainted());
  res.json(plan);
});

// Chạy trọn vòng lặp: đề xuất → thực thi → phản hồi.
app.post("/api/executor/loop", async (req, res) => {
  const { goal, context, agentId, agentName } = req.body as {
    goal: string;
    context?: string;
    agentId?: string;
    agentName?: string;
  };
  const result = await runActionLoop(
    agentId ?? "executor",
    agentName ?? "Executor",
    goal,
    {
      executor,
      isTainted: () => permLevel.isTainted(),
      guard: { maxRepeats: 3, maxSteps: 20, maxDurationMs: 180_000 },
      maxTurns: 3,
    },
    context ?? "",
  );
  broadcast("executor:loop", result);
  res.json(result);
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

/**
 * Tìm kiếm tri thức có xếp hạng (GĐ 6).
 *
 * Khác `LIKE` thuần: chấm điểm theo
 *   - khớp ở tiêu đề (mạnh hơn body)
 *   - khớp đúng cả từ (khớp cụm → điểm cao hơn)
 *   - độ tin cậy của mục
 *   - mới hơn = tốt hơn
 */
app.get("/api/kb/search", (req, res) => {
  const { q, kind, limit } = req.query as any;
  const query = String(q ?? "").trim();
  if (!query) {
    res.json({ query, results: kb.list({ kind, limit: 50 }) });
    return;
  }
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const candidates = kb.list({ kind, limit: 500 });

  const scored = candidates
    .map((e) => {
      const title = e.title.toLowerCase();
      const body = e.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 10;
        if (body.includes(t)) score += 3;
        // Khớp đúng từ (ranh giới từ) → thêm điểm.
        const rx = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
        if (rx.test(e.title)) score += 6;
        if (rx.test(e.body)) score += 2;
      }
      // Cụm từ khớp nguyên vẹn → rất mạnh.
      if (title.includes(query.toLowerCase())) score += 15;
      else if (body.includes(query.toLowerCase())) score += 5;
      // Độ tin cậy và độ mới.
      score *= 0.5 + e.confidence;
      const ageDays = (Date.now() - new Date(e.createdAt).getTime()) / 86_400_000;
      score *= Math.max(0.6, 1 - ageDays / 180);
      return { entry: e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Number(limit ?? 30), 100));

  res.json({ query, results: scored.map((s) => ({ ...s.entry, score: Number(s.score.toFixed(2)) })) });
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
  const known = registry.get(agentId);
  const agent = known ?? { id: agentId, name: agentId, role: "", department: "automation" as const };
  const policy = policyForLevel(configStore.get().automationLevel);
  if (emergencyStop) return res.status(423).json({ error: "Đang bật chế độ dừng khẩn cấp." });
  registry.setStatus(agentId, learningMode ? "learning" : "researching", topic);
  broadcast("agent:update", registry.get(agentId));
  const result = await research.research({ agent, topic, learningMode }, policy);
  registry.setStatus(agentId, "idle");
  const updated = registry.get(agentId);
  if (updated) broadcast("agent:update", updated);

  // Ghi ledger + cộng token cho nhân viên → thanh năng lượng chạy, HUD đổi số.
  const spent = result.tokensUsed ?? 0;
  if (spent > 0) {
    ledger.add({
      taskId: `research_${Date.now().toString(36)}`,
      department: agent.department ?? "automation",      agentId: agent.id,
      agentName: agent.name,
      model: "sandbox-web",
      backend: "sandbox-browser",
      inputTokens: spent,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costCents: 0,
      wallet: learningMode ? "learning" : "normal",
      cursorPercentUsed: budget.getQuota()?.totalPercentUsed,
      quotaSource: "estimated",
      durationMs: 0,
      ok: result.ok,
      error: result.ok ? undefined : result.note,
    });
    registry.recordUsage(agent.id, spent);
    const after = registry.get(agent.id);
    if (after) broadcast("agent:update", after);
    activity.record({
      kind: "task",
      actor: agent.name,
      message: `${learningMode ? "Tự học" : "Nghiên cứu"}: ${topic}`,
      detail: `${spent.toLocaleString("vi-VN")} token · ${result.sources.length} nguồn`,
      level: result.ok ? "info" : "warn",
    });
  }
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
    // Kill mọi lệnh Executor đang chạy (cả cây tiến trình con).
    const killed = executor.killAll();
    if (killed > 0) {
      activity.record({
        kind: "emergency",
        actor: "hệ thống",
        message: `Đã kill ${killed} cây tiến trình của Executor.`,
        level: "danger",
      });
    }
    // Hủy mọi thao tác chuột/bàn phím đang chạy.
    if (inputController.overlayState.active) {
      inputController.abort();
      activity.record({
        kind: "emergency",
        actor: "hệ thống",
        message: "Đã hủy thao tác chuột/bàn phím.",
        level: "danger",
      });
    }
    // Tắt Cấp 3 (Toàn quyền) — dừng khẩn cấp phải hạ quyền.
    if (permLevel.level() === "full") permLevel.disableFullAccess();
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

// --- Tự học định kỳ (GĐ 6: trong ngân sách) ---
// Tự học đi qua TaskRunner để: (1) dùng ví "learning" riêng, (2) được ghi
// vào ledger, (3) vẫn phải ước lượng và hỏi nếu vượt ngưỡng.
//
// LearningEngine quyết định TRƯỚC khi học:
//   - Ví học còn bao nhiêu → học mấy chủ đề, đọc mấy nguồn.
//   - Chủ đề nào chưa học / học lâu rồi → ưu tiên cái đó.
//   - Chủ đề hỏng 3 lần → tạm dừng, không lãng phí token nữa.
let learningTimer: NodeJS.Timeout | null = null;
let learningBusy = false;

function startLearningLoop(): void {
  if (learningTimer) clearInterval(learningTimer);
  const minutes = Math.max(5, configStore.get().learning.intervalMinutes);
  learningTimer = setInterval(() => {
    void runLearningSession();
  }, minutes * 60_000);
}

/** Chạy 1 phiên tự học, tự điều chỉnh theo ngân sách còn lại. */async function runLearningSession(): Promise<void> {
  if (learningBusy) return;
  const c = configStore.get();
  if (!c.learning.enabled || emergencyStop) return;
  if (c.automationLevel === "ask") return; // Chỉ hỏi → không tự học

  const plan = learning.planSession(c.learning.learningPercent);
  if (!plan.shouldLearn || plan.topics.length === 0) {
    broadcast("learning:plan", plan);
    return;
  }
  broadcast("learning:plan", plan);

  const agent = registry.leadOf("library") ?? registry.list()[0];
  if (!agent) return;

  learningBusy = true;
  try {
    for (const topic of plan.topics) {
      if (emergencyStop) break;
      const t = await tasks.submit({
        title: `Tự học: ${topic}`,
        prompt:
          `Nghiên cứu chủ đề "${topic}" bằng công cụ duyệt web sandbox, ` +
          `tóm tắt thành 5 gạch đầu dòng và ghi vào Thư viện Tri thức.`,
        agentId: agent.id,
        agentName: agent.name,
        department: agent.department,
        mode: "ask",
        wallet: "learning",
      });

      const ok = t.status === "done";
      learning.recordOutcome(topic, ok);
      if (!ok) continue;

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
    }
    learning.recordSession();
  } finally {
    learningBusy = false;
  }
}
startLearningLoop();

// --- API tự học (GĐ 6) ---
app.get("/api/learning/status", (_req, res) =>
  res.json({
    sessions: learning.sessionCount,
    usageRatio: learning.usageRatio(),
    progress: learning.listProgress(),
  }),
);

/** Kế hoạch phiên học tiếp theo (xem trước mà không chạy). */
app.get("/api/learning/plan", (_req, res) =>
  res.json(learning.planSession(configStore.get().learning.learningPercent)),
);

/** Chạy phiên học ngay (dùng ví học). */
app.post("/api/learning/run", async (_req, res) => {
  await runLearningSession();
  res.json({ ok: true, sessions: learning.sessionCount, usageRatio: learning.usageRatio() });
});

/** Bỏ tạm dừng một chủ đề đã hỏng nhiều lần. */
app.post("/api/learning/resume", (req, res) => {
  const { topic } = req.body as { topic: string };
  learning.resumeTopic(topic);
  res.json({ ok: true });
});

// --- Static client ---
const clientDist = path.join(ROOT, "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

/** Escape regex để tìm kiếm tri thức an toàn với ký tự đặc biệt. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
