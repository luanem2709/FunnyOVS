/**
 * Cấu hình trình duyệt sandbox: allowlist / blocklist, giới hạn hành vi nguy hiểm.
 */
export interface BrowserPolicy {
  /** Danh sách domain được phép. Rỗng = cho phép tất cả (trừ blocklist). */
  allowlist: string[];
  /** Danh sách domain bị chặn tuyệt đối. */
  blocklist: string[];
  /** Chặn hành động có rủi ro tài chính/pháp lý → phải hỏi người dùng. */
  sensitiveCategories: string[];
  /** Số trang tối đa cho một tác vụ tự chạy. */
  maxPagesPerTask: number;
  /** Thời gian tối đa cho một tác vụ (ms). */
  maxDurationMs: number;
  /** Số vòng lặp tối đa. */
  maxIterations: number;
  /** Cho phép tải file về máy không. */
  allowDownloads: boolean;
  /** Cho phép agent điền form không. */
  allowForms: boolean;
  /** Cho phép đăng nhập bằng tài khoản của người dùng không (luôn là false). */
  allowUserLogin: boolean;
  /** Cho phép đăng bài/nội dung không (luôn là false). */
  allowPosting: boolean;
  /** Cho phép thanh toán không (luôn là false). */
  allowPayments: boolean;
}

export const DEFAULT_POLICY: BrowserPolicy = {
  allowlist: [],
  blocklist: [
    "accounts.google.com",
    "login.microsoftonline.com",
    "accounts.paypal.com",
    "checkout.stripe.com",
    "paypal.com",
    "*.chase.com",
    "*.mbbank.vn",
    "*.techcombank.vn",
    "*.vietinbank.vn",
    "*.bidv.vn",
    "*.acb.vn",
  ],
  sensitiveCategories: ["payment", "banking", "login", "personal-data", "posting", "medical", "legal"],
  maxPagesPerTask: 15,
  maxDurationMs: 120_000,
  maxIterations: 8,
  allowDownloads: false,
  allowForms: false,
  allowUserLogin: false,
  allowPosting: false,
  allowPayments: false,
};

export function hostOf(url: string): string {
  try {
    // `new URL` tự chuẩn hóa IPv6 thành dạng có ngoặc vuông.
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Host dạng số (ví dụ `http://2130706433/` = 127.0.0.1, `http://0x7f000001/`).
 * Trình duyệt hiểu các dạng này ⇒ phải chặn như địa chỉ tương ứng.
 */
export function numericHostToIp(host: string): string | null {
  const h = host.toLowerCase();
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  if (/^0x[0-9a-f]+$/.test(h)) {
    const n = parseInt(h.slice(2), 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  // Dạng ngắn "a.b.c.d" (ví dụ 127.1 → 127.0.0.1) — xử lý riêng.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})$/);
  if (m) return `${m[1]}.0.0.${m[2]}`;
  const m2 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m2) return `${m2[1]}.${m2[2]}.${m2[3]}.0`;
  return null;
}

/** Kiểm tra domain có khớp pattern (hỗ trợ `*.example.com` và `example.*`). */
export function matchesPattern(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  if (p === host) return true;
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return host === base || host.endsWith("." + base);
  }
  if (p.endsWith(".*")) {
    const base = p.slice(0, -1);
    return host === base || host.startsWith(base);
  }
  return false;
}

/**
 * Các dải địa chỉ nội bộ / đặc biệt KHÔNG được duyệt web.
 *
 * - `169.254.0.0/16` link-local: gồm **cloud metadata endpoint** (169.254.169.254
 *   trên AWS/GCP/Azure) — truy cập được là đọc được thông tin định danh/máy chủ.
 * - `10/8`, `172.16/12`, `192.168/16`: mạng nội bộ doanh nghiệp.
 * - `127/8`: localhost.
 * - `0.0.0.0/8`: "this host" theo mọi cách diễn giải.
 * - `100.64/10` (CGNAT), `192.0.0/24`, `198.18/15`, `224/4` (multicast),
 *   `240/4` (dự trữ), `255.255.255.255`.
 */
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this host" / dùng chung
  ["10.0.0.0", 8], // mạng riêng lớp A
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + cloud metadata
  ["172.16.0.0", 12], // mạng riêng lớp B
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // mạng riêng lớp C
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // dự trữ + broadcast
];

/** IPv6 loopback / link-local / unique-local / unspecified. */
const BLOCKED_IPV6 = new Set(["::1", "::", "[::1]", "fe80::1", "::ffff:127.0.0.1"]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function maskFor(bits: number): number {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}

/** Địa chỉ có thuộc dải bị chặn không (chỉ dải IPv4 + vài IPv6 đặc biệt). */
export function isBlockedAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_IPV6.has(h) || BLOCKED_IPV6.has(host.toLowerCase())) return true;
  // IPv6-mapped IPv4 (::ffff:127.0.0.1)
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  const ip = ipv4ToInt(h);
  if (ip === null) return false;
  for (const [base, bits] of BLOCKED_IPV4_RANGES) {
    const b = ipv4ToInt(base)!;
    if ((ip & maskFor(bits)) === (b & maskFor(bits))) return true;
  }
  return false;
}

/** Địa chỉ dùng cho cloud metadata (AWS/GCP/Azure/DO) — chặn riêng để rõ ràng. */
const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
  "metadata.azure.com",
  "instance-data.ec2.internal",
]);

export interface UrlDecision {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

/** Quyết định có được mở URL hay không, dựa trên policy. */
export function evaluateUrl(url: string, policy: BrowserPolicy): UrlDecision {
  const lowerUrl = url.toLowerCase().trim();

  // Giao thức nguy hiểm — chặn trước, trước khi parse host.
  if (lowerUrl.startsWith("file:") || lowerUrl.startsWith("javascript:") || lowerUrl.startsWith("data:")) {
    return { allowed: false, reason: "Chỉ được phép mở http/https." };
  }
  if (lowerUrl.startsWith("ws:") || lowerUrl.startsWith("wss:")) {
    return { allowed: false, reason: "Chỉ được phép mở http/https." };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "URL không hợp lệ." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "Chỉ được phép mở http/https." };
  }

  const host = hostOf(url);
  if (!host) return { allowed: false, reason: "URL không hợp lệ." };

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return { allowed: false, reason: "Không được truy cập mạng nội bộ." };
  }

  // Cloud metadata + mọi địa chỉ nội bộ/đặc biệt.
  if (METADATA_HOSTS.has(host)) {
    return { allowed: false, reason: "Không được truy cập endpoint metadata của cloud." };
  }
  if (isBlockedAddress(host)) {
    return { allowed: false, reason: "Không được truy cập địa chỉ nội bộ." };
  }
  // Host dạng số (2130706433, 0x7f000001, 127.1) — trình duyệt hiểu là IP.
  const numeric = numericHostToIp(host);
  if (numeric && isBlockedAddress(numeric)) {
    return { allowed: false, reason: "Không được truy cập địa chỉ nội bộ." };
  }
  // Tên host nội bộ (.local, .internal, .lan, .home.arpa)
  if (/\.(local|internal|intranet|lan|home\.arpa)$/i.test(host)) {
    return { allowed: false, reason: "Không được truy cập tên host nội bộ." };
  }

  for (const pattern of policy.blocklist) {
    if (matchesPattern(host, pattern)) {
      return { allowed: false, reason: `Domain bị chặn: ${pattern}` };
    }
  }

  if (policy.allowlist.length > 0) {
    const ok = policy.allowlist.some((p) => matchesPattern(host, p));
    if (!ok) return { allowed: false, reason: "Domain không nằm trong allowlist." };
  }

  const lower = url.toLowerCase();
  if (lower.includes("checkout") || lower.includes("payment") || lower.includes("thanh-toan")) {
    return { allowed: false, reason: "Trang thanh toán — cần bạn xác nhận." };
  }

  return { allowed: true };
}

/** Nhận diện hành động nguy hiểm trên trang → luôn hỏi người dùng. */
export function detectRiskyAction(pageText: string): { risky: boolean; category?: string; detail?: string } {
  const t = pageText.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\b(thanh toán|thanh toan|payment|checkout|billing|đặt hàng)\b/i, "payment"],
    [/\b(đăng nhập|đăng ký|sign in|sign up|log ?in|password|mật khẩu)\b/i, "login"],
    [/\b(gửi|submit|đăng bài|publish|chia sẻ|share|bình luận|comment)\b/i, "posting"],
    [/\b(số thẻ|credit card|debit card|cvv|mật khẩu|otp|mã xác thực|ssn)\b/i, "personal-data"],
    [/\b(triệu phong|kê hoàn|tax|hợp đồng|contract|legal)\b/i, "legal"],
  ];
  for (const [re, cat] of patterns) {
    if (re.test(t)) return { risky: true, category: cat, detail: `Trang có nội dung liên quan "${cat}"` };
  }
  return { risky: false };
}
