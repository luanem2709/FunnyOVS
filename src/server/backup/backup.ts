/**
 * Sao lưu/khôi phục dữ liệu công ty ra MỘT tệp JSON (xem shared/backup.ts cho định dạng).
 *
 *  - `buildBackup`: gom CRM + email nháp + lịch + cây giao việc + lịch lặp. Không có bí mật nào trong tệp.
 *  - `parseBackup`: kiểm tra bằng schema; tệp sai/hỏng ném `ValidationError` (khoá `val.backup.invalid`) và KHÔNG đụng vào dữ liệu hiện có.
 *  - `writePreRestoreCopy`: trước khi khôi phục luôn lưu bản sao của dữ liệu hiện tại (giữ 5 bản gần nhất) để quay lại được.
 */
import fs from "node:fs";
import path from "node:path";
import { BACKUP_APP, BACKUP_VERSION, BackupSchema, type BackupFile } from "../../shared/backup.js";
import { ValidationError, type OfficeDb } from "../crm/store.js";

export function buildBackup(db: OfficeDb, org: unknown[], schedules: unknown[] = [], now: Date = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, createdAt: now.toISOString(), data: db.exportAll(), org, schedules };
}

/** Chuỗi JSON hoặc đối tượng → BackupFile đã kiểm tra. */
export function parseBackup(raw: unknown): BackupFile {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      throw new ValidationError("val.backup.invalid", { detail: `JSON: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}` });
    }
  }
  const parsed = BackupSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError("val.backup.invalid", { detail: `${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}`.slice(0, 120) });
  }
  return parsed.data;
}

/** Tên tệp tải về: funnyovs-backup-2026-11-21.json */
export function backupFileName(now: Date = new Date()): string {
  return `funnyovs-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Lưu bản sao trước khi khôi phục; giữ `keep` bản mới nhất. Trả đường dẫn tệp. */
export function writePreRestoreCopy(dataDir: string, file: BackupFile, keep = 5, now: Date = new Date()): string {
  const dir = path.join(dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const name = `pre-restore-${now.toISOString().replace(/[:.]/g, "-")}.json`;
  const target = path.join(dir, name);
  fs.writeFileSync(target, JSON.stringify(file), { encoding: "utf8", mode: 0o600 });
  const old = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("pre-restore-") && f.endsWith(".json"))
    .sort();
  for (const f of old.slice(0, Math.max(0, old.length - keep))) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* bỏ qua */
    }
  }
  return target;
}
