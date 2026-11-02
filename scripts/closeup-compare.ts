/**
 * So sánh composer vs direct ở góc cận cảnh nhân vật.
 *
 * Chạy: npx tsx scripts/closeup-compare.ts
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
  await page.waitForTimeout(2000);

  const res = await page.evaluate(`(async () => {
    const w = window;
    const scene = w.__scene, camera = w.__camera, renderer = w.__renderer, pipeline = w.__pipeline;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const sample = () => {
      const out = [];
      for (const [x, y] of [[bw/2, bh/2], [bw/2, bh*0.3], [bw*0.35, bh/2]]) {
        const p = new Uint8Array(4);
        gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        out.push([p[0], p[1], p[2]]);
      }
      return out;
    };
    const out = [];
    const step = (label, fn, composer) => {
      fn();
      if (composer) pipeline.render(1/60); else renderer.render(scene, camera);
      out.push({ label, px: sample() });
    };
    step("composer", () => {}, true);
    step("direct", () => {}, false);
    step("composer-noEnv", () => { scene.environment = null; }, true);
    step("direct-noEnv", () => {}, false);
    step("direct-noEnv-noBloom", () => { pipeline.bloom.enabled = false; }, false);
    step("composer-noEnv-noBloom", () => {}, true);
    return out;
  })()`);

  for (const r of res) console.log(r.label.padEnd(24), JSON.stringify(r.px));

  for (const [name, code] of [
    ["closeup-composer", "w.__pipeline.render(1/60)"],
    ["closeup-direct", "w.__renderer.render(w.__scene, w.__camera)"],
  ] as const) {
    const dataUrl = (await page.evaluate(`(() => {
      const w = window;
      ${code}
      return document.getElementById("scene").toDataURL("image/png");
    })()`)) as string;
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
