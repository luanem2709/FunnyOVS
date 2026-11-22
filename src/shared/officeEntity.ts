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
  metadata: z.record(z.string(), z.unknown()).default({}),
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

// ---------------------------------------------------------------------------
// Phân tầng công ty: Giám đốc (1) → Trưởng phòng (2) → Nhân viên (3)
// ---------------------------------------------------------------------------

export type Tier = 1 | 2 | 3;
export const TIER_TITLE: Record<Tier, string> = { 1: "Giám đốc", 2: "Trưởng phòng", 3: "Nhân viên" };

export const ORG_STATUSES = ["pending", "running", "awaiting-approval", "done", "failed", "rejected"] as const;
export const OrgStatus = z.enum(ORG_STATUSES);
export type OrgStatus = z.infer<typeof OrgStatus>;

/** Thông điệp có khoá i18n: client dịch theo ngôn ngữ người dùng, `text` là bản dự phòng (tiếng Việt). */
export const I18nMessage = z.object({
  key: z.string().optional(),
  vars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  text: z.string(),
});
export type I18nMessage = z.infer<typeof I18nMessage>;

/** Nghiệm thu có cấu trúc của một nút cha: client tự định dạng theo ngôn ngữ. */
export const OrgReview = z.object({
  done: z.number(),
  failed: z.number(),
  rejected: z.number(),
  items: z.array(
    z.object({
      assigneeId: z.string(),
      assigneeName: z.string(),
      department: z.string(),
      status: OrgStatus,
      text: z.string().optional(),
      error: I18nMessage.optional(),
    }),
  ),
});
export type OrgReview = z.infer<typeof OrgReview>;

/**
 * Một nút trong cây giao việc. `delegation` = chỉ phân việc xuống cấp dưới (không tốn token);
 * `work` = việc thật do agent chạy (đi qua TaskRunner: ước lượng, duyệt, ngân sách...).
 */
export const OrgNode = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum(["delegation", "work"]),
  assigneeId: z.string(),
  assigneeName: z.string(),
  department: z.string(),
  title: z.string(),
  status: OrgStatus,
  /** Id TaskRecord khi `kind = work` và đã được nộp. */
  taskId: z.string().optional(),
  /** Kết quả của việc thật (nút `work` đã xong). */
  result: z.string().optional(),
  /** Lỗi của việc thật hoặc của nút cha. */
  error: I18nMessage.optional(),
  /** Nghiệm thu có cấu trúc (nút `delegation` khi mọi cấp dưới đã kết thúc). */
  review: OrgReview.optional(),
  /** Báo cáo tổng hợp do Giám đốc viết (LLM) cho nút gốc. */
  summary: z.string().optional(),
  /** Lý do chọn phòng/người (từ kế hoạch). */
  rationale: z.string().optional(),
  /** Bản thử lại của nút này (nút gốc bị thay thế). */
  retryOf: z.string().optional(),
  /** Đã được thay bằng bản thử lại — không tính vào nghiệm thu. */
  superseded: z.boolean().optional(),
  /** Đang chờ bước phụ thuộc. */
  waitingFor: z.array(z.string()).optional(),
  /** Nguồn kế hoạch của nút gốc: LLM hay bộ từ khoá. */
  planSource: z.enum(["llm", "keywords"]).optional(),
  childIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrgNode = z.infer<typeof OrgNode>;

export type OfficeEvent =
  | { type: "snapshot"; entities: OfficeEntity[]; at: string }
  | { type: "entity.created"; entity: OfficeEntity }
  | { type: "entity.updated"; entity: OfficeEntity }
  | { type: "entity.removed"; id: string }
  | { type: "status.changed"; id: string; from: EntityStatus; to: EntityStatus; at: string }
  | {
      type: "log";
      entityId?: string;
      level: LogLevel;
      /** Văn bản mặc định (tiếng Việt) — client không có khoá i18n sẽ hiện nguyên văn. */
      text: string;
      /** Khoá i18n + biến để client dịch theo ngôn ngữ người dùng; `extra` là chi tiết không dịch (vd. thông báo lỗi). */
      key?: string;
      vars?: Record<string, string | number>;
      extra?: string;
      extraKey?: string;
      extraVars?: Record<string, string | number>;
      at: string;
    }
  | {
      type: "approval.requested";
      id: string;
      entityId: string;
      kind: "permission" | "token" | "action";
      /** Bản dự phòng (tiếng Việt); client ưu tiên dịch `key` + `vars`. */
      summary: string;
      key?: string;
      vars?: Record<string, string | number>;
      /** Chi tiết để hiển thị (đường dẫn, lý do, nội dung email...). */
      detail?: string;
      detailKey?: string;
      detailVars?: Record<string, string | number>;
      at: string;
    }
  | { type: "approval.decided"; id: string; decision: "approve" | "deny"; at: string }
  /** Công tắc DỪNG KHẨN CẤP đang bật/tắt. */
  | { type: "emergency"; active: boolean; at: string }
  /** Toàn bộ cây giao việc (gửi khi kết nối). */
  | { type: "org.snapshot"; nodes: OrgNode[]; at: string }
  /** Một nút giao việc mới/đã đổi. */
  | { type: "org.node"; node: OrgNode };

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
  "emergency",
  "org.snapshot",
  "org.node",
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
    case "emergency":
      return typeof e.active === "boolean";
    case "org.snapshot":
      return Array.isArray(e.nodes) && e.nodes.every((x) => OrgNode.safeParse(x).success);
    case "org.node":
      return OrgNode.safeParse(e.node).success;
  }
  return false;
}

/** Tên sự kiện WebSocket mang `OfficeEvent` (tách khỏi các sự kiện cũ để không phá client cũ). */
export const OFFICE_WS_EVENT = "office";
