/**
 * Sản phẩm số để bán: báo cáo ngắn dạng Markdown do agent/người dùng viết vào `<workspace>/public/insights/<chủ-đề>.md`.
 *
 * Chống rò rỉ và chống "đánh tráo":
 *  - Chỉ thư mục `public/insights` (không bao giờ đọc CRM, email, KB riêng, tệp ngoài workspace); chủ đề phải khớp `TOPIC_RE`.
 *  - Khi XUẤT BẢN (có người duyệt) lưu băm nội dung; lúc bán so lại — tệp bị sửa sau khi duyệt thì KHÔNG bán cho tới khi duyệt lại.
 *  - Quét riêng tư trước khi xin duyệt: email, số điện thoại, địa chỉ IP, bí mật/khoá, và tên/email của mọi liên hệ trong CRM.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redact } from "../security/redact.js";
import { TOPIC_RE } from "../../shared/economy.js";

export const MAX_CONTENT_BYTES = 20_000;

export interface ProductRecord {
  topic: string;
  title: string;
  priceMicro: number;
  contentHash: string;
  publishedAt: string;
}

export const insightsDir = (workspace: string): string => path.join(workspace, "public", "insights");

export const hashContent = (text: string): string => crypto.createHash("sha256").update(text).digest("hex");

export interface TopicFile {
  title: string;
  body: string;
  hash: string;
}

/** Đọc một chủ đề. Trả null nếu tên sai, không có tệp, không phải tệp thường, vượt kích thước hoặc thoát khỏi thư mục (symlink). */
export function readTopic(workspace: string, topic: string): TopicFile | null {
  if (!TOPIC_RE.test(topic)) return null;
  const dir = insightsDir(workspace);
  const file = path.join(dir, `${topic}.md`);
  try {
    const real = fs.realpathSync(file);
    const realDir = fs.realpathSync(dir);
    if (path.dirname(real) !== realDir) return null;
    const st = fs.statSync(real);
    if (!st.isFile() || st.size > MAX_CONTENT_BYTES || st.size === 0) return null;
    const body = fs.readFileSync(real, "utf8");
    const h1 = /^#\s+(.{1,120})$/m.exec(body)?.[1]?.trim();
    return { title: h1 ?? topic, body, hash: hashContent(body) };
  } catch {
    return null;
  }
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

/** Mã lý do không được bán — "email" | "phone" | "ip" | "secret" | "crm" (null = sạch; dịch qua `val.economy.why.<mã>`). `terms`: tên/email liên hệ trong CRM. Đây là lớp chặn tối thiểu, KHÔNG thay cho việc người duyệt đọc nội dung. */
export function privacyProblem(text: string, terms: readonly string[] = [], secrets: readonly string[] = []): string | null {
  if (EMAIL.test(text)) return "email";
  if (PHONE.test(text)) return "phone";
  if (IPV4.test(text)) return "ip";
  if (redact(text, secrets) !== text) return "secret";
  const lower = text.toLowerCase();
  for (const t of terms) {
    const needle = t.trim().toLowerCase();
    if (needle.length >= 3 && lower.includes(needle)) return "crm";
  }
  return null;
}

export class ProductStore {
  private items: ProductRecord[] = [];

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        this.items = raw.filter((p): p is ProductRecord => typeof p?.topic === "string" && TOPIC_RE.test(p.topic) && Number.isInteger(p.priceMicro) && typeof p.contentHash === "string");
      }
    } catch {
      /* chưa có */
    }
  }

  list(): ProductRecord[] {
    return [...this.items];
  }

  get(topic: string): ProductRecord | undefined {
    return this.items.find((p) => p.topic === topic);
  }

  set(p: ProductRecord): void {
    this.items = [...this.items.filter((x) => x.topic !== p.topic), p];
    this.save();
  }

  remove(topic: string): boolean {
    const n = this.items.length;
    this.items = this.items.filter((p) => p.topic !== topic);
    if (this.items.length === n) return false;
    this.save();
    return true;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 1), { encoding: "utf8", mode: 0o600 });
  }
}
