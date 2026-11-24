/**
 * REST của Lớp kinh tế (EAL) trên API CHÍNH. Mọi thao tác thay đổi chỉ nhận từ chính máy chạy ứng dụng (`loopbackOnly`);
 * đọc trạng thái dùng được ở mọi nơi đã qua xác thực (không có bí mật trong đó). Phần bán hàng công khai KHÔNG nằm ở đây
 * mà ở cổng riêng (economy/publicServer.ts).
 */
import type { Express, Request, Response } from "express";
import { ValidationError } from "../../shared/validation.js";
import type { EconomyService } from "../economy/service.js";
import { apiError } from "./business.js";

export interface EconomyRouteDeps {
  economy: EconomyService;
  isLoopback: (req: Request) => boolean;
}

export function registerEconomyRoutes(app: Express, d: EconomyRouteDeps): void {
  const own = (req: Request, res: Response): boolean => {
    if (d.isLoopback(req)) return true;
    apiError(res, 403, "loopbackOnly");
    return false;
  };
  const fail = (res: Response, e: unknown): void => {
    if (e instanceof ValidationError) return apiError(res, 400, e.key, e.vars);
    apiError(res, 500, "badRequest", undefined, e instanceof Error ? e.message : String(e));
  };

  app.get("/api/economy/state", (_req, res) => void res.json(d.economy.state()));

  /** Dòng sổ cái gần nhất (kèm kết quả kiểm tra chuỗi băm). */
  app.get("/api/economy/ledger", (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ verify: d.economy.ledger.verify(), rows: d.economy.ledger.tail(limit) });
  });

  /** Xin xuất bản một báo cáo: kiểm tra ngay, rồi chờ hộp duyệt trong cảnh 3D (không giữ kết nối chờ). */
  app.post("/api/economy/publish", (req, res) => {
    if (!own(req, res)) return;
    try {
      const b = (req.body ?? {}) as { topic?: unknown; priceUsd?: unknown };
      const r = d.economy.publish(String(b.topic ?? ""), Number(b.priceUsd));
      void r.done.catch(() => undefined);
      res.status(202).json({ ok: true, topic: r.topic, title: r.title, awaiting: "approval" });
    } catch (e) {
      fail(res, e);
    }
  });

  app.delete("/api/economy/products/:topic", (req, res) => {
    if (!own(req, res)) return;
    res.json({ ok: d.economy.unpublish(String(req.params.topic)) });
  });

  app.post("/api/economy/cost", (req, res) => {
    if (!own(req, res)) return;
    try {
      const b = (req.body ?? {}) as { amountUsd?: unknown; note?: unknown };
      d.economy.recordCost(Number(b.amountUsd), String(b.note ?? ""));
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post("/api/economy/pause", (req, res) => {
    if (!own(req, res)) return;
    d.economy.pause("operator");
    res.json({ ok: true });
  });

  app.post("/api/economy/resume", (req, res) => {
    if (!own(req, res)) return;
    d.economy.resume();
    res.json({ ok: true });
  });

  app.post("/api/economy/scouts", (req, res) => {
    if (!own(req, res)) return;
    try {
      d.economy.setScouts(Boolean((req.body as { enabled?: unknown } | undefined)?.enabled));
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  /** Chốt chu kỳ ngay (thường do bộ hẹn giờ chạy). */
  app.post("/api/economy/cycle", (req, res) => {
    if (!own(req, res)) return;
    res.json({ ok: true, cycle: d.economy.runCycle() });
  });
}
