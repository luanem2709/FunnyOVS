/**
 * Chụp ảnh kiểm tra nhãn 3D (billboard) — nhãn phòng + nhãn nhân vật.
 *
 * Chạy: npx tsx scripts/check-labels.ts
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.resolve("docs/shots");

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  // 1) Cận cảnh nhân vật → phải thấy nhãn tên + trạng thái.
  await page.evaluate(() => (window as any).__focusAgent?.("minh", 4.2));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, "gd1-label-agent.png") });

  // 2) Góc phòng → phải thấy nhãn phòng.
  await page.evaluate(() => {
    const w = window as any;
    w.__setCamera?.(0, 0, 11, 0.35, 0);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, "gd1-label-room.png") });

  // Trạng thái nhãn trong DOM/scene.
  const diag = await page.evaluate(() => {
    const w = window as any;
    const out: any[] = [];
    for (const [id, rec] of w.__agents ?? []) {
      const sp = rec.label?.sprite;
      out.push({
        id,
        name: rec.state.name,
        status: rec.state.status,
        visible: sp?.visible ?? null,
        scale: sp ? [+sp.scale.x.toFixed(2), +sp.scale.y.toFixed(2)] : null,
      });
    }
    return { agents: out, errors: [] };
  });
  console.log(JSON.stringify(diag, null, 2));
  if (errors.length) console.log("Lỗi trang:", errors.join("; "));
  console.log("→ docs/shots/gd1-label-agent.png, gd1-label-room.png");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
