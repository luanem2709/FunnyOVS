/**
 * Nhật ký chi tiêu token (SQLite).
 *
 * Mỗi lượt gọi LLM ghi một dòng. Nhờ vậy 3D HUD và tab "Nhật ký chi tiêu" hiển thị
 * được: ai làm gì, model nào, tốn bao nhiêu token, ví nào, và số liệu lấy từ đâu
 * (CLI chính xác / API Cursor / ước lượng).
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type WalletKind = "normal" | "learning";
export type QuotaSource = "cli-usage" | "cursor-api" | "estimated";

export interface LedgerEntry {
  id: number;
  ts: string;
  taskId: string;
  department: string;
  agentId: string;
  agentName: string;
  model: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costCents: number;
  wallet: WalletKind;
  /** % hạn mức Cursor tại thời điểm ghi (snapshot). */
  cursorPercentUsed?: number;
  quotaSource: QuotaSource;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface LedgerInput {
  taskId: string;
  department: string;
  agentId: string;
  agentName: string;
  model: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costCents: number;
  wallet: WalletKind;
  cursorPercentUsed?: number;
  quotaSource: QuotaSource;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export class TokenLedger {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "ledger.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        task_id TEXT NOT NULL,
        department TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        model TEXT NOT NULL,
        backend TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_cents REAL NOT NULL DEFAULT 0,
        wallet TEXT NOT NULL DEFAULT 'normal',
        cursor_percent_used REAL,
        quota_source TEXT NOT NULL DEFAULT 'estimated',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        ok INTEGER NOT NULL DEFAULT 1,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_ts ON token_ledger(ts);
      CREATE INDEX IF NOT EXISTS idx_ledger_task ON token_ledger(task_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON token_ledger(wallet);
    `);
  }

  add(input: LedgerInput): LedgerEntry {
    const ts = new Date().toISOString();
    const totalTokens =
      input.inputTokens + input.outputTokens + input.cacheReadTokens + input.cacheWriteTokens;
    const info = this.db
      .prepare(
        `INSERT INTO token_ledger
          (ts, task_id, department, agent_id, agent_name, model, backend,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           total_tokens, cost_cents, wallet, cursor_percent_used, quota_source,
           duration_ms, ok, error)
         VALUES (@ts, @taskId, @department, @agentId, @agentName, @model, @backend,
           @inputTokens, @outputTokens, @cacheReadTokens, @cacheWriteTokens,
           @totalTokens, @costCents, @wallet, @cursorPercentUsed, @quotaSource,
           @durationMs, @ok, @error)`,
      )
      .run({
        ts,
        taskId: input.taskId,
        department: input.department,
        agentId: input.agentId,
        agentName: input.agentName,
        model: input.model,
        backend: input.backend,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        totalTokens,
        costCents: input.costCents,
        wallet: input.wallet,
        cursorPercentUsed: input.cursorPercentUsed ?? null,
        quotaSource: input.quotaSource,
        durationMs: input.durationMs,
        ok: input.ok ? 1 : 0,
        error: input.error ?? null,
      });
    return { ...input, id: Number(info.lastInsertRowid), ts, totalTokens };
  }

  list(limit = 100, filters: { wallet?: WalletKind; agentId?: string } = {}): LedgerEntry[] {
    const where: string[] = [];
    const params: any = {};
    if (filters.wallet) {
      where.push("wallet = @wallet");
      params.wallet = filters.wallet;
    }
    if (filters.agentId) {
      where.push("agent_id = @agentId");
      params.agentId = filters.agentId;
    }
    const sql = `SELECT * FROM token_ledger ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY id DESC LIMIT ${Math.min(Math.max(limit, 1), 1000)}`;
    return (this.db.prepare(sql).all(params) as any[]).map(toEntry);
  }

  /** Tổng theo ví trong ngày hôm nay. */
  totalsToday(): { normal: number; learning: number; normalCents: number; learningCents: number } {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const rows = this.db
      .prepare(
        `SELECT wallet,
                SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens,
                SUM(cost_cents) AS cents
         FROM token_ledger WHERE ts >= ? GROUP BY wallet`,
      )
      .all(since.toISOString()) as any[];
    const out = { normal: 0, learning: 0, normalCents: 0, learningCents: 0 };
    for (const r of rows) {
      if (r.wallet === "learning") {
        out.learning = Number(r.tokens ?? 0);
        out.learningCents = Number(r.cents ?? 0);
      } else {
        out.normal = Number(r.tokens ?? 0);
        out.normalCents = Number(r.cents ?? 0);
      }
    }
    return out;
  }

  /** Tổng token + số lượt theo từng nhân viên hôm nay (khôi phục HUD sau restart). */
  totalsByAgent(): Array<{ agentId: string; agentName: string; tokens: number; calls: number }> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return (
      this.db
        .prepare(
          `SELECT agent_id AS agentId,
                  MAX(agent_name) AS agentName,
                  SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens,
                  COUNT(*) AS calls
           FROM token_ledger WHERE ts >= ? GROUP BY agent_id`,
        )
        .all(since.toISOString()) as any[]
    ).map((r) => ({
      agentId: String(r.agentId),
      agentName: String(r.agentName ?? r.agentId),
      tokens: Number(r.tokens ?? 0),
      calls: Number(r.calls ?? 0),
    }));
  }

  /** Tổng theo từng phòng ban (cho biểu đồ 3D). */
  totalsByDepartment(): Array<{ department: string; tokens: number; cents: number; calls: number }> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return (
      this.db
        .prepare(
          `SELECT department,
                  SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens,
                  SUM(cost_cents) AS cents,
                  COUNT(*) AS calls
           FROM token_ledger WHERE ts >= ? GROUP BY department ORDER BY tokens DESC`,
        )
        .all(since.toISOString()) as any[]
    ).map((r) => ({
      department: r.department,
      tokens: Number(r.tokens ?? 0),
      cents: Number(r.cents ?? 0),
      calls: Number(r.calls ?? 0),
    }));
  }

  close(): void {
    this.db.close();
  }
}

function toEntry(r: any): LedgerEntry {
  return {
    id: r.id,
    ts: r.ts,
    taskId: r.task_id,
    department: r.department,
    agentId: r.agent_id,
    agentName: r.agent_name,
    model: r.model,
    backend: r.backend,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    totalTokens: r.total_tokens,
    costCents: r.cost_cents,
    wallet: r.wallet,
    cursorPercentUsed: r.cursor_percent_used ?? undefined,
    quotaSource: r.quota_source,
    durationMs: r.duration_ms,
    ok: !!r.ok,
    error: r.error ?? undefined,
  };
}
