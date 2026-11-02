/**
 * Chẩn đoán cảnh: liệt kê đối tượng, vị trí camera, mẫu màu điểm ảnh.
 *
 * Chạy: npx tsx scripts/diag-scene.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const w = window as any;
    const info = w.__threeInfo;
    const diag = w.__captureFrame?.().diag;
    // Liệt kê các mesh có vị trí trong không gian
    const scene = w.__scene;
    let meshes: any[] = [];
    if (scene) {
      scene.traverse((o: any) => {
        if (o.isMesh && o.geometry) {
          o.updateWorldMatrix(true, false);
          const p = new (o.position.constructor as any)();
          o.getWorldPosition(p);
          meshes.push({
            name: o.name || o.type,
            mat: o.material?.type,
            p: [p.x, p.y, p.z],
            vis: o.visible,
          });
        }
      });
    }
    return {
      info,
      diag,
      hasScene: !!scene,
      meshCount: meshes.length,
      meshes: meshes.slice(0, 40),
      hooks: Object.keys(w).filter((k) => k.startsWith("__")),
    };
  });

  console.log(JSON.stringify(out, null, 2).slice(0, 6000));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
