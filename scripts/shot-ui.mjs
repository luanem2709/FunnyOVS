/**
 * Chụp ảnh độ phân giải cao giao diện hợp nhất (/office-3d/) bằng Chrome có sẵn + playwright-core.
 * Dùng với máy chủ cách ly (scripts/preview-server.mjs) để không đụng dữ liệu thật.
 *
 *   node scripts/shot-ui.mjs --out docs/shots/ai-tab.png --tab ai --lang en --width 1440 --height 900
 *
 * Tuỳ chọn:
 *   --url <url>      (mặc định http://127.0.0.1:8799/office-3d/)
 *   --tab <org|ai|crm|log|overview>   mở tab này ở bảng bên trái
 *   --settings       mở hộp Cài đặt (kèm --section network|email|github để cuộn tới mục đó)
 *   --room <chữ>     bấm nút điều hướng phòng có chữ này (vd. Meeting, Pantry, Lobby) để camera bay tới đó
 *   --assign <chữ>   giao việc cho Giám đốc qua REST ngay sau khi tải (xem họp/phản ứng); kèm --after <ms> để chờ rồi mới chụp
 *   --collapse       thu gọn bảng bên trái để thấy rõ cảnh
 *   --cam yaw,pitch,dist,x,z   đặt camera trực tiếp (vd. 0.3,0.25,3.2,0,0.4 để cận cảnh một nhân vật)
 *   --hour N         giả lập giờ trong ngày (0-24) để xem cảnh ban đêm
 *   --dist N         khoảng cách camera (cuộn chuột) sau khi bay tới phòng; --lang <vi|en> --width N --height N --wait ms
 * Biến môi trường: CHROME_PATH để đổi đường dẫn Chrome.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

const hour = arg("hour", "");
const url = arg("url", "http://127.0.0.1:8799/office-3d/") + (hour ? `?hour=${hour}` : "");
const out = path.resolve(String(arg("out", "docs/shots/ui.png")));
const lang = arg("lang", "en");
const width = Number(arg("width", 1440));
const height = Number(arg("height", 900));
const tab = arg("tab", "");
const wait = Number(arg("wait", 2500));
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ executablePath, args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
// Bỏ qua hướng dẫn lần đầu và đặt ngôn ngữ trước khi trang chạy.
await context.addInitScript(
  ([l]) => {
    localStorage.setItem("funnyovs.office3d.settings.v1", JSON.stringify({ lang: l, companyName: "FunnyOVS Corp", onboarded: true, idleLife: true, labels: "auto", quality: "low" }));
  },
  [lang],
);
const page = await context.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(wait);
if (tab) {
  // Màn hình hẹp: bảng bên trái mặc định đóng — mở ra trước.
  if ((await page.locator('[role="tab"]').count()) === 0) {
    await page.locator(".dock-toggle").click();
    await page.waitForTimeout(500);
  }
  const names = { org: 0, ai: 1, crm: 2, log: 3, overview: 4 };
  await page.locator('[role="tab"]').nth(names[tab] ?? 0).click();
  await page.waitForTimeout(800);
}
const assign = arg("assign", "");
if (assign) {
  await page.evaluate(
    (prompt) => fetch("/api/org/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, lang: "en" }) }),
    String(assign),
  );
  await page.waitForTimeout(Number(arg("after", 12000)));
}
if (arg("collapse", false)) {
  await page.locator(".dock-toggle").click();
  await page.waitForTimeout(400);
}
const room = arg("room", "");
if (room) {
  await page.locator(".roomnav button").filter({ hasText: String(room) }).first().click();
  await page.waitForTimeout(1800);
  const dist = Number(arg("dist", 0));
  if (dist) {
    // Cuộn chuột trên canvas để đổi khoảng cách camera.
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, dist);
    await page.waitForTimeout(600);
  }
}
const cam = arg("cam", "");
if (cam) {
  const [yaw, pitch, dist, x, z] = String(cam).split(",").map(Number);
  await page.evaluate(
    ([yaw, pitch, dist, x, z]) => {
      const c = window.__officeCam;
      c.yaw = yaw;
      c.pitch = pitch;
      c.dist = dist;
      c.goal.set(x, 1.1, z);
      c.target.set(x, 1.1, z);
    },
    [yaw, pitch, dist, x, z],
  );
  await page.waitForTimeout(800);
}
if (arg("settings", false)) {
  await page.locator('button[aria-label][title]').filter({ hasText: "⚙" }).first().click();
  await page.waitForTimeout(800);
  const section = arg("section", "");
  if (section) {
    await page.locator(`[data-section="${section}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
}
await page.screenshot({ path: out });
console.log(`đã lưu ${out}`);
if (problems.length) console.log(`CẢNH BÁO (${problems.length}):\n` + problems.slice(0, 12).join("\n"));
await browser.close();
