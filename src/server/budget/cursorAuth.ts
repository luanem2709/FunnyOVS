/**
 * Đọc token đăng nhập Cursor từ IDE (runtime only — KHÔNG ghi ra đĩa, KHÔNG log).
 *
 * Nguồn: %APPDATA%\Cursor\User\globalStorage\state.vscdb → bảng ItemTable →
 * khóa "cursorAuth/accessToken".
 *
 * Token này là JWT session của chính bạn. Ta chỉ dùng nó để:
 *   - gọi API đọc hạn mức (DashboardService)
 *   - chạy `cursor-agent` với biến CURSOR_AUTH_TOKEN
 * Không bao giờ ghi token vào log, ledger, file cấu hình hay commit.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface CursorAuth {
  token: string;
  /** Nguồn token, để hiển thị cho người dùng. */
  source: "ide-state" | "env" | "none";
  /** Thời điểm hết hạn (ISO) nếu token là JWT. */
  expiresAt?: string;
}

let cached: CursorAuth | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60_000;

function ideStatePath(): string {
  const appData = process.env.APPDATA ?? "";
  return path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
}

/** Đọc accessToken từ SQLite của IDE (read-only). */
function readTokenFromIde(): { token: string; expiresAt?: string } | null {
  const dbPath = ideStatePath();
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get("cursorAuth/accessToken") as { value?: string } | undefined;
    const token = row?.value;
    if (!token) return null;
    const expiresAt = readJwtExpiry(token);
    return { token, expiresAt };
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** Đọc `exp` từ JWT (không verify chữ ký — chỉ để hiển thị hạn dùng). */
function readJwtExpiry(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    if (typeof payload.exp === "number") return new Date(payload.exp * 1000).toISOString();
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Lấy token đăng nhập. Thứ tự ưu tiên:
 *   1. Biến môi trường CURSOR_AUTH_TOKEN (bạn tự đặt, ví dụ sau `agent login`)
 *   2. state.vscdb của IDE
 * Cache 5 phút để không mở DB mỗi lần poll.
 */
export function getCursorAuth(force = false): CursorAuth {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;

  const fromEnv = process.env.CURSOR_AUTH_TOKEN?.trim();
  if (fromEnv) {
    cached = { token: fromEnv, source: "env", expiresAt: readJwtExpiry(fromEnv) };
  } else {
    const ide = readTokenFromIde();
    cached = ide
      ? { token: ide.token, source: "ide-state", expiresAt: ide.expiresAt }
      : { token: "", source: "none" };
  }
  cachedAt = Date.now();
  return cached;
}

/** Thông tin an toàn để hiển thị (không chứa token). */
export function describeCursorAuth(): { authenticated: boolean; source: string; expiresAt?: string } {
  const a = getCursorAuth();
  return { authenticated: !!a.token, source: a.source, expiresAt: a.expiresAt };
}
