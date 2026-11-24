/**
 * Kết xuất clip: phục vụ MÃ của kit (index.html, scene.js) + DỮ LIỆU của dự án (timing/shots/characters.json) + three, mở Chrome,
 * gọi window.renderFrame(i) cho từng khung rồi chụp ảnh, ghép bằng ffmpeg cùng audio-final.wav (nếu có).
 *
 *   node studio/roblox-clip/render.mjs                                    (dự án = chính thư mục kit)
 *   node studio/roblox-clip/render.mjs --project <thư-mục-dự-án> --progress <file.json> --chrome <chrome.exe>
 *   node studio/roblox-clip/render.mjs --preview                          (chỉ chụp 1 khung giữa mỗi cảnh → <dự án>/preview/*.jpg, không ghép video)
 *   node studio/roblox-clip/render.mjs --frames 24,100,220                (chụp thử vài khung → <dự án>/frames-test/)
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kit = path.dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };
const flag = (n) => process.argv.includes(`--${n}`);
const project = path.resolve(arg("project") ?? kit);
const progressFile = arg("progress");
const preview = flag("preview");
const only = arg("frames")?.split(",").map(Number);
const chrome = arg("chrome") ?? process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// three: bản đóng gói kèm app (studio/vendor/three) hoặc node_modules khi chạy từ mã nguồn
const threeCandidates = [path.join(kit, "..", "vendor", "three"), path.join(kit, "..", "..", "node_modules", "three")];
const three = threeCandidates.find((d) => fs.existsSync(path.join(d, "build", "three.module.js")));
if (!three) { console.error("Không tìm thấy thư viện three (studio/vendor/three hoặc node_modules/three)."); process.exit(2); }

const outDir = path.join(project, preview ? "preview" : only ? "frames-test" : ".frames");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const report = (o) => { if (progressFile) try { fs.writeFileSync(progressFile, JSON.stringify(o)); } catch { /* bỏ qua */ } };

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const DATA = new Set(["/timing.json", "/shots.json", "/characters.json"]);
const inside = (file, dir) => { const rel = path.relative(dir, file); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file;
  let root;
  if (url.startsWith("/three/")) { root = three; file = path.join(three, url.slice(7)); }
  else if (DATA.has(url)) { root = project; file = path.join(project, url); }
  else { root = kit; file = path.join(kit, url === "/" ? "index.html" : url); }
  const resolved = path.resolve(file);
  if (!inside(resolved, root)) return void res.writeHead(403).end();
  fs.readFile(resolved, (e, buf) => {
    if (e) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": types[path.extname(resolved)] ?? "application/octet-stream" }).end(buf);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

let exitCode = 0;
const browser = await chromium.launch({ executablePath: chrome, args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--hide-scrollbars"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && problems.push(m.text()));
  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() => window.sceneReady === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.TOTAL_FRAMES);
  const fps = await page.evaluate(() => window.FPS);
  let list = only ?? Array.from({ length: total }, (_, i) => i);
  if (preview) {
    const timing = JSON.parse(fs.readFileSync(path.join(project, "timing.json"), "utf8"));
    list = Object.values(timing.scenes).map(([a, b]) => Math.min(total - 1, Math.round(((a + b) / 2) * fps)));
  }
  for (const [n, i] of list.entries()) {
    await page.evaluate((k) => window.renderFrame(k), i);
    await page.screenshot({ path: path.join(outDir, `f${String(preview ? n : i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (n % 24 === 0) report({ phase: "render", frame: n, total: list.length });
  }
  if (problems.length) { console.log("LỖI TRANG:", [...new Set(problems)].slice(0, 5).join(" | ")); exitCode = 3; }
  if (!only && !preview && exitCode === 0) {
    report({ phase: "encode", frame: list.length, total: list.length });
    const audio = path.join(project, "audio-final.wav");
    const out = path.resolve(arg("out") ?? path.join(project, "clip-co-giong.mp4"));
    const args = ["-y", "-framerate", String(fps), "-i", path.join(outDir, "f%05d.jpg"), ...(fs.existsSync(audio) ? ["-i", audio, "-c:a", "aac", "-b:a", "160k", "-shortest"] : []), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out];
    const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
    if (r.status === 0) { console.log(`đã tạo ${path.basename(out)}`); fs.rmSync(outDir, { recursive: true, force: true }); }
    else { console.log("ffmpeg lỗi (đã cài ffmpeg và có trong PATH chưa?)"); exitCode = 4; }
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
