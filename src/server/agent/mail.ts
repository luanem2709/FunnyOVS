/**
 * Email thật qua SMTP (gửi) và IMAP (đọc hộp thư). Mật khẩu nằm trong kho bí mật, không bao giờ trả ra API.
 * `smtpFactory`/`imapFactory` thay được trong test; mặc định dùng nodemailer / imapflow.
 */
import fs from "node:fs";
import path from "node:path";
import type { SecretStore } from "../ai/secrets.js";
import { redact } from "../security/redact.js";
import type { EmailDraft } from "../crm/store.js";
import type { ImapConfig, MailPublicConfig, SmtpConfig } from "../../shared/mail.js";

export type { ImapConfig, MailPublicConfig, SmtpConfig };

export interface MailConfig {
  smtp?: SmtpConfig;
  imap?: ImapConfig;
}

export interface InboxItem {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

export interface SmtpTransport {
  sendMail(m: { from: string; to: string; cc?: string; subject: string; text: string }): Promise<{ messageId?: string }>;
}

export type SmtpFactory = (cfg: SmtpConfig & { pass: string }) => SmtpTransport;
export type ImapFetcher = (cfg: ImapConfig & { pass: string }, limit: number) => Promise<InboxItem[]>;

const defaultSmtpFactory: SmtpFactory = (cfg) => {
  // Nạp lười: không tốn thời gian khởi động nếu người dùng không dùng email.
  let transport: SmtpTransport | null = null;
  return {
    async sendMail(m) {
      if (!transport) {
        const nodemailer = await import("nodemailer");
        transport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: { user: cfg.user, pass: cfg.pass },
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
        }) as unknown as SmtpTransport;
      }
      return transport.sendMail(m);
    },
  };
};

const defaultImapFetcher: ImapFetcher = async (cfg, limit) => {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const total = client.mailbox && typeof client.mailbox === "object" ? (client.mailbox as { exists: number }).exists : 0;
      if (!total) return [];
      const start = Math.max(1, total - limit + 1);
      const items: InboxItem[] = [];
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true })) {
        items.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0] ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim() : "",
          subject: msg.envelope?.subject ?? "",
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : "",
          seen: Boolean(msg.flags?.has("\\Seen")),
        });
      }
      return items.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
};

function cleanHost(h: unknown): string {
  const s = String(h ?? "").trim();
  return /^[A-Za-z0-9.-]{1,253}$/.test(s) ? s : "";
}

function cleanPort(p: unknown, dflt: number): number {
  const n = Number(p);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : dflt;
}

export class MailService {
  private cfg: MailConfig = {};
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly secrets: SecretStore,
    private readonly smtpFactory: SmtpFactory = defaultSmtpFactory,
    private readonly imapFetcher: ImapFetcher = defaultImapFetcher,
  ) {
    this.file = path.join(dataDir, "mail.json");
    try {
      this.cfg = this.sanitize(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch {
      /* chưa cấu hình */
    }
  }

  private sanitize(raw: unknown): MailConfig {
    const r = (raw ?? {}) as { smtp?: Record<string, unknown>; imap?: Record<string, unknown> };
    const out: MailConfig = {};
    if (r.smtp) {
      const host = cleanHost(r.smtp.host);
      const user = String(r.smtp.user ?? "").trim().slice(0, 254);
      if (host && user) {
        const secure = r.smtp.secure === true;
        out.smtp = { host, port: cleanPort(r.smtp.port, secure ? 465 : 587), secure, user, from: String(r.smtp.from ?? user).trim().slice(0, 254) || user };
      }
    }
    if (r.imap) {
      const host = cleanHost(r.imap.host);
      const user = String(r.imap.user ?? "").trim().slice(0, 254);
      if (host && user) {
        const secure = r.imap.secure !== false;
        out.imap = { host, port: cleanPort(r.imap.port, secure ? 993 : 143), secure, user };
      }
    }
    return out;
  }

  /** Cấu hình hiển thị cho giao diện: KHÔNG có mật khẩu, chỉ cờ đã đặt hay chưa. */
  publicConfig(): MailPublicConfig {
    return { ...this.cfg, smtpPassSet: this.secrets.has("smtp.pass"), imapPassSet: this.secrets.has("imap.pass") };
  }

  setConfig(raw: unknown, passwords: { smtpPass?: string; imapPass?: string } = {}): void {
    this.cfg = this.sanitize(raw);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.cfg), "utf8");
    if (passwords.smtpPass !== undefined) this.secrets.set("smtp.pass", passwords.smtpPass);
    if (passwords.imapPass !== undefined) this.secrets.set("imap.pass", passwords.imapPass);
  }

  smtpConfigured(): boolean {
    return Boolean(this.cfg.smtp && this.secrets.has("smtp.pass"));
  }

  imapConfigured(): boolean {
    return Boolean(this.cfg.imap && this.secrets.has("imap.pass"));
  }

  async send(draft: Pick<EmailDraft, "to" | "cc" | "subject" | "body">): Promise<{ messageId: string }> {
    if (!this.cfg.smtp || !this.secrets.has("smtp.pass")) throw new Error("SMTP chưa được cấu hình.");
    const t = this.smtpFactory({ ...this.cfg.smtp, pass: this.secrets.get("smtp.pass")! });
    try {
      const info = await t.sendMail({ from: this.cfg.smtp.from, to: draft.to, cc: draft.cc || undefined, subject: draft.subject, text: draft.body });
      return { messageId: info.messageId ?? "" };
    } catch (e) {
      throw new Error(redact(e instanceof Error ? e.message : String(e), this.secrets.allValues()));
    }
  }

  async inbox(limit = 10): Promise<InboxItem[]> {
    if (!this.cfg.imap || !this.secrets.has("imap.pass")) throw new Error("IMAP chưa được cấu hình.");
    try {
      return await this.imapFetcher({ ...this.cfg.imap, pass: this.secrets.get("imap.pass")! }, Math.min(Math.max(limit, 1), 30));
    } catch (e) {
      throw new Error(redact(e instanceof Error ? e.message : String(e), this.secrets.allValues()));
    }
  }
}
