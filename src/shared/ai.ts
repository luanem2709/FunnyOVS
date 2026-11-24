/**
 * Kiểu trạng thái nhà cung cấp AI dùng chung giữa server (hub) và client (tab Kết nối AI).
 * Đây chính là hình dạng JSON mà `GET /api/ai/status` trả về — không bao giờ chứa khoá thật.
 */

export type ProviderKind = "gateway" | "local" | "cloud" | "custom";

/**
 * Cách chọn nguồn khi có nhiều nguồn sẵn sàng:
 *  - priority: luôn thử nguồn trên cùng trước, lỗi/hết hạn mức mới xuống nguồn kế tiếp (mặc định);
 *  - roundrobin: xoay vòng điểm bắt đầu để dàn đều tải — dùng được nhiều gói miễn phí cùng lúc mà không dồn vào một nguồn (vẫn tự dự phòng khi lỗi).
 */
export type RoutingStrategy = "priority" | "roundrobin";
export const ROUTING_STRATEGIES: readonly RoutingStrategy[] = ["priority", "roundrobin"];

/** Số nguồn tuỳ chỉnh tối đa người dùng thêm được. */
export const MAX_CUSTOM_PROVIDERS = 20;

export type ProviderState = "ready" | "no-key" | "offline" | "cooling" | "disabled" | "auth-failed";

export interface ProviderStats {
  calls: number;
  failures: number;
  consecutiveFailures: number;
  /** Chẩn đoán kỹ thuật (tiếng Anh) — dùng cho nhật ký; giao diện dùng `lastErrorKey`. */
  lastError?: string;
  /** Khoá i18n (`ai.err.*`) + biến để client dịch lỗi gần nhất. */
  lastErrorKey?: string;
  lastErrorVars?: Record<string, string | number>;
  lastErrorStatus?: number;
  lastLatencyMs?: number;
  cooldownUntil?: number;
}

export interface ProviderStatus {
  id: string;
  label: string;
  kind: ProviderKind;
  free: boolean;
  baseUrl: string;
  state: ProviderState;
  /** Văn bản dự phòng (tiếng Việt); client ưu tiên dịch theo `detailKey`. */
  detail?: string;
  detailKey?: string;
  detailVars?: Record<string, string | number>;
  hasKey: boolean;
  keySource?: "env" | "stored";
  keyMask?: string;
  models: string[];
  activeModel?: string;
  /** Model do người dùng chọn tay (rỗng = tự chọn theo gợi ý). */
  modelOverride?: string;
  signupUrl?: string;
  stats: ProviderStats;
  enabled: boolean;
  priority: number;
  /** Nguồn do người dùng thêm (sửa/xoá được). */
  custom?: boolean;
}
