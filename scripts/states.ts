/**
 * Chụp ảnh nhân vật ở từng trạng thái agent để kiểm chứng animation.
 *
 * Chạy: npx tsx scripts/states.ts
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const OUT_DIR = path.resolve("docs/shots");
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/** Trạng thái agent → pose chibi tương ứng (xem assets/chibi.ts). */
const STATES = [
  { status: "idle", anim: "idle" },
  { status: "working", anim: "type" },
  { status: "researching", anim: "read" },
  { status: "waiting", anim: "wave" },
  { status: "blocked", anim: "sweat" },
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  for (const s of STATES) {
    await page.evaluate(
      ([status, anim]) => {
        const w = window as any;
        const rec = w.__agents?.get("minh");
        if (rec) {
          rec.state.status = status;
          w.__applyStatus?.(rec.state);
          rec.visual.chibi && (rec.visual.chibi.anim = anim);
        }
        w.__focusAgent?.("minh", 2.6);
      },
      [s.status, s.anim],
    );
    await page.waitForTimeout(1500);

    const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as
      | { dataUrl: string }
      | undefined;
    if (!shot?.dataUrl) continue;
    const file = path.join(OUT_DIR, `state-${s.status}.png`);
    fs.writeFileSync(file, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
    console.log(`→ ${path.relative(process.cwd(), file)}`);
  }

  if (errors.length) console.log("Lỗi: " + errors.join("; "));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
