/**
 * Chụp ảnh cảnh 3D để kiểm tra giao diện.
 *
 * Chạy: npx tsx scripts/screenshot.ts [phòngId] [tênFile]
 * Mặc định: chụp phòng "dispatch" (Phòng Giao việc).
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const ROOM = process.argv[2] ?? "dispatch";
const OUT = path.resolve("docs/shots", process.argv[3] ?? `${ROOM}.png`);

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack ?? ""}`));
  page.on("requestfailed", (r) => errors.push(`REQFAIL: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Nhấn nút phòng để camera tới đúng phòng cần chụp.
  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: OUT });

  // Ảnh chụp màn hình có thể đen vì WebGL không giữ buffer → chụp trực tiếp từ canvas.
  const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as
    | { dataUrl: string; diag: unknown }
    | undefined;
  if (shot?.dataUrl?.startsWith("data:image/png")) {
    fs.writeFileSync(OUT, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
    console.log("→ Đã chụp trực tiếp từ canvas WebGL.");
    console.log(`diag: ${JSON.stringify(shot.diag)}`);
  }

  const info = await page.evaluate(() => {
    const c = document.getElementById("scene") as HTMLCanvasElement | null;
    let gl = "none";
    try {
      const ctx = c?.getContext("webgl2") || c?.getContext("webgl");
      gl = ctx ? "ok" : "null";
    } catch {
      gl = "error";
    }
    return {
      canvas: c ? { w: c.width, h: c.height } : null,
      roomBtns: document.querySelectorAll(".room-btn").length,
      gl,
      renderer: (window as any).__threeInfo ?? null,
    };
  });

  console.log(`canvas: ${JSON.stringify(info.canvas)} · phòng: ${info.roomBtns}`);
  console.log(`renderer: ${JSON.stringify(info.renderer)}`);
  if (errors.length) {
    console.log("\n=== Lỗi console ===");
    for (const e of errors.slice(0, 20)) console.log("  " + e);
  } else {
    console.log("Không có lỗi console.");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
