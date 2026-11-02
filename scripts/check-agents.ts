/**
 * Kiểm tra nhân vật có hiển thị và nằm đúng chỗ không.
 *
 * Chạy: npx tsx scripts/check-agents.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.locator('.room-btn[data-room="dispatch"]').click();
  await page.waitForTimeout(3000);

  const res = await page.evaluate(`(() => {
    const w = window;
    const THREE = w.__THREE;
    const scene = w.__scene, camera = w.__camera;
    const agents = w.__agents;
    const out = [];
    for (const [id, rec] of agents) {
      const root = rec.visual.root;
      const p = root.position;
      // Đưa vị trí nhân vật lên màn hình
      const proj = p.clone().setY(1.0).project(camera);
      // Đếm mesh con nhìn thấy
      let meshes = 0, visible = 0;
      root.traverse((o) => { if (o.isMesh) { meshes++; if (o.visible) visible++; } });
      out.push({
        id, dept: rec.state.department,
        pos: [p.x, p.z],
        screen: [+proj.x.toFixed(2), +proj.y.toFixed(2)],
        inView: Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1,
        rootVisible: root.visible,
        meshes, visible,
      });
    }
    return out;
  })()`);

  for (const a of res) {
    console.log(
      `${a.id.padEnd(6)} ${a.dept.padEnd(11)} pos=(${a.pos[0]},${a.pos[1]}) screen=(${a.screen[0]},${a.screen[1]}) inView=${a.inView} rootVis=${a.rootVisible} meshes=${a.visible}/${a.meshes}`,
    );
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
