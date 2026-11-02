/**
 * Kiểm tra hệ thống đi lại của nhân viên.
 *
 * Chạy: npx tsx scripts/check-walk.ts
 *
 * Script này:
 *   1. Mở trang, ép mọi nhân viên đi ngay.
 *   2. Theo dõi vị trí/phase của họ trong vài giây.
 *   3. In báo cáo: ai đi, từ đâu tới đâu.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.resolve("docs/shots");

interface WalkerInfo {
  id: string;
  phase: string;
  x: number;
  z: number;
  target: string | null;
  pathLen: number;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const before = (await page.evaluate(() => (window as any).__walkerInfo())) as WalkerInfo[];
  console.log(`=== TRUOC KHI DI (${before.length} nhan vien) ===`);
  for (const w of before) console.log(`  ${w.id}: ${w.phase} @ (${w.x}, ${w.z})`);

  // Ép đi ngay.
  await page.evaluate(() => (window as any).__forceWalk());
  await page.waitForTimeout(1200);

  const samples: WalkerInfo[][] = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    samples.push(
      (await page.evaluate(() => (window as any).__walkerInfo())) as WalkerInfo[],
    );
  }

  console.log("\n=== THEO DOI 10 GAY ===");
  for (const w of before) {
    const trail = samples.map((s) => s.find((x) => x.id === w.id)).filter(Boolean);
    const phases = [...new Set(trail.map((t) => t!.phase))];
    const moved = Math.hypot(
      trail[trail.length - 1]!.x - trail[0]!.x,
      trail[trail.length - 1]!.z - trail[0]!.z,
    );
    const kinds = [...new Set(trail.map((t) => t!.target).filter(Boolean))];
    console.log(
      `  ${w.id}: ${phases.join(" -> ")} | dich chuyen ${moved.toFixed(2)}m | dich: ${kinds.join(",") || "-"}`,
    );
  }

  const walking = samples.some((s) => s.some((w) => w.phase === "walking"));
  const acting = samples.some((s) => s.some((w) => w.phase === "acting"));
  console.log(`\nCo nguoi dang di: ${walking ? "CO ✓" : "KHONG ✗"}`);
  console.log(`Co nguoi dang nghi o cho den: ${acting ? "CO ✓" : "KHONG ✗"}`);

  // Chụp ảnh toàn cảnh.
  const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as
    | { dataUrl: string }
    | undefined;
  if (shot?.dataUrl?.startsWith("data:image/png")) {
    fs.writeFileSync(path.join(OUT, "walk-check.png"), Buffer.from(shot.dataUrl.split(",")[1], "base64"));
    console.log("→ Đã lưu docs/shots/walk-check.png");
  }

  if (errors.length) {
    console.log("\n=== Loi ===");
    for (const e of errors.slice(0, 10)) console.log("  " + e);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
