/**
 * Phân tích vật liệu: vật liệu nào đang bị nhân bản nhiều lần?
 *
 * Chạy: npx tsx scripts/diag-materials.ts
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

  const info = (await page.evaluate(`(() => {
    const s = window.__scene;
    if (!s) return null;
    const byType = {};
    const byName = {};
    s.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        byType[m.type] = (byType[m.type] || 0) + 1;
        // Ghi nhận vật liệu nằm trong group phòng (userData.department).
        let p = o, room = null;
        while (p) { if (p.userData && p.userData.department) { room = p.userData.department; break; } p = p.parent; }
        const key = (m.type || "?") + (room ? " @room:" + room : " @scene");
        byName[key] = (byName[key] || 0) + 1;
      }
    });
    return { byType, byName };
  })()`)) as { byType: Record<string, number>; byName: Record<string, number> } | null;

  console.log("=== Theo loại vật liệu ===");
  console.log(JSON.stringify(info?.byType, null, 2));
  console.log("\n=== Theo vị trí ===");
  const entries = Object.entries(info?.byName ?? {}).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of entries.slice(0, 25)) console.log(`  ${v.toString().padStart(4)}  ${k}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
