/**
 * Kiểm tra nhanh: junction/symlink trên Windows có bị pathGuard chặn không?
 * Chạy: npx tsx scripts/check-junction.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPath } from "../src/server/sandbox/pathGuard.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "office3d-junction-"));
const workspace = path.join(tmp, "workspace");
const outside = path.join(tmp, "outside");
fs.mkdirSync(workspace, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");

console.log("tmp:", tmp);

// 1) Junction (Windows directory junction)
const junction = path.join(workspace, "junc");
try {
  fs.symlinkSync(outside, junction, "junction");
  console.log("tạo junction OK");
  const r = checkPath(path.join(junction, "secret.txt"), workspace);
  console.log("  checkPath(junction/secret.txt) →", JSON.stringify(r));
} catch (e) {
  console.log("tạo junction thất bại:", (e as Error).message);
}

// 2) Symlink thư mục
const symdir = path.join(workspace, "symdir");
try {
  fs.symlinkSync(outside, symdir, "dir");
  console.log("tạo symlink dir OK");
  const r = checkPath(path.join(symdir, "secret.txt"), workspace);
  console.log("  checkPath(symdir/secret.txt) →", JSON.stringify(r));
} catch (e) {
  console.log("tạo symlink dir thất bại:", (e as Error).message);
}

// 3) Symlink tệp
const symfile = path.join(workspace, "symfile.txt");
try {
  fs.symlinkSync(path.join(outside, "secret.txt"), symfile, "file");
  console.log("tạo symlink file OK");
  const r = checkPath(symfile, workspace);
  console.log("  checkPath(symfile.txt) →", JSON.stringify(r));
} catch (e) {
  console.log("tạo symlink file thất bại:", (e as Error).message);
}

// 4) Junction tới thư mục cha (dùng ..\ cũng phải chặn)
const r2 = checkPath(path.join("..", "outside", "secret.txt"), workspace);
console.log("  checkPath(../outside/secret.txt) →", JSON.stringify(r2));

fs.rmSync(tmp, { recursive: true, force: true });
