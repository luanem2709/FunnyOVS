/**
 * Lỗi dữ liệu đầu vào dùng chung (CRM, nguồn AI tuỳ chỉnh, lịch...). `key` + `vars` là khoá i18n (`val.*`) để REST/tool dịch theo ngôn ngữ người dùng;
 * `message` là bản tiếng Việt dự phòng. Tách riêng khỏi `crm/store.ts` để các module không cần SQLite vẫn dùng được.
 */
import { msg } from "./messages.js";

export class ValidationError extends Error {
  constructor(
    readonly key: string,
    readonly vars?: Record<string, string | number>,
  ) {
    super(msg("vi", key, vars));
    this.name = "ValidationError";
  }
}
