/**
 * Trộn âm thanh THEO TIMELINE (timing.json): giọng đọc đặt đúng mốc, nền pad nhẹ hạ thấp để không át giọng, tiếng gõ phím chỉ ở cảnh có gõ,
 * "ting" tin nhắn/bong bóng đúng thời điểm sự kiện trong cảnh (tính từ đầu cảnh). Không dùng mẫu âm thanh ngoài.
 *   node workspace/roblox-clip/mix.mjs        → audio-final.wav
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kit = path.dirname(fileURLToPath(import.meta.url));
const here = path.resolve(process.argv.includes("--project") ? process.argv[process.argv.indexOf("--project") + 1] : kit); // thư mục dự án
const tm = JSON.parse(fs.readFileSync(path.join(here, "timing.json"), "utf8"));
const DUR = Math.ceil(tm.total * 10) / 10;
const at = (scene, rel) => tm.scenes[scene][0] + rel;

// sự kiện "ting": [cảnh, giây từ đầu cảnh, tần số]
const pings = [["s2", 2.2, 1320], ["s2", 5.2, 1320], ["s3", 6.3, 990], ["s4", 2.0, 880], ["s4", 3.6, 880], ["s4", 5.2, 880], ["s7", 2.2, 1175], ["s8", 4.0, 1175]].map(([sc, rel, f]) => [at(sc, rel), f]);
// tiếng gõ phím: cả cảnh 1–3 và nửa đầu cảnh 8
const typing = [[tm.scenes.s1[0], tm.scenes.s3[1]], [tm.scenes.s8[0], at("s8", 4)]];
const typingGate = typing.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");

const pad = `aevalsrc='(0.05*sin(2*PI*110*t)+0.035*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t))*(0.6+0.4*sin(2*PI*0.12*t))':s=44100:d=${DUR}`;
const type = `aevalsrc='gt(${typingGate},0)*if(lt(mod(t,0.13),0.012),0.9*(random(0)-0.5),0)*(0.5+0.5*sin(2*PI*0.7*t))':s=44100:d=${DUR}`;
const inputs = ["-f", "lavfi", "-i", pad, "-f", "lavfi", "-i", type];
for (const [, f] of pings) inputs.push("-f", "lavfi", "-i", `aevalsrc='0.3*sin(2*PI*${f}*t)*exp(-8*t)':s=44100:d=0.6`);
const voices = tm.voice.filter((v) => v.file); // câu chưa có giọng thì bỏ qua
for (const v of voices) inputs.push("-i", path.join(here, v.file));
const nP = pings.length;
const filt = [];
filt.push("[0:a]volume=0.5[bed]");
filt.push("[1:a]volume=0.8[typ]");
pings.forEach(([t], i) => filt.push(`[${i + 2}:a]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[p${i}]`));
voices.forEach((v, i) => filt.push(`[${i + 2 + nP}:a]adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)},volume=1.7[v${i}]`));
const labels = ["[bed]", "[typ]", ...pings.map((_, i) => `[p${i}]`), ...voices.map((_, i) => `[v${i}]`)].join("");
const n = 2 + nP + voices.length;
filt.push(`${labels}amix=inputs=${n}:normalize=0,afade=t=in:st=0:d=1.2,afade=t=out:st=${DUR - 2}:d=2,alimiter=limit=0.92,atrim=0:${DUR}[a]`);
const wav = path.join(here, "audio-final.wav");
const r = spawnSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filt.join(";"), "-map", "[a]", "-ar", "44100", wav], { stdio: ["ignore", "ignore", "inherit"] });
console.log(r.status === 0 ? `đã tạo audio-final.wav (${DUR}s, ${voices.length} câu giọng, ${nP} tiếng ting)` : "ffmpeg lỗi (đã cài ffmpeg và có trong PATH chưa?)");
process.exit(r.status === 0 ? 0 : 1);
