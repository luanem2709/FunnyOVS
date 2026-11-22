/**
 * Nhật ký bảo mật chỉ-ghi-thêm (JSON Lines): ai/cái gì đã đổi điều nhạy cảm và lúc nào.
 *
 *  - Ghi: đặt/xoá khoá AI, bật/tắt nguồn AI, đổi cấu hình email/GitHub, bật/tắt LAN, đổi mã truy cập, duyệt/từ chối/hết hạn một hành động
 *    ra ngoài, gửi email, dừng khẩn cấp, sao lưu/khôi phục, lịch lặp.
 *  - KHÔNG bao giờ ghi bí mật: chi tiết chỉ nhận số/chuỗi ngắn/boolean (kiểu khác bị bỏ), và mọi chuỗi đi qua `redact()` kèm danh sách bí mật đang lưu.
 *  - Tệp có giới hạn dung lượng: quá 1 MB thì xoay vòng (giữ một bản cũ `.1`) nên không phình mãi.
 *  - Tệp quyền 0600 (như kho bí mật) vì chi tiết có thể chứa địa chỉ email người nhận.
 */
import fs from "node:fs";
import path from "node:path";
import { redact } from "./redact.js";

import { AUDIT_KINDS, type AuditActor, type AuditDetail, type AuditEntry, type AuditKind } from "../../shared/audit.js";

export { AUDIT_KINDS };
export type { AuditActor, AuditDetail, AuditEntry, AuditKind };

const MAX_BYTES = 1_000_000;
const MAX_VALUE_LEN = 160;
const MAX_KEYS = 12;

/** Chỉ giữ giá trị nguyên thuỷ ngắn; chuỗi được che bí mật. */
export function sanitizeDetail(detail: unknown, secrets: string[]): AuditDetail {
  const out: AuditDetail = {};
  if (typeof detail !== "object" || detail === null) return out;
  let n = 0;
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    if (n >= MAX_KEYS) break;
    const key = k.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40);
    if (!key) continue;
    if (typeof v === "string") out[key] = redact(v.replace(/[\r\n]+/g, " "), secrets).slice(0, MAX_VALUE_LEN);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
    else continue;
    n++;
  }
  return out;
}

export class AuditLog {
  constructor(
    private readonly file: string,
    /** Danh sách bí mật đang lưu (để che nếu lỡ lọt vào chi tiết). */
    private readonly secrets: () => string[] = () => [],
    private readonly now: () => number = Date.now,
  ) {}

  append(kind: AuditKind, actor: AuditActor, detail: unknown = {}): AuditEntry {
    const entry: AuditEntry = { at: new Date(this.now()).toISOString(), kind, actor, detail: sanitizeDetail(detail, this.secrets()) };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.rotateIfNeeded();
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      /* nhật ký không được làm hỏng thao tác chính */
    }
    return entry;
  }

  private rotateIfNeeded(): void {
    try {
      if (fs.statSync(this.file).size < MAX_BYTES) return;
      fs.renameSync(this.file, `${this.file}.1`);
    } catch {
      /* chưa có tệp */
    }
  }

  /** `limit` mục mới nhất (mới trước). Dòng hỏng bị bỏ qua. */
  tail(limit = 100): AuditEntry[] {
    const lines: string[] = [];
    for (const f of [`${this.file}.1`, this.file]) {
      try {
        lines.push(...fs.readFileSync(f, "utf8").split("\n"));
      } catch {
        /* chưa có */
      }
    }
    const out: AuditEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && out.length < Math.max(1, Math.min(limit, 500)); i--) {
      if (!lines[i]) continue;
      try {
        const e = JSON.parse(lines[i]) as AuditEntry;
        if ((AUDIT_KINDS as readonly string[]).includes(e.kind) && typeof e.at === "string") out.push(e);
      } catch {
        /* bỏ dòng hỏng */
      }
    }
    return out;
  }
}
