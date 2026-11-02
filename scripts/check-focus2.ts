/**
 * Raycast sau khi bật focus mode để xem thực sự nhìn thấy gì.
 *
 * Chạy: npx tsx scripts/check-focus2.ts
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
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.camera = camera;
    const rows = [];
    for (const ry of [0.3, 0.5, 0.7]) {
      const cells = [];
      for (const rx of [0.3, 0.5, 0.7]) {
        ray.setFromCamera(new THREE.Vector2(rx*2-1, -(ry*2-1)), camera);
        const hits = ray.intersectObjects(scene.children, true);
        if (!hits.length) { cells.push("none"); continue; }
        const h = hits[0];
        const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
        const wp = new THREE.Vector3(); h.object.getWorldPosition(wp);
        cells.push(\`\${m.type}/\${m.color?"#"+m.color.getHexString():"-"}/op=\${m.opacity.toFixed(2)}/vis=\${h.object.visible}/d=\${h.distance.toFixed(1)}/wp=\${wp.x.toFixed(1)},\${wp.y.toFixed(1)},\${wp.z.toFixed(1)}\`);
      }
      rows.push("y="+ry+" :: "+cells.join(" || "));
    }
    return { rows, cam: camera.position.toArray().map(v=>+v.toFixed(1)) };
  })()`);

  console.log("camera:", res.cam);
  for (const r of res.rows) console.log(r, "\n");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
