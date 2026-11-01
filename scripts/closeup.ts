/**
 * Chụp cận cảnh một agent để kiểm tra nhân vật 3D.
 *
 * Chạy: npx tsx scripts/closeup.ts [agentId] [khoảngCách]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const AGENT = process.argv[2] ?? "minh";
const DIST = Number(process.argv[3] ?? 3.0);
const OUT = path.resolve("docs/shots", `closeup-${AGENT}.png`);
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  await page.evaluate(
    ([id, d]) => (window as any).__focusAgent(id as string, d as number),
    [AGENT, DIST],
  );
  await page.waitForTimeout(2000);

  const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as
    | { dataUrl: string; diag: any }
    | undefined;
  if (!shot?.dataUrl) {
    console.log("Không lấy được frame.");
    await browser.close();
    return;
  }
  fs.writeFileSync(OUT, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
  console.log(`→ ${path.relative(process.cwd(), OUT)}`);
  console.log(`agent: ${JSON.stringify(shot.diag.agents)}`);
  console.log(`camera: ${JSON.stringify(shot.diag.camera)} calls=${shot.diag.calls}`);
  if (errors.length) console.log("Lỗi: " + errors.join("; "));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
