/**
 * Định dạng tệp sao lưu (JSON). Dùng chung server ↔ client (client chỉ cần kiểu để hiện số lượng đã khôi phục).
 *
 * Chứa: CRM (liên hệ, giao dịch, hoạt động), email nháp, lịch, cây giao việc, lịch lặp.
 * KHÔNG chứa bí mật: khoá AI, mật khẩu email, token GitHub, mã truy cập — chúng ở kho bí mật riêng và phải nhập lại trên máy mới.
 */
import { z } from "zod";
import { DEAL_STAGES } from "./crm.js";

export const BACKUP_APP = "FunnyOVS";
export const BACKUP_VERSION = 1;

const str = (max: number) => z.string().max(max);

export const ContactSchema = z.object({
  id: z.number().int().positive(),
  name: str(120),
  email: str(254),
  phone: str(40),
  company: str(120),
  tags: z.array(str(30)).max(12),
  notes: str(2000),
  createdAt: str(40),
  updatedAt: str(40),
});

export const DealSchema = z.object({
  id: z.number().int().positive(),
  contactId: z.number().int().positive().nullable(),
  title: str(160),
  value: z.number().finite().min(0).max(1e12),
  currency: str(6),
  stage: z.enum(DEAL_STAGES),
  createdAt: str(40),
  updatedAt: str(40),
});

export const ActivitySchema = z.object({
  id: z.number().int().positive(),
  contactId: z.number().int().positive().nullable(),
  dealId: z.number().int().positive().nullable(),
  kind: str(30),
  text: str(2000),
  agentId: str(40),
  at: str(40),
});

export const DraftSchema = z.object({
  id: z.number().int().positive(),
  to: str(600),
  cc: str(600),
  subject: str(200),
  body: str(20_000),
  status: z.enum(["draft", "sent", "failed", "discarded"]),
  agentId: str(40),
  error: str(500),
  createdAt: str(40),
  sentAt: str(40),
});

export const EventSchema = z.object({
  id: z.number().int().positive(),
  title: str(160),
  start: str(40),
  end: str(40),
  notes: str(1000),
  attendees: z.array(str(254)).max(20),
  agentId: str(40),
  createdAt: str(40),
});

export const BackupDataSchema = z.object({
  contacts: z.array(ContactSchema).max(50_000),
  deals: z.array(DealSchema).max(100_000),
  activities: z.array(ActivitySchema).max(200_000),
  drafts: z.array(DraftSchema).max(50_000),
  events: z.array(EventSchema).max(50_000),
});
export type BackupData = z.infer<typeof BackupDataSchema>;

export const BackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  createdAt: str(40),
  data: BackupDataSchema,
  /** Cây giao việc: được kiểm tiếp bằng OrgNodeSchema khi nạp (nút sai bị bỏ). */
  org: z.array(z.unknown()).max(5000),
  /** Lịch lặp (được kiểm khi nạp). */
  schedules: z.array(z.unknown()).max(500).optional(),
});
export type BackupFile = z.infer<typeof BackupSchema>;

export interface BackupCounts {
  contacts: number;
  deals: number;
  activities: number;
  drafts: number;
  events: number;
  org: number;
  schedules: number;
}

export function countsOf(f: BackupFile): BackupCounts {
  return {
    contacts: f.data.contacts.length,
    deals: f.data.deals.length,
    activities: f.data.activities.length,
    drafts: f.data.drafts.length,
    events: f.data.events.length,
    org: f.org.length,
    schedules: f.schedules?.length ?? 0,
  };
}
