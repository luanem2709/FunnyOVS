/**
 * Economic Autonomy Layer (EAL) — kiểu dùng chung server ↔ client.
 *
 * Tiền luôn là SỐ NGUYÊN micro-USD (1 USD = 1.000.000) để không dính sai số số thực; USDC có 6 chữ số thập phân nên khớp 1:1 với đơn vị nhỏ nhất của x402.
 * Giai đoạn 1 CHỈ NHẬN tiền (không giữ khoá ví, không chi tiền ra ngoài): "chi phí" là chi phí vận hành quy ước + chi phí người vận hành tự ghi.
 */

export const MICRO = 1_000_000;
export const usdToMicro = (usd: number): number => Math.round(usd * MICRO);
export const microToUsd = (m: number): number => m / MICRO;
export function formatUsd(micro: number): string {
  const sign = micro < 0 ? "-" : "";
  const v = Math.abs(micro) / MICRO;
  if (v >= 100) return `${sign}$${v.toFixed(0)}`;
  if (v >= 1) return `${sign}$${v.toFixed(2)}`;
  let digits = v.toFixed(4); // 0.5000 → "0.50"; 0.0000 → "0.00"; 0.0123 → "0.0123" (luôn giữ ít nhất 2 chữ số thập phân như tiền)
  while (digits.endsWith("0") && digits.length - digits.indexOf(".") - 1 > 2) digits = digits.slice(0, -1);
  return `${sign}$${digits}`;
}

export const RAIL_IDS = ["x402", "stripe", "mock"] as const;
export type RailId = (typeof RAIL_IDS)[number];

/** Loại sự kiện kinh tế. `quote`/`settled`/`failed` là ba sự kiện giao dịch; phần còn lại là vận hành. */
export const ECONOMY_EVENT_KINDS = ["quote", "settled", "failed", "cost", "opportunity", "published", "cycle", "paused", "resumed", "reinvest"] as const;
export type EconomyEventKind = (typeof ECONOMY_EVENT_KINDS)[number];

export interface EconomyEvent {
  id: string;
  at: string;
  kind: EconomyEventKind;
  /** micro-USD (có thể âm với chu kỳ lỗ). */
  amount?: number;
  topic?: string;
  rail?: RailId;
  /** Mã tham chiếu ngắn (băm giao dịch, id phiên) — đã cắt gọn, không phải bí mật. */
  ref?: string;
  note?: string;
}

export const OPPORTUNITY_RISKS = ["low", "medium", "high"] as const;
export type OpportunityRisk = (typeof OPPORTUNITY_RISKS)[number];
export type OpportunityStatus = "pending" | "approved" | "denied" | "expired";

export interface Opportunity {
  id: string;
  title: string;
  rationale: string;
  /** micro-USD ước tính. */
  estRevenue: number;
  estCost: number;
  risk: OpportunityRisk;
  source?: string;
  by: string;
  status: OpportunityStatus;
  createdAt: string;
  decidedAt?: string;
}

export interface ProductView {
  topic: string;
  title: string;
  priceMicro: number;
}

export interface CycleSummary {
  at: string;
  revenue: number;
  cost: number;
  net: number;
}

export type EconomyMode = "off" | "test" | "live";

export interface EconomyState {
  /** Bật bằng ECONOMY_RAIL. */
  enabled: boolean;
  rail?: RailId;
  mode: EconomyMode;
  /** Đã tự tạm dừng (lỗ liên tiếp) hoặc người vận hành tạm dừng. */
  paused: boolean;
  pausedReason?: "negative" | "operator";
  /** Dừng khẩn cấp của cả hệ thống đang bật → EAL không phục vụ, không chạy chu kỳ. */
  emergency: boolean;
  /** Địa chỉ nhận tiền (x402) rút gọn — không bao giờ có khoá. */
  payTo?: string;
  receivedMicro: number;
  costMicro: number;
  netMicro: number;
  negativeStreak: number;
  negativeLimit: number;
  lastCycle?: CycleSummary;
  scoutsActive: boolean;
  products: ProductView[];
  pending: Opportunity[];
  approvedCount: number;
  recent: EconomyEvent[];
  /** Chuỗi băm của sổ cái còn nguyên vẹn? */
  ledgerOk: boolean;
  ledgerCount: number;
  at: string;
}

/** Lựa chọn tái đầu tư (chỉ là ĐỀ XUẤT — người vận hành tự thực hiện sau khi duyệt). */
export const REINVEST_OPTIONS = ["add_api_key", "add_agent", "more_storage"] as const;
export type ReinvestOption = (typeof REINVEST_OPTIONS)[number];

export const TOPIC_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
