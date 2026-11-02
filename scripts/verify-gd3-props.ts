/**
 * Chụp cận cảnh để kiểm chứng đồ đạc GĐ 3:
 *  - Kệ sách cao phòng Thư viện
 *  - Biểu đồ tường phòng Tài chính (dữ liệu thật)
 *  - Tủ server phòng Đội AI
 *
 * Chạy: npx tsx scripts/verify-gd3-props.ts
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const OUT_DIR = path.resolve("docs/shots");
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE ERR: " + m.text());
  });

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);

  // Kệ sách Thư viện: nhìn thẳng vào kệ bên trái.
  await page.evaluate(() => {
    const w = window as any;
    const d = w.__rooms?.get("library");
    if (!d) return;
    w.__focusManager?.focus("library");
    // Kệ trái nằm ở x = -0.28*roomW, z = -0.34*roomD (tương đối tâm phòng).
    w.__setCamera(-2.5, -22.0, 3.4, 0.10, 0.0);
  });
  await page.waitForTimeout(1200);
  const camAfter = await page.evaluate(() => {
    const w = window as any;
    const c = w.__camera;
    return {
      pos: c ? [+c.position.x.toFixed(2), +c.position.y.toFixed(2), +c.position.z.toFixed(2)] : null,
      center: w.__pickCenter ? w.__pickCenter() : null,
    };
  });
  console.log("cam sau khi set:", JSON.stringify(camAfter));
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-shelves.png") });

  // Biểu đồ tường Tài chính: nhìn thẳng vào tường sau.
  await page.evaluate(() => {
    const w = window as any;
    const d = w.__rooms?.get("finance");
    if (!d) return;
    w.__focusManager?.focus("finance");
    w.__setCamera(d.center.x, d.center.z + 3.2, 4.6, 0.28, 0);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-finance-chart.png") });

  // Tủ server Đội AI.
  await page.evaluate(() => {
    const w = window as any;
    const d = w.__rooms?.get("ai-team");
    if (!d) return;
    w.__focusManager?.focus("ai-team");
    w.__setCamera(d.center.x + 2.4, d.center.z - 4.2, 4.2, 0.34, 0.3);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-ai-servers.png") });

  // Trạng thái cuối.
  const state = await page.evaluate(() => {
    const w = window as any;
    return {
      spends: w.__rooms
        ? [...w.__rooms.values()].map((d: any) => ({ id: d.id, tokens: d.spend?.tokens ?? 0 }))
        : [],
    };
  });

  console.log(JSON.stringify({ state, errors }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
