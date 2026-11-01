/**
 * Kiểm tra vật thể nào che camera (dùng raycast từ tâm khung hình).
 *
 * Chạy: npx tsx scripts/center-pick.ts [agentId]
 */
import { chromium } from "playwright-core";

const AGENT = process.argv[2] ?? "minh";
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate((id) => (window as any).__focusAgent?.(id, 2.6), AGENT);
  await page.waitForTimeout(1500);

  const hits = (await page.evaluate(() => (window as any).__pickCenter?.())) as string[];
  console.log("Vật thể ở tâm khung hình:");
  for (const h of hits ?? []) console.log("  " + h);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
