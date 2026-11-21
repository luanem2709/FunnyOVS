/**
 * Schema dùng chung server ↔ client cho "văn phòng 3D hợp nhất".
 *
 * Mọi thứ hiển thị trong cảnh (agent, phiên làm việc, máy tính, tác vụ) đều quy về `OfficeEntity`.
 * Thay đổi theo thời gian đi qua `OfficeEvent` (discriminated union) — một kiểu duy nhất cho WebSocket.
 *
 * Ý tưởng "backend là nguồn sự thật, giao diện chỉ phản chiếu" lấy từ Hermes3D (MIT), xem NOTICE.md.
 */
import { z } from "zod";

export const ENTITY_KINDS = ["agent", "session", "machine", "task"] as const;
export const EntityKind = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKind>;

/** Tập cha của trạng thái FunnyOVS (7) và trạng thái chung (5): không mất thông tin khi đổi qua lại. */
export const ENTITY_STATUSES = [
  "idle",
  "working",
  "researching",
  "learning",
  "pending-approval",
  "blocked",
  "error",
  "offline",
  "stopped",
] as const;
export const EntityStatus = z.enum(ENTITY_STATUSES);
export type EntityStatus = z.infer<typeof EntityStatus>;

export const OfficeEntity = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: EntityKind,
  status: EntityStatus,
  /** id phòng ban (src/server/agents/departments.ts). */
  department: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number().default(0), z: z.number() }).optional(),
  metadata: z.record(z.unknown()).default({}),
  /** ISO 8601. */
  updatedAt: z.string(),
});
export type OfficeEntity = z.infer<typeof OfficeEntity>;

/** Năm trạng thái đơn giản dùng cho KPI và bảng dự phòng. */
export type SimpleStatus = "idle" | "working" | "error" | "offline" | "pending-approval";

export function simplifyStatus(s: EntityStatus): SimpleStatus {
  switch (s) {
    case "working":
    case "researching":
    case "learning":
      return "working";
    case "blocked":
    case "error":
      return "error";
    case "pending-approval":
      return "pending-approval";
    case "offline":
    case "stopped":
      return "offline";
    default:
      return "idle";
  }
}

export type LogLevel = "info" | "warn" | "error";

export type OfficeEvent =
  | { type: "snapshot"; entities: OfficeEntity[]; at: string }
  | { type: "entity.created"; entity: OfficeEntity }
  | { type: "entity.updated"; entity: OfficeEntity }
  | { type: "entity.removed"; id: string }
  | { type: "status.changed"; id: string; from: EntityStatus; to: EntityStatus; at: string }
  | { type: "log"; entityId?: string; level: LogLevel; text: string; at: string }
  | {
      type: "approval.requested";
      id: string;
      entityId: string;
      kind: "permission" | "token";
      summary: string;
      /** Chi tiết để hiển thị (đường dẫn, ước lượng token...). */
      detail?: string;
      at: string;
    }
  | { type: "approval.decided"; id: string; decision: "approve" | "deny"; at: string };

export type OfficeEventType = OfficeEvent["type"];

const EVENT_TYPES: ReadonlySet<string> = new Set<OfficeEventType>([
  "snapshot",
  "entity.created",
  "entity.updated",
  "entity.removed",
  "status.changed",
  "log",
  "approval.requested",
  "approval.decided",
]);

/** Kiểm tra một giá trị nhận từ mạng có đúng hình dạng `OfficeEvent` (thực thể được kiểm bằng zod). */
export function isOfficeEvent(v: unknown): v is OfficeEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  const t = e.type;
  if (typeof t !== "string" || !EVENT_TYPES.has(t)) return false;
  switch (t) {
    case "snapshot":
      return Array.isArray(e.entities) && e.entities.every((x) => OfficeEntity.safeParse(x).success);
    case "entity.created":
    case "entity.updated":
      return OfficeEntity.safeParse(e.entity).success;
    case "entity.removed":
      return typeof e.id === "string";
    case "status.changed":
      return typeof e.id === "string" && EntityStatus.safeParse(e.from).success && EntityStatus.safeParse(e.to).success;
    case "log":
      return typeof e.text === "string" && ["info", "warn", "error"].includes(String(e.level));
    case "approval.requested":
      return typeof e.id === "string" && typeof e.entityId === "string" && typeof e.summary === "string";
    case "approval.decided":
      return typeof e.id === "string" && (e.decision === "approve" || e.decision === "deny");
  }
  return false;
}

/** Tên sự kiện WebSocket mang `OfficeEvent` (tách khỏi các sự kiện cũ để không phá client cũ). */
export const OFFICE_WS_EVENT = "office";
