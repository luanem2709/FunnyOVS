/**
 * Việc lặp lại (K3, schedule.tick): tính lần chạy kế tiếp, chạy đúng giờ đúng một lần, chạy bù một lần khi tắt máy,
 * bỏ qua khi dừng khẩn cấp, lưu bền, nạp lịch hỏng không làm sập, sao lưu/khôi phục.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDue, nextRun, viewOf, type Schedule } from "../src/shared/schedule.js";
import { MAX_SCHEDULES, Scheduler } from "../src/server/schedule/scheduler.js";
import { ValidationError } from "../src/server/crm/store.js";

const at = (d: number, h: number, m = 0): Date => new Date(2026, 10, d, h, m, 0, 0); // tháng 11/2026, giờ địa phương

describe("nextRun / isDue", () => {
  it("hằng ngày: hôm nay nếu chưa tới giờ, mai nếu đã qua, và SAU HẲN thời điểm gốc", () => {
    const s = { frequency: "daily", at: "09:00" } as const;
    expect(nextRun(s, at(21, 8, 59)).getTime()).toBe(at(21, 9).getTime());
    expect(nextRun(s, at(21, 9, 0)).getTime()).toBe(at(22, 9).getTime()); // đúng giờ thì lấy lần sau
    expect(nextRun(s, at(21, 23, 59)).getTime()).toBe(at(22, 9).getTime());
    expect(nextRun({ frequency: "daily", at: "00:00" }, at(30, 12)).getTime()).toBe(new Date(2026, 11, 1, 0, 0).getTime()); // qua tháng
  });

  it("hằng tuần: đúng thứ đã chọn (0 = Chủ nhật); cùng thứ nhưng đã qua giờ thì tuần sau", () => {
    // 21/11/2026 là thứ Bảy (6)
    expect(new Date(2026, 10, 21).getDay()).toBe(6);
    expect(nextRun({ frequency: "weekly", at: "10:00", weekday: 6 }, at(21, 9)).getTime()).toBe(at(21, 10).getTime());
    expect(nextRun({ frequency: "weekly", at: "10:00", weekday: 6 }, at(21, 11)).getTime()).toBe(at(28, 10).getTime());
    expect(nextRun({ frequency: "weekly", at: "08:00", weekday: 1 }, at(21, 12)).getTime()).toBe(at(23, 8).getTime()); // thứ Hai
    expect(nextRun({ frequency: "weekly", at: "08:00", weekday: 0 }, at(21, 12)).getTime()).toBe(at(22, 8).getTime()); // Chủ nhật
  });

  const base: Schedule = { id: "s", title: "t", prompt: "p", toAgentId: "giamdoc", frequency: "daily", at: "09:00", enabled: true, lang: "vi", createdAt: at(21, 10).toISOString() };
  it("isDue: tạo lúc 10:00 cho 09:00 thì chưa tới hạn đến sáng mai; tắt thì không bao giờ; ngày hỏng thì không", () => {
    expect(isDue(base, at(21, 23))).toBe(false);
    expect(isDue(base, at(22, 9))).toBe(true);
    expect(isDue({ ...base, enabled: false }, at(30, 9))).toBe(false);
    expect(isDue({ ...base, createdAt: "không phải ngày" }, at(30, 9))).toBe(false);
    expect(viewOf(base, at(21, 10)).nextRunAt).toBe(at(22, 9).toISOString());
  });
});

describe("Scheduler", () => {
  let dir: string;
  let file: string;
  let clock: Date;
  let paused: boolean;
  let runs: Array<{ title: string; to: string; lang: string }>;
  let events: string[];
  let failNext: boolean;
  const make = (): Scheduler =>
    new Scheduler({
      file,
      now: () => clock,
      run: async (s) => {
        if (failNext) {
          failNext = false;
          throw new Error("kaboom");
        }
        runs.push({ title: s.title, to: s.toAgentId, lang: s.lang });
        return { rootId: `org_${runs.length}` };
      },
      paused: () => paused,
      agentExists: (id) => ["giamdoc", "long"].includes(id),
      defaultAgent: () => "giamdoc",
      onEvent: (k, d) => events.push(`${k}:${d.status ?? d.title ?? d.id}`),
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-sched-"));
    file = path.join(dir, "schedules.json");
    clock = at(21, 8, 0);
    paused = false;
    runs = [];
    events = [];
    failNext = false;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("giao đúng giờ và ĐÚNG MỘT LẦN; không giao trước giờ; tick chồng nhau không giao đôi", async () => {
    const sch = make();
    sch.create({ title: "Báo cáo sáng", prompt: "Tóm tắt CRM", frequency: "daily", at: "08:30", lang: "en" });
    expect(await sch.tick()).toBe(0);
    clock = at(21, 8, 30);
    const [a, b] = await Promise.all([sch.tick(), sch.tick()]);
    expect(a + b).toBe(1); // tick thứ hai gặp cờ đang chạy
    expect(runs).toEqual([{ title: "Báo cáo sáng", to: "giamdoc", lang: "en" }]);
    clock = at(21, 12);
    expect(await sch.tick()).toBe(0); // hôm nay đã chạy rồi
    clock = at(22, 8, 30);
    expect(await sch.tick()).toBe(1);
    expect(runs).toHaveLength(2);
    expect(sch.list()[0]).toMatchObject({ lastStatus: "started", lastRootId: "org_2" });
  });

  it("máy tắt qua nhiều ngày → chạy bù ĐÚNG MỘT LẦN khi mở lại, không chạy dồn", async () => {
    const sch = make();
    sch.create({ title: "Hằng ngày", prompt: "p", frequency: "daily", at: "08:30" });
    clock = at(27, 18); // 6 ngày sau
    expect(await sch.tick()).toBe(1);
    expect(await sch.tick()).toBe(0);
    expect(runs).toHaveLength(1);
  });

  it("dừng khẩn cấp: bỏ qua lần chạy và ghi nhận 'skipped'; gỡ dừng khẩn cấp rồi KHÔNG có việc cũ nổ ra", async () => {
    const sch = make();
    sch.create({ title: "Bị chặn", prompt: "p", frequency: "daily", at: "08:30" });
    paused = true;
    clock = at(21, 8, 31);
    expect(await sch.tick()).toBe(1);
    expect(runs).toEqual([]);
    expect(sch.list()[0]).toMatchObject({ lastStatus: "skipped" });
    paused = false;
    clock = at(21, 20);
    expect(await sch.tick()).toBe(0); // lần đã bỏ qua không bị chạy bù trong cùng ngày
    expect(events).toContain("schedule.run:skipped");
  });

  it("lỗi khi giao việc được ghi lại (failed + thông điệp) và không làm sập vòng kiểm tra", async () => {
    const sch = make();
    sch.create({ title: "Lỗi", prompt: "p", frequency: "daily", at: "08:30" });
    clock = at(21, 9);
    failNext = true;
    expect(await sch.tick()).toBe(1);
    expect(sch.list()[0]).toMatchObject({ lastStatus: "failed", lastError: "kaboom" });
  });

  it("tạm dừng/bật lại: bật lại tính từ bây giờ (không chạy bù những lần đã tắt); xoá; chạy ngay", async () => {
    const sch = make();
    const s = sch.create({ title: "T", prompt: "p", frequency: "daily", at: "08:30" });
    sch.setEnabled(s.id, false);
    clock = at(25, 9);
    expect(await sch.tick()).toBe(0);
    sch.setEnabled(s.id, true);
    expect(await sch.tick()).toBe(0); // vừa bật: lần kế tiếp là sáng mai
    const ran = await sch.runNow(s.id);
    expect(ran?.lastStatus).toBe("started");
    expect(runs).toHaveLength(1);
    expect(sch.remove(s.id)).toBe(true);
    expect(sch.remove(s.id)).toBe(false);
    expect(await sch.runNow("khong-co")).toBeNull();
    expect(sch.setEnabled("khong-co", true)).toBeNull();
  });

  it("kiểm tra đầu vào: tên/nội dung/giờ/tần suất/thứ/người nhận/số lượng", () => {
    const sch = make();
    const bad = (input: Record<string, unknown>): string => {
      try {
        sch.create({ title: "T", prompt: "P", frequency: "daily", at: "08:00", ...input });
      } catch (e) {
        return (e as ValidationError).key;
      }
      return "ok";
    };
    expect(bad({ title: "  " })).toBe("val.schedule.titleRequired");
    expect(bad({ prompt: "" })).toBe("val.schedule.promptRequired");
    expect(bad({ at: "8:00" })).toBe("val.schedule.timeInvalid");
    expect(bad({ at: "24:00" })).toBe("val.schedule.timeInvalid");
    expect(bad({ frequency: "monthly" })).toBe("val.schedule.frequencyInvalid");
    expect(bad({ frequency: "weekly", weekday: 7 })).toBe("val.schedule.weekdayInvalid");
    expect(bad({ toAgentId: "ai-do" })).toBe("val.schedule.agentUnknown");
    expect(bad({ frequency: "weekly" })).toBe("ok"); // thứ mặc định = thứ Hai
    for (let i = 0; i < MAX_SCHEDULES; i++) if (bad({}) === "val.schedule.tooMany") break;
    expect(bad({})).toBe("val.schedule.tooMany");
  });

  it("lưu bền: mở lại vẫn còn lịch và trạng thái; tệp hỏng/lịch sai schema bị bỏ qua; khôi phục thay toàn bộ", async () => {
    const sch = make();
    sch.create({ title: "Giữ lại", prompt: "p", frequency: "weekly", at: "07:15", weekday: 3 });
    clock = at(21, 12);
    const again = make();
    expect(again.list().map((s) => [s.title, s.at, s.weekday])).toEqual([["Giữ lại", "07:15", 3]]);

    fs.writeFileSync(file, "không phải json");
    expect(make().list()).toEqual([]);

    const raw = [
      { id: "ok1", title: "Hợp lệ", prompt: "p", toAgentId: "giamdoc", frequency: "daily", at: "06:00", enabled: true, lang: "vi", createdAt: at(21, 1).toISOString() },
      { id: "ok1", title: "Trùng id", prompt: "p", toAgentId: "giamdoc", frequency: "daily", at: "06:00", enabled: true, lang: "vi", createdAt: at(21, 1).toISOString() },
      { id: "sai", title: "", prompt: "p" },
      "rác",
    ];
    const target = make();
    expect(target.replaceAll(raw)).toBe(1);
    expect(make().list().map((s) => s.id)).toEqual(["ok1"]); // đã lưu ra đĩa
    expect(target.replaceAll("không phải mảng")).toBe(0);
    expect(target.list()).toEqual([]);
  });
});
