/**
 * Chốt chặn HTTP/WebSocket cho server cục bộ.
 *
 * Server chạy trên máy người dùng nhưng trình duyệt vẫn có thể bị một trang web lạ lợi dụng:
 *  - DNS rebinding: trang lạ trỏ tên miền của nó về 127.0.0.1 để gọi API → chặn bằng kiểm tra header Host.
 *  - WebSocket chéo nguồn: WS không bị chính sách cùng nguồn chặn → kiểm tra header Origin khi nâng cấp kết nối.
 * Client không phải trình duyệt (curl, test) không gửi Origin nên vẫn dùng được.
 */
import type { IncomingMessage } from "node:http";
import { isPrivateLanHost } from "./network.js";

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

/** `extra`: danh sách host cho phép thêm (vd. truy cập qua LAN) lấy từ OFFICE_ALLOW_HOSTS, phân cách bằng dấu phẩy. */
export function parseAllowedHosts(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedHost(host: string | undefined, extra: string[] = [], allowPrivate = false): boolean {
  if (!host) return false;
  if (LOOPBACK_HOST.test(host)) return true;
  if (allowPrivate && isPrivateLanHost(host)) return true;
  const h = host.toLowerCase();
  const bare = h.replace(/:\d{1,5}$/, "");
  return extra.includes(h) || extra.includes(bare);
}

/** Origin hợp lệ nếu vắng (client không phải trình duyệt) hoặc cùng host với yêu cầu (cùng nguồn). */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined, extra: string[] = [], allowPrivate = false): boolean {
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (host && originHost.toLowerCase() === host.toLowerCase()) return true;
  return isAllowedHost(originHost, extra, allowPrivate) && isAllowedHost(host, extra, allowPrivate);
}

export function verifyWsClient(info: { origin?: string; req: IncomingMessage }, extra: string[] = [], allowPrivate = false): boolean {
  return isAllowedHost(info.req.headers.host, extra, allowPrivate) && isAllowedOrigin(info.origin, info.req.headers.host, extra, allowPrivate);
}

/** CSP chặt cho giao diện React (không cần inline script). Giao diện cổ điển còn dùng onclick nội tuyến nên không áp CSP này. */
export const OFFICE3D_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
