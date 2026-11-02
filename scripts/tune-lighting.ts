/**
 * Tìm bộ thông số ánh sáng cho cảnh đủ tương phản (không bị rửa trắng).
 *
 * Chạy: npx tsx scripts/tune-lighting.ts
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
    const scene = w.__scene, renderer = w.__renderer, pipeline = w.__pipeline;
    const canvas = document.getElementById("scene");

    const lights = [];
    scene.traverse((o) => {
      if (o.isLight) lights.push(o);
    });
    const amb = lights.find((l) => l.isAmbientLight);
    const hemi = lights.find((l) => l.isHemisphereLight);
    const dirs = lights.filter((l) => l.isDirectionalLight);
    const points = lights.filter((l) => l.isPointLight);

    const analyze = (url) => {
      const img = new Image();
      return new Promise((resolve) => {
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = 320; off.height = 192;
          const g = off.getContext("2d");
          g.drawImage(img, 0, 0, 320, 192);
          const d = g.getImageData(0, 0, 320, 192).data;
          let dark = 0, white = 0, colored = 0, sum = 0;
          const buckets = new Set();
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i+1], b = d[i+2];
            const mx = Math.max(r,gg,b), mn = Math.min(r,gg,b);
            if (mx < 70) dark++;
            if (mn > 235) white++;
            if (mx-mn > 40) colored++;
            sum += mx;
            buckets.add((r>>4)+","+(gg>>4)+","+(b>>4));
          }
          const total = d.length/4;
          resolve({
            dark: +((dark/total)*100).toFixed(1),
            white: +((white/total)*100).toFixed(1),
            colored: +((colored/total)*100).toFixed(1),
            mean: +(sum/total).toFixed(0),
            distinct: buckets.size,
          });
        };
        img.src = url;
      });
    };

    const results = [];
    const variants = [
      { label: "current", amb: 0.45, hemi: 1.05, sun: 2.1, fill: 0.55, pt: 1.0, exp: 0.7, env: 0.1 },
      { label: "A", amb: 0.25, hemi: 0.85, sun: 1.7, fill: 0.35, pt: 0.5, exp: 0.9, env: 0.15 },
      { label: "B", amb: 0.2, hemi: 0.7, sun: 1.5, fill: 0.3, pt: 0.35, exp: 1.0, env: 0.2 },
      { label: "C", amb: 0.15, hemi: 0.6, sun: 1.4, fill: 0.25, pt: 0.25, exp: 1.0, env: 0.25 },
      { label: "D", amb: 0.1, hemi: 0.5, sun: 1.3, fill: 0.2, pt: 0.2, exp: 1.1, env: 0.3 },
      { label: "E", amb: 0.08, hemi: 0.45, sun: 1.2, fill: 0.15, pt: 0.15, exp: 1.2, env: 0.35 },
    ];
    for (const v of variants) {
      if (amb) amb.intensity = v.amb;
      if (hemi) hemi.intensity = v.hemi;
      dirs[0].intensity = v.sun;
      if (dirs[1]) dirs[1].intensity = v.fill;
      for (const p of points) p.intensity *= 1;
      const base = points.map((p) => p.userData.baseIntensity ?? p.intensity);
      points.forEach((p, i) => { p.intensity = base[i] * v.pt; });
      renderer.toneMappingExposure = v.exp;
      scene.environmentIntensity = v.env;
      pipeline.render(1/60);
      const a = await analyze(canvas.toDataURL("image/png"));
      results.push({ label: v.label, ...v, ...a });
    }
    return results;
  })()`);

  for (const r of res) {
    console.log(
      `${r.label.padEnd(8)} amb=${r.amb} hemi=${r.hemi} sun=${r.sun} pt=${r.pt} exp=${r.exp} env=${r.env} | dark=${r.dark}% white=${r.white}% colored=${r.colored}% mean=${r.mean} distinct=${r.distinct}`,
    );
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
