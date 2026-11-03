/**
 * Thùng rác có khôi phục (GĐ 5).
 *
 * Yêu cầu: "Thùng rác thay vì xóa hẳn."
 *
 * Thiết kế:
 *  - File bị "xóa" được CHUYỂN vào `<workspace>/.trash/<timestamp>__<tên>`.
 *  - Mỗi lần chuyển ghi 1 dòng vào `.trash/index.jsonl` (manifest).
 *  - Có thể khôi phục lại vị trí cũ (hoàn tác được).
 *  - Dọn rác thật (xóa hẳn khỏi .trash) phải được người dùng xác nhận.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface TrashEntry {
  id: string;
  ts: string;
  /** Đường dẫn gốc (trước khi xóa). */
  original: string;
  /** Đường dẫn trong thùng rác. */
  trashed: string;
  /** Tên hiển thị. */
  name: string;
  /** Kích thước (byte) — tính khi chuyển vào. */
  size: number;
  /** true nếu đã khôi phục. */
  restored: boolean;
}

export class TrashBin {
  constructor(private readonly trashDir: string) {}

  /** Đường dẫn thư mục thùng rác. */
  get dir(): string {
    return this.trashDir;
  }

  /** Đọc manifest. */
  list(): TrashEntry[] {
    const manifest = path.join(this.trashDir, "index.jsonl");
    try {
      const raw = fs.readFileSync(manifest, "utf8");
      const out: TrashEntry[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as TrashEntry;
          // Kiểm tra vẫn còn trong thùng rác.
          e.restored = !fs.existsSync(e.trashed);
          out.push(e);
        } catch {
          /* bỏ qua dòng hỏng */
        }
      }
      return out.reverse();
    } catch {
      return [];
    }
  }

  /**
   * Chuyển một file/thư mục vào thùng rác.
   * @returns đường dẫn trong thùng rác, hoặc null nếu không tồn tại.
   */
  async move(target: string): Promise<string | null> {
    const abs = path.resolve(target);
    if (!fs.existsSync(abs)) return null;
    await fsp.mkdir(this.trashDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.basename(abs);
    const dest = path.join(this.trashDir, `${stamp}__${base}`);
    try {
      await fsp.rename(abs, dest);
    } catch {
      // Khác ổ đĩa → copy rồi xóa.
      await fsp.cp(abs, dest, { recursive: true });
      await fsp.rm(abs, { recursive: true, force: true });
    }
    const size = await dirSize(dest);
    const entry: TrashEntry = {
      id: `${stamp}__${base}`,
      ts: new Date().toISOString(),
      original: abs,
      trashed: dest,
      name: base,
      size,
      restored: false,
    };
    await fsp.appendFile(
      path.join(this.trashDir, "index.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf8",
    );
    return dest;
  }

  /**
   * Khôi phục một mục về vị trí gốc.
   * @returns đường dẫn đã khôi phục, hoặc lỗi.
   */
  async restore(id: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    const entry = this.list().find((e) => e.id === id);
    if (!entry) return { ok: false, error: "Không tìm thấy mục trong thùng rác." };
    if (!fs.existsSync(entry.trashed)) {
      return { ok: false, error: "Mục này đã bị dọn khỏi thùng rác." };
    }
    // Chỗ đến đã tồn tại → không ghi đè, tự đổi tên.
    let dest = entry.original;
    if (fs.existsSync(dest)) {
      const ext = path.extname(dest);
      const stem = dest.slice(0, dest.length - ext.length);
      let i = 1;
      while (fs.existsSync(`${stem} (khôi phục ${i})${ext}`)) i++;
      dest = `${stem} (khôi phục ${i})${ext}`;
    }
    try {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(entry.trashed, dest);
      return { ok: true, path: dest };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Dọn rác thật (xóa hẳn khỏi .trash) — KHÔNG khôi phục được.
   */
  async purge(id: string): Promise<{ ok: boolean; error?: string }> {
    const entry = this.list().find((e) => e.id === id);
    if (!entry) return { ok: false, error: "Không tìm thấy mục trong thùng rác." };
    try {
      await fsp.rm(entry.trashed, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Dọn toàn bộ thùng rác. */
  async purgeAll(): Promise<{ ok: boolean; count: number }> {
    const items = this.list().filter((e) => !e.restored);
    let n = 0;
    for (const e of items) {
      try {
        await fsp.rm(e.trashed, { recursive: true, force: true });
        n++;
      } catch {
        /* bỏ qua */
      }
    }
    return { ok: true, count: n };
  }
}

/** Tính tổng kích thước thư mục (byte). */
async function dirSize(target: string): Promise<number> {
  try {
    const st = await fsp.stat(target);
    if (st.isFile()) return st.size;
    let total = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      try {
        entries = (await fsp.readdir(dir, { withFileTypes: true })) as unknown as Array<{
          name: string;
          isDirectory: () => boolean;
          isFile: () => boolean;
        }>;
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) {
          try {
            total += (await fsp.stat(full)).size;
          } catch {
            /* ignore */
          }
        }
      }
    };
    await walk(target);
    return total;
  } catch {
    return 0;
  }
}
