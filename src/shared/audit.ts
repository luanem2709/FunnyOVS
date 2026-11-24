/**
 * Kiểu nhật ký bảo mật dùng chung server ↔ client (Cài đặt → Nhật ký bảo mật). Xem server/security/audit.ts.
 */

export const AUDIT_KINDS = [
  "ai.key.set",
  "ai.key.clear",
  "ai.enabled",
  "ai.model",
  "ai.provider.add",
  "ai.provider.edit",
  "ai.provider.remove",
  "ai.order",
  "ai.strategy",
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
  "economy.publish",
  "economy.unpublish",
  "economy.sale",
  "economy.opportunity",
  "economy.cost",
  "economy.cycle",
  "economy.paused",
  "economy.resumed",
  "economy.scouts",
  "economy.reinvest",
  "studio.save",
  "studio.render",
  "studio.cancel",
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
