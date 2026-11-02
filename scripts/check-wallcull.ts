/**
 * Kiểm tra cơ chế cắt tường: tường nào đang mờ, tại sao không mờ.
 *
 * Chạy: npx tsx scripts/check-wallcull.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__focusAgent("minh", 4.5));
  await page.waitForTimeout(1500);

  const res = await page.evaluate(`(async () => {
    const w = window;
    const THREE = w.__THREE;
    const scene = w.__scene, camera = w.__camera;
    const walls = [];
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.opacity !== undefined && o.geometry.type === "BoxGeometry") {
        const p = o.geometry.parameters;
        if (p.depth === 0.16 || p.width === 0.16) {
          const wp = new THREE.Vector3();
          o.getWorldPosition(wp);
          walls.push({ op: +o.material.opacity.toFixed(3), vis: o.visible, wp: [wp.x, wp.y, wp.z] });
        }
      }
    });
    // Ray thẳng từ camera tới tâm phòng dispatch
    const ray = new THREE.Raycaster();
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const tgt = new THREE.Vector3(0, 1, 0);
    const dir = tgt.clone().sub(camPos);
    const d = dir.length();
    dir.normalize();
    ray.set(camPos, dir);
    ray.camera = camera;
    ray.far = d - 0.05;
    const hits = ray.intersectObjects(scene.children, true);
    return {
      camPos: camPos.toArray().map((v) => +v.toFixed(2)),
      distToTarget: +d.toFixed(2),
      wallCount: walls.length,
      fadedWalls: walls.filter((x) => x.op < 0.9).length,
      walls: walls.slice(0, 20),
      rayHits: hits.slice(0, 6).map((h) => {
        const p = h.object.geometry.parameters;
        const wp = new THREE.Vector3(); h.object.getWorldPosition(wp);
        return { d: +h.distance.toFixed(2), wp: wp.toArray().map((v)=>+v.toFixed(1)), params: JSON.stringify(p).slice(0,60) };
      }),
    };
  })()`);

  console.log(JSON.stringify(res, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
