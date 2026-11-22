/**
 * Nhật ký bảo mật (K1, audit.log): chỉ-ghi-thêm, không chứa bí mật, xoay vòng khi quá lớn, chịu được dòng hỏng.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUDIT_KINDS, AuditLog, sanitizeDetail } from "../src/server/security/audit.js";

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-audit-"));
  file = path.join(dir, "sub", "audit.log");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("AuditLog", () => {
  it("ghi mỗi sự kiện một dòng JSON có giờ, loại, người thực hiện; đọc lại mới nhất trước", () => {
    let t = Date.parse("2026-01-01T00:00:00Z");
    const log = new AuditLog(file, () => [], () => (t += 1000));
    log.append("ai.key.set", "user", { provider: "groq" });
    log.append("network.lan", "user", { lan: true });
    log.append("action.expired", "system", { action: "email_send", agent: "nam" });
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual({ at: "2026-01-01T00:00:01.000Z", kind: "ai.key.set", actor: "user", detail: { provider: "groq" } });
    const tail = log.tail(10);
    expect(tail.map((e) => e.kind)).toEqual(["action.expired", "network.lan", "ai.key.set"]);
    expect(log.tail(2)).toHaveLength(2);
  });

  it("chi tiết chỉ nhận số/chuỗi ngắn/boolean; kiểu khác bị bỏ; xuống dòng bị làm phẳng; quá nhiều khoá bị cắt", () => {
    const d = sanitizeDetail({ a: "x\r\ny", n: 5, b: true, obj: { k: 1 }, arr: [1], fn: () => 1, nan: NaN, long: "z".repeat(1000), "bad key!": "v" }, []);
    expect(d.a).toBe("x y");
    expect(d.n).toBe(5);
    expect(d.b).toBe(true);
    expect("obj" in d || "arr" in d || "fn" in d || "nan" in d).toBe(false);
    expect((d.long as string).length).toBe(160);
    expect(d.badkey).toBe("v");
    const many = sanitizeDetail(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])), []);
    expect(Object.keys(many).length).toBeLessThanOrEqual(12);
    expect(sanitizeDetail("không phải đối tượng", [])).toEqual({});
  });

  it("KHÔNG bao giờ ghi bí mật: giá trị đang lưu và mẫu khoá phổ biến đều bị che", () => {
    const log = new AuditLog(file, () => ["mat-khau-rat-rieng-123"]);
    log.append("mail.config", "user", { note: "mật khẩu là mat-khau-rat-rieng-123", header: "Bearer abcdefghijklmnop12345", key: "gsk_abcdefghijklmnop123456" });
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toMatch(/mat-khau-rat-rieng-123|abcdefghijklmnop|gsk_/);
  });

  it("xoay vòng khi quá 1 MB (giữ bản .1) và vẫn đọc được cả hai", () => {
    const log = new AuditLog(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ at: "2026-01-01T00:00:00.000Z", kind: "emergency.on", actor: "user", detail: {} })}\n${"x".repeat(1_000_100)}\n`);
    log.append("emergency.off", "user");
    expect(fs.existsSync(`${file}.1`)).toBe(true);
    expect(fs.statSync(file).size).toBeLessThan(1000);
    const kinds = log.tail(10).map((e) => e.kind);
    expect(kinds[0]).toBe("emergency.off");
    expect(kinds).toContain("emergency.on");
  });

  it("dòng hỏng hoặc loại lạ bị bỏ qua; không có tệp thì trả mảng rỗng; ghi lỗi không ném", () => {
    const log = new AuditLog(file);
    expect(log.tail()).toEqual([]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `không phải json\n{"at":"x","kind":"loai.la","actor":"user","detail":{}}\n${JSON.stringify({ at: "2026-01-01T00:00:00.000Z", kind: "ai.key.clear", actor: "user", detail: {} })}\n`);
    expect(log.tail().map((e) => e.kind)).toEqual(["ai.key.clear"]);
    // thư mục không ghi được: không ném lỗi ra ngoài thao tác chính
    const bad = new AuditLog(path.join(file, "khong-the-tao", "a.log"));
    expect(() => bad.append("ai.key.set", "user", { provider: "x" })).not.toThrow();
  });

  it("danh sách loại sự kiện có đủ các thao tác nhạy cảm đã nêu trong tiêu chí K1", () => {
    for (const k of ["ai.key.set", "ai.key.clear", "mail.config", "github.token", "network.lan", "auth.rotate", "action.approved", "action.denied", "email.sent", "emergency.on"]) {
      expect((AUDIT_KINDS as readonly string[]).includes(k), k).toBe(true);
    }
  });
});
