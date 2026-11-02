/**
 * Chụp ảnh cảnh với các tường đã ẩn hoàn toàn — để kiểm chứng nội dung
 * (bàn, nhân vật) có thật sự nằm đúng chỗ không.
 *
 * Chạy: npx tsx scripts/nowalls.ts [roomId]
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const ROOM = process.argv[2] ?? "dispatch";
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
  }

  const dataUrl = (await page.evaluate(`(() => {
    const w = window;
    const scene = w.__scene;
    let hidden = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === "BoxGeometry") {
        const p = o.geometry.parameters;
        if ((p.depth === 0.16 && p.height === 3.2) || (p.width === 0.16 && p.height === 3.2)) {
          o.visible = false;
          hidden++;
        }
      }
    });
    w.__pipeline.render(1/60);
    return JSON.stringify({ hidden, url: document.getElementById("scene").toDataURL("image/png") });
  })()`)) as string;

  const parsed = JSON.parse(dataUrl);
  const out = path.resolve("docs/shots", `nowalls-${ROOM}.png`);
  fs.writeFileSync(out, Buffer.from(parsed.url.split(",")[1], "base64"));
  console.log("→", out, "ẩn", parsed.hidden, "tường");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
