/**
 * Đọc hạn mức (quota) thật của tài khoản Cursor từ API nội bộ của Cursor.
 *
 * Đã kiểm chứng trên máy (2026-11-01, Cursor 3.22.12 / CLI 2026.10.22):
 *   POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage
 *   POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetAggregatedUsageEvents
 *   POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo
 *
 * Đây là API NỘI BỘ (không công khai) — Cursor có thể đổi bất cứ lúc nào.
 * Vì vậy mọi lỗi ở đây đều được nuốt và chuyển thành `available: false`,
 * để lớp Token Budget rơi về chế độ tự đếm.
 */
import { getCursorAuth } from "./cursorAuth.js";

const ENDPOINT = process.env.CURSOR_QUOTA_ENDPOINT ?? "https://api2.cursor.sh";
const SERVICE = "aiserver.v1.DashboardService";

export interface CursorQuota {
  /** Đọc được từ server không. false = phải dùng chế độ tự đếm. */
  available: boolean;
  /** Tên gói: "Free" | "Pro" | ... */
  planName?: string;
  /** Chu kỳ thanh toán (ISO). */
  cycleStart?: string;
  cycleEnd?: string;
  /** Phần trăm đã dùng của pool "auto" (model trong gói). */
  autoPercentUsed?: number;
  /** Phần trăm đã dùng của pool API (model bên thứ ba, tính phí riêng). */
  apiPercentUsed?: number;
  /** Phần trăm tổng đã dùng. */
  totalPercentUsed?: number;
  /** Pool có trần định lượng bằng token không (gói Free thường là false). */
  includedLimitZero?: boolean;
  /** Danh sách model thuộc bucket "auto" (dùng để tự hạ cấp model hợp lệ). */
  autoBucketModels?: string[];
  /** Số dư tiền tạm tính (cents). */
  totalSpendCents?: number;
  /** Thông báo hiển thị của Cursor. */
  displayMessage?: string;
  /** Lý do không đọc được. */
  error?: string;
}

export interface AggregatedUsage {
  available: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalCents: number;
  startDate?: string;
  error?: string;
}

async function callService<T>(method: string, body: unknown = {}): Promise<T> {
  const auth = getCursorAuth();
  if (!auth.token) throw new Error("Chưa có token đăng nhập Cursor.");

  const res = await fetch(`${ENDPOINT}/${SERVICE}/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Cursor trả về HTTP ${res.status}`);
  return (await res.json()) as T;
}

function msToIso(v?: string | number): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return new Date(n).toISOString();
}

/** Đọc trạng thái hạn mức hiện tại. */
export async function fetchCursorQuota(): Promise<CursorQuota> {
  try {
    const raw = await callService<any>("GetCurrentPeriodUsage");
    const plan = raw?.planUsage ?? {};
    return {
      available: true,
      autoPercentUsed: numOrUndef(plan.autoPercentUsed),
      apiPercentUsed: numOrUndef(plan.apiPercentUsed),
      totalPercentUsed: numOrUndef(plan.totalPercentUsed),
      totalSpendCents: numOrUndef(plan.totalSpend),
      cycleStart: msToIso(raw?.billingCycleStart),
      cycleEnd: msToIso(raw?.billingCycleEnd),
      includedLimitZero: raw?.spendLimitUsage
        ? raw.spendLimitUsage.individualLimit === 0 && raw.spendLimitUsage.pooledLimit === "0"
        : undefined,
      autoBucketModels: Array.isArray(raw?.autoBucketModels) ? raw.autoBucketModels : undefined,
      displayMessage: raw?.autoModelSelectedDisplayMessage ?? raw?.displayMessage,
    };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Đọc tổng token đã dùng trong kỳ hiện tại. */
export async function fetchAggregatedUsage(startDate?: string): Promise<AggregatedUsage> {
  const empty: AggregatedUsage = {
    available: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalCents: 0,
  };
  try {
    const raw = await callService<any>("GetAggregatedUsageEvents", startDate ? { startDate } : {});
    const agg = raw?.aggregations?.[0];
    if (!agg) return { ...empty, available: true };
    return {
      available: true,
      inputTokens: Number(agg.inputTokens ?? 0),
      outputTokens: Number(agg.outputTokens ?? 0),
      cacheReadTokens: Number(agg.cacheReadTokens ?? 0),
      totalCents: Number(agg.totalCents ?? 0),
      startDate: msToIso(raw?.startDate),
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Đọc tên gói + giá nâng cấp (dùng để hiển thị trong tab Cài đặt). */
export async function fetchPlanInfo(): Promise<{
  available: boolean;
  planName?: string;
  price?: string;
  upgradeTier?: string;
  upgradePrice?: string;
  includedUsagePeriod?: string;
  error?: string;
}> {
  try {
    const raw = await callService<any>("GetPlanInfo");
    const plan = raw?.planInfo ?? {};
    const next = raw?.nextUpgrade ?? {};
    return {
      available: true,
      planName: plan.planName,
      price: plan.price,
      upgradeTier: next.tier,
      upgradePrice: next.price,
      includedUsagePeriod: next.includedUsagePeriod,
    };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
