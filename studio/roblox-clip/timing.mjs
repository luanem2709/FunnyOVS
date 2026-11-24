/**
 * Dựng TIMELINE từ giọng đọc: độ dài từng câu (ffprobe) quyết định độ dài từng cảnh, nên hình, phụ đề và tiếng luôn khớp.
 *   node studio/roblox-clip/timing.mjs [--project <thư-mục>]   → <dự án>/timing.json
 * Cảnh = [lead 0.7s] + giọng + [tail 0.8s], không ngắn hơn `MIN` của cảnh (đủ cho diễn xuất/hiệu ứng).
 * Câu CHƯA có file giọng (chưa tổng hợp / không gửi ra dịch vụ giọng) → ước lượng theo tốc độ đọc ~14 ký tự/giây và `file: null` (mix bỏ qua).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kit = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv;
const project = path.resolve(argv.includes("--project") ? argv[argv.indexOf("--project") + 1] : kit);
const lines = JSON.parse(fs.readFileSync(path.join(project, "loi-doc.json"), "utf8"));
const LEAD = 0.7;
const TAIL = 0.8;
const MIN = [3, 7, 8, 8, 8, 7.5, 8, 8, 11, 5]; // title, s1..s8, end
const NAMES = ["title", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "end"];
if (lines.length !== NAMES.length) { console.error(`loi-doc.json cần đúng ${NAMES.length} câu (tựa, 8 cảnh, kết); đang có ${lines.length}.`); process.exit(2); }
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);

let t = 0;
const scenes = {};
const voice = [];
lines.forEach((l, i) => {
  const mp3 = path.join(project, "voice", `v${i}.mp3`);
  const have = fs.existsSync(mp3);
  const d = have ? dur(mp3) : Math.max(1.5, l.text.length / 14);
  const len = Math.max(MIN[i], LEAD + d + TAIL);
  scenes[NAMES[i]] = [Number(t.toFixed(3)), Number((t + len).toFixed(3))];
  voice.push({ i, scene: NAMES[i], file: have ? `voice/v${i}.mp3` : null, start: Number((t + LEAD).toFixed(3)), dur: Number(d.toFixed(3)), text: l.text });
  t += len;
});
fs.writeFileSync(path.join(project, "timing.json"), JSON.stringify({ fps: 24, total: Number(t.toFixed(3)), scenes, voice }, null, 2));
for (const v of voice) console.log(`${v.scene.padEnd(5)} cảnh ${scenes[v.scene][0].toFixed(1)}–${scenes[v.scene][1].toFixed(1)}s · ${v.file ? "giọng" : "ước lượng"} ${v.start.toFixed(1)}s dài ${v.dur.toFixed(1)}s`);
console.log(`tổng ${t.toFixed(1)}s`);
