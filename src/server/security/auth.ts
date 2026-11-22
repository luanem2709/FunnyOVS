/**
 * Xác thực bằng token cho truy cập từ ngoài máy (chế độ LAN).
 *
 *  - Yêu cầu từ chính máy này (loopback) không cần token — trừ khi đặt OFFICE_REQUIRE_TOKEN=1.
 *  - Yêu cầu từ máy khác BẮT BUỘC có token: header `Authorization: Bearer`, `X-FunnyOVS-Token`, cookie, hoặc `?token=` ở lần đầu
 *    (sau đó đổi thành cookie HttpOnly + SameSite=Strict và chuyển hướng để token không nằm lại trên URL).
 *  - So sánh hằng thời gian (băm SHA-256 rồi `timingSafeEqual`), giới hạn thử sai theo địa chỉ, token lưu file quyền 0600.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { msg } from "../../shared/messages.js";

export const TOKEN_COOKIE = "funnyovs_token";
const MAX_FAILURES = 10;
const WINDOW_MS = 60_000;

export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/i, "");
  return a === "127.0.0.1" || a === "::1" || a.startsWith("127.");
}

function digest(s: string): Buffer {
  return crypto.createHash("sha256").update(s).digest();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export interface AuthOptions {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** Ghi đè cách nhận biết loopback (để test). */
  isLoopback?: (req: IncomingMessage) => boolean;
}

export class AuthManager {
  private token: string;
  private readonly file: string;
  private failures = new Map<string, number[]>();
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly opts: AuthOptions) {
    this.env = opts.env ?? process.env;
    this.file = path.join(opts.dataDir, "auth-token");
    this.token = this.load();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private load(): string {
    try {
      const t = fs.readFileSync(this.file, "utf8").trim();
      if (t.length >= 32) return t;
    } catch {
      /* tạo mới */
    }
    return this.write(crypto.randomBytes(32).toString("base64url"));
  }

  private write(token: string): string {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, token, { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* Windows */
    }
    return token;
  }

  /** Token hiện tại — chỉ đưa cho yêu cầu từ loopback (xem `/api/auth/info`). */
  currentToken(): string {
    return this.token;
  }

  /** Tạo token mới; mọi phiên cũ mất hiệu lực. */
  rotate(): string {
    this.token = this.write(crypto.randomBytes(32).toString("base64url"));
    return this.token;
  }

  isLoopback(req: IncomingMessage): boolean {
    return this.opts.isLoopback ? this.opts.isLoopback(req) : isLoopbackAddress(req.socket?.remoteAddress);
  }

  /** Yêu cầu này có bắt buộc token không. */
  required(req: IncomingMessage): boolean {
    return this.env.OFFICE_REQUIRE_TOKEN === "1" || !this.isLoopback(req);
  }

  verify(candidate: string | undefined): boolean {
    if (!candidate) return false;
    return crypto.timingSafeEqual(digest(candidate), digest(this.token));
  }

  private remoteKey(req: IncomingMessage): string {
    return req.socket?.remoteAddress ?? "unknown";
  }

  private recentFailures(key: string): number[] {
    const cutoff = this.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(req: IncomingMessage): boolean {
    return this.recentFailures(this.remoteKey(req)).length >= MAX_FAILURES;
  }

  private recordFailure(req: IncomingMessage): void {
    const key = this.remoteKey(req);
    const list = this.recentFailures(key);
    list.push(this.now());
    this.failures.set(key, list);
  }

  /** Lấy token từ yêu cầu (header → cookie → query). `allowQuery`: chỉ cho điều hướng GET/WS. */
  extract(req: IncomingMessage, allowQuery: boolean): { token?: string; fromQuery: boolean } {
    const h = req.headers;
    const bearer = /^Bearer\s+(.+)$/i.exec(String(h.authorization ?? ""))?.[1];
    if (bearer) return { token: bearer.trim(), fromQuery: false };
    const hdr = h["x-funnyovs-token"];
    if (typeof hdr === "string" && hdr) return { token: hdr, fromQuery: false };
    const cookie = parseCookies(h.cookie)[TOKEN_COOKIE];
    if (cookie) return { token: cookie, fromQuery: false };
    if (allowQuery) {
      try {
        const q = new URL(req.url ?? "/", "http://x").searchParams.get("token");
        if (q) return { token: q, fromQuery: true };
      } catch {
        /* URL hỏng */
      }
    }
    return { fromQuery: false };
  }

  /** Cho WebSocket: true nếu không cần token hoặc token hợp lệ. */
  verifyWs(req: IncomingMessage): boolean {
    if (!this.required(req)) return true;
    if (this.isBlocked(req)) return false;
    const { token } = this.extract(req, true);
    const ok = this.verify(token);
    if (!ok) this.recordFailure(req);
    return ok;
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!this.required(req)) return next();
      if (this.isBlocked(req)) {
        res.status(429).json({ error: msg("vi", "err.api.authBlocked"), code: "authBlocked" });
        return;
      }
      const wantsHtml = req.method === "GET" && String(req.headers.accept ?? "").includes("text/html");
      const { token, fromQuery } = this.extract(req, req.method === "GET");
      if (this.verify(token)) {
        if (fromQuery && wantsHtml) {
          // Đổi token trên URL thành cookie rồi chuyển hướng để token không lưu trong lịch sử/Referer.
          const secure = req.protocol === "https" ? "; Secure" : "";
          res.setHeader("Set-Cookie", `${TOKEN_COOKIE}=${encodeURIComponent(token!)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`);
          const url = new URL(req.originalUrl, "http://x");
          url.searchParams.delete("token");
          res.redirect(302, url.pathname + (url.search || ""));
          return;
        }
        return next();
      }
      if (token) this.recordFailure(req);
      if (wantsHtml) {
        res
          .status(401)
          .type("html")
          .send(
            `<!doctype html><meta charset="utf-8"><title>FunnyOVS</title><body style="font:15px system-ui;background:#0b0d12;color:#e8edf3;display:grid;place-items:center;height:100vh;margin:0">` +
              `<form method="get" action="/" style="background:#10141c;padding:24px;border-radius:12px;border:1px solid #2a313c;max-width:360px">` +
              `<h2 style="margin:0 0 8px">FunnyOVS</h2><p style="color:#8b95a3">Nhập mã truy cập (xem trong Cài đặt → Truy cập mạng LAN trên máy chủ).<br>Enter the access code.</p>` +
              `<input name="token" type="password" autofocus style="width:100%;padding:8px;border-radius:8px;border:1px solid #2a313c;background:#0d1117;color:inherit"> ` +
              `<button style="margin-top:12px;padding:8px 14px;border-radius:8px;border:0;background:#4a46d8;color:#fff">OK</button></form>`,
          );
        return;
      }
      res.status(401).json({ error: msg("vi", "err.api.authRequired"), code: "authRequired" });
    };
  }
}
