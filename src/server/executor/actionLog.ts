/**
 * Nhật ký hành động CHỈ GHI THÊM (append-only) — GĐ 4.
 *
 * Yêu cầu: "Nhật ký chỉ ghi thêm cho mọi hành động. Màn hình xem lại."
 *
 * Tính chất:
 *  - Mỗi dòng là một JSON kết quả hành động, nối thêm vào file `.jsonl`.
 *  - KHÔNG có API xóa/sửa. File chỉ lớn dần.
 *  - Có hash chuỗi (chain) để phát hiện nếu ai đó sửa file cũ.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface ActionLogEntry {
  id: number;
  ts: string;
  agentId: string;
  agentName: string;
  /** Loại hành động. */
  type: string;
  /** Mô tả ngắn. */
  description: string;
  /** Tham số đã lọc bớt (không ghi nội dung nhạy cảm). */
  params?: Record<string, unknown>;
  /** Kết quả. */
  ok: boolean;
  /** Mã lỗi nếu bị chặn/thất bại. */
  code?: string;
  error?: string;
  /** Thời gian chạy (ms). */
  durationMs?: number;
  /** Cấp quyền lúc chạy. */
  level?: string;
  /** Hành động có làm nhiễm phiên không. */
  tainted?: boolean;
  /** Hash của mục trước (chuỗi liên kết). */
  prevHash: string;
  /** Hash của mục này. */
  hash: string;
}

const GENESIS = "0".repeat(64);

export class ActionLog {
  private entries: ActionLogEntry[] = [];
  private seq = 0;
  private lastHash = GENESIS;

  constructor(private readonly logPath: string) {
    this.load();
  }

  /** Đọc lại log cũ (để giữ đúng chuỗi hash). */
  private load(): void {
    try {
      const raw = fs.readFileSync(this.logPath, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as ActionLogEntry;
          this.entries.push(e);
          this.seq = Math.max(this.seq, e.id);
          this.lastHash = e.hash;
        } catch {
          /* bỏ qua dòng hỏng */
        }
      }
    } catch {
      /* chưa có log */
    }
  }

  /** Ghi một mục (chỉ ghi thêm). */
  append(entry: Omit<ActionLogEntry, "id" | "ts" | "prevHash" | "hash">): ActionLogEntry {
    const prevHash = this.lastHash;
    const id = ++this.seq;
    const ts = new Date().toISOString();
    const hash = ActionLog.hashOf({ id, ts, ...entry, prevHash });
    const full: ActionLogEntry = { id, ts, ...entry, prevHash, hash };
    this.entries.push(full);
    this.lastHash = hash;
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fs.appendFileSync(this.logPath, JSON.stringify(full) + "\n", "utf8");
    } catch {
      /* log lỗi không chặn luồng */
    }
    return full;
  }

  /** Lấy N mục gần nhất (mới nhất trước). */
  list(limit = 200): ActionLogEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  /** Tổng số mục. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Kiểm tra chuỗi hash còn nguyên vẹn không (phát hiện bị sửa file).
   * @returns số mục hỏng (0 = tốt)
   */
  verifyChain(): { ok: boolean; brokenAt: number | null; checked: number } {
    let prev = GENESIS;
    for (const e of this.entries) {
      const expect = ActionLog.hashOf({
        id: e.id,
        ts: e.ts,
        agentId: e.agentId,
        agentName: e.agentName,
        type: e.type,
        description: e.description,
        params: e.params,
        ok: e.ok,
        code: e.code,
        error: e.error,
        durationMs: e.durationMs,
        level: e.level,
        tainted: e.tainted,
        prevHash: prev,
      });
      if (expect !== e.hash || e.prevHash !== prev) {
        return { ok: false, brokenAt: e.id, checked: this.entries.length };
      }
      prev = e.hash;
    }
    return { ok: true, brokenAt: null, checked: this.entries.length };
  }

  /** Hash chuẩn (SHA-256, trường theo thứ tự cố định). */
  static hashOf(e: Record<string, unknown>): string {
    const canonical = JSON.stringify(e, Object.keys(e).sort());
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }
}
