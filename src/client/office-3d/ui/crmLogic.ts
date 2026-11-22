/** Logic thuần của tab CRM (không React) để test được: định dạng tiền, gom giao dịch theo giai đoạn, sắp xếp. */
import { DEAL_STAGES, type CalendarEvent, type CrmSummary, type Deal, type DealStage } from "../../../shared/crm.js";
import type { Lang } from "../i18n/dictionaries.js";

/** Tiền theo ngôn ngữ giao diện; mã tiền tệ lạ/không hợp lệ rơi về "số + mã" thay vì ném lỗi. */
export function formatMoney(lang: Lang, value: number, currency = "VND"): string {
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${new Intl.NumberFormat(locale).format(value)} ${currency}`;
  }
}

export interface StageRow {
  stage: DealStage;
  count: number;
  value: number;
  /** 0..1 so với giai đoạn có nhiều giao dịch nhất (để vẽ thanh). */
  share: number;
}

export function stageRows(summary: CrmSummary): StageRow[] {
  const max = Math.max(1, ...DEAL_STAGES.map((s) => summary.deals[s]?.count ?? 0));
  return DEAL_STAGES.map((stage) => {
    const d = summary.deals[stage] ?? { count: 0, value: 0 };
    return { stage, count: d.count, value: d.value, share: d.count / max };
  });
}

/** Giao dịch mới cập nhật lên trước; giao dịch còn mở xếp trước giao dịch đã đóng (thắng/thua). */
export function sortDeals(deals: Deal[]): Deal[] {
  const closed = (d: Deal): number => (d.stage === "won" || d.stage === "lost" ? 1 : 0);
  return [...deals].sort((a, b) => closed(a) - closed(b) || b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
}

/** Sự kiện sắp tới trước, rồi sự kiện đã qua (mới nhất trước). */
export function sortEvents(events: CalendarEvent[], now = Date.now()): CalendarEvent[] {
  const t = (e: CalendarEvent): number => new Date(e.start).getTime();
  const upcoming = events.filter((e) => t(e) >= now).sort((a, b) => t(a) - t(b));
  const past = events.filter((e) => t(e) < now).sort((a, b) => t(b) - t(a));
  return [...upcoming, ...past];
}

export function formatWhen(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Chi tiết một mục nhật ký bảo mật → "khoá=giá trị · khoá=giá trị" (giá trị boolean hiện có/không). */
export function formatAuditDetail(detail: Record<string, string | number | boolean>): string {
  return Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? (v ? "✓" : "✗") : v}`)
    .join(" · ");
}
