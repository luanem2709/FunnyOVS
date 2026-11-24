/**
 * Máy chủ CÔNG KHAI tối thiểu cho sản phẩm trả phí — chạy ở CỔNG RIÊNG, tách hẳn khỏi API chính.
 *
 * Vì sao tách: API chính coi mọi yêu cầu từ loopback là "chính chủ" (không cần token, được đổi cài đặt/khoá). Nếu bạn đưa một cổng ra internet bằng
 * tunnel/reverse proxy, mọi yêu cầu sẽ trông như đến từ loopback và lọt qua cơ chế đó. Cổng riêng này CHỈ có ba đường dẫn bên dưới, không có
 * quyền gì khác, nên chỉ cần tunnel cổng này. Mặc định KHÔNG chạy (đặt ECONOMY_PUBLIC_PORT) và chỉ nghe 127.0.0.1.
 *
 *   GET /health
 *   GET /api/public/insights            → danh mục (miễn phí): chủ đề + giá
 *   GET /api/public/insights/:topic     → 402 + yêu cầu thanh toán; có bằng chứng thanh toán hợp lệ → nội dung
 */
import express, { type Express, type Request } from "express";
import http from "node:http";
import type { EconomyService } from "./service.js";

export interface PublicAppOptions {
  /** Số yêu cầu tối đa mỗi IP mỗi phút. */
  perIpPerMin?: number;
  /** Tổng số yêu cầu tối đa mỗi phút (mọi IP). */
  globalPerMin?: number;
  /** Địa chỉ gốc công khai (vd. https://api.example.com) để ghi vào yêu cầu thanh toán; không đặt = lấy từ Host. */
  baseUrl?: string;
  /** Tin tưởng X-Forwarded-For (chỉ bật khi đứng sau proxy của bạn). */
  trustProxy?: boolean;
  now?: () => number;
}

/** Cửa sổ trượt 60 giây theo khoá. */
class Window {
  private hits = new Map<string, number[]>();
  constructor(private readonly now: () => number) {}
  /** Trả số giây phải chờ nếu vượt `max`, ngược lại 0 (và tính một lượt). */
  hit(key: string, max: number): number {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - 60_000);
    if (list.length >= max) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0] + 60_000 - t) / 1000));
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const k of this.hits.keys()) if ((this.hits.get(k)?.at(-1) ?? 0) < t - 60_000) this.hits.delete(k);
    return 0;
  }
}

export function createPublicApp(economy: EconomyService, o: PublicAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", Boolean(o.trustProxy));
  const win = new Window(o.now ?? Date.now);
  const perIp = o.perIpPerMin ?? 30;
  const global = o.globalPerMin ?? 600;
  const origin = (req: Request): string => {
    if (o.baseUrl) return o.baseUrl.replace(/\/+$/, "");
    const host = String(req.headers.host ?? "localhost").replace(/[^A-Za-z0-9.:-]/g, "").slice(0, 80);
    return `${req.protocol}://${host}`;
  };

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return void res.status(405).json({ error: "method_not_allowed" });
    if (req.path === "/health") return next();
    const wait = win.hit("*", global) || win.hit(`ip:${req.ip ?? "?"}`, perIp);
    if (wait) {
      res.setHeader("Retry-After", String(wait));
      return void res.status(429).json({ error: "rate_limited" });
    }
    next();
  });

  app.get("/health", (_req, res) => void res.json({ ok: true }));

  app.get("/api/public/insights", (_req, res) => {
    if (!economy.enabled) return void res.status(404).json({ error: "not_found" });
    const s = economy.state();
    if (s.emergency) return void res.status(503).json({ error: "unavailable" });
    res.json({ products: economy.catalog() });
  });

  app.get("/api/public/insights/:topic", async (req, res) => {
    try {
      const topic = String(req.params.topic);
      const r = await economy.handlePublic(topic, req.headers, `${origin(req)}/api/public/insights/${encodeURIComponent(topic)}`);
      for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
      res.status(r.status).json(r.body);
    } catch {
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.use((_req, res) => void res.status(404).json({ error: "not_found" }));
  return app;
}

export function startPublicServer(economy: EconomyService, o: PublicAppOptions & { port: number; host?: string }): http.Server {
  const server = http.createServer(createPublicApp(economy, o));
  server.listen(o.port, o.host ?? "127.0.0.1");
  return server;
}
