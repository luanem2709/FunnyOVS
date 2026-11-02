/**
 * Kiểm tra giả thuyết: readPixels phá hỏng backbuffer → toDataURL trắng.
 *
 * Chạy: npx tsx scripts/test-capture-order.ts
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
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__focusAgent("minh", 4.5));
  await page.waitForTimeout(1500);

  const res = await page.evaluate(`(async () => {
    const w = window;
    const scene = w.__scene, camera = w.__camera, renderer = w.__renderer, pipeline = w.__pipeline;
    const canvas = document.getElementById("scene");
    const gl = canvas.getContext("webgl2");

    const analyze = (url) => {
      const img = new Image();
      return new Promise((resolve) => {
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = 200; off.height = 125;
          const g = off.getContext("2d");
          g.drawImage(img, 0, 0, 200, 125);
          const d = g.getImageData(0, 0, 200, 125).data;
          const buckets = new Set();
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) {
            buckets.add((d[i]>>4)+","+(d[i+1]>>4)+","+(d[i+2]>>4));
            sum += (d[i]+d[i+1]+d[i+2])/3;
          }
          return { distinct: buckets.size, mean: +(sum/(d.length/4)).toFixed(0) };
        };
        img.src = url;
      });
    };

    const out = [];
    // A: render rồi toDataURL ngay (không readPixels)
    pipeline.render(1/60);
    out.push({ label: "A render->toDataURL", ...await analyze(canvas.toDataURL("image/png")) });

    // B: render, readPixels, rồi toDataURL
    pipeline.render(1/60);
    const p = new Uint8Array(4);
    gl.readPixels(400, 250, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    out.push({ label: "B render->read->toDataURL", px: Array.from(p), ...await analyze(canvas.toDataURL("image/png")) });

    // C: render, readPixels, render lại, toDataURL
    pipeline.render(1/60);
    gl.readPixels(400, 250, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    pipeline.render(1/60);
    out.push({ label: "C render->read->render->toDataURL", ...await analyze(canvas.toDataURL("image/png")) });

    // D: đọc từ 2D canvas copy (drawImage) thay vì readPixels
    pipeline.render(1/60);
    const off = document.createElement("canvas");
    off.width = canvas.width; off.height = canvas.height;
    off.getContext("2d").drawImage(canvas, 0, 0);
    const d2 = off.getContext("2d").getImageData(400, 250, 1, 1).data;
    out.push({ label: "D render->2dCopy", px: Array.from(d2), ...await analyze(canvas.toDataURL("image/png")) });

    return out;
  })()`);

  for (const r of res) console.log(JSON.stringify(r));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
