/**
 * Dò lại bộ ánh sáng theo cách repo tham khảo làm:
 * hemi + sun chính, đèn point rất yếu, không ambient, ACES + exposure ~1.1.
 *
 * Chạy: npx tsx scripts/tune-lighting2.ts
 */
import { chromium } from "playwright-core";

const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.locator('.room-btn[data-room="dispatch"]').click();
  await page.waitForTimeout(3000);

  const res = await page.evaluate(`(async () => {
    const w = window;
    const scene = w.__scene, renderer = w.__renderer, pipeline = w.__pipeline;
    const canvas = document.getElementById("scene");

    const lights = [];
    scene.traverse((o) => { if (o.isLight) lights.push(o); });
    const amb = lights.find((l) => l.isAmbientLight);
    const hemi = lights.find((l) => l.isHemisphereLight);
    const dirs = lights.filter((l) => l.isDirectionalLight);
    const points = lights.filter((l) => l.isPointLight);
    const base = points.map((p) => p.userData.base ?? p.intensity);

    const analyze = (url) => {
      const img = new Image();
      return new Promise((resolve) => {
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = 320; off.height = 180;
          const g = off.getContext("2d");
          g.drawImage(img, 0, 0, 320, 180);
          const d = g.getImageData(0, 0, 320, 180).data;
          let dark = 0, white = 0, colored = 0, sum = 0, sum2 = 0;
          const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i+1], b = d[i+2];
            const mx = Math.max(r,gg,b), mn = Math.min(r,gg,b);
            if (mx < 70) dark++;
            if (mn > 235) white++;
            if (mx-mn > 40) colored++;
            sum += mx; sum2 += mx*mx;
          }
          const mean = sum/n;
          resolve({
            dark: +((dark/n)*100).toFixed(1),
            white: +((white/n)*100).toFixed(1),
            colored: +((colored/n)*100).toFixed(1),
            mean: +mean.toFixed(0),
            std: +Math.sqrt(sum2/n - mean*mean).toFixed(0),
          });
        };
        img.src = url;
      });
    };

    const results = [];
    const variants = [
      { label: "hien-tai", amb: 0.45, hemi: 1.05, sun: 2.1, fill: 0.55, pt: 1.0, exp: 0.7 },
      { label: "A", amb: 0.15, hemi: 1.0, sun: 1.8, fill: 0.3, pt: 0.2, exp: 1.0 },
      { label: "B", amb: 0.0, hemi: 1.2, sun: 2.0, fill: 0.35, pt: 0.15, exp: 1.05 },
      { label: "C", amb: 0.0, hemi: 1.45, sun: 1.95, fill: 0.3, pt: 0.1, exp: 1.12 },
      { label: "D", amb: 0.0, hemi: 1.2, sun: 2.2, fill: 0.4, pt: 0.25, exp: 0.95 },
      { label: "E", amb: 0.05, hemi: 1.0, sun: 2.4, fill: 0.45, pt: 0.3, exp: 0.85 },
    ];
    for (const v of variants) {
      if (amb) amb.intensity = v.amb;
      if (hemi) hemi.intensity = v.hemi;
      dirs[0].intensity = v.sun;
      if (dirs[1]) dirs[1].intensity = v.fill;
      points.forEach((p, i) => { p.intensity = base[i] * v.pt; });
      renderer.toneMappingExposure = v.exp;
      pipeline.render(1/60);
      const a = await analyze(canvas.toDataURL("image/png"));
      results.push({ label: v.label, ...v, ...a });
    }
    return results;
  })()`);

  for (const r of res) {
    console.log(`${r.label.padEnd(9)} amb=${r.amb} hemi=${r.hemi} sun=${r.sun} pt=${r.pt} exp=${r.exp} | dark=${r.dark}% white=${r.white}% colored=${r.colored}% mean=${r.mean} std=${r.std}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
