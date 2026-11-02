/**
 * Đo hiệu năng cảnh 3D: draw call, số mesh, FPS.
 *
 * Chạy: npx tsx scripts/perf.ts
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Đếm FPS nhiều lần rồi lấy trung vị — một lần đo duy nhất rất nhiễu
  // (máy đang chạy song song nhiều thứ).
  const fps = (await page.evaluate(`(async () => {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      let frames = 0;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          frames++;
          if (performance.now() - t0 >= 1500) resolve(null);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      runs.push(frames / ((performance.now() - t0) / 1000));
    }
    runs.sort((a, b) => a - b);
    return {
      median: +runs[2].toFixed(1),
      min: +runs[0].toFixed(1),
      max: +runs[4].toFixed(1),
      all: runs.map((r) => +r.toFixed(1)),
    };
  })()`)) as { median: number; min: number; max: number; all: number[] };

  const info = (await page.evaluate(`(() => {
    const r = window.__renderer;
    const s = window.__scene;
    if (!r || !s) return null;
    // Đọc thông tin sau một lần render để có số draw call thật.
    r.render(s, window.__camera);
    let meshes = 0;
    let lights = 0;
    const materials = new Set();
    s.traverse((o) => {
      if (o.isMesh) { meshes++; materials.add(o.material && o.material.uuid); }
      if (o.isLight) lights++;
    });
    return {
      calls: r.info.render.calls,
      triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
      programs: r.info.programs ? r.info.programs.length : 0,
      meshes,
      lights,
      uniqueMaterials: materials.size,
      pixelRatio: r.getPixelRatio(),
      size: [r.domElement.width, r.domElement.height],
    };
  })()`)) as Record<string, unknown> | null;

  console.log("=== HIỆU NĂNG ===");
  console.log(
    `FPS (SwiftShader, không GPU): median ${fps.median} (min ${fps.min} / max ${fps.max}) — ${fps.all.join(", ")}`,
  );
  console.log(JSON.stringify(info, null, 2));

  // Ảnh chụp để đối chiếu.
  const shot = (await page.evaluate(() => (window as any).__captureFrame?.())) as
    | { dataUrl: string }
    | undefined;
  if (shot?.dataUrl?.startsWith("data:image/png")) {
    fs.mkdirSync(path.resolve("docs/shots"), { recursive: true });
    fs.writeFileSync(path.resolve("docs/shots/perf.png"), Buffer.from(shot.dataUrl.split(",")[1], "base64"));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
