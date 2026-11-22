/**
 * Kho bí mật cục bộ (khoá API, mật khẩu SMTP/IMAP, token GitHub).
 *
 * - Lưu ở `<dữ liệu>/secrets.json`, tạo với quyền 0600 (chỉ chủ file đọc/ghi; trên Windows quyền do ACL của thư mục người dùng).
 * - Ghi nguyên tử (file tạm + đổi tên). Không bao giờ trả giá trị gốc ra API: chỉ trả bản che qua `mask`.
 * - Giá trị bí mật được cung cấp cho `redact()` để che khỏi nhật ký/sự kiện.
 */
import fs from "node:fs";
import path from "node:path";
import { maskKey } from "../security/redact.js";

interface Shape {
  version: 1;
  values: Record<string, string>;
}

export class SecretStore {
  private data: Shape = { version: 1, values: {} };

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Shape>;
      if (raw && typeof raw.values === "object" && raw.values) {
        for (const [k, v] of Object.entries(raw.values)) if (typeof v === "string") this.data.values[k] = v;
      }
    } catch {
      /* chưa có file hoặc file hỏng: bắt đầu trống */
    }
  }

  get(name: string): string | undefined {
    return this.data.values[name] || undefined;
  }

  has(name: string): boolean {
    return Boolean(this.data.values[name]);
  }

  names(): string[] {
    return Object.keys(this.data.values);
  }

  set(name: string, value: string): void {
    const v = value.trim();
    if (!v) {
      this.delete(name);
      return;
    }
    this.data.values[name] = v;
    this.save();
  }

  delete(name: string): void {
    if (name in this.data.values) {
      delete this.data.values[name];
      this.save();
    }
  }

  mask(name: string): string {
    return maskKey(this.data.values[name] ?? "");
  }

  /** Mọi giá trị bí mật — chỉ dùng để truyền cho `redact()`. */
  allValues(): string[] {
    return Object.values(this.data.values);
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* Windows: bỏ qua */
    }
  }
}
