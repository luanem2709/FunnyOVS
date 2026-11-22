/**
 * Kiểm tra giao diện bằng trình duyệt thật (Chrome + playwright-core) trên máy chủ CÁCH LY — các mục "kiểm thủ công" trong docs/07-diem-so.md.
 * Tự khởi động một máy chủ cách ly mới (dữ liệu tạm) + một LLM giả trên cổng riêng, nên chạy lặp lại được và không đụng
 * dữ liệu thật hay Ollama thật của bạn. Mỗi bước in PASS/FAIL; thoát mã 1 nếu có FAIL. Cần `npx vite build` trước.
 *
 *   node scripts/verify-ui.mjs
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditContrast, auditPage } from "./a11y-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.VERIFY_PORT ?? "8811";
const MOCK_PORT = process.env.VERIFY_MOCK_PORT ?? "11435";
const base = `http://127.0.0.1:${PORT}`;

const mock = spawn(process.execPath, [path.join(root, "scripts", "mock-llm.mjs")], { env: { ...process.env, MOCK_PORT }, stdio: "ignore" });
// stdin dạng pipe: đóng stdin = báo cho máy chủ cách ly tự dọn thư mục tạm rồi thoát.
const server = spawn(process.execPath, [path.join(root, "scripts", "preview-server.mjs")], {
  env: { ...process.env, PREVIEW_PORT: PORT, PREVIEW_STDIN_CLOSE: "1", OLLAMA_HOST: `127.0.0.1:${MOCK_PORT}` },
  stdio: ["pipe", "ignore", "ignore"],
});
/** Đóng stdin để máy chủ tự dọn thư mục tạm, và ĐỢI nó thoát (nếu cha thoát trước, Windows có thể giết con giữa chừng → rò thư mục tạm). */
const shutdown = () =>
  new Promise((resolve) => {
    mock.kill();
    server.once("exit", resolve);
    server.stdin?.end();
    setTimeout(() => {
      server.kill();
      resolve();
    }, 8000).unref();
  });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    /* chưa sẵn sàng */
  }
  await new Promise((r) => setTimeout(r, 500));
}

const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let failed = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
};

/** Đợi tới khi `fn()` trả giá trị đúng (bỏ qua lỗi tạm thời), tối đa `ms`. */
const waitFor = async (fn, ms, step = 400) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      /* chưa sẵn sàng */
    }
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
};

const browser = await chromium.launch({ executablePath, args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] }).catch(async (e) => {
  console.log(`FAIL  Không mở được Chrome (${executablePath}): ${String(e?.message ?? e).split("\n")[0]}`);
  await shutdown();
  process.exit(1);
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Verify Co", onboarded: true, idleLife: true, labels: "auto", quality: "low" }));
});
const page = await context.newPage();
const errors = [];
// /api/files/read trả 403 CÓ CHỦ Ý ở bước kiểm tra duyệt quyền (Chrome ghi 403 thành lỗi console) → không tính.
page.on("console", (m) => m.type() === "error" && !(m.location().url ?? "").includes("/api/files/read") && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

// Mọi bước nằm trong try: dù lỗi ở đâu (hết giờ chờ, trang sập...), vẫn đóng Chrome và dọn máy chủ + thư mục tạm.
try {
await page.goto(`${base}/office-3d/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
if (await page.locator('[role="tab"]').count() === 0) await page.locator(".dock-toggle").click();

const tab = (i) => page.locator('[role="tab"]').nth(i);
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");

// ---- H1/H2: có đủ 5 tab
const tabs = await page.locator('[role="tab"]').allInnerTexts();
ok("5 tab: Company, AI, CRM, Activity, Overview", tabs.join(",") === "Company,AI,CRM,Activity,Overview", tabs.join(","));

// ---- B5: tab Kết nối AI
await tab(1).click();
await page.waitForTimeout(1200);
const providers = await page.locator(".aicard").count();
ok("AI: liệt kê ≥ 9 nhà cung cấp", providers >= 9, `${providers}`);
const groq = page.locator('[data-provider="groq"]');
ok("AI: Groq hiện 'Needs key' + 'No API key yet' (chuỗi server được dịch)", /Needs key/.test(await groq.innerText()) && /No API key yet/.test(await groq.innerText()));

await page.locator(".aitop button", { hasText: "Rescan" }).click();
await page.waitForTimeout(2500);
const ollama = page.locator('[data-provider="ollama"]');
const ollamaReady = /Ready/.test(await ollama.innerText());
ok("AI: tự dò thấy dịch vụ kiểu Ollama đang chạy (LLM giả) → 'Ready'", ollamaReady);
if (ollamaReady) {
  await ollama.locator("button", { hasText: /^Test$/ }).click();
  await page.waitForTimeout(2500);
  ok("AI: Kiểm thử Ollama báo 'Working'", /Working — \d+ms/.test(await ollama.innerText()), (await ollama.innerText()).match(/Working[^\n]*/)?.[0] ?? "");
  ok("AI: chấm sức khoẻ trên thanh đầu đổi sang 'AI: ollama'", /AI: ollama/.test(await text(".healthpill")), await text(".healthpill"));
}

// dán khoá giả (chỉ lưu trên máy chủ cách ly), thấy bản che, rồi xoá
await groq.locator('input[type="password"]').fill("gsk_verify_fake_key_1234567890abcd");
await groq.locator('button[type="submit"]').click();
await page.waitForTimeout(1500);
const groqText = await groq.innerText();
ok("AI: lưu khoá → hiện bản che, không hiện khoá thật", /Key saved gsk_…/.test(groqText) && !groqText.includes("verify_fake_key"), groqText.match(/Key saved[^\n]*/)?.[0] ?? "");
ok("AI: Groq chuyển sang 'Ready' sau khi có khoá", /Ready/.test(groqText));
await groq.locator("button", { hasText: "Remove key" }).click();
await page.waitForTimeout(1500);
ok("AI: xoá khoá → quay lại 'Needs key'", /Needs key/.test(await groq.innerText()));

// ---- C3: tab CRM
await tab(2).click();
await page.waitForTimeout(800);
await page.locator(".subnav button", { hasText: "Contacts" }).click();
await page.locator("details.addform summary").click();
await page.locator('.addform input[aria-label="Name"]').fill("Verify Contact");
await page.locator('.addform input[aria-label="Email"]').fill("verify@example.com");
await page.locator('.addform button[type="submit"]').click();
await page.waitForTimeout(1200);
ok("CRM: thêm liên hệ hiện trong danh sách", /Verify Contact/.test(await text(".contacts")));
await page.locator(".subnav button", { hasText: "Pipeline" }).click();
await page.locator("details.addform summary").click();
await page.locator('.addform input[aria-label="Deal title"]').fill("Verify deal");
await page.locator('.addform input[aria-label="Value"]').fill("5000");
await page.locator('.addform button[type="submit"]').click();
await page.waitForTimeout(1200);
ok("CRM: thêm giao dịch, tổng pipeline cập nhật", /5,000/.test(await text(".crmkpis")), await text(".crmkpis"));
const wonBefore = Number(((await text(".crmkpis b.ok-text")).match(/[\d,]+/)?.[0] ?? "0").replace(/,/g, ""));
await page.locator(".deal select").first().selectOption("won");
await page.waitForTimeout(1200);
const wonAfter = Number(((await text(".crmkpis b.ok-text")).match(/[\d,]+/)?.[0] ?? "0").replace(/,/g, ""));
ok("CRM: chuyển giai đoạn 'won' → mục Won tăng đúng giá trị giao dịch", wonAfter - wonBefore === 5000, `${wonBefore} → ${wonAfter}`);

// ---- K3: việc lặp lại (tab Company)
await tab(0).click();
await page.waitForTimeout(600);
await page.locator(".schedulepanel details.addform summary").click();
await page.locator('.schedulepanel input[aria-label="Name"]').fill("Morning CRM summary");
await page.locator('.schedulepanel textarea[aria-label="What to do"]').fill("Summarize the CRM pipeline.");
await page.locator('.schedulepanel input[type="time"]').fill("08:30");
await page.locator('.schedulepanel button[type="submit"]').click();
await page.waitForTimeout(1200);
const schedText = await text(".schedulepanel .schedules li");
ok("Việc lặp lại: tạo lịch hiện trong danh sách với giờ và người nhận", /Morning CRM summary/.test(schedText) && /Every day at 08:30 → Hùng/.test(schedText), schedText.slice(0, 100));
ok("Việc lặp lại: có 'Next:' (lần chạy kế tiếp)", /Next:/.test(schedText));
await page.locator(".schedulepanel .schedules li button", { hasText: "Run now" }).click();
await page.waitForTimeout(1800);
ok("Việc lặp lại: 'Run now' giao việc cho Giám đốc → 'Last: started' và có luồng việc mới", /Last: started/.test(await text(".schedulepanel .schedules li")) && (await page.locator(".flowroot").count()) >= 1);
await page.locator(".schedulepanel .schedules li button", { hasText: "Pause" }).click();
await page.waitForTimeout(1000);
ok("Việc lặp lại: tạm dừng → hiện 'Paused'", /Paused/.test(await text(".schedulepanel .schedules li")));
await page.locator(".schedulepanel .schedules li button", { hasText: "Delete" }).click();
await page.waitForTimeout(1000);
ok("Việc lặp lại: xoá → danh sách trống", /No recurring work yet/.test(await text(".schedulepanel")));

// ---- J1: quét tiếp cận (tên truy cập, lang, hộp thoại, id, canvas, vùng live, tablist) trên mọi tab và hộp thoại Cài đặt
async function auditEverything(lang) {
  for (let i = 0; i < 5; i++) {
    await tab(i).click();
    await page.waitForTimeout(700);
    const label = await tab(i).innerText();
    const issues = await auditPage(page, { expectLang: lang });
    ok(`A11y [${lang}] tab "${label}": không có lỗi tiếp cận`, issues.length === 0, issues.slice(0, 4).join(" | "));
    const low = await auditContrast(page);
    ok(`Tương phản [${lang}] tab "${label}": mọi chữ đạt WCAG AA (4,5:1; chữ lớn 3:1)`, low.length === 0, low.slice(0, 3).join(" | "));
  }
  await page.locator("button[title]", { hasText: "⚙" }).first().click();
  await page.waitForTimeout(1000);
  const issues = await auditPage(page, { expectLang: lang });
  ok(`A11y [${lang}] hộp thoại Cài đặt: không có lỗi tiếp cận`, issues.length === 0, issues.slice(0, 4).join(" | "));
  const lowDialog = await auditContrast(page);
  ok(`Tương phản [${lang}] hộp thoại Cài đặt: mọi chữ đạt WCAG AA`, lowDialog.length === 0, lowDialog.slice(0, 3).join(" | "));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await tab(0).click();
  await page.waitForTimeout(300);
}
await auditEverything("en");
// Tự kiểm: bộ đo tương phản phải BẮT ĐƯỢC một mẫu chữ kém (tránh trường hợp nó lặng lẽ không đo gì và luôn báo "đạt").
await page.evaluate(() => {
  const p = document.createElement("p");
  p.id = "__low_contrast_probe";
  p.style.cssText = "color:#666;background:#555;position:fixed;left:0;top:0;z-index:99";
  p.textContent = "Low contrast probe";
  document.body.appendChild(p);
});
const probe = await auditContrast(page);
ok("Tương phản: bộ đo bắt được mẫu chữ kém (tự kiểm)", probe.some((x) => x.includes("Low contrast probe")), probe.join(" | ").slice(0, 120));
await page.evaluate(() => document.getElementById("__low_contrast_probe")?.remove());

// ---- J2: dùng được hoàn toàn bằng bàn phím
const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      role: a?.getAttribute("role") ?? "",
      id: a?.id ?? "",
      cls: typeof a?.className === "string" ? a.className : "",
      inModal: Boolean(a?.closest(".modal")),
      inDock: Boolean(a?.closest(".approval-dock")),
      text: (a?.textContent ?? "").trim().slice(0, 30),
    };
  });

await tab(0).click();
await tab(0).focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
let cur = await active();
ok("Bàn phím: → đổi sang tab kế tiếp và đưa focus theo", cur.role === "tab" && cur.id === "tab-ai" && (await tab(1).getAttribute("aria-selected")) === "true", JSON.stringify(cur));
await page.keyboard.press("End");
await page.waitForTimeout(300);
cur = await active();
ok("Bàn phím: End về tab cuối", cur.id === "tab-overview", JSON.stringify(cur));
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
cur = await active();
ok("Bàn phím: → ở tab cuối xoay vòng về tab đầu", cur.id === "tab-org", JSON.stringify(cur));

// Luồng chính chỉ bằng bàn phím: từ tab → Tab tới ô nhập → gõ → Ctrl+Enter → có luồng việc mới
const flowsBefore = await page.locator(".flowroot").count();
let reached = 0;
for (let i = 1; i <= 8; i++) {
  await page.keyboard.press("Tab");
  if ((await active()).cls.includes("assign")) {
    reached = i;
    break;
  }
}
ok("Bàn phím: từ tab 'Company', Tab tới ô giao việc trong ≤ 8 lần (không bẫy, thứ tự hợp lý)", reached > 0 && reached <= 8, `${reached} lần`);
await page.keyboard.type("Prepare the weekly status report for the board");
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(2200);
const assignedNote = await text('.orgpanel > [role="status"]');
ok("Bàn phím: Ctrl+Enter giao việc → thông báo 'Assigned' trong vùng status", /Assigned/.test(assignedNote), assignedNote);
ok("Bàn phím: luồng việc mới xuất hiện", (await page.locator(".flowroot").count()) > flowsBefore, `${flowsBefore} → ${await page.locator(".flowroot").count()}`);

// ---- E: không còn chữ tiếng Việt lọt vào giao diện tiếng Anh (trừ tên người) — mọi tab, sau khi đã có luồng việc chạy thật
const agentNames = await page.evaluate(async () => (await (await fetch("/api/agents")).json()).map((a) => a.name));
const VI_DIACRITICS = "[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]";
const vietnameseLeaks = () =>
  page.evaluate(
    ({ names, source }) => {
      const re = new RegExp(source, "i");
      let body = document.body.innerText;
      for (const n of [...names].sort((a, b) => b.length - a.length)) body = body.split(n).join("");
      return body.split("\n").filter((l) => re.test(l)).map((l) => l.trim().slice(0, 100)).slice(0, 5);
    },
    { names: agentNames, source: VI_DIACRITICS },
  );
for (let i = 0; i < 5; i++) {
  await tab(i).click();
  await page.waitForTimeout(800);
  const leaks = await vietnameseLeaks();
  ok(`Đa ngôn ngữ: tab "${await tab(i).innerText()}" không lọt chữ tiếng Việt vào giao diện tiếng Anh`, leaks.length === 0, leaks.join(" | "));
}
await tab(0).click();
await page.waitForTimeout(300);

// Hộp thoại: mở bằng Enter, bẫy focus (Tab và Shift+Tab xoay vòng bên trong), Esc đóng và trả focus về nút mở
const gear = page.locator("button[title]", { hasText: "⚙" }).first();
await gear.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
cur = await active();
ok("Bàn phím: Enter mở Cài đặt và focus vào trong hộp thoại", cur.inModal, JSON.stringify(cur));
let outside = 0;
for (let i = 0; i < 70; i++) {
  await page.keyboard.press("Tab");
  if (!(await active()).inModal) outside++;
}
ok("Bàn phím: Tab 70 lần không bao giờ rơi ra ngoài hộp thoại", outside === 0, `${outside} lần ra ngoài`);
outside = 0;
for (let i = 0; i < 70; i++) {
  await page.keyboard.press("Shift+Tab");
  if (!(await active()).inModal) outside++;
}
ok("Bàn phím: Shift+Tab 70 lần cũng không rơi ra ngoài", outside === 0, `${outside} lần ra ngoài`);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
cur = await active();
ok("Bàn phím: Esc đóng hộp thoại và trả focus về nút ⚙", (await page.locator(".modal").count()) === 0 && cur.text.includes("⚙"), JSON.stringify(cur));

// ---- J3: yêu cầu duyệt — được thông báo cho trình đọc màn hình và duyệt được bằng bàn phím
const staff = await page.evaluate(async () => (await (await fetch("/api/agents")).json())[0]);
const permReq = await page.evaluate(
  async ({ id, name, target }) => {
    const r = await fetch("/api/files/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: id, agentName: name, path: target, purpose: "verify-ui" }) });
    return { status: r.status, body: await r.json() };
  },
  { id: staff.id, name: staff.name, target: path.join(root, "package.json") },
);
ok("Duyệt: đọc tệp ngoài vùng làm việc bị chặn và tạo yêu cầu chờ duyệt", permReq.status === 403 && Boolean(permReq.body.requestId), JSON.stringify(permReq.body).slice(0, 80));
await page.waitForTimeout(900);
ok("Duyệt: hộp duyệt hiện ra", (await page.locator(".approval-dock .approval").count()) === 1);
const announced = await text('[data-announcer="approvals"]');
ok("Duyệt: vùng aria-live (assertive) được đọc 'Needs your approval: …' kèm tên người xin", /Needs your approval/.test(announced) && announced.includes(staff.name), announced);
await page.evaluate(() => document.activeElement?.blur());
let presses = 0;
let inDock = false;
for (let i = 1; i <= 25 && !inDock; i++) {
  await page.keyboard.press("Tab");
  presses = i;
  inDock = (await active()).inDock;
}
ok("Duyệt: từ đầu trang, Tab tới nút duyệt trong ≤ 25 lần", inDock, `${presses} lần`);
cur = await active();
await page.keyboard.press("Enter");
await page.waitForTimeout(1000);
ok(`Duyệt: Enter trên nút '${cur.text}' → thẻ biến mất`, (await page.locator(".approval").count()) === 0);
const pending = await page.evaluate(async () => (await (await fetch("/api/permissions")).json()).pending.length);
ok("Duyệt: máy chủ ghi nhận quyết định (không còn yêu cầu chờ)", pending === 0);
const reread = await page.evaluate(
  async ({ id, name, target }) => (await fetch("/api/files/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: id, agentName: name, path: target, purpose: "verify-ui" }) })).status,
  { id: staff.id, name: staff.name, target: path.join(root, "package.json") },
);
ok("Duyệt: quyết định có hiệu lực thật — đọc lại tệp được phép (200)", reread === 200, `HTTP ${reread}`);

// ---- E: dịch giao diện sang tiếng Việt, kể cả chuỗi do server sinh
await page.locator('button[aria-label][title]', { hasText: /^EN$/ }).first().click();
await page.waitForTimeout(600);
await tab(1).click();
await page.waitForTimeout(1500);
const viGroq = await page.locator('[data-provider="groq"]').innerText();
ok("Đa ngôn ngữ: thẻ Groq sang tiếng Việt, gồm lý do 'Chưa có khoá API'", /Cần khoá/.test(viGroq) && /Chưa có khoá API/.test(viGroq));
await tab(0).click();
ok("Đa ngôn ngữ: tab đổi tên", (await tab(0).innerText()) === "Tổ chức");
await auditEverything("vi");

// ---- D7/H2: Cài đặt → mạng LAN (không bật thật)
await page.locator('button[title]', { hasText: "⚙" }).first().click();
await page.waitForTimeout(1200);
ok("Cài đặt: có mục Truy cập từ máy khác (LAN), Email, GitHub", (await page.locator(".setsection").count()) >= 3);
const lan = page.locator('[data-section="network"] input[type="checkbox"]');
ok("Cài đặt: LAN mặc định TẮT", !(await lan.isChecked()));
await lan.check();
await page.waitForTimeout(1200);
ok("Cài đặt: bật LAN → báo cần khởi động lại", /khởi động lại/i.test(await text('[data-section="network"]')));
await lan.uncheck(); // trả lại như cũ
await page.waitForTimeout(1000);
ok("Cài đặt: tắt lại → hết cảnh báo", !/Cần khởi động lại/.test(await text('[data-section="network"]')));
// ---- K2: sao lưu → đổi dữ liệu → khôi phục (trong trình duyệt thật)
const backupSection = page.locator('[data-section="backup"]');
ok("Cài đặt: có mục Sao lưu & khôi phục", (await backupSection.count()) === 1);
const [download] = await Promise.all([page.waitForEvent("download"), backupSection.locator("a", { hasText: "sao lưu" }).click()]);
const savedPath = await download.path();
ok("Sao lưu: tải được tệp .json đúng tên", /^funnyovs-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
await page.evaluate(() => fetch("/api/crm/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sẽ mất sau khi khôi phục", email: "mat@x.vn" }) }));
await backupSection.locator('input[type="file"]').setInputFiles(savedPath);
await page.waitForTimeout(600);
ok("Khôi phục: hiện hộp xác nhận kèm số liệu của tệp", /THAY THẾ/.test(await text('[data-section="backup"] [role="alertdialog"]')), await text('[data-section="backup"] [role="alertdialog"]'));
await backupSection.locator("button.danger").click();
await page.waitForTimeout(1500);
ok("Khôi phục: báo thành công", /Đã khôi phục:/.test(await text('[data-section="backup"]')), (await text('[data-section="backup"]')).match(/Đã khôi phục:[^.]*/)?.[0] ?? "");
const contactsAfter = await page.evaluate(async () => (await (await fetch("/api/crm/contacts")).json()).map((c) => c.name));
ok("Khôi phục: dữ liệu thêm sau khi sao lưu đã biến mất, dữ liệu cũ còn", !contactsAfter.includes("Sẽ mất sau khi khôi phục") && contactsAfter.includes("Verify Contact"), contactsAfter.join(", "));
await page.waitForTimeout(1500);
const auditText = await text('[data-section="audit"]');
ok("Nhật ký bảo mật hiện: đổi chế độ LAN, sao lưu, khôi phục", /LAN/.test(auditText) && /Xuất bản sao lưu/.test(auditText) && /Khôi phục từ bản sao lưu/.test(auditText), auditText.slice(0, 120));
await page.keyboard.press("Escape");

// ---- I2: ngân sách dựng hình (số lệnh vẽ + số tam giác của cả cảnh), ở mức Cao và Thấp
async function measure(quality) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((q) => localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Perf", onboarded: true, idleLife: true, labels: "auto", quality: q })), quality);
  const p = await ctx.newPage();
  await p.goto(`${base}/office-3d/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(4500);
  const stats = await p.evaluate(() => window.__officeStats?.());
  await ctx.close();
  return stats;
}
const BUDGET = { calls: 1800, trianglesHigh: 1_000_000, trianglesLow: 450_000 };
const high = await measure("high");
const low = await measure("low");
ok(`Dựng hình mức Cao trong ngân sách (≤ ${BUDGET.calls} lệnh vẽ, ≤ ${BUDGET.trianglesHigh.toLocaleString()} tam giác)`, high && high.calls <= BUDGET.calls && high.triangles <= BUDGET.trianglesHigh, JSON.stringify(high));
ok(`Dựng hình mức Thấp trong ngân sách (≤ ${BUDGET.trianglesLow.toLocaleString()} tam giác) và nhẹ hơn Cao rõ rệt`, low && low.triangles <= BUDGET.trianglesLow && low.triangles < high.triangles * 0.55, JSON.stringify(low));

// ---- I3: máy chủ chết đột ngột giữa chừng → biểu ngữ → khởi động lại → tự nối lại (không tải lại trang), dữ liệu còn nguyên
async function chaos() {
  const CHAOS_PORT = process.env.VERIFY_CHAOS_PORT ?? "8812";
  const cbase = `http://127.0.0.1:${CHAOS_PORT}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-chaos-"));
  const env = {
    ...process.env,
    PORT: CHAOS_PORT,
    OFFICE_HOST: "127.0.0.1",
    OFFICE_HOME: home,
    OFFICE_DATA_DIR: path.join(home, "data"),
    OFFICE_WORKSPACE: path.join(home, "workspace"),
    OFFICE_CLIENT_DIST: path.join(root, "dist"),
    OLLAMA_HOST: `127.0.0.1:${MOCK_PORT}`,
  };
  let child = null;
  const boot = () => {
    child = spawn(process.execPath, ["--import", "tsx", path.join(root, "src", "server", "main.ts")], { cwd: root, env, stdio: "ignore" });
    return waitFor(async () => (await fetch(`${cbase}/api/health`)).ok, 60000, 500);
  };
  const kill = () =>
    new Promise((resolve) => {
      if (!child) return resolve();
      child.once("exit", resolve);
      child.kill();
      setTimeout(resolve, 6000).unref();
    });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Chaos Co", onboarded: true, idleLife: true, labels: "auto", quality: "low" })));
  const cp = await ctx.newPage();
  const uncaught = [];
  cp.on("pageerror", (e) => uncaught.push(e.message));
  const pill = (label) => cp.locator(".pill-text", { hasText: new RegExp(`^${label}$`) }).count();
  const banner = async () => (await cp.locator(".banner").count()) > 0;

  try {
    ok("Hỗn loạn: máy chủ thử khởi động", await boot());
    await cp.goto(`${cbase}/office-3d/`, { waitUntil: "networkidle" });
    ok("Hỗn loạn: ban đầu kết nối ổn (chấm 'Connected')", await waitFor(async () => (await pill("Connected")) > 0, 20000));
    await cp.locator('[role="tab"]').nth(2).click(); // tab CRM có tải định kỳ
    await cp.evaluate(() => fetch("/api/crm/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Survivor", email: "survivor@example.com" }) }));

    // --- vòng 1: chết → khởi động lại, đợi tự nối lại
    await kill();
    const sawBanner = await waitFor(async () => /Connection lost/.test((await cp.locator(".banner").first().innerText().catch(() => "")) ?? ""), 20000);
    ok("Hỗn loạn: máy chủ chết → biểu ngữ 'Connection lost' + chấm 'Offline'", sawBanner && (await pill("Offline")) > 0);
    await cp.locator('[role="tab"]').nth(1).click();
    await cp.waitForTimeout(600);
    ok("Hỗn loạn: khi mất kết nối giao diện không sập (không có thẻ lỗi dựng, vẫn đủ 5 tab)", (await cp.locator(".crash").count()) === 0 && (await cp.locator('[role="tab"]').count()) === 5);
    ok("Hỗn loạn: khởi động lại máy chủ với cùng dữ liệu", await boot());
    const healed = await waitFor(async () => !(await banner()) && (await pill("Connected")) > 0, 60000);
    ok("Hỗn loạn: giao diện tự nối lại, không cần tải lại trang (hết biểu ngữ, 'Connected')", healed);
    const survivors = await cp.evaluate(async () => (await (await fetch("/api/crm/contacts")).json()).map((c) => c.name));
    ok("Hỗn loạn: dữ liệu tạo trước khi chết vẫn còn (lưu bền)", survivors.includes("Survivor"), survivors.join(", "));
    await cp.locator('[role="tab"]').nth(2).click();
    ok("Hỗn loạn: bảng CRM tải lại được dữ liệu sau khi nối lại", await waitFor(async () => (await cp.locator(".crmkpis").count()) > 0, 15000));

    // --- vòng 2: chết lần nữa; bấm 'Retry now' phải nối lại ngay (nhanh hơn bộ đếm lùi)
    await kill();
    await waitFor(banner, 20000);
    // Các lần thử tự động thất bại làm chờ dài ra (1, 2, 4, 8, 16 s…): đợi để lần tự thử kế tiếp còn xa lúc máy chủ lên lại.
    await cp.waitForTimeout(16000);
    ok("Hỗn loạn: lần chết thứ hai → biểu ngữ trở lại", await banner());
    ok("Hỗn loạn: khởi động lại lần hai", await boot());
    const t0 = Date.now();
    const stillDown = await banner();
    // Nếu giữa chừng bộ tự thử đã kịp nối lại thì không còn nút để bấm — vẫn là hồi phục hợp lệ, chỉ không thử được đường bấm tay.
    if (stillDown) await cp.locator(".banner button").click({ timeout: 5000 }).catch(() => undefined);
    const quick = await waitFor(async () => !(await banner()), 10000, 250);
    ok("Hỗn loạn: bấm 'Retry now' (hoặc tự nối lại) hồi phục ngay (≤ 10 s)", quick, `${Date.now() - t0} ms ${stillDown ? "(đã bấm Retry now)" : "(đã tự nối lại trước khi bấm)"}`);
    ok("Hỗn loạn: suốt quá trình không có lỗi JavaScript chưa bắt", uncaught.length === 0, uncaught.slice(0, 2).join(" | "));
  } finally {
    await ctx.close();
    await kill();
    try {
      fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch {
      /* thư mục tạm; hệ điều hành sẽ dọn */
    }
  }
}
// ---- J4: giảm chuyển động — theo hệ điều hành (prefers-reduced-motion) và ép tay trong Cài đặt
async function reducedMotion() {
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await rctx.addInitScript(() => localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Calm Co", onboarded: true, idleLife: true, labels: "auto", quality: "low" })));
  const rp = await rctx.newPage();
  try {
    await rp.goto(`${base}/office-3d/`, { waitUntil: "networkidle" });
    await rp.waitForFunction(() => Boolean(window.__officeMotion), null, { timeout: 30000 });
    const calm = await rp.evaluate(() => ({ attr: document.documentElement.dataset.motion, scene: window.__officeMotion?.(), dur: getComputedStyle(document.querySelector(".dock")).transitionDuration }));
    ok("Giảm chuyển động: hệ điều hành yêu cầu giảm → trang, cảnh 3D đều giảm; chuyển tiếp CSS gần như tắt", calm.attr === "reduced" && calm.scene?.reduced === true && parseFloat(calm.dur) < 0.01, JSON.stringify(calm));
    await rp.locator("button[title]", { hasText: "⚙" }).first().click();
    await rp.waitForTimeout(700);
    await rp.getByLabel("Motion").selectOption("full");
    await rp.waitForTimeout(500);
    const forced = await rp.evaluate(() => ({ attr: document.documentElement.dataset.motion, scene: window.__officeMotion?.(), dur: getComputedStyle(document.querySelector(".dock")).transitionDuration }));
    ok("Giảm chuyển động: chọn 'Full' trong Cài đặt thắng ưu tiên của hệ điều hành (chuyển tiếp CSS trở lại)", forced.attr === "full" && forced.scene?.reduced === false && parseFloat(forced.dur) > 0.05, JSON.stringify(forced));
  } finally {
    await rctx.close();
  }
}
await reducedMotion();

// ---- L1/L2: việc đang chạy hiện ngay trong cảnh 3D — bảng việc sống ở phòng Giao việc + huy hiệu số việc mở trên bàn (LLM giả chậm để bắt được lúc đang chạy)
async function workInFlight() {
  const WPORT = process.env.VERIFY_WORK_PORT ?? "8814";
  const WMOCK = process.env.VERIFY_WORK_MOCK_PORT ?? "11442";
  const wbase = `http://127.0.0.1:${WPORT}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-work-"));
  const slowMock = spawn(process.execPath, [path.join(root, "scripts", "mock-llm.mjs")], { env: { ...process.env, MOCK_PORT: WMOCK, MOCK_DELAY_MS: "4000" }, stdio: "ignore" });
  const srv = spawn(process.execPath, ["--import", "tsx", path.join(root, "src", "server", "main.ts")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: WPORT,
      OFFICE_HOST: "127.0.0.1",
      OFFICE_HOME: home,
      OFFICE_DATA_DIR: path.join(home, "data"),
      OFFICE_WORKSPACE: path.join(home, "workspace"),
      OFFICE_CLIENT_DIST: path.join(root, "dist"),
      OLLAMA_HOST: `127.0.0.1:${WMOCK}`,
    },
    stdio: "ignore",
  });
  const stop = (child) =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      child.kill();
      setTimeout(resolve, 6000).unref();
    });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Work Co", onboarded: true, idleLife: true, labels: "auto", quality: "low" })));
  const wp = await ctx.newPage();
  const snapshot = () => wp.evaluate(() => window.__officeBoard?.());
  try {
    ok("Bảng việc: máy chủ thử (LLM giả chậm) khởi động", await waitFor(async () => (await fetch(`${wbase}/api/health`)).ok, 60000, 500));
    await wp.goto(`${wbase}/office-3d/`, { waitUntil: "networkidle" });
    ok("Bảng việc: cảnh 3D dựng xong và có móc kiểm tra", await waitFor(async () => Boolean(await snapshot()), 30000, 500));
    const empty = await snapshot();
    ok("Bảng việc: lúc đầu trống, chưa bàn nào có huy hiệu", empty.info.flows.length === 0 && empty.badges.every((b) => !b.visible), JSON.stringify(empty.info));

    // giao việc nhưng KHÔNG đợi phản hồi (kế hoạch mất vài giây vì LLM giả chậm)
    await wp.evaluate(() => {
      void fetch("/api/org/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Plan the product launch campaign and prepare a sales quote", lang: "en" }) });
    });
    const running = await waitFor(async () => (await snapshot()).info.flows[0]?.state === "running", 30000, 400);
    ok("Bảng việc: có luồng 'running' ngay khi giao việc", running);
    const mid = await snapshot();
    const flowTitle = mid.info.flows[0].title;
    // Bảng vẽ lại theo nhịp (nửa giây, và khung hình trên GPU phần mềm rất chậm) nên đợi tới khi nó thật sự hiện luồng này.
    const painted = await waitFor(async () => ((await snapshot()).painted ?? "").includes(flowTitle), 20000, 400);
    const midNow = await snapshot();
    ok("Bảng việc: bảng đã vẽ đúng luồng này (khoá nội dung chứa tiêu đề) và đếm 1 đang chạy", painted && midNow.info.running === 1, (midNow.painted ?? "").slice(0, 120));
    ok("Huy hiệu: Giám đốc (người phân việc) có huy hiệu 'open' khi việc đang mở", mid.badges.some((b) => b.visible && b.tone === "open" && b.open >= 1), JSON.stringify(mid.badges.filter((b) => b.visible)));
    const spread = await waitFor(async () => (await snapshot()).badges.filter((b) => b.visible).length >= 2 && (await snapshot()).info.flows[0].total >= 1, 40000, 500);
    const shown = (await snapshot()).badges.filter((b) => b.visible);
    ok("Huy hiệu: việc đã chia xuống cấp dưới → nhiều bàn cùng có huy hiệu, bảng có tiến độ", spread, `${shown.length} bàn: ${shown.map((b) => `${b.id.replace("agent:", "")}=${b.open}`).join(", ")}`);

    // Giám đốc chia việc cho ≥ 2 phòng → họp: có mặt Giám đốc + MỌI trưởng phòng liên quan (không sót người đến sau)
    const met = await waitFor(async () => ((await snapshot()).meeting?.attendees.length ?? 0) >= 3, 30000, 500);
    const meeting = (await snapshot()).meeting;
    ok("Họp: Giám đốc chia việc cho 2 phòng → họp với cả 2 trưởng phòng, bảng phòng họp có chủ đề", met && Boolean(meeting?.title), JSON.stringify(meeting));
    const finished = await waitFor(async () => (await snapshot()).info.flows[0]?.state === "done", 120000, 1000);
    ok("Bảng việc: luồng chuyển sang 'done' khi nghiệm thu xong", finished);
    const announced = await waitFor(async () => /Work completed:/.test(await wp.locator('[data-announcer="flows"]').innerText()), 15000, 500);
    ok("Trình đọc màn hình: vùng aria-live báo 'Work completed: …' khi luồng việc xong", announced, (await wp.locator('[data-announcer="flows"]').innerText().catch(() => "")).slice(0, 100));
    // M1: báo cáo Markdown của luồng vừa xong (tab Tổ chức, nút "Download report")
    const reportBtn = wp.locator(".flowroot button", { hasText: "Download report" }).first();
    ok("Báo cáo: luồng đã xong có nút tải báo cáo", await waitFor(async () => (await reportBtn.count()) > 0, 15000, 500));
    const [report] = await Promise.all([wp.waitForEvent("download"), reportBtn.click()]);
    const reportText = fs.readFileSync(await report.path(), "utf8");
    ok("Báo cáo: tên tệp đúng mẫu (bỏ dấu, có ngày)", /^funnyovs-report-plan-the-product-launch-campaign-and-pre-\d{4}-\d{2}-\d{2}\.md$/.test(report.suggestedFilename()), report.suggestedFilename());
    ok(
      "Báo cáo: nội dung có tiêu đề, trạng thái, tóm tắt Giám đốc và kết quả từng người (tiếng Anh)",
      /^# Plan the product launch campaign/.test(reportText) && /\*\*Status:\*\* Done/.test(reportText) && /## Director's summary/.test(reportText) && /## Results by person/.test(reportText) && /> Completed my part/.test(reportText),
      reportText.split("\n").slice(0, 6).join(" ⏎ ").slice(0, 160),
    );
    await wp.waitForTimeout(1500);
    const after = await snapshot();
    ok("Huy hiệu: hết việc thì mọi huy hiệu tắt; bảng vẫn giữ luồng vừa xong để xem kết quả", after.badges.every((b) => !b.visible) && /:done:\d+\/\d+:/.test(after.painted) && after.info.running === 0, after.painted?.slice(0, 120));
  } finally {
    await ctx.close().catch(() => undefined);
    slowMock.kill();
    await stop(srv);
    try {
      fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch {
      /* thư mục tạm; hệ điều hành sẽ dọn */
    }
  }
}
await workInFlight();

await chaos();

// ---- không có lỗi console / HTTP 5xx
ok("Không có lỗi console hoặc HTTP 5xx", errors.length === 0, errors.slice(0, 3).join(" | "));

} catch (e) {
  failed++;
  console.log(`FAIL  Kịch bản bị dừng giữa chừng — ${String(e?.message ?? e).split("\n")[0]}`);
} finally {
  await browser.close().catch(() => undefined);
  await shutdown();
}
console.log(failed ? `\n${failed} bước FAIL` : "\nTất cả PASS");
process.exit(failed ? 1 : 0);
