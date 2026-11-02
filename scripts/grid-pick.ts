/**
 * Raycast lưới điểm trên màn hình để tìm vật thể che camera.
 *
 * Chạy: npx tsx scripts/grid-pick.ts [roomId]
 */
import { chromium } from "playwright-core";

const ROOM = process.argv[2] ?? "dispatch";
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

  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
  }

  const res = await page.evaluate(`(async () => {
    const w = window;
    const scene = w.__scene, camera = w.__camera;
    scene.updateMatrixWorld(true);
    const rc = new (Object.getPrototypeOf(scene).constructor === Object ? Object : Object)();
    const THREE = w.__THREE;
    const ray = new THREE.Raycaster();
    const out = [];
    const rows = [0.15, 0.35, 0.5, 0.7, 0.9];
    for (const ry of rows) {
      const line = [];
      for (const rx of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        ray.setFromCamera(new THREE.Vector2(rx * 2 - 1, -(ry * 2 - 1)), camera);
        const hits = ray.intersectObjects(scene.children, true);
        if (!hits.length) { line.push("none"); continue; }
        const h = hits[0];
        const o = h.object;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const p = o.geometry && o.geometry.parameters ? JSON.stringify(o.geometry.parameters).slice(0, 55) : o.geometry.type;
        line.push(\`\${m.type}/\${m.color ? "#"+m.color.getHexString() : "-"}/op=\${m.opacity.toFixed(2)}/d=\${h.distance.toFixed(1)}/wp=\${wp.x.toFixed(1)},\${wp.y.toFixed(1)},\${wp.z.toFixed(1)}/\${p}\`);
      }
      out.push("y=" + ry + " :: " + line.join(" || "));
    }
    return out;
  })()`);

  for (const l of res) console.log(l, "\n");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
