/** Logic thuần cho hộp "Sao lưu & khôi phục": xem trước nội dung tệp trước khi hỏi xác nhận (kiểm đầy đủ do server làm). */
import type { BackupCounts } from "../../../shared/backup.js";

export type BackupPreview = { ok: true; counts: BackupCounts; createdAt: string } | { ok: false };

/** Đọc nhanh tệp: có đúng là bản sao lưu FunnyOVS không và chứa bao nhiêu mục. Không ném lỗi. */
export function previewBackupText(text: string): BackupPreview {
  try {
    const f = JSON.parse(text) as { app?: unknown; version?: unknown; createdAt?: unknown; data?: Record<string, unknown>; org?: unknown; schedules?: unknown };
    if (f?.app !== "FunnyOVS" || f.version !== 1 || typeof f.data !== "object" || f.data === null) return { ok: false };
    const n = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
    return {
      ok: true,
      createdAt: typeof f.createdAt === "string" ? f.createdAt : "",
      counts: {
        contacts: n(f.data.contacts),
        deals: n(f.data.deals),
        activities: n(f.data.activities),
        drafts: n(f.data.drafts),
        events: n(f.data.events),
        org: n(f.org),
        schedules: n(f.schedules),
      },
    };
  } catch {
    return { ok: false };
  }
}
