/**
 * Chẩn đoán lưới điều hướng: vì sao nhân viên không đi được?
 *
 * Chạy: npx tsx scripts/diag-nav.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const info = (await page.evaluate(() => (window as any).__navDebug())) as {
    id: string;
    home: { x: number; z: number };
    results: { kind: string; room: string; ok: boolean; len: number }[];
  }[];

  for (const a of info) {
    const okCount = a.results.filter((r) => r.ok).length;
    console.log(`\n${a.id} @ (${a.home.x}, ${a.home.z}) — ${okCount}/${a.results.length} điểm tới được`);
    for (const r of a.results) {
      console.log(`   ${r.ok ? "✓" : "✗"} ${r.kind} (${r.room}) len=${r.len}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
