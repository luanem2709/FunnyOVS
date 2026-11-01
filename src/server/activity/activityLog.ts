/**
 * Nhật ký hoạt động (audit log) — Phase 6.
 *
 * Ghi lại MỌI sự kiện quan trọng: tác vụ, cấp quyền, duyệt web, đề xuất,
 * cấu hình, dừng khẩn cấp. Giữ trong bộ nhớ (vòng tròn) + đẩy qua WebSocket.
 *
 * Nhật ký KHÔNG chứa token đăng nhập hay nội dung bí mật của Cursor.
 */
import { EventEmitter } from "node:events";

export type ActivityKind =
  | "task"
  | "approval"
  | "permission"
  | "browser"
  | "proposal"
  | "config"
  | "emergency"
  | "budget"
  | "system";

export interface ActivityEntry {
  id: number;
  ts: string;
  kind: ActivityKind;
  actor: string;
  message: string;
  detail?: string;
  level: "info" | "warn" | "danger";
}

const MAX_ENTRIES = 500;

export class ActivityLog extends EventEmitter {
  private entries: ActivityEntry[] = [];
  private seq = 0;

  record(entry: {
    kind: ActivityKind;
    actor: string;
    message: string;
    detail?: string;
    level?: "info" | "warn" | "danger";
  }): ActivityEntry {
    const e: ActivityEntry = {
      id: ++this.seq,
      ts: new Date().toISOString(),
      kind: entry.kind,
      actor: entry.actor,
      message: entry.message,
      detail: entry.detail,
      level: entry.level ?? "info",
    };
    this.entries.push(e);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.emit("activity", e);
    return e;
  }

  list(limit = 100, kind?: ActivityKind): ActivityEntry[] {
    const filtered = kind ? this.entries.filter((e) => e.kind === kind) : this.entries;
    return filtered.slice(-limit).reverse();
  }

  clear(): void {
    this.entries = [];
  }
}
