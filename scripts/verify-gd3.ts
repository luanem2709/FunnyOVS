/**
 * Kiểm chứng GĐ 3: camera bay mượt, nút Toàn cảnh, ngày/đêm, kệ sách Thư viện,
 * biểu đồ tường Tài chính, bong bóng thoại.
 *
 * Chạy: npx tsx scripts/verify-gd3.ts
 */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const OUT_DIR = path.resolve("docs/shots");
const EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE ERR: " + m.text());
  });

  await page.goto("http://localhost:5173/?capture=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const results: Record<string, unknown> = {};

  // 1) Camera bay mượt khi bấm phòng.
  await page.click('.room-btn[data-room="library"]');
  await page.waitForTimeout(150);
  const midFlight = await page.evaluate(() => {
    const c = (window as any).__camera;
    return c ? { x: +c.position.x.toFixed(2), z: +c.position.z.toFixed(2), y: +c.position.y.toFixed(2) } : null;
  });
  await page.waitForTimeout(1400);
  const endFlight = await page.evaluate(() => {
    const c = (window as any).__camera;
    return c ? { x: +c.position.x.toFixed(2), z: +c.position.z.toFixed(2), y: +c.position.y.toFixed(2) } : null;
  });
  results.flyTo = { midFlight, endFlight, moved: !!midFlight && !!endFlight && (midFlight.z !== endFlight.z || midFlight.y !== endFlight.y) };
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-library.png") });

  // 2) Nút Toàn cảnh.
  await page.click("#btn-overview");
  await page.waitForTimeout(1600);
  const overview = await page.evaluate(() => {
    const c = (window as any).__camera;
    return c ? { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2) } : null;
  });
  results.overview = overview;
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-overview.png") });

  // 3) Ngày/đêm.
  await page.click("#btn-daynight");
  await page.waitForTimeout(900);
  const night = await page.evaluate(() => {
    const s = (window as any).__scene;
    const lights = (window as any).__lights;
    const btn = document.getElementById("btn-daynight");
    return {
      btn: btn?.textContent?.trim(),
      bg: (s?.background as any)?.getHexString?.() ?? null,
      sunIntensity: lights?.sun?.intensity ?? null,
      hemiIntensity: lights?.hemisphere?.intensity ?? null,
    };
  });
  results.night = night;
  await page.screenshot({ path: path.join(OUT_DIR, "gd3-night.png") });
  // Quay lại ngày.
  await page.click("#btn-daynight");
  await page.waitForTimeout(600);

  // 4) Kệ sách Thư viện: đếm InstancedMesh (sách) trong group phòng.
  const libInfo = await page.evaluate(() => {
    const groups = (window as any).__roomGroups;
    if (!groups) return null;
    const g = groups.get("library");
    if (!g) return null;
    let meshes = 0;
    let instanced = 0;
    let books = 0;
    g.traverse((o: any) => {
      if (o.isInstancedMesh) {
        instanced++;
        books += o.count ?? 0;
      } else if (o.isMesh) meshes++;
    });
    return { meshes, instanced, books };
  });
  results.library = libInfo;

  // 5) Biểu đồ tường Tài chính: tồn tại + dữ liệu thật.
  const finInfo = await page.evaluate(() => {
    const groups = (window as any).__roomGroups;
    const rooms = (window as any).__rooms;
    if (!groups) return null;
    const g = groups.get("finance");
    if (!g) return null;
    let meshes = 0;
    let textured = 0;
    g.traverse((o: any) => {
      if (o.isMesh) {
        meshes++;
        if (o.material?.map) textured++;
      }
    });
    const spends = rooms
      ? [...rooms.values()].map((d: any) => ({ id: d.id, tokens: d.spend?.tokens ?? 0 }))
      : [];
    return { meshes, textured, spends };
  });
  results.finance = finInfo;

  // 6) Bong bóng thoại: hiện khi có task xong.
  const bubble = await page.evaluate(() => {
    const agents = (window as any).__agents;
    if (!agents) return null;
    const out: any[] = [];
    for (const [id, rec] of agents) {
      out.push({ id, hasBubble: !!rec.bubble, visible: rec.bubble?.sprite?.visible ?? null });
    }
    return out;
  });
  results.bubbles = bubble;

  // 7) Chất lượng tự động + FPS.
  const quality = await page.evaluate(() => {
    const el = document.getElementById("quality-fps");
    return el?.textContent?.trim() ?? null;
  });
  results.quality = quality;

  console.log(JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
