/**
 * Kiểm tra BẢN ĐÓNG GÓI (H6): chạy FunnyOVS.exe thật với thư mục dữ liệu tạm, nối vào cửa sổ bằng CDP (remote debugging),
 * rồi kiểm tra server nội bộ, trang /office-3d/, API, và các thư viện chạy lười (nodemailer, imapflow) có mặt trong bản cài.
 *
 *   npm run desktop:dir              # tạo release/win-unpacked (hoặc đặt FUNNY_EXE tới tệp .exe khác, kể cả bản portable)
 *   node scripts/verify-desktop.mjs
 *
 * Không đụng dữ liệu thật: dùng --user-data-dir riêng nên cũng không vướng bản đang chạy của bạn (khoá một phiên bản).
 */
import { chromium } from "playwright-core";
import { spawn, execSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.env.FUNNY_EXE ?? path.join(root, "release", "win-unpacked", "FunnyOVS.exe");
const cdpPort = Number(process.env.VERIFY_CDP_PORT ?? 9333);
if (!fs.existsSync(exe)) {
  console.error(`Không thấy ${exe} — chạy "npm run desktop:dir" trước.`);
  process.exit(2);
}

let failed = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
};

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-desktop-"));
const app = spawn(exe, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userData}`], { stdio: "ignore" });
let exited = false;
app.once("exit", () => (exited = true));

async function stopApp() {
  if (!exited) {
    try {
      // Cả cây tiến trình (Electron + server con) — Windows không tự dọn con khi cha bị giết.
      execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" });
    } catch {
      app.kill();
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
  } catch {
    /* thư mục tạm */
  }
}

try {
  // Chờ CDP sẵn sàng.
  let browser;
  for (let i = 0; i < 80 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  ok("Ứng dụng khởi động và mở cổng gỡ lỗi", Boolean(browser));
  if (!browser) throw new Error("không nối được CDP");

  let page;
  for (let i = 0; i < 80 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+/.test(p.url()));
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  ok("Cửa sổ chính đã tải trang từ server nội bộ", Boolean(page), page?.url() ?? "");
  if (!page) throw new Error("không thấy cửa sổ");
  const origin = new URL(page.url()).origin;

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  const get = async (p) => page.evaluate(async (u) => (await fetch(u)).json(), `${origin}${p}`);
  const health = await get("/api/health");
  ok("GET /api/health: DB ổn, có phiên bản", health.ok === true && /^\d+\.\d+\.\d+$/.test(health.version), `v${health.version}, ${health.memoryMb} MB`);
  ok("Server chỉ nghe loopback (không bật LAN)", health.lan === false);
  const ai = await get("/api/ai/status");
  ok("GET /api/ai/status: đủ 10 nguồn dựng sẵn, không lộ khoá", ai.providers.length >= 10 && !JSON.stringify(ai).match(/gsk_|sk-[A-Za-z0-9]{10}/));
  const mail = await get("/api/mail/config");
  ok("GET /api/mail/config: không có mật khẩu", mail.smtpPassSet === false && !("smtpPass" in mail));
  const crm = await get("/api/crm/summary");
  ok("GET /api/crm/summary: SQLite chạy trong bản đóng gói (better-sqlite3 đã build cho Electron)", crm.contacts === 0);

  const backup = await get("/api/backup");
  ok("GET /api/backup: tệp sao lưu hợp lệ và KHÔNG chứa khoá/mật khẩu", backup.app === "FunnyOVS" && backup.version === 1 && Array.isArray(backup.org) && !/password|apiKey|smtpPass|secret/i.test(JSON.stringify(backup).replace(/"(?:secretsFile|passwordSet)"/g, "")), `${Object.keys(backup).join(",")}`);
  const audit = await get("/api/audit");
  ok("GET /api/audit: nhật ký bảo mật có mục xuất sao lưu vừa tạo", Array.isArray(audit) && audit.some((e) => e.kind === "backup.export"), `${audit.length} mục`);
  const schedules = await get("/api/schedules");
  ok("GET /api/schedules: danh sách việc lặp lại (rỗng lúc đầu)", Array.isArray(schedules) && schedules.length === 0);

  // Giao diện hợp nhất.
  await page.evaluate(() => localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: "en", companyName: "Desktop Verify", onboarded: true, idleLife: true, labels: "auto", quality: "low" })));
  await page.goto(`${origin}/office-3d/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  ok("/office-3d/ tải được, có tiêu đề công ty", /Desktop Verify/.test(await page.locator(".brand .company").innerText()));
  ok("Có canvas 3D (WebGL chạy trong Electron)", (await page.locator("canvas").count()) > 0);
  // đợi React gắn xong (lang đặt trong effect, vùng aria-live dựng sau khi tải cài đặt): cố định 3,5 s đôi khi chưa đủ lúc máy bận → đo trước khi kết luận, không đổi điều kiện đạt
  await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector('[data-announcer="approvals"]') && document.querySelector('[data-announcer="flows"]'), null, { timeout: 15000 }).catch(() => {});
  ok("Trang khai báo lang theo ngôn ngữ đang chọn và có vùng aria-live cho yêu cầu duyệt + luồng việc", (await page.evaluate(() => document.documentElement.lang)) === "en" && (await page.locator('[data-announcer="approvals"][aria-live="assertive"]').count()) === 1 && (await page.locator('[data-announcer="flows"][aria-live="polite"]').count()) === 1);
  const board = await page.evaluate(() => window.__officeBoard?.());
  ok("Bảng việc sống và huy hiệu trên bàn có mặt trong cảnh (17 người, chưa có việc nào mở)", Boolean(board) && board.badges.length >= 17 && board.badges.every((b) => !b.visible) && board.info.flows.length === 0, board ? `${board.badges.length} bàn` : "không có móc");
  if ((await page.locator('[role="tab"]').count()) === 0) await page.locator(".dock-toggle").click();
  await page.locator('[role="tab"]').nth(1).click();
  await page.waitForTimeout(1500);
  ok("Tab AI hiện danh sách nhà cung cấp", (await page.locator(".aicard").count()) >= 9);
  await page.locator('[role="tab"]').nth(2).click();
  await page.waitForTimeout(800);
  ok("Tab CRM hiện pipeline", (await page.locator(".crmpanel .stagebars li").count()) === 6);
  await page.locator("button.icon", { hasText: "⚙" }).click();
  await page.waitForTimeout(800);
  ok("Cài đặt có mục LAN/Email/GitHub", (await page.locator(".setsection").count()) >= 3);
  await page.keyboard.press("Escape");
  ok("Có nút khởi động lại (cầu nối Electron) để áp dụng LAN", await page.evaluate(() => typeof window.funnyDesktop?.restart === "function"));

  // Thư viện chạy lười có trong bản cài.
  const resources = path.join(path.dirname(exe), "resources", "app", "node_modules");
  for (const pkg of ["better-sqlite3", "nodemailer", "imapflow", "playwright-core"]) {
    ok(`Bản cài có thư viện ${pkg}`, fs.existsSync(path.join(resources, pkg, "package.json")));
  }
  // Nạp thật nodemailer + imapflow bằng chính Node nhúng trong Electron (ELECTRON_RUN_AS_NODE), từ thư mục bản cài như server.mjs.
  try {
    const out = execFileSync(
      exe,
      ["--input-type=module", "-e", "const [a, b] = await Promise.all([import('nodemailer'), import('imapflow')]); console.log(typeof (a.createTransport ?? a.default?.createTransport) + ':' + typeof b.ImapFlow);"],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, cwd: path.join(path.dirname(exe), "resources", "app"), encoding: "utf8", timeout: 30000 },
    ).trim();
    ok("nodemailer và imapflow nạp được trong bản cài (email thật chạy được)", out === "function:function", out);
  } catch (e) {
    ok("nodemailer và imapflow nạp được trong bản cài (email thật chạy được)", false, e instanceof Error ? e.message.slice(0, 160) : String(e));
  }
  // Studio: kit + three đi kèm bản cài và kết xuất THẬT chạy được (Chrome + playwright-core, tiến trình con bằng ELECTRON_RUN_AS_NODE).
  const studioRoot = path.join(path.dirname(exe), "resources", "app", "studio");
  ok("Bản cài có Studio kit (mã dựng + dữ liệu mẫu) và three tối thiểu", ["roblox-clip/render.mjs", "roblox-clip/scene.js", "roblox-clip/shots.json", "roblox-clip/synth.py", "vendor/three/build/three.module.js", "vendor/three/build/three.core.js", "vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js"].every((f) => fs.existsSync(path.join(studioRoot, f))));
  const studioState0 = await get("/api/studio/state");
  ok("GET /api/studio/state: Studio chạy trong bản đóng gói và dò được công cụ ngoài", Array.isArray(studioState0.jobs) && studioState0.tools && typeof studioState0.tools.chrome === "boolean", JSON.stringify(studioState0.tools));
  if (studioState0.tools?.chrome) {
    const post = (p, body) => page.evaluate(async ([u, b]) => (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json(), [`${origin}${p}`, body]);
    await post("/api/studio/projects", { project: "desktop-verify" });
    const started = await post("/api/studio/render", { project: "desktop-verify", preview: true });
    let job = started.job;
    for (let i = 0; i < 180 && job && !["done", "failed", "cancelled"].includes(job.status); i++) {
      await new Promise((r) => setTimeout(r, 500));
      job = (await get("/api/studio/state")).jobs.find((j) => j.id === started.job.id);
    }
    ok("Studio: 'xem thử' chạy thật trong bản đóng gói → xong, 10 ảnh", job?.status === "done" && job.previewCount === 10, job ? `${job.status}${job.error ? ` ${job.error.key} ${job.error.detail ?? ""}`.slice(0, 160) : ""}` : "không có việc");
    const still = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength }; }, `${origin}/api/studio/projects/desktop-verify/preview/4`);
    ok("Studio: ảnh xem thử tải được qua REST (JPEG có nội dung)", still.status === 200 && /jpeg/.test(still.type ?? "") && still.size > 5000, `${still.size} byte`);
  }
  ok("Không có lỗi console", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
} catch (e) {
  ok("Chạy kiểm tra bản đóng gói", false, e instanceof Error ? e.message : String(e));
} finally {
  await stopApp();
}
console.log(failed ? `\n${failed} bước FAIL` : "\nTất cả PASS");
process.exit(failed ? 1 : 0);
