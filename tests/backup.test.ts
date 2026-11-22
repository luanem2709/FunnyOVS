/**
 * Sao lưu/khôi phục (K2, backup.roundtrip): vòng khứ hồi giữ nguyên dữ liệu và quan hệ; tệp hỏng không làm mất dữ liệu hiện có.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OfficeDb, ValidationError } from "../src/server/crm/store.js";
import { backupFileName, buildBackup, parseBackup, writePreRestoreCopy } from "../src/server/backup/backup.js";
import { countsOf } from "../src/shared/backup.js";

let dir: string;
let dbs: OfficeDb[] = [];
const open = (sub: string): OfficeDb => {
  const d = new OfficeDb(path.join(dir, sub));
  dbs.push(d);
  return d;
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-backup-"));
});
afterEach(() => {
  for (const d of dbs) d.close();
  dbs = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function seed(db: OfficeDb): void {
  const mai = db.upsertContact({ name: "Chị Mai", email: "mai@shop.vn", company: "Mai Shop", tags: ["vip", "pro"], notes: "Khách quen" }).contact;
  const nam = db.upsertContact({ name: "Anh Nam", phone: "0900" }).contact;
  const d1 = db.addDeal({ contactId: mai.id, title: "Gói Pro", value: 12_000_000, stage: "proposal" });
  const d2 = db.addDeal({ contactId: nam.id, title: "Gói Lite", value: 500_000 });
  db.moveDeal(d2.id, "won");
  db.logActivity({ contactId: mai.id, dealId: d1.id, kind: "deal", text: "Báo giá lần 1", agentId: "long" });
  db.logActivity({ contactId: null, dealId: null, kind: "note", text: "Ghi chú chung" });
  db.createDraft({ to: "mai@shop.vn", subject: "Chào chị", body: "Nội dung thư", agentId: "nam" });
  db.addEvent({ title: "Họp khách", start: "2026-12-01T09:00:00.000Z", attendees: ["mai@shop.vn"], notes: "Mang hợp đồng" });
}

describe("vòng khứ hồi", () => {
  it("xuất → JSON → nạp vào CSDL trống cho ra dữ liệu GIỐNG HỆT (id, quan hệ, nhãn, lịch, email nháp)", () => {
    const src = open("a");
    seed(src);
    const file = buildBackup(src, [{ id: "org_1" }], [{ id: "s1" }], new Date("2026-11-21T10:00:00Z"));
    const json = JSON.stringify(file);

    const parsed = parseBackup(json);
    expect(countsOf(parsed)).toEqual({ contacts: 2, deals: 2, activities: 2, drafts: 1, events: 1, org: 1, schedules: 1 });

    const dst = open("b");
    expect(dst.summary().contacts).toBe(0);
    const counts = dst.importAll(parsed.data);
    expect(counts).toEqual({ contacts: 2, deals: 2, activities: 2, drafts: 1, events: 1 });
    expect(dst.exportAll()).toEqual(src.exportAll());
    // quan hệ còn đúng: giao dịch trỏ đúng liên hệ, tìm kiếm và tổng kết chạy như cũ
    expect(dst.getDeal(1)!.contactName).toBe("Chị Mai");
    expect(dst.summary()).toEqual(src.summary());
    expect(dst.searchContacts("mai")).toHaveLength(1);
    // id tiếp theo không đụng id cũ
    expect(dst.addDeal({ title: "Mới", value: 1 }).id).toBeGreaterThan(2);
  });

  it("khôi phục là THAY THẾ: dữ liệu đang có bị thay bằng nội dung bản sao lưu", () => {
    const src = open("a");
    seed(src);
    const json = JSON.stringify(buildBackup(src, []));
    const dst = open("b");
    dst.upsertContact({ name: "Người cũ", email: "cu@x.vn" });
    dst.addEvent({ title: "Sự kiện cũ", start: "2026-01-01T00:00:00Z" });
    dst.importAll(parseBackup(json).data);
    expect(dst.listContacts().map((c) => c.name).sort()).toEqual(["Anh Nam", "Chị Mai"]);
    expect(dst.listEvents().map((e) => e.title)).toEqual(["Họp khách"]);
  });

  it("tham chiếu mồ côi (giao dịch trỏ liên hệ không có trong tệp) bị đặt về null thay vì làm hỏng khôi phục", () => {
    const src = open("a");
    seed(src);
    const file = buildBackup(src, []);
    file.data.contacts = file.data.contacts.filter((c) => c.name !== "Anh Nam");
    const dst = open("b");
    dst.importAll(parseBackup(file).data);
    expect(dst.listDeals().find((d) => d.title === "Gói Lite")!.contactId).toBeNull();
    expect(dst.listDeals().find((d) => d.title === "Gói Pro")!.contactId).toBe(1);
  });
});

describe("tệp hỏng không làm mất dữ liệu hiện có", () => {
  const valid = (): string => {
    const src = open("src");
    seed(src);
    return JSON.stringify(buildBackup(src, []));
  };

  it("không phải JSON / sai ứng dụng / sai phiên bản / thiếu phần dữ liệu / giai đoạn sai → ValidationError val.backup.invalid", () => {
    const base = JSON.parse(valid());
    const bad: unknown[] = [
      "không phải json {",
      "",
      { ...base, app: "KhacApp" },
      { ...base, version: 2 },
      { ...base, data: { ...base.data, contacts: "x" } },
      (() => {
        const c = structuredClone(base);
        c.data.deals[0].stage = "bay-mau";
        return c;
      })(),
      (() => {
        const c = structuredClone(base);
        c.data.contacts[0].name = "x".repeat(500);
        return c;
      })(),
      { ...base, org: "khong-phai-mang" },
    ];
    for (const b of bad) {
      let err: unknown;
      try {
        parseBackup(b);
      } catch (e) {
        err = e;
      }
      expect(err, JSON.stringify(b).slice(0, 60)).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).key).toBe("val.backup.invalid");
    }
  });

  it("nạp lỗi GIỮA CHỪNG (hai liên hệ trùng email) → rollback, dữ liệu cũ còn nguyên", () => {
    const dst = open("dst");
    dst.upsertContact({ name: "Giữ lại", email: "giu@x.vn" });
    const before = dst.exportAll();
    const file = parseBackup(valid());
    file.data.contacts.push({ ...file.data.contacts[0], id: 99, name: "Trùng email" }); // cùng email với liên hệ đầu
    let err: unknown;
    try {
      dst.importAll(file.data);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(dst.exportAll()).toEqual(before);
  });
});

describe("bản sao trước khi khôi phục và tên tệp", () => {
  it("giữ tối đa 5 bản pre-restore mới nhất; tệp chỉ chủ sở hữu đọc được; không chứa bí mật nào", () => {
    const src = open("a");
    seed(src);
    const file = buildBackup(src, []);
    let last = "";
    for (let i = 0; i < 8; i++) last = writePreRestoreCopy(dir, file, 5, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    const files = fs.readdirSync(path.join(dir, "backups"));
    expect(files).toHaveLength(5);
    expect(files.sort()[4]).toBe(path.basename(last)); // còn bản mới nhất
    if (process.platform !== "win32") expect(fs.statSync(last).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(file)).not.toMatch(/password|pass"|token|apiKey|secret/i);
  });

  it("tên tệp tải về theo ngày", () => {
    expect(backupFileName(new Date("2026-11-21T23:59:00Z"))).toBe("funnyovs-backup-2026-11-21.json");
  });
});
