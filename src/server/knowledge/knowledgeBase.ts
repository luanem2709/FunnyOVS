/**
 * Thư viện Tri thức — lưu trong SQLite.
 *
 * 3 loại nội dung:
 *  - notes   : ghi chú nghiên cứu (tóm tắt, link nguồn, ngày học, độ tin cậy)
 *  - skills  : quy trình đã chạy tốt, lưu lại để tái sử dụng
 *  - lessons : lỗi đã gặp và cách tránh
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type EntryKind = "note" | "skill" | "lesson" | "retrospective";

export interface KnowledgeEntry {
  id: number;
  kind: EntryKind;
  agentId: string;
  title: string;
  body: string;
  /** Danh sách link nguồn (JSON string khi lưu). */
  sources: string[];
  /** Độ tin cậy 0..1 */
  confidence: number;
  /** Đánh dấu nội dung đến từ web (dữ liệu, không phải mệnh lệnh). */
  fromWeb: boolean;
  tags: string[];
  createdAt: string;
}

export interface Retrospective {
  taskId: string;
  agentId: string;
  agentName: string;
  didWell: string;
  didWrong: string;
  nextTime: string;
  createdAt: string;
}

export class KnowledgeBase {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "knowledge.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        sources TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.5,
        from_web INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries(kind);
      CREATE INDEX IF NOT EXISTS idx_entries_agent ON entries(agent_id);

      CREATE TABLE IF NOT EXISTS retrospectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        did_well TEXT NOT NULL,
        did_wrong TEXT NOT NULL,
        next_time TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  add(entry: Omit<KnowledgeEntry, "id" | "createdAt">): KnowledgeEntry {
    const createdAt = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO entries (kind, agent_id, title, body, sources, confidence, from_web, tags, created_at)
         VALUES (@kind, @agentId, @title, @body, @sources, @confidence, @fromWeb, @tags, @createdAt)`,
      )
      .run({
        kind: entry.kind,
        agentId: entry.agentId,
        title: entry.title,
        body: entry.body,
        sources: JSON.stringify(entry.sources ?? []),
        confidence: entry.confidence ?? 0.5,
        fromWeb: entry.fromWeb ? 1 : 0,
        tags: JSON.stringify(entry.tags ?? []),
        createdAt,
      });
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): KnowledgeEntry | null {
    const row = this.db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as any;
    return row ? toEntry(row) : null;
  }

  list(opts: { kind?: EntryKind; agentId?: string; limit?: number; query?: string } = {}): KnowledgeEntry[] {
    const where: string[] = [];
    const params: any = {};
    if (opts.kind) {
      where.push("kind = @kind");
      params.kind = opts.kind;
    }
    if (opts.agentId) {
      where.push("agent_id = @agentId");
      params.agentId = opts.agentId;
    }
    if (opts.query) {
      where.push("(title LIKE @q OR body LIKE @q)");
      params.q = `%${opts.query}%`;
    }
    const sql = `SELECT * FROM entries ${where.length ? "WHERE " + where.join(" AND ") : ""}
                ORDER BY created_at DESC LIMIT ${Math.min(opts.limit ?? 100, 500)}`;
    return (this.db.prepare(sql).all(params) as any[]).map(toEntry);
  }

  remove(id: number): boolean {
    return this.db.prepare("DELETE FROM entries WHERE id = ?").run(id).changes > 0;
  }

  saveRetrospective(r: Omit<Retrospective, "createdAt">): Retrospective {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO retrospectives (task_id, agent_id, agent_name, did_well, did_wrong, next_time, created_at)
         VALUES (@taskId, @agentId, @agentName, @didWell, @didWrong, @nextTime, @createdAt)
         ON CONFLICT(task_id) DO UPDATE SET
           did_well = @didWell, did_wrong = @didWrong, next_time = @nextTime, created_at = @createdAt`,
      )
      .run({ ...r, createdAt });
    return { ...r, createdAt };
  }

  listRetrospectives(limit = 50): Retrospective[] {
    return (
      this.db
        .prepare("SELECT * FROM retrospectives ORDER BY created_at DESC LIMIT ?")
        .all(Math.min(limit, 200)) as any[]
    ).map((r) => ({
      taskId: r.task_id,
      agentId: r.agent_id,
      agentName: r.agent_name,
      didWell: r.did_well,
      didWrong: r.did_wrong,
      nextTime: r.next_time,
      createdAt: r.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

function toEntry(row: any): KnowledgeEntry {
  return {
    id: row.id,
    kind: row.kind,
    agentId: row.agent_id,
    title: row.title,
    body: row.body,
    sources: safeJson<string[]>(row.sources, []),
    confidence: row.confidence,
    fromWeb: !!row.from_web,
    tags: safeJson<string[]>(row.tags, []),
    createdAt: row.created_at,
  };
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
