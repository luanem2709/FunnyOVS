/**
 * So sánh render có/không composer để tìm nguyên nhân ảnh bị rửa trắng.
 *
 * Chạy: npx tsx scripts/compare-render.ts
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/** Đánh giá mã thô trong trang (tránh transpile của tsx làm hỏng closure). */
async function evalRaw(page: any, code: string): Promise<any> {
  return page.evaluate(`(async () => { ${code} })()`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const res = await evalRaw(
    page,
    `
    const w = window;
    const scene = w.__scene;
    const camera = w.__camera;
    const pipeline = w.__pipeline;
    const renderer = w.__renderer;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");
    const w2 = gl.drawingBufferWidth, h2 = gl.drawingBufferHeight;
    const sample = () => {
      const out = [];
      for (const [x, y] of [[w2/2, h2/2], [w2/4, h2/4], [w2*0.75, h2*0.3], [w2*0.2, h2*0.8]]) {
        const p = new Uint8Array(4);
        gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        out.push([p[0], p[1], p[2]]);
      }
      return out;
    };
    pipeline.render(1/60);
    const composerPixels = sample();
    renderer.render(scene, camera);
    const directPixels = sample();
    return {
      composerPixels, directPixels,
      softwareGL: pipeline.softwareGL,
      hasComposer: !!pipeline.composer,
      toneMapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      outputCS: renderer.outputColorSpace,
      sceneEnv: !!scene.environment,
      envIntensity: scene.environmentIntensity,
      bg: scene.background && scene.background.getHexString ? scene.background.getHexString() : null,
    };
  `,
  );

  console.log(JSON.stringify(res, null, 2));

  for (const name of ["render-composer", "render-direct"]) {
    const dataUrl = (await evalRaw(
      page,
      `
      const w = window;
      const canvas = document.getElementById("scene");
      if ("${name}" === "render-composer") w.__pipeline.render(1/60);
      else w.__renderer.render(w.__scene, w.__camera);
      return canvas.toDataURL("image/png");
    `,
    )) as string;
    const out = path.resolve("docs/shots", `${name}.png`);
    fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log("→", out);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
