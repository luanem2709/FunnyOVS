/**
 * Dữ liệu kinh doanh cục bộ (SQLite): CRM (liên hệ, giao dịch, hoạt động), nháp email, lịch.
 * Là dữ liệu THẬT của người dùng — nằm trong thư mục dữ liệu của app, không gửi đi đâu.
 */
import Database from "better-sqlite3";
import type { BackupData } from "../../shared/backup.js";
import { ValidationError } from "../../shared/validation.js";
import fs from "node:fs";
import path from "node:path";

import { DEAL_STAGES, OPEN_STAGES, type Activity, type CalendarEvent, type Contact, type CrmSummary, type Deal, type DealStage, type DraftStatus, type EmailDraft } from "../../shared/crm.js";

export { DEAL_STAGES };
export type { Activity, CalendarEvent, Contact, CrmSummary, Deal, DealStage, DraftStatus, EmailDraft };

/** Lỗi dữ liệu đầu vào (khoá i18n `val.*`): định nghĩa ở shared/validation.ts, xuất lại ở đây cho mã cũ. */
export { ValidationError };

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s);
}

function clip(s: unknown, n: number): string {
  return String(s ?? "").trim().slice(0, n);
}

function iso(s: unknown, field: string): string {
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) throw new ValidationError("val.dateInvalid", { field });
  return d.toISOString();
}

const now = (): string => new Date().toISOString();

export class OfficeDb {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "office.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS contacts_email ON contacts(lower(email)) WHERE email != '';
      CREATE TABLE IF NOT EXISTS deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, title TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'VND', stage TEXT NOT NULL DEFAULT 'lead', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, deal_id INTEGER, kind TEXT NOT NULL, text TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS email_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, cc TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL, body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', agent_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
        attendees TEXT NOT NULL DEFAULT '', agent_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  // ---- Sao lưu / khôi phục ----

  /** Toàn bộ dữ liệu kinh doanh (không giới hạn số dòng) để sao lưu. */
  exportAll(): BackupData {
    const rows = (sql: string): Array<Record<string, unknown>> => this.db.prepare(sql).all() as Array<Record<string, unknown>>;
    return {
      contacts: rows("SELECT * FROM contacts ORDER BY id").map((r) => this.toContact(r)),
      deals: rows("SELECT d.*, c.name AS contact_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id ORDER BY d.id").map((r) => {
        const { contactName: _drop, ...deal } = this.toDeal(r);
        void _drop;
        return deal;
      }),
      activities: rows("SELECT * FROM activities ORDER BY id").map((r) => ({
        id: Number(r.id),
        contactId: r.contact_id === null ? null : Number(r.contact_id),
        dealId: r.deal_id === null ? null : Number(r.deal_id),
        kind: String(r.kind),
        text: String(r.text),
        agentId: String(r.agent_id),
        at: String(r.at),
      })),
      drafts: rows("SELECT * FROM email_drafts ORDER BY id").map((r) => this.toDraft(r)),
      events: rows("SELECT * FROM events ORDER BY id").map((r) => this.toEvent(r)),
    };
  }

  /**
   * Thay TOÀN BỘ dữ liệu kinh doanh bằng `data` trong MỘT giao dịch: lỗi giữa chừng (trùng email, dữ liệu sai...) → không đổi gì.
   * Giữ nguyên id để các tham chiếu (giao dịch → liên hệ, hoạt động → giao dịch) còn đúng; tham chiếu mồ côi bị bỏ về null.
   */
  importAll(data: BackupData): { contacts: number; deals: number; activities: number; drafts: number; events: number } {
    const run = this.db.transaction((d: BackupData) => {
      this.db.exec("DELETE FROM activities; DELETE FROM deals; DELETE FROM email_drafts; DELETE FROM events; DELETE FROM contacts;");
      const contactIds = new Set(d.contacts.map((c) => c.id));
      const dealIds = new Set(d.deals.map((x) => x.id));
      const insContact = this.db.prepare("INSERT INTO contacts (id,name,email,phone,company,tags,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
      for (const c of d.contacts) insContact.run(c.id, c.name, c.email.toLowerCase(), c.phone, c.company, c.tags.join(","), c.notes, c.createdAt, c.updatedAt);
      const insDeal = this.db.prepare("INSERT INTO deals (id,contact_id,title,value,currency,stage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)");
      for (const x of d.deals) insDeal.run(x.id, x.contactId !== null && contactIds.has(x.contactId) ? x.contactId : null, x.title, x.value, x.currency, x.stage, x.createdAt, x.updatedAt);
      const insAct = this.db.prepare("INSERT INTO activities (id,contact_id,deal_id,kind,text,agent_id,at) VALUES (?,?,?,?,?,?,?)");
      for (const a of d.activities) {
        insAct.run(a.id, a.contactId !== null && contactIds.has(a.contactId) ? a.contactId : null, a.dealId !== null && dealIds.has(a.dealId) ? a.dealId : null, a.kind, a.text, a.agentId, a.at);
      }
      const insDraft = this.db.prepare("INSERT INTO email_drafts (id,to_addr,cc,subject,body,status,agent_id,error,created_at,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
      for (const m of d.drafts) insDraft.run(m.id, m.to, m.cc, m.subject, m.body, m.status, m.agentId, m.error, m.createdAt, m.sentAt);
      const insEvent = this.db.prepare("INSERT INTO events (id,title,start,end,notes,attendees,agent_id,created_at) VALUES (?,?,?,?,?,?,?,?)");
      for (const e of d.events) insEvent.run(e.id, e.title, e.start, e.end, e.notes, e.attendees.join(","), e.agentId, e.createdAt);
    });
    try {
      run(data);
    } catch (e) {
      throw new ValidationError("val.backup.invalid", { detail: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
    }
    return { contacts: data.contacts.length, deals: data.deals.length, activities: data.activities.length, drafts: data.drafts.length, events: data.events.length };
  }

  // ---- Liên hệ ----

  private toContact(r: Record<string, unknown>): Contact {
    return {
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      phone: String(r.phone),
      company: String(r.company),
      tags: String(r.tags).split(",").map((t) => t.trim()).filter(Boolean),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /** Tạo hoặc cập nhật liên hệ: khớp theo email (nếu có), nếu không thì theo tên + công ty. */
  upsertContact(input: { name: string; email?: string; phone?: string; company?: string; tags?: string[] | string; notes?: string }): { contact: Contact; created: boolean } {
    const name = clip(input.name, 120);
    if (!name) throw new ValidationError("val.contact.nameRequired");
    const email = clip(input.email, 254).toLowerCase();
    if (email && !isEmail(email)) throw new ValidationError("val.email.invalid");
    const phone = clip(input.phone, 40);
    const company = clip(input.company, 120);
    const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags ?? "").split(","))
      .map((t) => clip(t, 30))
      .filter(Boolean)
      .slice(0, 12)
      .join(",");
    const notes = clip(input.notes, 2000);

    let row = email
      ? (this.db.prepare("SELECT * FROM contacts WHERE lower(email) = ?").get(email) as Record<string, unknown> | undefined)
      : (this.db.prepare("SELECT * FROM contacts WHERE lower(name) = ? AND lower(company) = ?").get(name.toLowerCase(), company.toLowerCase()) as
          | Record<string, unknown>
          | undefined);
    const t = now();
    if (row) {
      const merged = {
        name,
        email: email || String(row.email),
        phone: phone || String(row.phone),
        company: company || String(row.company),
        tags: tags || String(row.tags),
        notes: notes ? [String(row.notes), notes].filter(Boolean).join("\n").slice(-2000) : String(row.notes),
      };
      this.db
        .prepare("UPDATE contacts SET name=?, email=?, phone=?, company=?, tags=?, notes=?, updated_at=? WHERE id=?")
        .run(merged.name, merged.email, merged.phone, merged.company, merged.tags, merged.notes, t, row.id);
      row = this.db.prepare("SELECT * FROM contacts WHERE id = ?").get(row.id) as Record<string, unknown>;
      return { contact: this.toContact(row), created: false };
    }
    const info = this.db
      .prepare("INSERT INTO contacts (name,email,phone,company,tags,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(name, email, phone, company, tags, notes, t, t);
    row = this.db.prepare("SELECT * FROM contacts WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>;
    return { contact: this.toContact(row), created: true };
  }

  getContact(idOrName: number | string): Contact | null {
    const row =
      typeof idOrName === "number" || /^\d+$/.test(String(idOrName))
        ? this.db.prepare("SELECT * FROM contacts WHERE id = ?").get(Number(idOrName))
        : this.db.prepare("SELECT * FROM contacts WHERE lower(name) = ? OR lower(email) = ? ORDER BY id LIMIT 1").get(String(idOrName).toLowerCase(), String(idOrName).toLowerCase());
    return row ? this.toContact(row as Record<string, unknown>) : null;
  }

  searchContacts(query: string, limit = 20): Contact[] {
    const cleaned = clip(query, 80).toLowerCase().replace(/[%_]/g, "");
    if (!cleaned) return [];
    const q = `%${cleaned}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM contacts WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR lower(company) LIKE ? OR lower(tags) LIKE ? OR lower(notes) LIKE ?
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(q, q, q, q, q, Math.min(Math.max(limit, 1), 100)) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toContact(r));
  }

  listContacts(limit = 100): Contact[] {
    return (this.db.prepare("SELECT * FROM contacts ORDER BY updated_at DESC LIMIT ?").all(Math.min(limit, 500)) as Array<Record<string, unknown>>).map((r) => this.toContact(r));
  }

  // ---- Giao dịch ----

  private toDeal(r: Record<string, unknown>): Deal {
    return {
      id: Number(r.id),
      contactId: r.contact_id === null ? null : Number(r.contact_id),
      contactName: r.contact_name ? String(r.contact_name) : undefined,
      title: String(r.title),
      value: Number(r.value),
      currency: String(r.currency),
      stage: String(r.stage) as DealStage,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  addDeal(input: { contactId?: number | null; title: string; value?: number; currency?: string; stage?: string }): Deal {
    const title = clip(input.title, 160);
    if (!title) throw new ValidationError("val.deal.titleRequired");
    const stage = (input.stage ?? "lead") as DealStage;
    if (!DEAL_STAGES.includes(stage)) throw new ValidationError("val.deal.stageInvalid", { stages: DEAL_STAGES.join(", ") });
    const value = Number(input.value ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new ValidationError("val.deal.valueInvalid");
    if (input.contactId != null && !this.getContact(input.contactId)) throw new ValidationError("val.contact.notFound");
    const t = now();
    const info = this.db
      .prepare("INSERT INTO deals (contact_id,title,value,currency,stage,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(input.contactId ?? null, title, value, clip(input.currency, 6) || "VND", stage, t, t);
    return this.getDeal(Number(info.lastInsertRowid))!;
  }

  getDeal(id: number): Deal | null {
    const r = this.db
      .prepare("SELECT d.*, c.name AS contact_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id WHERE d.id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return r ? this.toDeal(r) : null;
  }

  moveDeal(id: number, stage: string): Deal {
    if (!DEAL_STAGES.includes(stage as DealStage)) throw new ValidationError("val.deal.stageInvalid", { stages: DEAL_STAGES.join(", ") });
    const info = this.db.prepare("UPDATE deals SET stage = ?, updated_at = ? WHERE id = ?").run(stage, now(), id);
    if (info.changes === 0) throw new ValidationError("val.deal.notFound");
    return this.getDeal(id)!;
  }

  listDeals(opts: { stage?: string; limit?: number } = {}): Deal[] {
    const rows = (
      opts.stage
        ? this.db
            .prepare("SELECT d.*, c.name AS contact_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id WHERE d.stage = ? ORDER BY d.updated_at DESC LIMIT ?")
            .all(opts.stage, opts.limit ?? 100)
        : this.db
            .prepare("SELECT d.*, c.name AS contact_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id ORDER BY d.updated_at DESC LIMIT ?")
            .all(opts.limit ?? 100)
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toDeal(r));
  }

  // ---- Hoạt động ----

  logActivity(input: { contactId?: number | null; dealId?: number | null; kind: string; text: string; agentId?: string }): Activity {
    const kind = clip(input.kind, 20) || "note";
    const text = clip(input.text, 2000);
    if (!text) throw new ValidationError("val.activity.textRequired");
    const at = now();
    const info = this.db
      .prepare("INSERT INTO activities (contact_id,deal_id,kind,text,agent_id,at) VALUES (?,?,?,?,?,?)")
      .run(input.contactId ?? null, input.dealId ?? null, kind, text, clip(input.agentId, 40), at);
    return { id: Number(info.lastInsertRowid), contactId: input.contactId ?? null, dealId: input.dealId ?? null, kind, text, agentId: clip(input.agentId, 40), at };
  }

  activitiesFor(contactId: number, limit = 10): Activity[] {
    return (this.db.prepare("SELECT * FROM activities WHERE contact_id = ? ORDER BY id DESC LIMIT ?").all(contactId, limit) as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      contactId: r.contact_id === null ? null : Number(r.contact_id),
      dealId: r.deal_id === null ? null : Number(r.deal_id),
      kind: String(r.kind),
      text: String(r.text),
      agentId: String(r.agent_id),
      at: String(r.at),
    }));
  }

  summary(): CrmSummary {
    const contacts = Number((this.db.prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number }).n);
    const deals = Object.fromEntries(DEAL_STAGES.map((s) => [s, { count: 0, value: 0 }])) as Record<DealStage, { count: number; value: number }>;
    for (const r of this.db.prepare("SELECT stage, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM deals GROUP BY stage").all() as Array<{ stage: DealStage; n: number; v: number }>) {
      if (deals[r.stage]) deals[r.stage] = { count: r.n, value: r.v };
    }
    const open = OPEN_STAGES.reduce((sum, k) => sum + deals[k].value, 0);
    return { contacts, deals, openValue: open, wonValue: deals.won.value };
  }

  // ---- Nháp email ----

  private toDraft(r: Record<string, unknown>): EmailDraft {
    return {
      id: Number(r.id),
      to: String(r.to_addr),
      cc: String(r.cc),
      subject: String(r.subject),
      body: String(r.body),
      status: String(r.status) as DraftStatus,
      agentId: String(r.agent_id),
      error: String(r.error),
      createdAt: String(r.created_at),
      sentAt: String(r.sent_at),
    };
  }

  createDraft(input: { to: string; cc?: string; subject: string; body: string; agentId?: string }): EmailDraft {
    const to = this.cleanAddressList(input.to, true);
    const cc = this.cleanAddressList(input.cc ?? "", false);
    const subject = clip(input.subject, 200).replace(/[\r\n]+/g, " "); // chặn chèn header
    const body = String(input.body ?? "").slice(0, 20_000);
    if (!subject) throw new ValidationError("val.draft.subjectRequired");
    if (!body.trim()) throw new ValidationError("val.draft.bodyRequired");
    const info = this.db
      .prepare("INSERT INTO email_drafts (to_addr,cc,subject,body,agent_id,created_at) VALUES (?,?,?,?,?,?)")
      .run(to, cc, subject, body, clip(input.agentId, 40), now());
    return this.getDraft(Number(info.lastInsertRowid))!;
  }

  /** Danh sách địa chỉ ngăn cách bằng dấu phẩy; mỗi địa chỉ phải hợp lệ (chặn header injection). */
  private cleanAddressList(raw: string, required: boolean): string {
    const list = String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (required && list.length === 0) throw new ValidationError("val.draft.toRequired");
    if (list.length > 10) throw new ValidationError("val.draft.tooMany");
    for (const a of list) if (!isEmail(a)) throw new ValidationError("val.email.invalidAddr", { addr: a.slice(0, 60) });
    return list.join(", ");
  }

  getDraft(id: number): EmailDraft | null {
    const r = this.db.prepare("SELECT * FROM email_drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.toDraft(r) : null;
  }

  setDraftStatus(id: number, status: DraftStatus, error = ""): void {
    this.db.prepare("UPDATE email_drafts SET status = ?, error = ?, sent_at = ? WHERE id = ?").run(status, error.slice(0, 500), status === "sent" ? now() : "", id);
  }

  listDrafts(limit = 30): EmailDraft[] {
    return (this.db.prepare("SELECT * FROM email_drafts ORDER BY id DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map((r) => this.toDraft(r));
  }

  // ---- Lịch ----

  private toEvent(r: Record<string, unknown>): CalendarEvent {
    return {
      id: Number(r.id),
      title: String(r.title),
      start: String(r.start),
      end: String(r.end),
      notes: String(r.notes),
      attendees: String(r.attendees).split(",").map((s) => s.trim()).filter(Boolean),
      agentId: String(r.agent_id),
      createdAt: String(r.created_at),
    };
  }

  addEvent(input: { title: string; start: string; end?: string; notes?: string; attendees?: string[]; agentId?: string }): CalendarEvent {
    const title = clip(input.title, 160);
    if (!title) throw new ValidationError("val.event.titleRequired");
    const start = iso(input.start, "start");
    const end = input.end ? iso(input.end, "end") : new Date(new Date(start).getTime() + 3600_000).toISOString();
    if (new Date(end) < new Date(start)) throw new ValidationError("val.event.endBeforeStart");
    const attendees = (input.attendees ?? []).map((a) => clip(a, 254)).filter(Boolean).slice(0, 20);
    for (const a of attendees) if (a.includes("@") && !isEmail(a)) throw new ValidationError("val.attendee.invalid", { addr: a.slice(0, 60) });
    const info = this.db
      .prepare("INSERT INTO events (title,start,end,notes,attendees,agent_id,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(title, start, end, clip(input.notes, 1000), attendees.join(","), clip(input.agentId, 40), now());
    return this.toEvent(this.db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>);
  }

  listEvents(opts: { from?: string; to?: string; limit?: number } = {}): CalendarEvent[] {
    const from = opts.from ? iso(opts.from, "from") : "0000";
    const to = opts.to ? iso(opts.to, "to") : "9999";
    return (this.db.prepare("SELECT * FROM events WHERE start >= ? AND start <= ? ORDER BY start LIMIT ?").all(from, to, opts.limit ?? 100) as Array<Record<string, unknown>>).map((r) => this.toEvent(r));
  }
}

// ---- ICS ----

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(isoStr: string): string {
  return isoStr.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Gấp dòng theo RFC 5545 (≤ 75 octet). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function toIcs(events: CalendarEvent[], prodId = "-//FunnyOVS//Office//EN"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${prodId}`, "CALSCALE:GREGORIAN"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:funnyovs-${e.id}@local`,
      `DTSTAMP:${icsDate(e.createdAt)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
    );
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
    for (const a of e.attendees) lines.push(a.includes("@") ? `ATTENDEE:mailto:${a}` : `COMMENT:${icsEscape(a)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
