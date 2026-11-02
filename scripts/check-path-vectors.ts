/**
 * Dò các vector bypass đường dẫn trên Windows.
 * Chạy: npx tsx scripts/check-path-vectors.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPath, isWithin, resolveExisting } from "../src/server/sandbox/pathGuard.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-vec-"));
const workspace = path.join(tmp, "workspace");
const outside = path.join(tmp, "outside");
fs.mkdirSync(workspace, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
fs.writeFileSync(path.join(workspace, "ok.txt"), "ok", "utf8");

const cases: Array<[string, string]> = [
  ["đường dẫn tuyệt đối ngoài", path.join(outside, "secret.txt")],
  ["traversal ..", path.join("..", "outside", "secret.txt")],
  ["traversal nhiều lớp", path.join("..", "..", "..", "etc", "passwd")],
  ["dấu gạch chéo kép", "..\\..\\outside\\secret.txt"],
  ["mixed separator", "..\\outside/../outside/secret.txt"],
  ["dấu chấm cuối (Windows strip)", "..\\outside\\secret.txt."],
  ["khoảng trắng cuối", "..\\outside\\secret.txt "],
  ["drive-relative C:..", "C:..\\outside\\secret.txt"],
  ["UNC \\\\?\\", "\\\\?\\" + outside + "\\secret.txt"],
  ["rooted \\outside", "\\" + outside.slice(1) + "\\secret.txt"],
  ["null byte", "ok.txt\0.png"],
  ["rỗng", ""],
  ["device NUL", "\\\\.\\NUL"],
];

console.log("workspace:", workspace);
console.log("");
for (const [name, p] of cases) {
  let r: any;
  try {
    r = checkPath(p, workspace);
  } catch (e) {
    console.log(`${name.padEnd(28)} → LỖI: ${(e as Error).message}`);
    continue;
  }
  const ok = r.ok === false;
  console.log(
    `${ok ? "CHẶN " : "!!! LỌT"} ${name.padEnd(28)} → ${r.ok ? "CHO PHÉP" : `${r.code}`}`,
  );
}

// 8.3 short name
try {
  const { execSync } = await import("node:child_process");
  const out = execSync(`cmd /c dir /x "${workspace}"`, { encoding: "utf8" });
  console.log("\n(dir /x workspace)\n" + out.split("\n").slice(0, 12).join("\n"));
} catch (e) {
  console.log("dir /x thất bại:", (e as Error).message);
}

// isWithin edge: root vs root
console.log("\nisWithin(root, root) =", isWithin(workspace, workspace));
console.log("isWithin(root, root + sep) =", isWithin(workspace, workspace + path.sep));

fs.rmSync(tmp, { recursive: true, force: true });
