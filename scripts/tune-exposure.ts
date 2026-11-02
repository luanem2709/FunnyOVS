/**
 * Dò exposure + IBL để cảnh không bị rửa trắng.
 *
 * Chạy: npx tsx scripts/tune-exposure.ts
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
    const scene = w.__scene, pipeline = w.__pipeline, renderer = w.__renderer;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const sample = () => {
      const out = [];
      for (const [x, y] of [[bw/2, bh/2], [bw/4, bh/4], [bw*0.75, bh*0.3]]) {
        const p = new Uint8Array(4);
        gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        out.push([p[0], p[1], p[2]]);
      }
      return out;
    };
    const bloom = pipeline.bloom;
    const out = [];
    for (const exp of [1.08, 0.85, 0.7, 0.55, 0.45]) {
      for (const envI of [0.55, 0.25, 0.1]) {
        renderer.toneMappingExposure = exp;
        scene.environmentIntensity = envI;
        bloom.threshold = 1.0;
        bloom.strength = 0.25;
        pipeline.render(1/60);
        out.push({ exp, envI, px: sample() });
      }
    }
    return out;
  })()`);

  for (const r of res) {
    console.log(`exp=${r.exp} env=${r.envI} -> ${JSON.stringify(r.px)}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
