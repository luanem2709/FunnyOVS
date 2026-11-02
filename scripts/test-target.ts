/**
 * Thử các cấu hình render target khác nhau xem cái nào cho ảnh toDataURL đúng.
 *
 * Chạy: npx tsx scripts/test-target.ts
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__focusAgent("minh", 3.5));
  await page.waitForTimeout(1500);

  const res = await page.evaluate(`(async () => {
    const w = window;
    const THREE = w.__THREE;
    const scene = w.__scene, camera = w.__camera, renderer = w.__renderer;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;

    const readCenter = () => {
      const p = new Uint8Array(4);
      gl.readPixels(Math.floor(bw/2), Math.floor(bh/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return [p[0], p[1], p[2]];
    };
    // Phân tích ảnh toDataURL: đếm pixel trắng vs có màu
    const analyze = (url) => {
      const img = new Image();
      return new Promise((resolve) => {
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = 300; off.height = 225;
          const g = off.getContext("2d");
          g.drawImage(img, 0, 0, 300, 225);
          const d = g.getImageData(0, 0, 300, 225).data;
          const buckets = new Map();
          for (let i = 0; i < d.length; i += 4) {
            const k = (d[i]>>4) + "," + (d[i+1]>>4) + "," + (d[i+2]>>4);
            buckets.set(k, (buckets.get(k)||0)+1);
          }
          const total = d.length/4;
          const top = [...buckets.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
          resolve({ distinct: buckets.size, top: top.map(([k,v])=>k+"="+((v/total)*100).toFixed(0)+"%") });
        };
        img.src = url;
      });
    };

    const results = [];
    const variants = [
      { name: "half-float-msaa4", type: THREE.HalfFloatType, samples: 4 },
      { name: "half-float-msaa0", type: THREE.HalfFloatType, samples: 0 },
      { name: "ubyte-msaa4", type: THREE.UnsignedByteType, samples: 4 },
      { name: "ubyte-msaa0", type: THREE.UnsignedByteType, samples: 0 },
      { name: "float-msaa0", type: THREE.FloatType, samples: 0 },
    ];
    for (const v of variants) {
      try {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: v.type, samples: v.samples });
        const composer = new THREE.EffectComposer(renderer, target);
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(gl.drawingBufferWidth / renderer.getPixelRatio(), gl.drawingBufferHeight / renderer.getPixelRatio());
        composer.addPass(new THREE.RenderPass(scene, camera));
        composer.addPass(new THREE.OutputPass());
        composer.render(1/60);
        const px = readCenter();
        const a = await analyze(canvas.toDataURL("image/png"));
        results.push({ name: v.name, px, ...a });
        composer.dispose();
      } catch (e) {
        results.push({ name: v.name, error: String(e) });
      }
    }
    return results;
  })()`);

  for (const r of res) console.log(JSON.stringify(r));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
