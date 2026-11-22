/**
 * Logic thuần của giao diện hợp nhất: định dạng tiền/ngày, gom giao dịch, dịch lỗi API, số ít/nhiều, form email, trạng thái LAN,
 * và quét tĩnh để mọi khoá i18n mà giao diện dùng đều có đủ ở cả hai ngôn ngữ.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CATALOG } from "../src/server/ai/catalog.js";
import type { ProviderKind, ProviderState } from "../src/shared/ai.js";
import { AUDIT_KINDS } from "../src/shared/audit.js";
import { DEAL_STAGES, OPEN_STAGES, type CalendarEvent, type CrmSummary, type Deal, type DraftStatus } from "../src/shared/crm.js";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";
import { approvalReasonLabel, logLine, messageText, plural, taskLabel, translate } from "../src/client/office-3d/i18n/index.js";
import { ApiError, errorKey, errorText, listSchedules } from "../src/client/office-3d/lib/api.js";
import { ErrorBoundary } from "../src/client/office-3d/ui/ErrorBoundary.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TABS, tabAfterKey } from "../src/client/office-3d/store/ui.js";
import { Note, isSubmitCombo } from "../src/client/office-3d/ui/a11y.js";
import { stepKey } from "../src/client/office-3d/lib/roving.js";
import { acceptsKey } from "../src/client/office-3d/ui/AiPanel.js";
import { previewBackupText } from "../src/client/office-3d/ui/backupLogic.js";
import { describeSchedule } from "../src/client/office-3d/ui/SchedulePanel.js";
import { FREQUENCIES, SCHEDULE_STATUSES } from "../src/shared/schedule.js";
import { formatAuditDetail, formatMoney, sortDeals, sortEvents, stageRows } from "../src/client/office-3d/ui/crmLogic.js";
import { lanWanted, mailBody, mailFormFrom } from "../src/client/office-3d/ui/SettingsSections.js";

const tEn = (k: string, v?: Record<string, string | number>) => translate("en", k, v);
const tVi = (k: string, v?: Record<string, string | number>) => translate("vi", k, v);

const deal = (over: Partial<Deal>): Deal => ({
  id: 1,
  contactId: null,
  title: "d",
  value: 0,
  currency: "VND",
  stage: "lead",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("CRM: tiền, giai đoạn, sắp xếp", () => {
  it("formatMoney theo ngôn ngữ; mã tiền tệ lạ không ném lỗi", () => {
    expect(formatMoney("en", 12_000_000)).toMatch(/12,000,000/);
    expect(formatMoney("vi", 12_000_000, "VND")).toMatch(/12\.000\.000/);
    expect(formatMoney("en", 1500, "USD")).toBe("$1,500");
    expect(formatMoney("en", 5, "XYZ??")).toContain("XYZ??");
  });

  it("stageRows đủ 6 giai đoạn theo đúng thứ tự, tỉ lệ thanh so với giai đoạn đông nhất, không chia cho 0", () => {
    const empty = Object.fromEntries(DEAL_STAGES.map((s) => [s, { count: 0, value: 0 }])) as CrmSummary["deals"];
    const none = stageRows({ contacts: 0, deals: empty, openValue: 0, wonValue: 0 });
    expect(none.map((r) => r.stage)).toEqual([...DEAL_STAGES]);
    expect(none.every((r) => r.share === 0)).toBe(true);
    const some = stageRows({ contacts: 3, deals: { ...empty, lead: { count: 4, value: 40 }, won: { count: 2, value: 90 } }, openValue: 40, wonValue: 90 });
    expect(some.find((r) => r.stage === "lead")!.share).toBe(1);
    expect(some.find((r) => r.stage === "won")!.share).toBe(0.5);
    expect([...OPEN_STAGES]).toEqual(["lead", "qualified", "proposal", "negotiation"]);
  });

  it("sortDeals: giao dịch còn mở trước, đã đóng sau; mới cập nhật trước", () => {
    const list = sortDeals([
      deal({ id: 1, stage: "won", updatedAt: "2026-03-01T00:00:00.000Z" }),
      deal({ id: 2, stage: "lead", updatedAt: "2026-01-01T00:00:00.000Z" }),
      deal({ id: 3, stage: "negotiation", updatedAt: "2026-02-01T00:00:00.000Z" }),
      deal({ id: 4, stage: "lost", updatedAt: "2026-04-01T00:00:00.000Z" }),
    ]);
    expect(list.map((d) => d.id)).toEqual([3, 2, 4, 1]);
  });

  it("sortEvents: sắp tới (gần nhất trước) rồi đã qua (mới nhất trước)", () => {
    const now = Date.parse("2026-06-15T00:00:00Z");
    const ev = (id: number, start: string): CalendarEvent => ({ id, title: "e", start, end: "", notes: "", attendees: [], agentId: "", createdAt: "" });
    const out = sortEvents([ev(1, "2026-06-01T00:00:00Z"), ev(2, "2026-07-01T00:00:00Z"), ev(3, "2026-06-20T00:00:00Z"), ev(4, "2026-05-01T00:00:00Z")], now);
    expect(out.map((e) => e.id)).toEqual([3, 2, 1, 4]);
  });
});

describe("client chịu được phản hồi bất thường của máy chủ", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const reply = (body: string, init: ResponseInit = {}): void => {
    globalThis.fetch = (async () => new Response(body, init)) as typeof fetch;
  };

  it("200 nhưng không phải JSON (máy chủ bản cũ trả index.html cho đường dẫn lạ) → ApiError badResponse, không phải dữ liệu rỗng làm vỡ .map", async () => {
    reply("<!doctype html><title>x</title>", { status: 200, headers: { "content-type": "text/html" } });
    const err = await listSchedules().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("badResponse");
    expect(errorText(tEn, err)).toMatch(/older version/);
    expect(errorText(tVi, err)).toMatch(/bản cũ/);
  });

  it("thân rỗng là {} hợp lệ (các lệnh POST không trả gì); JSON đúng được đọc; lỗi JSON có mã; mất mạng có mã network", async () => {
    reply("", { status: 200 });
    expect(await listSchedules()).toEqual({});
    reply("[1,2]", { status: 200, headers: { "content-type": "application/json" } });
    expect(await listSchedules()).toEqual([1, 2]);
    reply(JSON.stringify({ error: "x", code: "scheduleGone" }), { status: 404, headers: { "content-type": "application/json" } });
    expect(await listSchedules().catch((e) => e)).toMatchObject({ status: 404, code: "scheduleGone" });
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await listSchedules().catch((e) => e)).toMatchObject({ status: 0, code: "network" });
  });
});

describe("chốt chặn lỗi giao diện", () => {
  it("bắt lỗi dựng, hiện thẻ cảnh báo (role=alert) kèm thông điệp, và thử lại/tải lại được", () => {
    const derived = ErrorBoundary.getDerivedStateFromError(new Error("boom"));
    expect(derived.error.message).toBe("boom");
    expect(ErrorBoundary.getDerivedStateFromError("chuỗi").error.message).toBe("chuỗi");
    const eb = new ErrorBoundary({ children: null, inline: true });
    expect(eb.render()).toBeNull(); // chưa lỗi → hiện con (null ở đây)
    eb.state = { error: new Error("boom") };
    const el = eb.render() as { props: { role: string; className: string; children: unknown[] } };
    expect(el.props.role).toBe("alert");
    expect(el.props.className).toBe("crash inline");
  });
});

describe("mô tả việc lặp lại", () => {
  it("hằng ngày / hằng tuần theo từng ngôn ngữ", () => {
    expect(describeSchedule(tEn, { frequency: "daily", at: "08:30" }, "Hùng")).toBe("Every day at 08:30 → Hùng");
    expect(describeSchedule(tVi, { frequency: "daily", at: "08:30" }, "Hùng")).toBe("Hằng ngày lúc 08:30 → Hùng");
    expect(describeSchedule(tEn, { frequency: "weekly", at: "09:00", weekday: 1 }, "Long")).toBe("Every Monday at 09:00 → Long");
    expect(describeSchedule(tVi, { frequency: "weekly", at: "09:00", weekday: 0 }, "Long")).toBe("Chủ nhật hằng tuần lúc 09:00 → Long");
    expect(describeSchedule(tEn, { frequency: "weekly", at: "09:00" }, "Long")).toContain("Monday"); // mặc định thứ Hai
  });
});

describe("xem trước tệp sao lưu", () => {
  it("nhận đúng tệp FunnyOVS và đếm số mục; từ chối tệp khác, JSON hỏng, phiên bản lạ", () => {
    const good = JSON.stringify({ app: "FunnyOVS", version: 1, createdAt: "2026-11-21T00:00:00Z", data: { contacts: [1, 2], deals: [1], activities: [], drafts: [], events: [1, 2, 3] }, org: [1], schedules: [1, 2] });
    expect(previewBackupText(good)).toEqual({ ok: true, createdAt: "2026-11-21T00:00:00Z", counts: { contacts: 2, deals: 1, activities: 0, drafts: 0, events: 3, org: 1, schedules: 2 } });
    for (const bad of ["{không phải json", "[]", "null", JSON.stringify({ app: "Khac", version: 1, data: {} }), JSON.stringify({ app: "FunnyOVS", version: 9, data: {} }), JSON.stringify({ app: "FunnyOVS", version: 1 })]) {
      expect(previewBackupText(bad).ok, bad).toBe(false);
    }
  });
});

describe("nhật ký bảo mật hiển thị", () => {
  it("formatAuditDetail: khoá=giá trị, boolean thành ✓/✗, rỗng thì chuỗi rỗng", () => {
    expect(formatAuditDetail({ provider: "groq", enabled: false, n: 3, ok: true })).toBe("provider=groq · enabled=✗ · n=3 · ok=✓");
    expect(formatAuditDetail({})).toBe("");
  });
});

describe("dịch lỗi API và thông điệp có khoá", () => {
  it("errorKey: mã ngắn → err.api.*, mã có dấu chấm là khoá đầy đủ", () => {
    expect(errorKey("loopbackOnly")).toBe("err.api.loopbackOnly");
    expect(errorKey("val.deal.stageInvalid")).toBe("val.deal.stageInvalid");
  });

  it("errorText dịch theo mã + biến ở cả hai ngôn ngữ; rơi về thông điệp kỹ thuật khi mã lạ", () => {
    const stage = new ApiError(400, "val.deal.stageInvalid", { stages: "lead, won" }, "Giai đoạn không hợp lệ (lead, won)");
    expect(errorText(tEn, stage)).toBe("Invalid stage (lead, won)");
    expect(errorText(tVi, stage)).toBe("Giai đoạn không hợp lệ (lead, won)");
    expect(errorText(tEn, new ApiError(403, "loopbackOnly", undefined, "x"))).toBe("Only available from the machine running the app.");
    expect(errorText(tEn, new ApiError(404, "unknownProvider", { id: "zzz" }, "x"))).toBe('There is no AI provider "zzz".');
    expect(errorText(tEn, new ApiError(0, "network", undefined, "x"))).toMatch(/Cannot reach the app/);
    expect(errorText(tVi, new ApiError(0, "network", undefined, "x"))).toMatch(/Không kết nối được/);
    expect(errorText(tEn, new ApiError(401, undefined, undefined, "raw"))).toBe("An access code is required.");
    expect(errorText(tEn, new ApiError(500, "maLa", undefined, "technical detail"))).toBe("technical detail");
    expect(errorText(tEn, new Error("plain"))).toBe("plain");
  });

  it("messageText: dịch theo khoá; khoá lạ hoặc thiếu dùng văn bản dự phòng thay vì hiện khoá thô", () => {
    expect(messageText(tEn, { key: "err.task.cancelled", text: "Đã huỷ." })).toBe("Cancelled.");
    expect(messageText(tVi, { key: "err.task.cancelled", text: "x" })).toBe("Đã huỷ.");
    expect(messageText(tEn, { key: "khong.co.khoa", text: "văn bản dự phòng" })).toBe("văn bản dự phòng");
    expect(messageText(tEn, { text: "no key" })).toBe("no key");
  });

  it("plural: số ít/số nhiều tiếng Anh; tiếng Việt giống nhau", () => {
    expect(plural(tEn, "crm.contactsCount", 1)).toBe("1 contact");
    expect(plural(tEn, "crm.contactsCount", 0)).toBe("0 contacts");
    expect(plural(tEn, "crm.contactsCount", 7)).toBe("7 contacts");
    expect(plural(tVi, "crm.contactsCount", 1)).toBe("1 liên hệ");
    expect(plural(tVi, "crm.contactsCount", 7)).toBe("7 liên hệ");
  });
});

describe("Cài đặt: LAN, email, ô dán khoá", () => {
  it("lanWanted: lựa chọn đã lưu = ngược với trạng thái đang chạy khi cần khởi động lại", () => {
    expect(lanWanted({ lan: false, restartRequired: false })).toBe(false);
    expect(lanWanted({ lan: false, restartRequired: true })).toBe(true); // vừa bật, chờ khởi động lại
    expect(lanWanted({ lan: true, restartRequired: false })).toBe(true);
    expect(lanWanted({ lan: true, restartRequired: true })).toBe(false); // vừa tắt, chờ khởi động lại
  });

  it("form email ↔ body: máy chủ trống = bỏ phần đó; mật khẩu trống = không gửi (giữ mật khẩu đã lưu)", () => {
    const blank = mailFormFrom(undefined);
    expect(mailBody(blank)).toEqual({});
    const form = { ...blank, smtpHost: " smtp.x.vn ", smtpPort: "587", smtpSecure: false, smtpUser: "me@x.vn", smtpFrom: "", smtpPass: "", imapHost: "imap.x.vn", imapUser: "me@x.vn", imapPass: "s3cret" };
    const body = mailBody(form);
    expect(body.smtp).toEqual({ host: "smtp.x.vn", port: 587, secure: false, user: "me@x.vn" });
    expect(body.imap).toEqual({ host: "imap.x.vn", port: 993, secure: true, user: "me@x.vn" });
    expect("smtpPass" in body).toBe(false);
    expect(body.imapPass).toBe("s3cret");
    // cổng sai → mặc định hợp lý
    expect(mailBody({ ...blank, smtpHost: "h", smtpPort: "abc" }).smtp!.port).toBe(465);
    // nạp lại từ cấu hình đã lưu; `from` trùng `user` không hiện ra
    const loaded = mailFormFrom({ smtp: { host: "h", port: 25, secure: false, user: "u@x.vn", from: "u@x.vn" }, smtpPassSet: true, imapPassSet: false });
    expect(loaded.smtpFrom).toBe("");
    expect(loaded.smtpPort).toBe("25");
    expect(loaded.smtpPass).toBe("");
  });

  it("acceptsKey: đám mây luôn; OmniRoute chỉ khi đòi khoá; máy cục bộ không", () => {
    expect(acceptsKey({ id: "groq", kind: "cloud", state: "no-key", hasKey: false })).toBe(true);
    expect(acceptsKey({ id: "omniroute", kind: "gateway", state: "ready", hasKey: false })).toBe(false);
    expect(acceptsKey({ id: "omniroute", kind: "gateway", state: "no-key", hasKey: false })).toBe(true);
    expect(acceptsKey({ id: "omniroute", kind: "gateway", state: "ready", hasKey: true })).toBe(true);
    expect(acceptsKey({ id: "ollama", kind: "local", state: "offline", hasKey: false })).toBe(false);
  });
});

describe("i18n của giao diện: mọi khoá dùng đều tồn tại (vi + en)", () => {
  const has = (k: string): boolean => k in DICTIONARIES.vi && k in DICTIONARIES.en;

  it("khoá ghép động: trạng thái/loại nguồn AI, ghi chú theo nguồn, giai đoạn CRM, trạng thái email, tab, nguồn kế hoạch", () => {
    // Record<..., true> buộc trình biên dịch báo lỗi nếu thêm giá trị mới mà quên bản dịch ở đây.
    const states: Record<ProviderState, true> = { ready: true, "no-key": true, offline: true, cooling: true, disabled: true, "auth-failed": true };
    const kinds: Record<ProviderKind, true> = { gateway: true, local: true, cloud: true, custom: true };
    const drafts: Record<DraftStatus, true> = { draft: true, sent: true, failed: true, discarded: true };
    for (const s of Object.keys(states)) expect(has(`ai.state.${s}`), `ai.state.${s}`).toBe(true);
    for (const k of Object.keys(kinds)) expect(has(`ai.kind.${k}`), `ai.kind.${k}`).toBe(true);
    for (const d of Object.keys(drafts)) expect(has(`crm.draft.status.${d}`), `crm.draft.status.${d}`).toBe(true);
    for (const p of CATALOG) expect(has(`ai.note.${p.id}`), `ai.note.${p.id}`).toBe(true);
    for (const s of DEAL_STAGES) expect(has(`crm.stage.${s}`), `crm.stage.${s}`).toBe(true);
    for (const t of TABS) expect(has(`tab.${t}`), `tab.${t}`).toBe(true);
    for (const s of ["llm", "keywords"]) expect(has(`org.planSource.${s}`)).toBe(true);
    for (const n of ["one", "other"]) expect(has(`crm.contactsCount.${n}`)).toBe(true);
    for (const k of AUDIT_KINDS) expect(has(`audit.kind.${k}`), `audit.kind.${k}`).toBe(true);
    for (const f of FREQUENCIES) expect(has(`schedule.freq.${f}`), f).toBe(true);
    for (const st of SCHEDULE_STATUSES) expect(has(`schedule.last.${st}`), st).toBe(true);
    for (let d = 0; d < 7; d++) expect(has(`schedule.weekday.${d}`), `weekday ${d}`).toBe(true);
    for (const a of ["user", "agent", "system"]) expect(has(`audit.actor.${a}`), a).toBe(true);
  });

  it("quét tĩnh: mọi t(\"khoá\") / tr(\"khoá\") viết thẳng trong mã giao diện đều có bản dịch", () => {
    const root = path.resolve(__dirname, "..", "src", "client", "office-3d");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(path.join(d, e.name));
      }
    };
    walk(root);
    const used = new Map<string, string>();
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/\b(?:t|tr)\(\s*["']([a-zA-Z][a-zA-Z0-9_.-]*\.[a-zA-Z0-9_.-]+)["']/g)) used.set(m[1], path.relative(root, f));
    }
    expect(used.size).toBeGreaterThan(80);
    const missing = [...used].filter(([k]) => !has(k)).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });
});

describe("tiếp cận: bàn phím và thông báo", () => {
  it("tablist: ←/→ xoay vòng, Home/End về hai đầu, phím khác bỏ qua", () => {
    expect(tabAfterKey(TABS[0], "ArrowRight")).toBe(TABS[1]);
    expect(tabAfterKey(TABS[TABS.length - 1], "ArrowRight")).toBe(TABS[0]);
    expect(tabAfterKey(TABS[0], "ArrowLeft")).toBe(TABS[TABS.length - 1]);
    expect(tabAfterKey(TABS[2], "Home")).toBe(TABS[0]);
    expect(tabAfterKey(TABS[1], "End")).toBe(TABS[TABS.length - 1]);
    for (const k of ["Enter", "Tab", "a", "ArrowDown"]) expect(tabAfterKey(TABS[1], k), k).toBeNull();
  });

  it("stepKey chạy với danh sách bất kỳ (mục con CRM, danh sách rỗng, mục lạ không làm hỏng)", () => {
    const list = ["a", "b", "c"] as const;
    expect(stepKey(list, "c", "ArrowRight")).toBe("a");
    expect(stepKey(list, "a", "ArrowLeft")).toBe("c");
    expect(stepKey(list, "b", "End")).toBe("c");
    expect(stepKey(list, "zzz" as "a", "ArrowRight")).toBe("b"); // mục hiện tại không có trong danh sách → coi như đầu danh sách
    expect(stepKey([] as string[], "a", "ArrowRight")).toBeNull();
    expect(stepKey(list, "a", " ")).toBeNull();
  });

  it("Ctrl/⌘+Enter gửi; Enter thường, Shift+Enter hay đang gõ bằng bộ gõ thì không", () => {
    const e = (over: object) => ({ key: "Enter", ctrlKey: false, metaKey: false, ...over });
    expect(isSubmitCombo(e({ ctrlKey: true }))).toBe(true);
    expect(isSubmitCombo(e({ metaKey: true }))).toBe(true);
    expect(isSubmitCombo(e({}))).toBe(false);
    expect(isSubmitCombo(e({ ctrlKey: true, key: "a" }))).toBe(false);
    expect(isSubmitCombo(e({ ctrlKey: true, nativeEvent: { isComposing: true } }))).toBe(false);
  });

  it("Note: vùng status luôn có mặt (để được đọc); lỗi hiện role=alert", () => {
    const none = renderToStaticMarkup(createElement(Note, { note: null }));
    expect(none).toContain('role="status"');
    expect(none).not.toContain('role="alert"');
    const good = renderToStaticMarkup(createElement(Note, { note: { text: "Đã giao" } }));
    expect(good).toMatch(/role="status"[^>]*>Đã giao</);
    expect(good).not.toContain('role="alert"');
    const bad = renderToStaticMarkup(createElement(Note, { note: { text: "Lỗi mạng", bad: true } }));
    expect(bad).toMatch(/role="alert"[^>]*>Lỗi mạng</);
    expect(bad).not.toMatch(/role="status"[^>]*>Lỗi mạng/);
  });

  it("quét tĩnh: thông báo lỗi hiện động (`cond && <p className=\"warn\">`) đều có role để trình đọc màn hình đọc", () => {
    const dir = path.resolve(__dirname, "..", "src", "client", "office-3d", "ui");
    // Trạng thái tĩnh hiển thị trong danh sách (không phải thông báo vừa xảy ra) — không cần role.
    const STATIC = ['d.error && <span className="warn">', 's.lastError && <div className="warn">'];
    const missing: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      fs.readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/&& <(?:p|div|span) className="warn"(?![^>]*role=)/.test(line) && !STATIC.some((s) => line.includes(s))) missing.push(`${f}:${i + 1}`);
        });
    }
    expect(missing).toEqual([]);
  });
});

describe("nhãn do server sinh được dịch theo ngôn ngữ đang chọn (E1, E2)", () => {
  const planning = { task: "Đang lập kế hoạch: Fix the login bug", taskKey: "task.planning", taskVars: { title: "Fix the login bug" } };

  it("việc đang làm: có khoá thì dịch (tiếng Anh không còn chữ tiếng Việt), tên việc của người dùng giữ nguyên", () => {
    expect(taskLabel(tEn, planning)).toBe("Planning: Fix the login bug");
    expect(taskLabel(tVi, planning)).toBe("Đang lập kế hoạch: Fix the login bug");
    expect(taskLabel(tEn, { task: "Viết báo cáo tuần" })).toBe("Viết báo cáo tuần"); // việc do người dùng đặt tên: không có khoá
    expect(taskLabel(tEn, { task: "x", taskKey: "khong.co.khoa" })).toBe("x"); // khoá lạ → dùng chữ dự phòng, không hiện khoá thô
    expect(taskLabel(tEn, {})).toBe("");
  });

  it("lý do cần duyệt: dịch theo khoá + biến, dự phòng bằng chữ gốc", () => {
    const md = { approvalReason: "Vượt ngưỡng", approvalReasonKey: "approval.reason.overLimit", approvalReasonVars: { tokens: "90,000", limit: "50,000" } };
    expect(approvalReasonLabel(tEn, md)).toContain("90,000");
    expect(approvalReasonLabel(tEn, md)).not.toMatch(/[ăâđêôơưáàảãạ]/i);
    expect(approvalReasonLabel(tVi, md)).toContain("90,000");
    expect(approvalReasonLabel(tEn, { approvalReason: "Lý do cũ" })).toBe("Lý do cũ");
  });

  it("dòng nhật ký: có khoá thì dịch kèm phần phụ; không khoá thì nguyên văn", () => {
    expect(logLine(tEn, { text: "x" })).toBe("x");
    const keyed = { key: "task.delegating", vars: { title: "A" }, text: "Phân việc: A" };
    expect(logLine(tEn, keyed)).toBe("Delegating: A");
    expect(logLine(tVi, keyed)).toBe("Phân việc: A");
    expect(logLine(tEn, { ...keyed, extra: "ghi chú", extraKey: "task.planning", extraVars: { title: "B" } })).toBe("Delegating: A — Planning: B");
  });
});
