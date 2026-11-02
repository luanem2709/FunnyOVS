/**
 * Kiểm tra chế độ tập trung phòng + đo độ phủ màu của ảnh.
 *
 * Chạy: npx tsx scripts/check-focus.ts
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const ROOM = process.argv[2] ?? "dispatch";
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

  const btn = page.locator(`.room-btn[data-room="${ROOM}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(3000);
  }

  const res = await page.evaluate(`(() => {
    const w = window;
    const scene = w.__scene, camera = w.__camera;
    // Liệt kê các group phòng (có userData.department trên sàn con)
    const groups = [];
    scene.children.forEach((o) => {
      if (!o.isGroup) return;
      let dept = null;
      o.traverse((c) => { if (!dept && c.userData && c.userData.department) dept = c.userData.department; });
      if (!dept) return;
      groups.push({ dept, visible: o.visible, children: o.children.length });
    });
    const canvas = document.getElementById("scene");
    w.__pipeline.render(1/60);
    return {
      groups,
      camera: camera.position.toArray().map((v) => +v.toFixed(1)),
      url: canvas.toDataURL("image/png"),
    };
  })()`);

  console.log("Các phòng:");
  for (const g of res.groups) {
    console.log(`  ${g.dept.padEnd(12)} visible=${g.visible} children=${g.children}`);
  }
  console.log("camera:", res.camera);

  const out = path.resolve("docs/shots", `focus-${ROOM}.png`);
  fs.writeFileSync(out, Buffer.from(res.url.split(",")[1], "base64"));
  console.log("→", out);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
