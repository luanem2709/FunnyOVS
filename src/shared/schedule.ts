/**
 * Lịch giao việc lặp lại: kiểu dữ liệu + phép tính "lần chạy kế tiếp" (thuần, test được). Dùng chung server ↔ client.
 *
 * Giờ là GIỜ ĐỊA PHƯƠNG của máy chạy ứng dụng ("hằng ngày lúc 09:00" là 9 giờ sáng theo đồng hồ máy).
 * Bỏ lỡ (máy tắt đúng giờ) thì chạy BÙ ĐÚNG MỘT LẦN ở lần kiểm tra kế tiếp — không chạy dồn nhiều lần.
 */
import { z } from "zod";

export const FREQUENCIES = ["daily", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SCHEDULE_STATUSES = ["started", "skipped", "failed"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const ScheduleSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  toAgentId: z.string().min(1).max(40),
  frequency: z.enum(FREQUENCIES),
  /** "HH:MM" 24 giờ, giờ địa phương. */
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Thứ trong tuần cho lịch tuần (0 = Chủ nhật … 6 = Thứ bảy). */
  weekday: z.number().int().min(0).max(6).optional(),
  enabled: z.boolean(),
  lang: z.enum(["vi", "en"]),
  createdAt: z.string(),
  lastRunAt: z.string().optional(),
  lastStatus: z.enum(SCHEDULE_STATUSES).optional(),
  lastRootId: z.string().optional(),
  lastError: z.string().max(300).optional(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** Một lịch kèm lần chạy kế tiếp (tính sẵn cho giao diện). */
export type ScheduleView = Schedule & { nextRunAt: string };

/** Lần chạy kế tiếp, SAU hẳn thời điểm `from`, theo giờ địa phương. */
export function nextRun(s: Pick<Schedule, "frequency" | "at" | "weekday">, from: Date): Date {
  const [hh, mm] = s.at.split(":").map(Number);
  const d = new Date(from.getTime());
  d.setHours(hh, mm, 0, 0);
  if (s.frequency === "daily") {
    if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  const wd = s.weekday ?? 1;
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/** Đã đến hạn chưa: lần chạy kế tiếp tính từ lần chạy trước (hoặc lúc tạo) đã qua. */
export function isDue(s: Schedule, now: Date): boolean {
  if (!s.enabled) return false;
  const base = new Date(s.lastRunAt ?? s.createdAt);
  if (Number.isNaN(base.getTime())) return false;
  return nextRun(s, base).getTime() <= now.getTime();
}

export function viewOf(s: Schedule, now: Date): ScheduleView {
  const base = new Date(s.lastRunAt ?? s.createdAt);
  return { ...s, nextRunAt: nextRun(s, Number.isNaN(base.getTime()) ? now : base).toISOString() };
}
