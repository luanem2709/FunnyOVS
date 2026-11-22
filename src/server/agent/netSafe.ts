/**
 * Tải trang web an toàn cho công cụ `web_fetch`: chống SSRF.
 *
 *  - Chỉ http/https; chặn cổng lạ (chỉ 80/443/8080/8443 khi tường minh).
 *  - Phân giải DNS trước, TỪ CHỐI nếu BẤT KỲ địa chỉ nào là riêng/loopback/link-local/CGNAT/multicast/metadata.
 *  - GHIM IP đã kiểm tra khi kết nối (tránh DNS rebinding giữa lúc kiểm và lúc nối).
 *  - Chuyển hướng thủ công (tối đa 3), mỗi chặng kiểm lại; giới hạn dung lượng và thời gian.
 */
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { evaluateUrl, type BrowserPolicy } from "../browser/policy.js";

/** IPv4/IPv6 không phải địa chỉ công cộng. */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPrivateIp(mapped[1]);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + metadata đám mây
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + dành riêng
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::" || l === "::1" || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb") || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("ff");
  }
  return true; // không nhận ra → coi là không an toàn
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type Resolver = (host: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: Resolver = (host) => dns.lookup(host, { all: true });

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** Kiểm URL theo chính sách trình duyệt + SSRF; trả về IP đã ghim để kết nối. */
export async function assertPublicUrl(
  raw: string,
  policy: BrowserPolicy,
  resolver: Resolver = defaultResolver,
): Promise<{ url: URL; ip: string; family: number }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL không hợp lệ.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Chỉ cho phép http/https.");
  if (url.username || url.password) throw new UnsafeUrlError("URL không được chứa tài khoản/mật khẩu.");
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError("Cổng không được phép.");
  const decision = evaluateUrl(url.toString(), policy);
  if (!decision.allowed) throw new UnsafeUrlError(decision.reason ?? "Domain không được phép.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: Array<{ address: string; family: number }>;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  else {
    try {
      addrs = await resolver(host);
    } catch {
      throw new UnsafeUrlError("Không phân giải được tên miền.");
    }
  }
  if (addrs.length === 0) throw new UnsafeUrlError("Không phân giải được tên miền.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("Địa chỉ nội bộ/riêng bị chặn.");
  return { url, ip: addrs[0].address, family: addrs[0].family };
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
}

/** Hàm gửi yêu cầu thật (có thể thay trong test). Kết nối thẳng tới `ip` đã kiểm. */
export type Requester = (url: URL, ip: string, family: number, opts: { timeoutMs: number; maxBytes: number }) => Promise<RawResponse>;

export const nodeRequester: Requester = (url, ip, family, { timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: { "user-agent": "FunnyOVS/1.0 (+local agent)", accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
        // Ghim IP: bỏ qua DNS lần hai.
        lookup: (_host, _opts, cb) => (cb as (e: Error | null, address: string, family: number) => void)(null, ip, family),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = (): void => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated });
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Quá thời gian chờ.")));
    req.on("error", reject);
    req.end();
  });

export interface SafeGetOptions {
  policy: BrowserPolicy;
  resolver?: Resolver;
  requester?: Requester;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface SafeGetResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml|rss\+xml|atom\+xml))/i;

export async function safeGet(rawUrl: string, opts: SafeGetOptions): Promise<SafeGetResult> {
  const request = opts.requester ?? nodeRequester;
  let current = rawUrl;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const { url, ip, family } = await assertPublicUrl(current, opts.policy, opts.resolver);
    const res = await request(url, ip, family, { timeoutMs: opts.timeoutMs ?? 10_000, maxBytes: opts.maxBytes ?? 400_000 });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(String(res.headers.location), url).toString();
      continue;
    }
    const ct = String(res.headers["content-type"] ?? "");
    if (ct && !TEXT_TYPES.test(ct)) throw new UnsafeUrlError(`Loại nội dung không hỗ trợ: ${ct.split(";")[0]}`);
    return { url: url.toString(), status: res.status, contentType: ct, body: res.body.toString("utf8"), truncated: res.truncated };
  }
  throw new UnsafeUrlError("Quá nhiều lần chuyển hướng.");
}

/** HTML → văn bản thuần (bỏ script/style/thẻ, gộp khoảng trắng). */
export function htmlToText(html: string, maxChars = 8000): string {
  const text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
