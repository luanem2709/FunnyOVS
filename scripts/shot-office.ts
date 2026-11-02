/**
 * Chụp ảnh toàn cảnh văn phòng 3D (không đọc canvas → dùng page.screenshot).
 *
 * Chạy: npx tsx scripts/shot-office.ts [out.png]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const OUT = path.resolve("docs/shots", process.argv[2] ?? "office-live.png");
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERR:", m.text());
  });

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  // Kéo camera lên cao để thấy toàn bộ văn phòng.
  await page.evaluate(() => {
    const w = window as any;
    w.__setCamera?.(0, 0, 78, 0.85, 0);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT });
  console.log("→", OUT);

  const info = await page.evaluate(() => {
    const w = window as any;
    const agents = w.__agents;
    const cam = w.__camera;
    const out: any[] = [];
    if (agents) {
      for (const [id, rec] of agents) {
        out.push({
          id,
          status: rec.state.status,
          task: rec.state.task ?? null,
          tokens: rec.state.tokensUsed,
          tasks: rec.state.tasksDone,
          pos: { x: +rec.visual.root.position.x.toFixed(2), z: +rec.visual.root.position.z.toFixed(2) },
          phase: rec.walker?.phase ?? null,
        });
      }
    }
    const budgetText = document.getElementById("budget-widget")?.textContent?.trim() ?? "";
    const rooms = w.__rooms;
    const roomInfo: any[] = [];
    if (rooms) {
      for (const [id, d] of rooms) {
        roomInfo.push({ id, visible: d.group?.visible ?? null, agents: d.agents?.length ?? 0 });
      }
    }
    const focus = w.__focusManager?.current ?? null;
    return {
      camera: cam ? { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1) } : null,
      roomInfo,
      focus,
      agents: out,
      budgetText,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
