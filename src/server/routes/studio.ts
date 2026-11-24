/**
 * REST của Studio. Mọi thao tác thay đổi/chạy chỉ nhận từ chính máy chạy ứng dụng (`loopbackOnly`); đọc trạng thái/sản phẩm dùng được ở mọi nơi đã xác thực.
 * Tên dự án luôn qua `PROJECT_RE` + kiểm đường dẫn trong service; file phục vụ chỉ là clip mp4 và ảnh xem thử của dự án đó.
 */
import type { Express, Request, Response } from "express";
import { ValidationError } from "../../shared/validation.js";
import type { StudioService } from "../studio/service.js";
import { apiError } from "./business.js";

export interface StudioRouteDeps {
  studio: StudioService;
  isLoopback: (req: Request) => boolean;
}

export function registerStudioRoutes(app: Express, d: StudioRouteDeps): void {
  const own = (req: Request, res: Response): boolean => {
    if (d.isLoopback(req)) return true;
    apiError(res, 403, "loopbackOnly");
    return false;
  };
  const fail = (res: Response, e: unknown): void => {
    if (e instanceof ValidationError) return apiError(res, 400, e.key, e.vars);
    apiError(res, 500, "badRequest", undefined, e instanceof Error ? e.message : String(e));
  };

  app.get("/api/studio/state", async (_req, res) => {
    await d.studio.tools().catch(() => undefined);
    res.json(d.studio.state());
  });

  app.post("/api/studio/projects", (req, res) => {
    if (!own(req, res)) return;
    try {
      res.json({ ok: true, ...d.studio.create(String((req.body as { project?: unknown } | undefined)?.project ?? "")) });
    } catch (e) {
      fail(res, e);
    }
  });

  app.get("/api/studio/projects/:project/:kind(script|shots|characters)", (req, res) => {
    try {
      res.json(d.studio.read(req.params.project, req.params.kind));
    } catch (e) {
      fail(res, e);
    }
  });

  app.put("/api/studio/projects/:project/:kind(script|shots|characters)", (req, res) => {
    if (!own(req, res)) return;
    try {
      res.json({ ok: true, ...d.studio.save(req.params.project, req.params.kind, req.body) });
    } catch (e) {
      fail(res, e);
    }
  });

  /** Bắt đầu dựng (chạy nền, trả 202 ngay). Nếu bật `voice` thì hộp duyệt hiện trong cảnh 3D trước khi gửi lời đọc ra ngoài. */
  app.post("/api/studio/render", async (req, res) => {
    if (!own(req, res)) return;
    try {
      const b = (req.body ?? {}) as { project?: unknown; voice?: unknown; preview?: unknown };
      const job = await d.studio.start(String(b.project ?? ""), { voice: Boolean(b.voice), preview: Boolean(b.preview) });
      res.status(202).json({ ok: true, job });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post("/api/studio/cancel", (req, res) => {
    if (!own(req, res)) return;
    res.json({ ok: d.studio.cancel(String((req.body as { id?: unknown } | undefined)?.id ?? "")) });
  });

  app.get("/api/studio/projects/:project/clip.mp4", (req, res) => {
    const f = d.studio.clipPath(req.params.project);
    if (!f) return void apiError(res, 404, "val.studio.noOutput");
    res.type("video/mp4").sendFile(f, { dotfiles: "deny" });
  });

  app.get("/api/studio/projects/:project/preview/:n", (req, res) => {
    const f = d.studio.previewPath(req.params.project, Number(req.params.n));
    if (!f) return void apiError(res, 404, "val.studio.noOutput");
    res.type("image/jpeg").setHeader("Cache-Control", "no-store");
    res.sendFile(f, { dotfiles: "deny" });
  });
}
