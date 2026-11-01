/**
 * Cơ chế "đề xuất thay đổi" — agent KHÔNG BAO GIỜ sửa mã nguồn trực tiếp.
 *
 * Agent tạo một proposal (diff/unified hoặc file mới), người dùng duyệt trong UI,
 * rồi hệ thống mới áp dụng. Có thể hoàn tác (undo) bất kỳ lúc nào.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export type ProposalStatus = "pending" | "applied" | "rejected" | "reverted" | "failed";

export interface Proposal {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  rationale: string;
  /** Các file bị tác động: đường dẫn tương đối + nội dung mới (null = xóa). */
  files: Array<{ path: string; content: string | null }>;
  status: ProposalStatus;
  createdAt: string;
  decidedAt?: string;
  /** Ảnh chụp nội dung cũ để hoàn tác. */
  backups?: Array<{ path: string; previous: string | null }>;
  error?: string;
}

export class ProposalStore extends EventEmitter {
  private proposals: Proposal[] = [];

  constructor(private readonly rootDir: string) {
    super();
  }

  create(input: {
    agentId: string;
    agentName: string;
    title: string;
    rationale: string;
    files: Array<{ path: string; content: string | null }>;
  }): Proposal {
    const p: Proposal = {
      id: `prop_${crypto.randomBytes(6).toString("hex")}`,
      agentId: input.agentId,
      agentName: input.agentName,
      title: input.title,
      rationale: input.rationale,
      files: input.files,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.proposals.push(p);
    this.emit("proposal", p);
    return p;
  }

  list(status?: ProposalStatus): Proposal[] {
    const list = status ? this.proposals.filter((p) => p.status === status) : this.proposals;
    return [...list].reverse();
  }

  get(id: string): Proposal | null {
    return this.proposals.find((p) => p.id === id) ?? null;
  }

  /** Áp dụng proposal (chỉ người dùng gọi, qua API duyệt). */
  apply(id: string): { ok: boolean; error?: string; proposal?: Proposal } {
    const p = this.get(id);
    if (!p) return { ok: false, error: "Không tìm thấy đề xuất." };
    if (p.status !== "pending") return { ok: false, error: `Đề xuất đã ở trạng thái "${p.status}".` };

    const backups: Array<{ path: string; previous: string | null }> = [];
    try {
      for (const f of p.files) {
        const abs = path.resolve(this.rootDir, f.path);
        if (!abs.startsWith(path.resolve(this.rootDir))) {
          throw new Error(`Đường dẫn vượt ra ngoài thư mục dự án: ${f.path}`);
        }
        let previous: string | null = null;
        if (fs.existsSync(abs)) previous = fs.readFileSync(abs, "utf8");
        backups.push({ path: f.path, previous });

        if (f.content === null) {
          fs.rmSync(abs, { force: true });
        } else {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, f.content, "utf8");
        }
      }
      p.backups = backups;
      p.status = "applied";
      p.decidedAt = new Date().toISOString();
      this.emit("applied", p);
      return { ok: true, proposal: p };
    } catch (e) {
      // Khôi phục phần đã áp dụng
      for (const b of backups.reverse()) {
        try {
          const abs = path.resolve(this.rootDir, b.path);
          if (b.previous === null) fs.rmSync(abs, { force: true });
          else fs.writeFileSync(abs, b.previous, "utf8");
        } catch {
          /* ignore */
        }
      }
      p.status = "failed";
      p.error = (e as Error).message;
      this.emit("failed", p);
      return { ok: false, error: p.error };
    }
  }

  /** Hoàn tác một proposal đã áp dụng. */
  revert(id: string): { ok: boolean; error?: string } {
    const p = this.get(id);
    if (!p) return { ok: false, error: "Không tìm thấy đề xuất." };
    if (p.status !== "applied") return { ok: false, error: "Chỉ hoàn tác được đề xuất đã áp dụng." };
    if (!p.backups) return { ok: false, error: "Không có bản sao lưu để hoàn tác." };

    try {
      for (const b of p.backups) {
        const abs = path.resolve(this.rootDir, b.path);
        if (b.previous === null) fs.rmSync(abs, { force: true });
        else {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, b.previous, "utf8");
        }
      }
      p.status = "reverted";
      p.decidedAt = new Date().toISOString();
      this.emit("reverted", p);
      return { ok: true };
    } catch (e) {
      p.error = (e as Error).message;
      return { ok: false, error: p.error };
    }
  }

  reject(id: string): { ok: boolean; error?: string } {
    const p = this.get(id);
    if (!p) return { ok: false, error: "Không tìm thấy đề xuất." };
    if (p.status !== "pending") return { ok: false, error: "Đề xuất đã được xử lý." };
    p.status = "rejected";
    p.decidedAt = new Date().toISOString();
    this.emit("rejected", p);
    return { ok: true };
  }
}

/** Tạo unified diff đơn giản giữa hai nội dung văn bản. */
export function simpleDiff(oldText: string, newText: string, filePath: string): string {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) {
      if (x !== undefined) lines.push(" " + x);
    } else {
      if (x !== undefined) lines.push("-" + x);
      if (y !== undefined) lines.push("+" + y);
    }
  }
  return lines.join("\n");
}
