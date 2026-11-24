/**
 * REST cho phần "doanh nghiệp thật": kết nối AI, email, GitHub, CRM, lịch, duyệt hành động, sức khoẻ hệ thống.
 *
 * - Các thao tác nhạy cảm (nhập khoá, cấu hình SMTP/IMAP, khởi động tiến trình) chỉ nhận từ chính máy chạy ứng dụng (`loopbackOnly`).
 * - Lỗi trả về dạng { error, code, vars } — client dịch theo `code`.
 * - Không bao giờ trả khoá/mật khẩu; chỉ trả bản che hoặc cờ "đã đặt".
 */
import express, { type Express, type Request, type Response } from "express";
import type { AiHub } from "../ai/hub.js";
import type { ActionGate } from "../agent/gate.js";
import type { MailService } from "../agent/mail.js";
import type { AuditLog } from "../security/audit.js";
import type { Scheduler } from "../schedule/scheduler.js";
import { viewOf } from "../../shared/schedule.js";
import { backupFileName, buildBackup, parseBackup, writePreRestoreCopy } from "../backup/backup.js";
import { countsOf } from "../../shared/backup.js";
import { DEAL_STAGES, toIcs, type OfficeDb } from "../crm/store.js";
import { ValidationError } from "../../shared/validation.js";
import { msg } from "../../shared/messages.js";

export interface BusinessDeps {
  hub: AiHub;
  db: OfficeDb;
  mail: MailService;
  gate: ActionGate;
  isLoopback: (req: Request) => boolean;
  /** Nhật ký bảo mật (ghi mọi thay đổi nhạy cảm). */
  audit: AuditLog;
  /** Thư mục dữ liệu (bản sao trước khi khôi phục nằm ở `backups/`). */
  dataDir: string;
  /** Cây giao việc: đọc/thay thế/đang bận — dùng cho sao lưu & khôi phục. */
  org: { list: () => unknown[]; replaceAll: (raw: unknown) => number; busy: () => boolean; onReplaced: () => void };
  /** Lịch giao việc lặp lại. */
  scheduler: Scheduler;
  version: string;
  emergency: () => boolean;
  lan: boolean;
  startedAt: number;
}

/**
 * Trả lỗi dạng { error, code, vars }: `error` là bản tiếng Việt dự phòng, client dịch theo `code` + `vars`.
 * `code` ngắn (vd. "loopbackOnly") ứng với khoá `err.api.<code>`; `code` có dấu chấm (vd. "val.contact.nameRequired") là khoá đầy đủ.
 */
export function apiError(res: Response, status: number, code: string, vars?: Record<string, string | number>, detail?: string): void {
  const key = code.includes(".") ? code : `err.api.${code}`;
  res.status(status).json({ error: detail ?? msg("vi", key, vars), code, vars });
}

export function registerBusinessRoutes(app: Express, d: BusinessDeps): void {
  const loopbackOnly = (req: Request, res: Response): boolean => {
    if (d.isLoopback(req)) return true;
    apiError(res, 403, "loopbackOnly");
    return false;
  };
  /** Id nhà cung cấp trong URL phải có trong danh mục; sai → 404 có mã `unknownProvider` (client tự dịch). */
  const providerId = (req: Request, res: Response): string | null => {
    const id = String(req.params.id);
    if (d.hub.knows(id)) return id;
    apiError(res, 404, "unknownProvider", { id: id.slice(0, 40) });
    return null;
  };
  const fail = (res: Response, e: unknown): void => {
    if (e instanceof ValidationError) return apiError(res, 400, e.key, e.vars);
    apiError(res, 500, "badRequest", undefined, e instanceof Error ? e.message : String(e));
  };

  // ---- Kết nối AI ----
  app.get("/api/ai/status", async (req, res) => {
    try {
      res.json({ providers: await d.hub.status(req.query.refresh === "1"), anyReady: d.hub.hasProvider(), strategy: d.hub.strategy() });
    } catch (e) {
      fail(res, e);
    }
  });
  app.post("/api/ai/refresh", async (_req, res) => {
    try {
      res.json({ providers: await d.hub.status(true), anyReady: d.hub.hasProvider(), strategy: d.hub.strategy() });
    } catch (e) {
      fail(res, e);
    }
  });
  // Nút "+ Thêm API": nguồn tuỳ chỉnh (mọi điểm cuối tương thích OpenAI) được gom vào cùng bộ router. Khoá chỉ lưu ở kho khoá 0600.
  app.post("/api/ai/custom/check", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    res.json(await d.hub.check(req.body));
  });
  app.post("/api/ai/custom", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    try {
      const added = await d.hub.addCustom(req.body);
      d.audit.append("ai.provider.add", "user", { provider: added.id, label: added.label, host: new URL(added.baseUrl).host, hasKey: added.hasKey });
      res.json(added);
    } catch (e) {
      fail(res, e);
    }
  });
  app.patch("/api/ai/custom/:id", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    try {
      const updated = await d.hub.updateCustom(String(req.params.id), req.body);
      d.audit.append("ai.provider.edit", "user", { provider: updated.id, label: updated.label, host: new URL(updated.baseUrl).host });
      res.json(updated);
    } catch (e) {
      fail(res, e);
    }
  });
  app.delete("/api/ai/custom/:id", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    try {
      await d.hub.removeCustom(String(req.params.id));
      d.audit.append("ai.provider.remove", "user", { provider: String(req.params.id).slice(0, 60) });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });
  app.put("/api/ai/order", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const order = (req.body as { order?: unknown } | undefined)?.order;
    if (!Array.isArray(order) || order.length > 100) return apiError(res, 400, "badRequest");
    d.hub.setOrder(order);
    d.audit.append("ai.order", "user", { count: order.length });
    res.json({ ok: true });
  });
  app.put("/api/ai/strategy", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    try {
      const strategy = (req.body as { strategy?: unknown } | undefined)?.strategy;
      d.hub.setStrategy(strategy);
      d.audit.append("ai.strategy", "user", { strategy: String(strategy) });
      res.json({ ok: true, strategy: d.hub.strategy() });
    } catch (e) {
      fail(res, e);
    }
  });
  app.post("/api/ai/omniroute/start", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    res.json(await d.hub.startOmniRoute());
  });
  app.post("/api/ai/:id/test", async (req, res) => {
    const id = providerId(req, res);
    if (id) res.json(await d.hub.test(id));
  });
  app.put("/api/ai/:id/key", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const id = providerId(req, res);
    if (!id) return;
    const key = String((req.body as { key?: unknown } | undefined)?.key ?? "").trim();
    if (!key || key.length > 500) return apiError(res, 400, "badRequest");
    try {
      await d.hub.setKey(id, key);
      d.audit.append("ai.key.set", "user", { provider: id });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });
  app.delete("/api/ai/:id/key", async (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const id = providerId(req, res);
    if (!id) return;
    await d.hub.clearKey(id);
    d.audit.append("ai.key.clear", "user", { provider: id });
    res.json({ ok: true });
  });
  app.post("/api/ai/:id/enabled", (req, res) => {
    const id = providerId(req, res);
    if (!id) return;
    try {
      const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled !== false;
      d.hub.setEnabled(id, enabled);
      d.audit.append("ai.enabled", "user", { provider: id, enabled });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });
  app.put("/api/ai/:id/model", (req, res) => {
    const id = providerId(req, res);
    if (!id) return;
    try {
      const model = String((req.body as { model?: unknown } | undefined)?.model ?? "");
      d.hub.setModel(id, model);
      d.audit.append("ai.model", "user", { provider: id, model: model || "auto" });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- Email / GitHub (cấu hình: chỉ từ máy chủ) ----
  app.get("/api/mail/config", (_req, res) => res.json(d.mail.publicConfig()));
  app.put("/api/mail/config", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const b = (req.body ?? {}) as { smtp?: unknown; imap?: unknown; smtpPass?: unknown; imapPass?: unknown };
    d.mail.setConfig(
      { smtp: b.smtp, imap: b.imap },
      { smtpPass: typeof b.smtpPass === "string" ? b.smtpPass : undefined, imapPass: typeof b.imapPass === "string" ? b.imapPass : undefined },
    );
    const pub = d.mail.publicConfig();
    d.audit.append("mail.config", "user", {
      smtpHost: pub.smtp?.host ?? "",
      imapHost: pub.imap?.host ?? "",
      smtpPassChanged: typeof b.smtpPass === "string" && b.smtpPass.length > 0,
      imapPassChanged: typeof b.imapPass === "string" && b.imapPass.length > 0,
    });
    res.json(pub);
  });
  app.get("/api/mail/drafts", (_req, res) => res.json(d.db.listDrafts(30)));

  app.get("/api/github/status", (_req, res) => res.json({ hasToken: d.hub.secrets.has("github.token") }));
  app.put("/api/github/token", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const token = String((req.body as { token?: unknown } | undefined)?.token ?? "").trim();
    if (token.length > 500) return apiError(res, 400, "badRequest");
    d.hub.secrets.set("github.token", token); // rỗng = xoá
    d.audit.append("github.token", "user", { action: token ? "set" : "clear" });
    res.json({ hasToken: d.hub.secrets.has("github.token") });
  });

  // ---- CRM ----
  app.get("/api/crm/summary", (_req, res) => res.json(d.db.summary()));
  app.get("/api/crm/contacts", (req, res) => {
    const q = String(req.query.q ?? "").trim();
    res.json(q ? d.db.searchContacts(q, 50) : d.db.listContacts(100));
  });
  app.get("/api/crm/deals", (req, res) => res.json(d.db.listDeals({ stage: req.query.stage ? String(req.query.stage) : undefined })));
  app.get("/api/crm/stages", (_req, res) => res.json(DEAL_STAGES));
  app.post("/api/crm/contacts", (req, res) => {
    try {
      res.json(d.db.upsertContact((req.body ?? {}) as { name: string }));
    } catch (e) {
      fail(res, e);
    }
  });
  app.post("/api/crm/deals", (req, res) => {
    try {
      res.json(d.db.addDeal((req.body ?? {}) as { title: string }));
    } catch (e) {
      fail(res, e);
    }
  });
  app.patch("/api/crm/deals/:id", (req, res) => {
    try {
      res.json(d.db.moveDeal(Number(req.params.id), String((req.body as { stage?: unknown } | undefined)?.stage ?? "")));
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- Lịch ----
  app.get("/api/calendar/events", (_req, res) => res.json(d.db.listEvents({ limit: 200 })));
  app.get("/api/calendar.ics", (_req, res) => {
    res.type("text/calendar").set("Content-Disposition", 'attachment; filename="funnyovs.ics"').send(toIcs(d.db.listEvents({ limit: 1000 })));
  });
  app.post("/api/calendar/events", (req, res) => {
    try {
      res.json(d.db.addEvent((req.body ?? {}) as { title: string; start: string }));
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- Duyệt hành động ----
  app.post("/api/actions/:id/decide", (req, res) => {
    const approve = (req.body as { approve?: unknown } | undefined)?.approve === true;
    if (!d.gate.decide(String(req.params.id), approve)) return apiError(res, 404, "actionGone");
    res.json({ ok: true });
  });

  // ---- Việc lặp lại ----
  app.get("/api/schedules", (_req, res) => res.json(d.scheduler.list()));
  app.post("/api/schedules", (req, res) => {
    try {
      res.json(viewOf(d.scheduler.create((req.body ?? {}) as Record<string, unknown>), new Date()));
    } catch (e) {
      fail(res, e);
    }
  });
  app.patch("/api/schedules/:id", (req, res) => {
    const s = d.scheduler.setEnabled(String(req.params.id), (req.body as { enabled?: unknown } | undefined)?.enabled !== false);
    if (!s) return apiError(res, 404, "scheduleGone");
    res.json(viewOf(s, new Date()));
  });
  app.delete("/api/schedules/:id", (req, res) => {
    if (!d.scheduler.remove(String(req.params.id))) return apiError(res, 404, "scheduleGone");
    res.json({ ok: true });
  });
  app.post("/api/schedules/:id/run", async (req, res) => {
    if (d.emergency()) return apiError(res, 423, "emergency");
    const s = await d.scheduler.runNow(String(req.params.id));
    if (!s) return apiError(res, 404, "scheduleGone");
    res.json(viewOf(s, new Date()));
  });

  // ---- Sao lưu / khôi phục (chỉ từ chính máy) ----
  app.get("/api/backup", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const file = buildBackup(d.db, d.org.list(), d.scheduler.raw());
    d.audit.append("backup.export", "user", { ...countsOf(file) });
    res
      .type("application/json")
      .set("Content-Disposition", `attachment; filename="${backupFileName()}"`)
      .send(JSON.stringify(file));
  });
  // Nhận văn bản thô (text/plain) để không vướng giới hạn kích thước của bộ đọc JSON chung.
  app.post("/api/backup/restore", express.text({ type: () => true, limit: "25mb" }), (req, res) => {
    if (!loopbackOnly(req, res)) return;
    try {
      const file = parseBackup(typeof req.body === "string" && req.body ? req.body : req.body);
      if (d.org.busy()) return apiError(res, 409, "backupBusy");
      // Luôn giữ bản sao dữ liệu hiện tại trước khi thay thế.
      writePreRestoreCopy(d.dataDir, buildBackup(d.db, d.org.list(), d.scheduler.raw()));
      d.db.importAll(file.data);
      d.org.replaceAll(file.org);
      d.scheduler.replaceAll(file.schedules ?? []);
      d.org.onReplaced();
      const counts = countsOf(file);
      d.audit.append("backup.import", "user", { ...counts });
      res.json({ ok: true, counts });
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- Nhật ký bảo mật (chỉ từ chính máy) ----
  app.get("/api/audit", (req, res) => {
    if (!loopbackOnly(req, res)) return;
    const limit = Number(req.query.limit ?? 100);
    res.json(d.audit.tail(Number.isFinite(limit) ? limit : 100));
  });

  // ---- Sức khoẻ ----
  app.get("/api/health", async (_req, res) => {
    let dbOk = true;
    try {
      d.db.summary();
    } catch {
      dbOk = false;
    }
    const providers = await d.hub.status();
    const ready = providers.filter((p) => p.state === "ready");
    res.json({
      ok: dbOk,
      version: d.version,
      uptimeSec: Math.round((Date.now() - d.startedAt) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      emergency: d.emergency(),
      lan: d.lan,
      db: { ok: dbOk },
      ai: { ready: ready.length > 0, providers: ready.map((p) => p.id), names: ready.map((p) => p.label), total: providers.length },
      pendingActions: d.gate.list().length,
    });
  });
}
