/**
 * Sổ cái kinh tế: chỉ-ghi-thêm VÀ băm nối (mỗi dòng chứa băm SHA-256 của dòng trước) nên sửa/xoá/chèn một dòng cũ sẽ bị `verify()` phát hiện.
 *
 * Khác nhật ký bảo mật (`audit.log`, xoay vòng ở 1 MB): sổ cái KHÔNG xoay vòng và KHÔNG xoá — dòng tiền cần lưu giữ đầy đủ.
 * Không chứa bí mật: chuỗi bị cắt ngắn và đi qua `redact()`; chỉ nhận số/chuỗi ngắn.
 * Giới hạn (nói thẳng): băm nối chống sửa NHẦM/vô ý và sửa tệp thủ công, không chống kẻ có toàn quyền ghi đĩa viết lại cả chuỗi
 * (muốn vậy phải neo băm cuối ra ngoài máy; xem docs/economy-layer.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redact } from "../security/redact.js";
import { ECONOMY_EVENT_KINDS, RAIL_IDS, type EconomyEventKind, type RailId } from "../../shared/economy.js";

export interface LedgerRecord {
  seq: number;
  at: string;
  kind: EconomyEventKind;
  /** micro-USD. */
  amount?: number;
  topic?: string;
  rail?: RailId;
  ref?: string;
  note?: string;
  /** Số liệu phụ (vd. doanh thu/chi phí của chu kỳ). */
  data?: Record<string, number>;
  prev: string;
  hash: string;
}

export type LedgerInput = Omit<LedgerRecord, "seq" | "at" | "prev" | "hash">;

export const GENESIS = "0".repeat(64);
const MAX_STR = 160;

function clean(v: unknown, secrets: string[]): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  return redact(v.replace(/[\r\n]+/g, " "), secrets).slice(0, MAX_STR);
}

function cleanData(d: unknown): Record<string, number> | undefined {
  if (typeof d !== "object" || d === null) return undefined;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (n >= 8) break;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const key = k.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
    if (!key) continue;
    out[key] = Math.round(v);
    n++;
  }
  return n ? out : undefined;
}

export function hashOf(r: Omit<LedgerRecord, "hash">): string {
  const canon = JSON.stringify([r.seq, r.at, r.kind, r.amount ?? null, r.topic ?? "", r.rail ?? "", r.ref ?? "", r.note ?? "", r.data ? Object.entries(r.data).sort(([a], [b]) => (a < b ? -1 : 1)) : [], r.prev]);
  return crypto.createHash("sha256").update(canon).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  /** seq của dòng đầu tiên sai (băm không khớp / nối sai / số thứ tự lệch). */
  brokenAt?: number;
}

export function verifyRecords(rows: LedgerRecord[]): VerifyResult {
  let prev = GENESIS;
  let seq = 0;
  for (const r of rows) {
    seq++;
    if (r.seq !== seq || r.prev !== prev || r.hash !== hashOf(r)) return { ok: false, count: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

export class EconomyLedger {
  private rows: LedgerRecord[] = [];
  private bad = 0;

  constructor(
    private readonly file: string,
    private readonly secrets: () => string[] = () => [],
    private readonly now: () => number = Date.now,
  ) {
    this.load();
  }

  private load(): void {
    let text = "";
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch {
      return;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as LedgerRecord;
        if (typeof r.seq === "number" && typeof r.hash === "string" && ECONOMY_EVENT_KINDS.includes(r.kind)) this.rows.push(r);
        else this.bad++;
      } catch {
        this.bad++;
      }
    }
  }

  append(input: LedgerInput): LedgerRecord {
    const secrets = this.secrets();
    const last = this.rows[this.rows.length - 1];
    const base: Omit<LedgerRecord, "hash"> = {
      seq: (last?.seq ?? 0) + 1,
      at: new Date(this.now()).toISOString(),
      kind: input.kind,
      ...(typeof input.amount === "number" && Number.isFinite(input.amount) ? { amount: Math.round(input.amount) } : {}),
      ...(clean(input.topic, secrets) ? { topic: clean(input.topic, secrets) } : {}),
      ...(input.rail && RAIL_IDS.includes(input.rail) ? { rail: input.rail } : {}),
      ...(clean(input.ref, secrets) ? { ref: clean(input.ref, secrets) } : {}),
      ...(clean(input.note, secrets) ? { note: clean(input.note, secrets) } : {}),
      ...(cleanData(input.data) ? { data: cleanData(input.data) } : {}),
      prev: last?.hash ?? GENESIS,
    };
    const rec: LedgerRecord = { ...base, hash: hashOf(base) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(rec)}\n`, { encoding: "utf8", mode: 0o600 });
    this.rows.push(rec);
    return rec;
  }

  all(): readonly LedgerRecord[] {
    return this.rows;
  }

  tail(limit = 50): LedgerRecord[] {
    return this.rows.slice(-limit).reverse();
  }

  verify(): VerifyResult {
    const v = verifyRecords(this.rows);
    if (v.ok && this.bad > 0) return { ok: false, count: this.rows.length, brokenAt: this.rows.length + 1 };
    return v;
  }

  /** Tổng `amount` của một loại trong khoảng [fromMs, toMs). */
  sum(kind: EconomyEventKind, fromMs = 0, toMs = Infinity): number {
    let s = 0;
    for (const r of this.rows) {
      const t = Date.parse(r.at);
      if (r.kind === kind && t >= fromMs && t < toMs) s += r.amount ?? 0;
    }
    return s;
  }

  /** Đã ghi giao dịch thành công với mã tham chiếu này chưa (chống phát lại, kể cả sau khi khởi động lại). */
  hasSettledRef(ref: string): boolean {
    return this.rows.some((r) => r.kind === "settled" && r.ref === ref.slice(0, MAX_STR));
  }
}
