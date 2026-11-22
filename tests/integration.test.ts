/**
 * Test tích hợp: TaskRunner + backend router + công cụ + sổ cái (C9), REST nghiệp vụ (E4, H7), thông báo server đa ngôn ngữ (E1, E2, E5, E6).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { ActionGate } from "../src/server/agent/gate.js";
import { createRunLlm, type BackendSetting } from "../src/server/agent/backend.js";
import { buildTools } from "../src/server/agent/tools.js";
import { MailService } from "../src/server/agent/mail.js";
import { AuditLog } from "../src/server/security/audit.js";
import { Scheduler } from "../src/server/schedule/scheduler.js";
import { SecretStore } from "../src/server/ai/secrets.js";
import { AiHub } from "../src/server/ai/hub.js";
import { OfficeDb } from "../src/server/crm/store.js";
import { DEFAULT_POLICY } from "../src/server/browser/policy.js";
import { TokenBudget } from "../src/server/budget/tokenBudget.js";
import { TokenLedger } from "../src/server/budget/tokenLedger.js";
import { estimateTask } from "../src/server/budget/estimation.js";
import { GuardedFs } from "../src/server/security/guardedFs.js";
import { PermissionManager, type RequestReason } from "../src/server/security/permissions.js";
import { KnowledgeBase } from "../src/server/knowledge/knowledgeBase.js";
import { TaskRunner, type TaskRecord } from "../src/server/tasks/taskRunner.js";
import { OfficeBridge } from "../src/server/office/entityAdapter.js";
import { registerBusinessRoutes } from "../src/server/routes/business.js";
import { AiError, type AiAttempt, type ChatMessage, type ChatResult } from "../src/server/ai/types.js";
import { runAgent } from "../src/server/agent/executor.js";
import { MESSAGES_EN, MESSAGES_VI, msg } from "../src/shared/messages.js";
import { translate } from "../src/client/office-3d/i18n/index.js";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";

let dir: string;
let workspace: string;
let prevWs: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-int-"));
  workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  prevWs = process.env.OFFICE_WORKSPACE;
  process.env.OFFICE_WORKSPACE = workspace;
});
afterEach(() => {
  if (prevWs === undefined) delete process.env.OFFICE_WORKSPACE;
  else process.env.OFFICE_WORKSPACE = prevWs;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function scriptedHub(replies: Array<string | Error>) {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    calls,
    hub: {
      hasProvider: () => true,
      status: async () => [],
      chat: async (m: ChatMessage[]): Promise<ChatResult> => {
        calls.push(m.map((x) => ({ ...x })));
        const r = replies[Math.min(i++, replies.length - 1)];
        if (r instanceof Error) throw r;
        return { text: r, usage: { inputTokens: 120, outputTokens: 30 }, providerId: "mock", model: "mock-1", latencyMs: 4 };
      },
    },
  };
}

function rig(opts: { replies: Array<string | Error>; setting?: BackendSetting; cursorAvailable?: boolean; hasProvider?: boolean }) {
  const perms = new PermissionManager(path.join(dir, "perm"));
  const db = new OfficeDb(dir);
  const secrets = new SecretStore(path.join(dir, "secrets.json"));
  const kb = new KnowledgeBase(dir);
  const ledger = new TokenLedger(dir);
  const budget = new TokenBudget(true);
  budget.configure({ dailyLimit: 5_000_000, perTaskLimit: 1_000_000 }, budget.issueConfigToken());
  const registry = new AgentRegistry();
  const s = scriptedHub(opts.replies);
  if (opts.hasProvider === false) s.hub.hasProvider = () => false;
  const tools = buildTools({ fs: new GuardedFs(perms), perms, kb, db, mail: new MailService(dir, secrets), gate: new ActionGate(), secrets, policy: () => DEFAULT_POLICY, emergency: () => false });
  const cursorCalls: string[] = [];
  const runLlm = createRunLlm({
    hub: s.hub as never,
    tools,
    registry,
    cursor: async (o) => {
      cursorCalls.push(o.prompt);
      return { ok: true, text: "từ cursor", usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, durationMs: 1 };
    },
    cursorAvailable: () => opts.cursorAvailable ?? false,
    setting: () => opts.setting ?? "auto",
    company: () => "ACME",
  });
  const updates: TaskRecord[] = [];
  const runner = new TaskRunner({ budget, ledger, workspace, runLlm, onUpdate: (t) => updates.push({ ...t }) });
  return { runner, ledger, budget, db, cursorCalls, calls: s.calls, close: () => { db.close(); kb.close(); ledger.close(); } };
}

const submit = (r: ReturnType<typeof rig>, agentId = "ha", prompt = "Viết báo cáo ngắn", lang: "vi" | "en" = "vi") =>
  r.runner.submit({ title: "Việc thử", prompt, agentId, agentName: agentId, department: agentId === "phuc" ? "finance" : "marketing", lang });

describe("TaskRunner + router + công cụ (C9)", () => {
  it("agent chạy việc THẬT không cần Cursor: gọi công cụ ghi file, trả đáp án, ghi sổ cái provider-usage", async () => {
    const r = rig({
      replies: ['{"thought":"ghi báo cáo","tool":"fs_write","args":{"path":"bao-cao.md","content":"# Báo cáo\\nDoanh thu tăng"}}', '{"final":"Đã lưu báo cáo vào bao-cao.md"}'],
    });
    const task = await submit(r);
    expect(task.status).toBe("done");
    expect(task.result).toBe("Đã lưu báo cáo vào bao-cao.md");
    expect(task.backend).toBe("router:mock");
    expect(task.model).toBe("mock-1");
    expect(fs.readFileSync(path.join(workspace, "bao-cao.md"), "utf8")).toContain("Doanh thu tăng");
    const rows = r.ledger.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ backend: "router:mock", quotaSource: "provider-usage", ok: true });
    expect(rows[0].totalTokens).toBe(300); // 2 lượt × (120 + 30)
    expect(r.budget.snapshot().total.used).toBeGreaterThanOrEqual(300);
    expect(r.cursorCalls).toHaveLength(0);
    expect(r.calls[0][0].content).toContain("Nhân viên nội dung"); // vai trò lấy từ chức danh trong sơ đồ công ty
    r.close();
  });

  it("agent tuân theo ngôn ngữ của người yêu cầu (E5) và danh sách công cụ của phòng mình (D5)", async () => {
    const r = rig({ replies: ['{"final":"ok"}'] });
    await submit(r, "ha", "Write a post", "en");
    const sys = r.calls[0][0].content;
    expect(sys).toContain("English");
    expect(sys).toContain("fs_write");
    expect(sys).not.toContain("email_send"); // marketing không có công cụ gửi email
    expect(sys).not.toContain("crm_add_deal");
    const r2 = rig({ replies: ['{"final":"ok"}'] });
    await submit(r2, "ha", "Viết bài", "vi");
    expect(r2.calls[0][0].content).toContain("tiếng Việt");
    expect(r2.calls[0][0].content).toContain("Nhân viên nội dung");
    r.close();
    r2.close();
  });

  it("chưa có nhà cung cấp AI và không có Cursor → lỗi có khoá hướng dẫn kết nối AI (E2)", async () => {
    const r = rig({ replies: [new AiError("NO_PROVIDER", "none")], hasProvider: false, cursorAvailable: false });
    const task = await submit(r);
    expect(task.status).toBe("failed");
    expect(task.errorKey).toBe("err.ai.noProvider");
    expect(msg("en", task.errorKey!)).toMatch(/AI Connections/);
    r.close();
  });

  it("auto: ưu tiên router khi có nhà cung cấp; dùng Cursor khi không có router nhưng đã đăng nhập; 'cursor-agent' ép dùng Cursor; 'rule' không gọi LLM", async () => {
    const withProvider = rig({ replies: ['{"final":"từ router"}'], cursorAvailable: true });
    expect((await submit(withProvider)).result).toBe("từ router");
    expect(withProvider.cursorCalls).toHaveLength(0);

    const cursorOnly = rig({ replies: ['{"final":"x"}'], hasProvider: false, cursorAvailable: true });
    const t2 = await submit(cursorOnly);
    expect(t2.result).toBe("từ cursor");
    expect(t2.backend).toBe("cursor-agent");

    const forced = rig({ replies: ['{"final":"x"}'], setting: "cursor-agent" });
    expect((await submit(forced)).result).toBe("từ cursor");

    const rule = rig({ replies: ['{"final":"x"}'], setting: "rule" });
    const t4 = await submit(rule);
    expect(t4.status).toBe("failed");
    expect(rule.cursorCalls).toHaveLength(0);
    expect(rule.calls).toHaveLength(0);
    for (const x of [withProvider, cursorOnly, forced, rule]) x.close();
  });

  it("chế độ 'ask'/'plan' chỉ cho công cụ đọc (không ghi, không gửi)", async () => {
    const r = rig({ replies: ['{"final":"ok"}'] });
    await r.runner.submit({ title: "t", prompt: "p", agentId: "ha", agentName: "Hà", department: "marketing", mode: "ask" });
    const sys = r.calls[0][0].content;
    expect(sys).toContain("fs_read");
    expect(sys).not.toContain("fs_write");
    expect(sys).not.toContain("kb_save");
    r.close();
  });

  it("lỗi ngân sách mang khoá i18n và biến (E2)", async () => {
    const r = rig({ replies: ['{"final":"x"}'] });
    r.budget.configure({ perTaskLimit: 10 }, r.budget.issueConfigToken());
    const task = await r.runner.submit({ title: "t", prompt: "p", agentId: "ha", agentName: "Hà", department: "marketing" });
    expect(task.status).toBe("failed");
    expect(task.errorKey).toBe("err.budget.overTask");
    expect(Object.keys(task.errorVars ?? {}).sort()).toEqual(["limit", "tokens"]);
    expect(msg("en", task.errorKey!, task.errorVars)).toMatch(/per-task cap/);
    expect(estimateTask({ prompt: "x ".repeat(600_000) }, { freeTierOnly: true }).reasonKey).toBe("approval.reason.overLimit");
    r.close();
  });
});

describe("thông báo do server sinh đều có khoá và được dịch (E1, E2, E6)", () => {
  it("mọi khoá err.*, approval.*, log.*, task.*, prompt.* được server dùng trong mã nguồn đều tồn tại ở cả hai ngôn ngữ", () => {
    const root = path.resolve(__dirname, "..", "src", "server");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith(".ts")) files.push(path.join(d, e.name));
      }
    };
    walk(root);
    const used = new Set<string>();
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/["'`]((?:err|approval|log|task|prompt|perm|val|ai\.(?:detail|err|omni))\.[a-zA-Z0-9_.-]+)["'`]/g)) used.add(m[1]);
      for (const m of text.matchAll(/\$t:([a-zA-Z0-9_.-]+)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(15);
    // Tên loại sự kiện (không phải khoá thông báo) và tiền tố dùng cho startsWith.
    const EVENT_TYPES = new Set(["approval.requested", "approval.decided"]);
    const dictVi = DICTIONARIES.vi as Record<string, string>;
    const dictEn = DICTIONARIES.en as Record<string, string>;
    // Tiền tố: "err.budget" (so khớp startsWith) hoặc "perm.action." (ghép động với lý do xin quyền).
    const isPrefixOfKey = (k: string) => Object.keys(dictVi).some((full) => full.startsWith(k.endsWith(".") ? k : `${k}.`));
    const missing = [...used].filter((k) => !EVENT_TYPES.has(k) && !(k in dictVi && k in dictEn) && !isPrefixOfKey(k));
    expect(missing).toEqual([]);
  });

  it("lỗi AI: chi tiết từng nguồn dịch theo ngôn ngữ của tác vụ, không lẫn tiếng Việt vào câu tiếng Anh (E1)", async () => {
    const attempts: AiAttempt[] = [
      { providerId: "groq", error: "timed out after 30s", code: "TIMEOUT", vars: { s: 30 } },
      { providerId: "cerebras", error: "HTTP 429: slow down", code: "HTTP", status: 429, vars: { detail: ": slow down" } },
    ];
    const chat = async (): Promise<ChatResult> => {
      throw new AiError("ALL_FAILED", "all AI providers failed: groq: timed out after 30s | cerebras: HTTP 429: slow down", undefined, undefined, attempts);
    };
    const agent = { id: "ha", name: "Hà", role: "Writer", department: "marketing", tier: 3 };
    const en = await runAgent({ agent, prompt: "p", lang: "en", chat, tools: [] });
    expect(en.error?.key).toBe("err.ai.allFailed");
    expect(en.error?.vars?.detail).toBe("groq: Timed out after 30s. | cerebras: HTTP 429: slow down");
    const finalEn = msg("en", en.error!.key, en.error!.vars);
    expect(finalEn).toBe("All AI providers failed: groq: Timed out after 30s. | cerebras: HTTP 429: slow down");
    expect(finalEn).not.toMatch(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i);
    const vi = await runAgent({ agent, prompt: "p", lang: "vi", chat, tools: [] });
    expect(vi.error?.vars?.detail).toBe("groq: Quá thời gian chờ (30s). | cerebras: HTTP 429: slow down");
  });

  it("mọi lý do xin quyền (RequestReason) đều có bản dịch perm.action.* ở cả hai ngôn ngữ", () => {
    // Record<RequestReason, true> buộc trình biên dịch báo lỗi nếu thêm lý do mới mà quên dòng này.
    const ALL: Record<RequestReason, true> = { read: true, write: true, delete: true, list: true, execute: true };
    for (const reason of Object.keys(ALL)) {
      for (const lang of ["vi", "en"] as const) {
        const text = translate(lang, "approval.perm.summary", { agent: "An", action: `$t:perm.action.${reason}` });
        expect(text, `${lang}/${reason}`).not.toContain("perm.action");
        expect(text).toContain("An");
      }
    }
  });

  it("vi và en của phần dùng chung đủ khoá, cùng biến", () => {
    expect(Object.keys(MESSAGES_EN).sort()).toEqual(Object.keys(MESSAGES_VI).sort());
    for (const k of Object.keys(MESSAGES_VI)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars((MESSAGES_EN as Record<string, string>)[k]), k).toEqual(vars((MESSAGES_VI as Record<string, string>)[k]));
    }
    for (const k of Object.keys(MESSAGES_VI)) expect(k in DICTIONARIES.vi && k in DICTIONARIES.en, k).toBe(true);
  });

  it("$t: dịch tiếp phần chèn ở cả server và client", () => {
    expect(msg("vi", "approval.perm.summary", { agent: "An", action: "$t:perm.action.read" })).toBe("An cần quyền đọc thư mục/tệp");
    expect(translate("en", "approval.perm.summary", { agent: "An", action: "$t:perm.action.write" })).toBe("An requests permission to write to a folder/file");
    expect(translate("en", "approval.action.email_send.summary", { agent: "Nam", to: "a@b.vn" })).toBe("Nam wants to send an email to a@b.vn");
  });

  it("cầu nối: xin quyền / duyệt token / duyệt hành động đều phát khoá + biến, không chỉ chuỗi tiếng Việt", () => {
    const reg = new AgentRegistry();
    const bridge = new OfficeBridge({ listAgents: () => reg.list(), listTasks: () => [], machine: () => null });
    const perm = bridge.translate("permission:request", { id: "p1", agentId: "an", agentName: "An", reason: "write", path: "C:/x", purpose: "ghi báo cáo" })[0];
    expect(perm).toMatchObject({ type: "approval.requested", kind: "permission", key: "approval.perm.summary" });
    expect(perm.type === "approval.requested" && perm.vars).toEqual({ agent: "An", action: "$t:perm.action.write" });

    const est = estimateTask({ prompt: "x ".repeat(120_000) }, { freeTierOnly: true });
    const tok = bridge.translate("task:approval", { id: "a1", taskId: "t9", title: "Học", agentId: "tri", agentName: "Tri", department: "library", reason: est.reason ?? "", estimation: est, createdAt: "x" })[0];
    expect(tok.type === "approval.requested" && tok.key).toBe("approval.token.summary");
    expect(tok.type === "approval.requested" && tok.detailKey).toMatch(/^approval\.reason\./);

    const gate = new ActionGate();
    let req!: Parameters<OfficeBridge["translate"]>[1];
    gate.once("request", (r) => (req = r));
    void gate.request({ agentId: "nam", agentName: "Nam", action: "email_send", vars: { agent: "Nam", to: "k@x.vn" }, detail: "Subject: Hi" });
    const act = bridge.translate("action:request", req)[0];
    expect(act).toMatchObject({ type: "approval.requested", kind: "action", key: "approval.action.email_send.summary" });
    gate.denyAll();
    const generic = bridge.translate("action:request", { id: "z", agentId: "nam", agentName: "Nam", action: "lam_gi_do", vars: {}, detail: "", createdAt: "x", expiresAt: "y" })[0];
    expect(generic.type === "approval.requested" && generic.key).toBe("approval.action.generic.summary");
  });

  it("giao diện mới kết nối nhận lại mọi yêu cầu duyệt còn chờ (hộp duyệt không bị trống)", () => {
    const reg = new AgentRegistry();
    const bridge = new OfficeBridge({
      listAgents: () => reg.list(),
      listTasks: () => [],
      machine: () => null,
      pendingPermissions: () => [{ id: "p1", agentId: "an", agentName: "An", reason: "read", path: "C:/x" }],
      pendingTokenApprovals: () => [],
      pendingActions: () => [{ id: "act_1", agentId: "nam", agentName: "Nam", action: "email_send", vars: { agent: "Nam", to: "a@b.vn" }, detail: "d", createdAt: "x", expiresAt: "y" }],
    });
    const pending = bridge.pendingApprovals();
    expect(pending.map((e) => (e.type === "approval.requested" ? e.kind : e.type))).toEqual(["permission", "action"]);
  });

  it("log nhiệm vụ lỗi có extraKey/extraVars để client dịch nguyên nhân", () => {
    const reg = new AgentRegistry();
    const bridge = new OfficeBridge({ listAgents: () => reg.list(), listTasks: () => [], machine: () => null });
    bridge.translate("task:update", { id: "t1", title: "T", prompt: "p", agentId: "ha", agentName: "Hà", department: "marketing", status: "running", createdAt: "x", wallet: "normal" } as TaskRecord);
    const evs = bridge.translate("task:update", { id: "t1", title: "T", prompt: "p", agentId: "ha", agentName: "Hà", department: "marketing", status: "failed", createdAt: "x", wallet: "normal", error: "Chưa có AI", errorKey: "err.ai.noProvider" } as TaskRecord);
    const log = evs.find((e) => e.type === "log");
    expect(log && log.type === "log" && log.key).toBe("log.failed");
    expect(log && log.type === "log" && log.extraKey).toBe("err.ai.noProvider");
  });
});

describe("REST nghiệp vụ: mã lỗi, che bí mật, sức khoẻ (E4, H7, D4)", () => {
  let server: http.Server;
  let base: string;
  let hub: AiHub;
  let db: OfficeDb;
  let gate: ActionGate;
  let audit: AuditLog;
  let scheduler: Scheduler;
  let clock = new Date(2026, 10, 21, 8, 0, 0); // 21/11/2026 08:00 giờ địa phương
  let emergency = false;
  const scheduleRuns: string[] = [];
  // Cây giao việc giả cho sao lưu: một danh sách trong bộ nhớ.
  let orgNodes: unknown[] = [];
  let orgBusy = false;
  let orgReplaced = 0;
  const orgStub = { list: () => orgNodes, replaceAll: (raw: unknown) => ((orgNodes = Array.isArray(raw) ? raw : []), orgNodes.length), busy: () => orgBusy, onReplaced: () => void orgReplaced++ };

  function start(isLoopback: () => boolean): Promise<void> {
    hub = new AiHub({ dataDir: dir, env: { GROQ_API_KEY: "gsk_abcdefghijklmnop123456" }, fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
    db = new OfficeDb(dir);
    gate = new ActionGate();
    audit = new AuditLog(path.join(dir, "audit.log"), () => hub.secrets.allValues());
    scheduler = new Scheduler({
      file: path.join(dir, "schedules.json"),
      now: () => clock,
      run: async (sc) => {
        scheduleRuns.push(sc.title);
        return { rootId: "org_9" };
      },
      paused: () => emergency,
      agentExists: (id) => id === "giamdoc" || id === "long",
      defaultAgent: () => "giamdoc",
      onEvent: (k, d) => audit.append(k, "user", d),
    });
    const mail = new MailService(dir, hub.secrets);
    const app = express();
    app.use(express.json());
    registerBusinessRoutes(app, { audit, scheduler, dataDir: dir, org: orgStub, hub, db, mail, gate, isLoopback, version: "9.9.9", emergency: () => emergency, lan: false, startedAt: Date.now() - 5000 });
    return new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  }
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => { db?.close(); r(); }) : r())));

  const j = (path_: string, init?: RequestInit) => fetch(`${base}${path_}`, { headers: { "content-type": "application/json" }, ...init });

  it("thao tác nhạy cảm chỉ từ chính máy: từ máy khác → 403 + mã loopbackOnly; từ chính máy → được", async () => {
    await start(() => false);
    for (const [method, url, body] of [
      ["PUT", "/api/ai/groq/key", { key: "gsk_zzzzzzzzzzzzzzzzzzzzzzzz" }],
      ["DELETE", "/api/ai/groq/key", undefined],
      ["POST", "/api/ai/omniroute/start", {}],
      ["PUT", "/api/mail/config", { smtp: { host: "smtp.x", user: "u" } }],
      ["PUT", "/api/github/token", { token: "ghp_x" }],
    ] as const) {
      const r = await j(url, { method, body: body ? JSON.stringify(body) : undefined });
      expect(r.status, `${method} ${url}`).toBe(403);
      expect(await r.json()).toMatchObject({ code: "loopbackOnly" });
    }
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    await start(() => true);
    expect((await j("/api/ai/groq/key", { method: "PUT", body: JSON.stringify({ key: "gsk_zzzzzzzzzzzzzzzzzzzzzzzz" }) })).status).toBe(200);
    expect((await j("/api/github/token", { method: "PUT", body: JSON.stringify({ token: "ghp_abcdefghijklmnopqrstuvwxyz123456" }) })).status).toBe(200);
  });

  it("khoá/mật khẩu không bao giờ nằm trong phản hồi", async () => {
    await start(() => true);
    await j("/api/ai/groq/key", { method: "PUT", body: JSON.stringify({ key: "gsk_secretsecretsecret123456" }) });
    await j("/api/mail/config", { method: "PUT", body: JSON.stringify({ smtp: { host: "smtp.x.vn", user: "me@x.vn" }, smtpPass: "mat-khau-bi-mat-123" }) });
    await j("/api/github/token", { method: "PUT", body: JSON.stringify({ token: "ghp_abcdefghijklmnopqrstuvwxyz123456" }) });
    const bodies = await Promise.all(["/api/ai/status", "/api/mail/config", "/api/github/status", "/api/health"].map(async (u) => (await j(u)).text()));
    const all = bodies.join("\n");
    for (const secret of ["gsk_secretsecretsecret123456", "mat-khau-bi-mat-123", "ghp_abcdefghijklmnopqrstuvwxyz123456"]) expect(all).not.toContain(secret);
    expect(JSON.parse(bodies[1])).toMatchObject({ smtpPassSet: true });
    expect(JSON.parse(bodies[2])).toEqual({ hasToken: true });
    const groq = (JSON.parse(bodies[0]).providers as Array<{ id: string; keyMask?: string; keySource?: string }>).find((p) => p.id === "groq")!;
    expect(groq.keySource).toBe("stored");
    expect(groq.keyMask).toBe("gsk_…3456");
  });

  it("lỗi API có {error, code}: actionGone 404, badRequest 400; duyệt hành động đúng một lần", async () => {
    await start(() => true);
    const gone = await j("/api/actions/act_khongco/decide", { method: "POST", body: JSON.stringify({ approve: true }) });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ code: "actionGone" });

    const p = gate.request({ agentId: "nam", agentName: "Nam", action: "email_send", vars: {}, detail: "d" });
    const id = gate.list()[0].id;
    expect((await j(`/api/actions/${id}/decide`, { method: "POST", body: JSON.stringify({ approve: true }) })).status).toBe(200);
    expect(await p).toBe("approved");
    expect((await j(`/api/actions/${id}/decide`, { method: "POST", body: JSON.stringify({ approve: true }) })).status).toBe(404);

    const bad = await j("/api/crm/deals", { method: "POST", body: JSON.stringify({ title: "x", stage: "bay-mau" }) });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: string; code: string; vars: Record<string, string> };
    expect(body.code).toBe("val.deal.stageInvalid"); // khoá i18n đầy đủ: client dịch, không hiện chuỗi tiếng Việt cố định
    expect(body.vars.stages).toContain("negotiation");
    expect(body.error).toMatch(/Giai đoạn không hợp lệ/); // bản tiếng Việt dự phòng
    expect(translate("en", body.code, body.vars)).toMatch(/^Invalid stage \(lead, qualified/);
    const noName = await j("/api/crm/contacts", { method: "POST", body: JSON.stringify({ name: "  " }) });
    expect(((await noName.json()) as { code: string }).code).toBe("val.contact.nameRequired");
    expect((await j("/api/ai/groq/key", { method: "PUT", body: JSON.stringify({ key: "" }) })).status).toBe(400);
  });

  it("id nhà cung cấp lạ → 404 + mã unknownProvider, không chạm vào kho khoá", async () => {
    await start(() => true);
    for (const [method, url, body] of [
      ["POST", "/api/ai/khong-co/test", {}],
      ["PUT", "/api/ai/khong-co/key", { key: "abcdefghijklmnopqrstuv" }],
      ["DELETE", "/api/ai/khong-co/key", undefined],
      ["POST", "/api/ai/khong-co/enabled", { enabled: false }],
      ["PUT", "/api/ai/khong-co/model", { model: "x" }],
    ] as const) {
      const r = await j(url, { method, body: body ? JSON.stringify(body) : undefined });
      expect(r.status, `${method} ${url}`).toBe(404);
      expect(await r.json()).toMatchObject({ code: "unknownProvider", vars: { id: "khong-co" } });
    }
    expect(hub.secrets.names().some((n) => n.includes("khong-co"))).toBe(false);
  });

  it("nhật ký bảo mật (K1): mọi thay đổi nhạy cảm để lại dấu vết nhưng KHÔNG chứa bí mật; chỉ đọc được từ chính máy", async () => {
    await start(() => true);
    const SECRETS = ["gsk_auditsecretkey_1234567890", "mat-khau-audit-xyz-987", "ghp_auditgithubtoken1234567890abcdef"];
    await j("/api/ai/groq/key", { method: "PUT", body: JSON.stringify({ key: SECRETS[0] }) });
    await j("/api/ai/groq/enabled", { method: "POST", body: JSON.stringify({ enabled: false }) });
    await j("/api/ai/groq/model", { method: "PUT", body: JSON.stringify({ model: "my-model" }) });
    await j("/api/mail/config", { method: "PUT", body: JSON.stringify({ smtp: { host: "smtp.audit.vn", user: "me@audit.vn" }, smtpPass: SECRETS[1] }) });
    await j("/api/github/token", { method: "PUT", body: JSON.stringify({ token: SECRETS[2] }) });
    await j("/api/ai/groq/key", { method: "DELETE" });

    const entries = (await (await j("/api/audit")).json()) as Array<{ kind: string; actor: string; detail: Record<string, unknown> }>;
    expect(entries.map((e) => e.kind)).toEqual(["ai.key.clear", "github.token", "mail.config", "ai.model", "ai.enabled", "ai.key.set"]); // mới trước
    expect(entries.find((e) => e.kind === "ai.key.set")!.detail).toEqual({ provider: "groq" });
    expect(entries.find((e) => e.kind === "mail.config")!.detail).toMatchObject({ smtpHost: "smtp.audit.vn", smtpPassChanged: true });
    expect(entries.find((e) => e.kind === "github.token")!.detail).toEqual({ action: "set" });
    // bí mật không nằm trong phản hồi lẫn tệp nhật ký
    const raw = fs.readFileSync(path.join(dir, "audit.log"), "utf8") + JSON.stringify(entries);
    for (const secret of SECRETS) expect(raw).not.toContain(secret);

    // quyết định hành động đi qua cổng duyệt: ghi ở main.ts (gate.on("decided")) — ở đây kiểm thẳng hàm AuditLog nhận đúng loại
    audit.append("action.approved", "user", { action: "email_send", to: "a@b.vn" });
    expect(((await (await j("/api/audit?limit=1")).json()) as Array<{ kind: string }>)[0].kind).toBe("action.approved");
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    await start(() => false);
    const blocked = await j("/api/audit");
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "loopbackOnly" });
  });

  it("sao lưu qua REST (K2): tải tệp JSON không chứa bí mật; khôi phục kiểm tra schema, giữ bản sao, từ chối khi bận hoặc không từ chính máy", async () => {
    await start(() => true);
    const SECRET = "gsk_backupsecretkey_1234567890";
    await j("/api/ai/groq/key", { method: "PUT", body: JSON.stringify({ key: SECRET }) });
    await j("/api/mail/config", { method: "PUT", body: JSON.stringify({ smtp: { host: "smtp.x.vn", user: "me@x.vn" }, smtpPass: "mat-khau-sao-luu-321" }) });
    await j("/api/crm/contacts", { method: "POST", body: JSON.stringify({ name: "Chị Mai", email: "mai@shop.vn" }) });
    await j("/api/crm/deals", { method: "POST", body: JSON.stringify({ contactId: 1, title: "Gói Pro", value: 1000 }) });
    orgNodes = [{ id: "org_1", title: "x" }];

    const res = await fetch(`${base}/api/backup`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="funnyovs-backup-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("mat-khau-sao-luu-321");
    const file = JSON.parse(text) as { data: { contacts: unknown[]; deals: unknown[] }; org: unknown[] };
    expect([file.data.contacts.length, file.data.deals.length, file.org.length]).toEqual([1, 1, 1]);

    // dữ liệu đổi sau khi sao lưu → khôi phục đưa về đúng bản đã lưu
    await j("/api/crm/contacts", { method: "POST", body: JSON.stringify({ name: "Người mới", email: "moi@x.vn" }) });
    orgNodes = [];
    const restore = (body: string) => fetch(`${base}/api/backup/restore`, { method: "POST", headers: { "content-type": "text/plain" }, body });
    const ok = await restore(text);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { counts: { contacts: number } }).counts.contacts).toBe(1);
    expect(((await (await j("/api/crm/contacts")).json()) as Array<{ name: string }>).map((c) => c.name)).toEqual(["Chị Mai"]);
    expect(orgNodes).toEqual([{ id: "org_1", title: "x" }]);
    expect(orgReplaced).toBe(1);
    const copies = fs.readdirSync(path.join(dir, "backups"));
    expect(copies).toHaveLength(1); // bản sao trước khi khôi phục (có "Người mới")
    expect(fs.readFileSync(path.join(dir, "backups", copies[0]), "utf8")).toContain("Người mới");

    // tệp hỏng: 400 + khoá i18n; dữ liệu giữ nguyên
    const bad = await restore("{không phải json");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "val.backup.invalid" });
    expect(((await (await j("/api/crm/contacts")).json()) as unknown[]).length).toBe(1);

    // đang có việc chạy: 409 backupBusy
    orgBusy = true;
    const busy = await restore(text);
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ code: "backupBusy" });
    orgBusy = false;

    // nhật ký bảo mật ghi lại
    const kinds = ((await (await j("/api/audit")).json()) as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toContain("backup.export");
    expect(kinds).toContain("backup.import");

    // không từ chính máy → 403 (cả tải lẫn khôi phục)
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    await start(() => false);
    expect((await fetch(`${base}/api/backup`)).status).toBe(403);
    expect((await restore(text)).status).toBe(403);
  });

  it("việc lặp lại qua REST (K3): tạo → liệt kê (kèm lần kế tiếp) → tạm dừng → chạy ngay → xoá; kiểm tra đầu vào và dừng khẩn cấp", async () => {
    await start(() => true);
    emergency = false;
    clock = new Date(2026, 10, 21, 8, 0, 0);
    const post = (body: unknown) => j("/api/schedules", { method: "POST", body: JSON.stringify(body) });
    const created = (await (await post({ title: "Tóm tắt CRM", prompt: "Tóm tắt pipeline hôm nay", frequency: "daily", at: "08:30", lang: "en" })).json()) as { id: string; toAgentId: string; nextRunAt: string; enabled: boolean };
    expect(created.toAgentId).toBe("giamdoc"); // mặc định Giám đốc
    expect(new Date(created.nextRunAt).getHours()).toBe(8);
    expect(new Date(created.nextRunAt).getMinutes()).toBe(30);
    const list = (await (await j("/api/schedules")).json()) as Array<{ id: string }>;
    expect(list.map((x) => x.id)).toEqual([created.id]);

    // đầu vào sai → 400 với khoá i18n
    for (const [bad, code] of [
      [{ prompt: "x", at: "08:00" }, "val.schedule.titleRequired"],
      [{ title: "x", at: "08:00" }, "val.schedule.promptRequired"],
      [{ title: "x", prompt: "y", at: "25:99" }, "val.schedule.timeInvalid"],
      [{ title: "x", prompt: "y", at: "08:00", frequency: "monthly" }, "val.schedule.frequencyInvalid"],
      [{ title: "x", prompt: "y", at: "08:00", frequency: "weekly", weekday: 9 }, "val.schedule.weekdayInvalid"],
      [{ title: "x", prompt: "y", at: "08:00", toAgentId: "khong-co" }, "val.schedule.agentUnknown"],
    ] as const) {
      const r = await post(bad);
      expect(r.status, code).toBe(400);
      expect(await r.json()).toMatchObject({ code });
    }

    // chạy ngay giao việc; dừng khẩn cấp thì 423
    const ran = await j(`/api/schedules/${created.id}/run`, { method: "POST" });
    expect(ran.status).toBe(200);
    expect(scheduleRuns).toEqual(["Tóm tắt CRM"]);
    expect(await ran.json()).toMatchObject({ lastStatus: "started", lastRootId: "org_9" });
    emergency = true;
    expect((await j(`/api/schedules/${created.id}/run`, { method: "POST" })).status).toBe(423);
    emergency = false;

    // tạm dừng / bật lại
    const paused = await j(`/api/schedules/${created.id}`, { method: "PATCH", body: JSON.stringify({ enabled: false }) });
    expect(((await paused.json()) as { enabled: boolean }).enabled).toBe(false);
    clock = new Date(2026, 10, 25, 9, 0, 0); // quá hạn nhiều ngày nhưng đang tạm dừng
    expect(await scheduler.tick()).toBe(0);

    expect((await j(`/api/schedules/${created.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await j(`/api/schedules/${created.id}`, { method: "DELETE" })).status).toBe(404);
    expect(await (await j("/api/schedules/khong-co/run", { method: "POST" })).json()).toMatchObject({ code: "scheduleGone" });
    const kinds = ((await (await j("/api/audit")).json()) as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["schedule.create", "schedule.run", "schedule.delete"]));
  });

  it("CRM và lịch qua REST; xuất .ics đúng kiểu nội dung", async () => {
    await start(() => true);
    const c = (await (await j("/api/crm/contacts", { method: "POST", body: JSON.stringify({ name: "Chị Mai", email: "mai@shop.vn" }) })).json()) as { contact: { id: number } };
    await j("/api/crm/deals", { method: "POST", body: JSON.stringify({ contactId: c.contact.id, title: "Gói Pro", value: 1000 }) });
    const moved = await j("/api/crm/deals/1", { method: "PATCH", body: JSON.stringify({ stage: "won" }) });
    expect((await moved.json()).stage).toBe("won");
    expect((await (await j("/api/crm/summary")).json()).wonValue).toBe(1000);
    expect(((await (await j("/api/crm/contacts?q=mai")).json()) as unknown[]).length).toBe(1);
    await j("/api/calendar/events", { method: "POST", body: JSON.stringify({ title: "Họp", start: "2026-12-01T09:00:00Z" }) });
    const ics = await fetch(`${base}/api/calendar.ics`);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("SUMMARY:Họp");
  });

  it("GET /api/health: trạng thái DB, AI, bộ nhớ, thời gian chạy (H7)", async () => {
    await start(() => true);
    const h = await (await j("/api/health")).json();
    expect(h).toMatchObject({ ok: true, version: "9.9.9", db: { ok: true }, emergency: false, lan: false, pendingActions: 0 });
    expect(h.uptimeSec).toBeGreaterThanOrEqual(5);
    expect(h.memoryMb).toBeGreaterThan(0);
    expect(h.ai.total).toBeGreaterThan(5);
    expect(h.ai.providers).toContain("groq"); // khoá từ môi trường → sẵn sàng
  });
});

describe("dữ liệu bền qua khởi động lại (H3)", () => {
  it("cấu hình email, kho khoá, nháp email, lịch sống sót khi mở lại", () => {
    const secrets = new SecretStore(path.join(dir, "secrets.json"));
    const mail = new MailService(dir, secrets);
    mail.setConfig({ smtp: { host: "smtp.x.vn", user: "me@x.vn", port: 465, secure: true } }, { smtpPass: "p4ss-word" });
    const db = new OfficeDb(dir);
    const d = db.createDraft({ to: "a@b.vn", subject: "Chào", body: "nội dung" });
    db.addEvent({ title: "Họp", start: "2026-12-01T09:00:00Z" });
    db.close();

    const mail2 = new MailService(dir, new SecretStore(path.join(dir, "secrets.json")));
    expect(mail2.publicConfig().smtp).toMatchObject({ host: "smtp.x.vn", port: 465, secure: true });
    expect(mail2.smtpConfigured()).toBe(true);
    const db2 = new OfficeDb(dir);
    expect(db2.getDraft(d.id)!.subject).toBe("Chào");
    expect(db2.listEvents()).toHaveLength(1);
    db2.close();
  });
});
