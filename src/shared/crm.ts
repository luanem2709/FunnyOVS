/**
 * Kiểu dữ liệu kinh doanh dùng chung giữa server (SQLite) và client (tab CRM).
 * Đây là hình dạng JSON của các REST /api/crm/* và /api/mail/drafts, /api/calendar/*.
 */

export const DEAL_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: number;
  contactId: number | null;
  contactName?: string;
  title: string;
  value: number;
  currency: string;
  stage: DealStage;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: number;
  contactId: number | null;
  dealId: number | null;
  kind: string;
  text: string;
  agentId: string;
  at: string;
}

export type DraftStatus = "draft" | "sent" | "failed" | "discarded";

export interface EmailDraft {
  id: number;
  to: string;
  cc: string;
  subject: string;
  body: string;
  status: DraftStatus;
  agentId: string;
  error: string;
  createdAt: string;
  sentAt: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  notes: string;
  attendees: string[];
  agentId: string;
  createdAt: string;
}

export interface CrmSummary {
  contacts: number;
  deals: Record<DealStage, { count: number; value: number }>;
  openValue: number;
  wonValue: number;
}

/** Các giai đoạn còn "đang mở" (tính vào giá trị pipeline). */
export const OPEN_STAGES = ["lead", "qualified", "proposal", "negotiation"] as const satisfies readonly DealStage[];
