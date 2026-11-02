/**
 * Chụp ảnh bằng page.screenshot (không đọc canvas) + điều khiển camera.
 *
 * Chạy: npx tsx scripts/shot2.ts [roomId] [out.png]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const ROOM = process.argv[2] ?? "dispatch";
const OUT = path.resolve("docs/shots", process.argv[3] ?? `shot2-${ROOM}.png`);
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERR:", m.text());
  });

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
  }

  // Chụp bằng page.screenshot — không qua canvas.
  await page.screenshot({ path: OUT });
  console.log("→", OUT);

  const info = await page.evaluate(() => {
    const w = window as any;
    return {
      camera: w.__camera?.position.toArray(),
      rooms: [...(w.__rooms?.values?.() ?? [])].map((d: any) => ({
        id: d.id,
        center: d.center,
        size: d.size,
        agents: d.agents?.length,
      })),
    };
  });
  console.log(JSON.stringify(info, null, 2).slice(0, 4000));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
