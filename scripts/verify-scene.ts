/**
 * Kiểm tra nội dung cảnh 3D bằng phân tích pixel (không phụ thuộc xem ảnh).
 *
 * Chạy: npx tsx scripts/verify-scene.ts [phòngId]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const ROOM = process.argv[2] ?? "dispatch";
const OUT = path.resolve("docs/shots", `verify-${ROOM}.png`);
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

interface Capture {
  dataUrl: string;
  diag: unknown;
}

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
  }

  const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as Capture | undefined;
  if (!shot?.dataUrl) {
    console.log("Không lấy được frame.");
    await browser.close();
    return;
  }
  fs.writeFileSync(OUT, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
  console.log(`→ ${path.relative(process.cwd(), OUT)}`);
  console.log(`diag: ${JSON.stringify(shot.diag)}`);

  // Phân tích pixel bằng sharp-free cách: dùng canvas trong trang để đếm màu.
  const stats = await page.evaluate(async () => {
    const c = document.getElementById("scene") as HTMLCanvasElement;
    const off = document.createElement("canvas");
    off.width = 400;
    off.height = 225;
    const g = off.getContext("2d")!;
    g.drawImage(c, 0, 0, off.width, off.height);
    const d = g.getImageData(0, 0, off.width, off.height).data;
    const buckets = new Map<string, number>();
    let dark = 0;
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx < 60) dark++;
      if (mx - mn > 45) colored++;
      const key = `${r >> 5}_${gg >> 5}_${b >> 5}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const total = d.length / 4;
    const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      total,
      darkPct: +((dark / total) * 100).toFixed(1),
      coloredPct: +((colored / total) * 100).toFixed(1),
      distinctColors: buckets.size,
      top: top.map(([k, v]) => `${k}=${((v / total) * 100).toFixed(1)}%`),
    };
  });

  console.log(`\nPhân tích pixel:`);
  console.log(`  pixel tối (<60):     ${stats.darkPct}%`);
  console.log(`  pixel có màu rõ:     ${stats.coloredPct}%`);
  console.log(`  số màu phân biệt:    ${stats.distinctColors}`);
  console.log(`  màu chiếm nhiều:     ${stats.top.join(", ")}`);
  if (errors.length) console.log("\nLỗi: " + errors.join("; "));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
