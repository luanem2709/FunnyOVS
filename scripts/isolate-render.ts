/**
 * Bật/tắt từng yếu tố render lúc runtime để tìm nguyên nhân ảnh rửa trắng.
 *
 * Chạy: npx tsx scripts/isolate-render.ts
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

  const res = await page.evaluate(`(async () => {
    const w = window;
    const scene = w.__scene, camera = w.__camera, renderer = w.__renderer, pipeline = w.__pipeline;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const sample = () => {
      const out = [];
      for (const [x, y] of [[bw/2, bh/2], [bw/4, bh/4]]) {
        const p = new Uint8Array(4);
        gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        out.push([p[0], p[1], p[2]]);
      }
      return out;
    };
    const lights = [];
    scene.traverse((o) => { if (o.isLight) lights.push({ t: o.type, i: o.intensity }); });
    const out = { lights, steps: [] };

    const step = (label, fn, useComposer) => {
      fn();
      if (useComposer) pipeline.render(1/60); else renderer.render(scene, camera);
      out.steps.push({ label, px: sample() });
    };

    step("full-composer", () => {}, true);
    step("no-ibl", () => { scene.environment = null; }, true);
    step("no-tone", () => { renderer.toneMapping = 0; }, true);
    step("no-ibl-no-tone", () => {}, true);
    step("direct-only", () => {}, false);
    step("back-ibl", () => { scene.environment = pipeline.environment; renderer.toneMapping = 4; }, false);
    return out;
  })()`);

  console.log("Số đèn:", res.lights.length, JSON.stringify(res.lights));
  for (const s of res.steps) console.log(s.label.padEnd(22), JSON.stringify(s.px));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
