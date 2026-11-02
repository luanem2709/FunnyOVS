/**
 * Kiểm tra HUD bằng DOM (không cần WebGL): đọc nội dung thanh ngân sách,
 * các bảng chi tiêu và badge trạng thái để xác minh số liệu hiển thị đúng.
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

  // Tab "Tác vụ & chi tiêu" — bảng chi tiêu token.
  await page.locator('.tab[data-panel="tasks"]').click();
  await page.waitForTimeout(2500);
  const tasks = await page.evaluate(() => {
    const p = document.getElementById("panel");
    return (p?.innerText ?? "").replace(/\s+/g, " ").trim();
  });
  console.log("\n== Tab Tác vụ & nhật ký chi tiêu ==");
  console.log("  " + tasks.slice(0, 900));

  // Panel phòng ban.
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
