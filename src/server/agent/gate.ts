/**
 * Cổng duyệt hành động (human-in-the-loop) cho công cụ có tác dụng ra bên ngoài: gửi email, tạo issue GitHub...
 *
 * Công cụ gọi `request()` rồi CHỜ người dùng quyết định (hoặc hết hạn → coi như từ chối). Mỗi yêu cầu chỉ được quyết định đúng một lần.
 * Giao diện nhận yêu cầu qua sự kiện "request" và trả lời bằng `decide()`.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export interface ActionRequest {
  id: string;
  agentId: string;
  agentName: string;
  /** Loại hành động: email_send, github_issue... (quyết định khoá i18n của tóm tắt). */
  action: string;
  /** Biến cho khoá tóm tắt `approval.action.<action>.summary`. */
  vars: Record<string, string | number>;
  /** Chi tiết hiển thị cho người duyệt (nội dung email, tiêu đề issue...). */
  detail: string;
  createdAt: string;
  expiresAt: string;
}

export type ActionOutcome = "approved" | "denied" | "expired";

interface Pending {
  req: ActionRequest;
  resolve: (o: ActionOutcome) => void;
  timer: NodeJS.Timeout;
}

export const DEFAULT_ACTION_TTL_MS = 10 * 60_000;

export class ActionGate extends EventEmitter {
  private pending = new Map<string, Pending>();

  constructor(private readonly ttlMs = DEFAULT_ACTION_TTL_MS) {
    super();
  }

  list(): ActionRequest[] {
    return [...this.pending.values()].map((p) => p.req);
  }

  /** Gửi yêu cầu duyệt và chờ kết quả. */
  request(input: Omit<ActionRequest, "id" | "createdAt" | "expiresAt">, ttlMs = this.ttlMs): Promise<ActionOutcome> {
    const now = Date.now();
    const req: ActionRequest = {
      ...input,
      id: `act_${randomUUID().slice(0, 12)}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    return new Promise<ActionOutcome>((resolve) => {
      const timer = setTimeout(() => this.finish(req.id, "expired"), ttlMs);
      timer.unref();
      this.pending.set(req.id, { req, resolve, timer });
      this.emit("request", req);
    });
  }

  /** Người dùng quyết định. Trả false nếu yêu cầu không còn (đã xử lý/hết hạn). */
  decide(id: string, approve: boolean): boolean {
    return this.finish(id, approve ? "approved" : "denied");
  }

  /** Từ chối mọi yêu cầu đang chờ (dừng khẩn cấp). */
  denyAll(): number {
    let n = 0;
    for (const id of [...this.pending.keys()]) if (this.finish(id, "denied")) n++;
    return n;
  }

  private finish(id: string, outcome: ActionOutcome): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(outcome);
    this.emit("decided", { ...p.req, outcome });
    return true;
  }
}
