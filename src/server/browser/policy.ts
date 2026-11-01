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
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
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

export interface UrlDecision {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

/** Quyết định có được mở URL hay không, dựa trên policy. */
export function evaluateUrl(url: string, policy: BrowserPolicy): UrlDecision {
  const host = hostOf(url);
  if (!host) return { allowed: false, reason: "URL không hợp lệ." };

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return { allowed: false, reason: "Không được truy cập mạng nội bộ." };
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
