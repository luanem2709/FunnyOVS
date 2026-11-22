/**
 * Tính điểm từ docs/07-diem-so.md: mỗi nhóm = (tiêu chí [x] / tổng) * 10, tổng = trung bình các nhóm.
 * Chạy: npm run score
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "docs", "07-diem-so.md"), "utf8");

const groups = [];
let cur = null;
for (const line of text.split(/\r?\n/)) {
  const h = /^##\s+([A-Z])\.\s+(.*)$/.exec(line);
  if (h) {
    cur = { id: h[1], name: h[2].trim(), done: 0, total: 0, open: [] };
    groups.push(cur);
    continue;
  }
  const m = /^- \[( |x)\]\s+([A-Z]\d+)\s+—\s+(.*)$/.exec(line);
  if (m && cur) {
    cur.total++;
    if (m[1] === "x") cur.done++;
    else cur.open.push(`${m[2]} ${m[3].slice(0, 70)}`);
  }
}

let sum = 0;
for (const g of groups) {
  const score = g.total ? (g.done / g.total) * 10 : 0;
  sum += score;
  console.log(`${g.id}. ${g.name.padEnd(34)} ${String(g.done).padStart(2)}/${String(g.total).padEnd(2)}  ${score.toFixed(1)}/10`);
}
const total = groups.length ? sum / groups.length : 0;
console.log(`${"".padEnd(40, "-")}\nTỔNG  ${total.toFixed(2)}/10`);
const open = groups.flatMap((g) => g.open);
if (open.length) console.log(`\nCòn mở (${open.length}):\n- ${open.join("\n- ")}`);
process.exit(open.length ? 1 : 0);
