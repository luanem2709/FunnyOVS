/**
 * Kiểu nhật ký bảo mật dùng chung server ↔ client (Cài đặt → Nhật ký bảo mật). Xem server/security/audit.ts.
 */

export const AUDIT_KINDS = [
  "ai.key.set",
  "ai.key.clear",
  "ai.enabled",
  "ai.model",
  "mail.config",
  "github.token",
  "network.lan",
  "auth.rotate",
  "action.approved",
  "action.denied",
  "action.expired",
  "email.sent",
  "emergency.on",
  "emergency.off",
  "backup.export",
  "backup.import",
  "schedule.create",
  "schedule.delete",
  "schedule.run",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export type AuditActor = "user" | "agent" | "system";
export type AuditDetail = Record<string, string | number | boolean>;

export interface AuditEntry {
  at: string;
  kind: AuditKind;
  actor: AuditActor;
  detail: AuditDetail;
}
