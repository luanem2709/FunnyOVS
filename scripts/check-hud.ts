/**
 * Kiểm tra HUD bằng DOM (không cần WebGL): đọc nội dung thanh ngân sách,
 * badge trạng thái và danh sách nhân viên để xác minh token hiển thị đúng.
 *
 * Chạy: npx tsx scripts/check-hud.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const budget = document.getElementById("budget-widget");
    const rows = [...(budget?.querySelectorAll(".bar-row") ?? [])].map((r) =>
      (r as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
    );
    return {
      budgetText: (budget?.innerText ?? "").replace(/\s+/g, " ").trim(),
      rows,
      autoLine: document.getElementById("auto-line")?.textContent?.trim() ?? "(thiếu)",
    };
  });
  console.log("== Thanh ngân sách ==");
  for (const r of info.rows) console.log("  " + r);
  console.log("  " + info.autoLine);
  console.log("\n== Toàn bộ widget ==");
  console.log("  " + info.budgetText);

  // Mở panel phòng ban để xem token từng nhân viên.
  const btn = page.locator('.room-btn[data-room="dispatch"]');
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
    const panel = await page.evaluate(() => {
      const p = document.getElementById("panel");
      return (p?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
    });
    console.log("\n== Panel phòng Giao việc ==");
    console.log("  " + panel);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
