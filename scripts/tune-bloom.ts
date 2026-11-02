/**
 * Tìm tham số bloom + IBL không rửa trắng.
 *
 * Chạy: npx tsx scripts/tune-bloom.ts
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
    const combos = [];
    for (const envI of [0.55, 0.3, 0.15]) {
      for (const thr of [0.9, 1.1, 1.4]) {
        for (const str of [0.34, 0.2]) combos.push([envI, thr, str]);
      }
    }
    for (const [envI, thr, str] of combos) {
      scene.environmentIntensity = envI;
      bloom.threshold = thr;
      bloom.strength = str;
      pipeline.render(1/60);
      out.push({ envI, thr, str, px: sample() });
    }
    return out;
  })()`);

  for (const r of res) {
    console.log(`env=${r.envI} thr=${r.thr} str=${r.str} -> ${JSON.stringify(r.px)}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
