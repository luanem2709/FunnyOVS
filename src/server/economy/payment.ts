/**
 * Cổng thanh toán (payment rail) CHỈ NHẬN TIỀN. Không rail nào giữ khoá ví hay khoá có quyền chuyển tiền đi:
 *  - x402 (USDC trên Base): server chỉ biết ĐỊA CHỈ NHẬN công khai; người mua ký giấy uỷ quyền, bên trung gian (facilitator) kiểm và thanh toán.
 *  - Stripe Checkout (chế độ test): trang thanh toán do Stripe lưu; server chỉ ĐỌC trạng thái phiên bằng khoá test.
 *  - mock: cho test/mô phỏng.
 * Chế độ thật (mạng chính `base`, khoá `sk_live_…`) bị TỪ CHỐI trừ khi người vận hành đặt rõ ECONOMY_ALLOW_LIVE=1.
 * `fetch` được tiêm vào để test không gọi mạng thật.
 */
import crypto from "node:crypto";
import type { RailId } from "../../shared/economy.js";

export interface PriceSpec {
  topic: string;
  /** URL tài nguyên được bán (đưa vào yêu cầu thanh toán). */
  resource: string;
  description: string;
  priceMicro: number;
}

export type Headers = Record<string, string | string[] | undefined>;

export interface VerifyOutcome {
  ok: boolean;
  payer?: string;
  error?: string;
}

export interface SettleOutcome {
  ok: boolean;
  /** Mã chống phát lại: băm của bằng chứng thanh toán (cùng bằng chứng không dùng được hai lần). */
  proofRef: string;
  /** Mã giao dịch của rail (băm giao dịch / id phiên). */
  txRef?: string;
  payer?: string;
  error?: string;
  /** Header phản hồi cho người mua (x402: X-PAYMENT-RESPONSE). */
  responseHeaders?: Record<string, string>;
}

export interface PaymentRail {
  id: RailId;
  mode: "test" | "live";
  /** Địa chỉ nhận (công khai), nếu có. */
  payTo?: string;
  /** Nội dung phản hồi HTTP 402 cho một mức giá. */
  challenge(spec: PriceSpec): Promise<unknown>;
  /** Lấy bằng chứng thanh toán từ header yêu cầu. */
  proofOf(headers: Headers): string | undefined;
  /** Mã chống phát lại của một bằng chứng (tính được TRƯỚC khi thanh toán). */
  proofRef(proof: string): string;
  verify(spec: PriceSpec, proof: string): Promise<VerifyOutcome>;
  settle(spec: PriceSpec, proof: string): Promise<SettleOutcome>;
}

export class RailConfigError extends Error {}

const proofDigest = (proof: string): string => `p:${crypto.createHash("sha256").update(proof).digest("hex").slice(0, 32)}`;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const MAX_PROOF = 8192;

// --------------------------------------------------------------------------- x402

export const X402_NETWORKS = {
  "base-sepolia": { usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", live: false },
  base: { usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", live: true },
} as const;
export type X402Network = keyof typeof X402_NETWORKS;
export const DEFAULT_FACILITATOR = "https://x402.org/facilitator";

export interface X402Options {
  payTo: string;
  network?: string;
  facilitatorUrl?: string;
  allowLive?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createX402Rail(o: X402Options): PaymentRail {
  const network = (o.network ?? "base-sepolia") as X402Network;
  const net = X402_NETWORKS[network];
  if (!net) throw new RailConfigError(`x402: unsupported network "${String(o.network).slice(0, 30)}" (use base-sepolia, or base with ECONOMY_ALLOW_LIVE=1)`);
  if (net.live && !o.allowLive) throw new RailConfigError("x402: mainnet (base) needs ECONOMY_ALLOW_LIVE=1 — phase 1 is testnet only");
  if (!/^0x[0-9a-fA-F]{40}$/.test(o.payTo ?? "")) throw new RailConfigError("x402: ECONOMY_X402_PAY_TO must be a public 0x… address (never a private key)");
  const facilitator = (o.facilitatorUrl ?? DEFAULT_FACILITATOR).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(facilitator);
  } catch {
    throw new RailConfigError("x402: facilitator URL is invalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new RailConfigError("x402: facilitator must be https");
  const f = o.fetchImpl ?? fetch;
  const timeout = o.timeoutMs ?? 15_000;

  const requirement = (spec: PriceSpec) => ({
    scheme: "exact",
    network,
    maxAmountRequired: String(spec.priceMicro),
    resource: spec.resource,
    description: spec.description.slice(0, 200),
    mimeType: "application/json",
    payTo: o.payTo,
    maxTimeoutSeconds: 60,
    asset: net.usdc,
    extra: { name: "USDC", version: "2" },
  });

  /** Kiểm nhanh tại chỗ trước khi hỏi facilitator: đúng mạng, đúng người nhận, đủ tiền. */
  function precheck(spec: PriceSpec, proof: string): string | undefined {
    if (proof.length > MAX_PROOF) return "payment header too large";
    let p: { scheme?: string; network?: string; payload?: { authorization?: { to?: string; value?: string } } };
    try {
      p = JSON.parse(Buffer.from(proof, "base64").toString("utf8"));
    } catch {
      return "payment header is not base64 JSON";
    }
    if (p.scheme !== "exact" || p.network !== network) return "wrong scheme or network";
    const a = p.payload?.authorization;
    if (a?.to && a.to.toLowerCase() !== o.payTo.toLowerCase()) return "payment is addressed to someone else";
    if (a?.value !== undefined) {
      try {
        if (BigInt(a.value) < BigInt(spec.priceMicro)) return "amount is below the price";
      } catch {
        return "amount is not a number";
      }
    }
    return undefined;
  }

  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await f(`${facilitator}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`facilitator HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  return {
    id: "x402",
    mode: net.live ? "live" : "test",
    payTo: o.payTo,
    async challenge(spec) {
      return { x402Version: 1, error: "X-PAYMENT header is required", accepts: [requirement(spec)] };
    },
    proofOf: (h) => first(h["x-payment"]),
    proofRef: proofDigest,
    async verify(spec, proof) {
      const bad = precheck(spec, proof);
      if (bad) return { ok: false, error: bad };
      try {
        const r = await post("/verify", { x402Version: 1, paymentHeader: proof, paymentRequirements: requirement(spec) });
        return r.isValid === true ? { ok: true, payer: typeof r.payer === "string" ? r.payer : undefined } : { ok: false, error: String(r.invalidReason ?? "invalid payment").slice(0, 120) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "facilitator error" };
      }
    },
    async settle(spec, proof) {
      const proofRef = proofDigest(proof);
      try {
        const r = await post("/settle", { x402Version: 1, paymentHeader: proof, paymentRequirements: requirement(spec) });
        if (r.success !== true) return { ok: false, proofRef, error: String(r.errorReason ?? "settlement failed").slice(0, 120) };
        const tx = typeof r.transaction === "string" ? r.transaction : undefined;
        const header = Buffer.from(JSON.stringify({ success: true, transaction: tx, network, payer: r.payer })).toString("base64");
        return { ok: true, proofRef, txRef: tx, payer: typeof r.payer === "string" ? r.payer : undefined, responseHeaders: { "X-PAYMENT-RESPONSE": header } };
      } catch (e) {
        return { ok: false, proofRef, error: e instanceof Error ? e.message.slice(0, 120) : "facilitator error" };
      }
    },
  };
}

// --------------------------------------------------------------------------- Stripe Checkout (test)

export interface StripeOptions {
  secretKey: string;
  /** Địa chỉ gốc công khai dùng cho success/cancel URL. */
  baseUrl?: string;
  allowLive?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
/** Stripe yêu cầu tối thiểu 0,50 USD và đơn vị cent. */
export const STRIPE_MIN_MICRO = 500_000;

export function createStripeRail(o: StripeOptions): PaymentRail {
  const key = o.secretKey ?? "";
  const live = /^(sk|rk)_live_/.test(key);
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.test(key)) throw new RailConfigError("stripe: ECONOMY_STRIPE_KEY must be a Stripe secret key (sk_test_…)");
  if (live && !o.allowLive) throw new RailConfigError("stripe: live keys need ECONOMY_ALLOW_LIVE=1 — phase 1 is test mode only");
  const f = o.fetchImpl ?? fetch;
  const timeout = o.timeoutMs ?? 15_000;
  const base = (o.baseUrl ?? "http://localhost").replace(/\/+$/, "");
  const cents = (m: number): number => m / 10_000;
  const priceError = (m: number): string | undefined => (m < STRIPE_MIN_MICRO || m % 10_000 !== 0 ? "stripe: price must be ≥ $0.50 and whole cents" : undefined);
  const auth = { authorization: `Bearer ${key}` };

  async function session(id: string): Promise<Record<string, unknown>> {
    const res = await f(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: auth, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`stripe HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async function check(spec: PriceSpec, id: string): Promise<VerifyOutcome> {
    if (!SESSION_RE.test(id)) return { ok: false, error: "bad session id" };
    try {
      const s = await session(id);
      if (Boolean(s.livemode) !== live) return { ok: false, error: "session mode does not match the configured key" };
      if (s.payment_status !== "paid") return { ok: false, error: "not paid yet" };
      if (s.amount_total !== cents(spec.priceMicro) || String(s.currency).toLowerCase() !== "usd") return { ok: false, error: "amount does not match the price" };
      const topic = (s.metadata as Record<string, unknown> | null)?.topic;
      if (topic !== spec.topic) return { ok: false, error: "session was created for another product" };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "stripe error" };
    }
  }

  return {
    id: "stripe",
    mode: live ? "live" : "test",
    async challenge(spec) {
      const bad = priceError(spec.priceMicro);
      if (bad) throw new RailConfigError(bad);
      const form = new URLSearchParams({
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(cents(spec.priceMicro)),
        "line_items[0][price_data][product_data][name]": spec.description.slice(0, 120),
        "metadata[topic]": spec.topic,
        success_url: `${base}/?paid=1`,
        cancel_url: `${base}/?paid=0`,
      });
      const res = await f("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { ...auth, "content-type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`stripe HTTP ${res.status}`);
      const s = (await res.json()) as { id?: string; url?: string };
      return { error: "payment_required", rail: "stripe", mode: live ? "live" : "test", priceUsd: cents(spec.priceMicro) / 100, checkoutUrl: s.url, sessionId: s.id, then: "pay at checkoutUrl, then repeat this request with header X-Stripe-Session: <sessionId>" };
    },
    proofOf: (h) => first(h["x-stripe-session"]),
    proofRef: (proof) => `stripe:${proof.slice(0, 120)}`,
    verify: (spec, proof) => check(spec, proof),
    async settle(spec, proof) {
      const r = await check(spec, proof);
      const proofRef = `stripe:${proof.slice(0, 120)}`;
      return r.ok ? { ok: true, proofRef, txRef: proof.slice(0, 60) } : { ok: false, proofRef, error: r.error };
    },
  };
}

// --------------------------------------------------------------------------- mock (test / mô phỏng)

export function createMockRail(): PaymentRail {
  const parse = (proof: string): { amount: number; nonce: string } | null => {
    const m = /^mock:(\d{1,12}):([A-Za-z0-9_-]{1,40})$/.exec(proof);
    return m ? { amount: Number(m[1]), nonce: m[2] } : null;
  };
  return {
    id: "mock",
    mode: "test",
    payTo: "0x0000000000000000000000000000000000000000",
    async challenge(spec) {
      return { error: "payment_required", rail: "mock", priceMicro: spec.priceMicro };
    },
    proofOf: (h) => first(h["x-mock-payment"]),
    proofRef: proofDigest,
    async verify(spec, proof) {
      const p = parse(proof);
      return p && p.amount >= spec.priceMicro ? { ok: true, payer: "mock-payer" } : { ok: false, error: "invalid mock payment" };
    },
    async settle(spec, proof) {
      const p = parse(proof);
      return p && p.amount >= spec.priceMicro ? { ok: true, proofRef: proofDigest(proof), txRef: `mock-${p.nonce}`, payer: "mock-payer" } : { ok: false, proofRef: proofDigest(proof), error: "invalid mock payment" };
    },
  };
}

// --------------------------------------------------------------------------- từ biến môi trường

export interface RailFromEnv {
  rail?: PaymentRail;
  error?: string;
}

/** `ECONOMY_RAIL` = x402 | stripe | mock; không đặt = EAL tắt. Cấu hình sai → trả lỗi dễ hiểu, không ném (server vẫn chạy bình thường). */
export function railFromEnv(env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): RailFromEnv {
  const id = (env.ECONOMY_RAIL ?? "").trim().toLowerCase();
  if (!id) return {};
  const allowLive = env.ECONOMY_ALLOW_LIVE === "1";
  try {
    if (id === "x402") return { rail: createX402Rail({ payTo: env.ECONOMY_X402_PAY_TO ?? "", network: env.ECONOMY_X402_NETWORK, facilitatorUrl: env.ECONOMY_X402_FACILITATOR, allowLive, fetchImpl }) };
    if (id === "stripe") return { rail: createStripeRail({ secretKey: env.ECONOMY_STRIPE_KEY ?? "", baseUrl: env.ECONOMY_PUBLIC_BASE_URL, allowLive, fetchImpl }) };
    if (id === "mock") return { rail: createMockRail() };
    return { error: `ECONOMY_RAIL must be x402, stripe or mock (got "${id.slice(0, 20)}")` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid payment configuration" };
  }
}
