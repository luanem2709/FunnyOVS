/**
 * Chuẩn bị thư mục `build/app` cho electron-builder:
 *   - dist/        giao diện 3D đã build bằng Vite
 *   - server.mjs   server Node gom thành một file (esbuild)
 *   - main.cjs     vỏ Electron
 *   - package.json chỉ chứa phụ thuộc native/runtime còn lại
 *
 * Tách riêng thư mục này để better-sqlite3 được build lại cho Electron ở đó,
 * không làm hỏng bản build cho Node ở node_modules gốc (dùng cho `npm test`).
 *
 * Chạy: npm run desktop:prepare
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "build", "app");
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("[desktop] build giao diện (vite)...");
execSync("npx vite build", { cwd: root, stdio: "inherit" });
fs.cpSync(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });

console.log("[desktop] gom server (esbuild)...");
// Phụ thuộc native / có file đi kèm giữ ở ngoài, cài riêng vào build/app/node_modules.
// nodemailer + imapflow (email thật) nạp lười khi người dùng bật email; giữ ngoài để khỏi gom pino/worker vào bundle.
const external = ["better-sqlite3", "playwright-core", "nodemailer", "imapflow"];
await build({
  entryPoints: [path.join(root, "src/server/main.ts")],
  outfile: path.join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external,
  // Các gói CJS (express...) cần require() trong bundle ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});

fs.copyFileSync(path.join(root, "electron", "main.cjs"), path.join(out, "main.cjs"));
fs.copyFileSync(path.join(root, "electron", "preload.cjs"), path.join(out, "preload.cjs"));
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

// Studio dựng clip: mã + dữ liệu mẫu của kit và phần tối thiểu của three (kết xuất chạy offline, không CDN).
console.log("[desktop] chép studio kit + three...");
const kitSrc = path.join(root, "studio", "roblox-clip");
const kitOut = path.join(out, "studio", "roblox-clip");
fs.mkdirSync(kitOut, { recursive: true });
const GENERATED = new Set(["timing.json"]);
for (const f of fs.readdirSync(kitSrc)) {
  if (GENERATED.has(f) || !/\.(mjs|js|json|html|py)$/.test(f) || !fs.statSync(path.join(kitSrc, f)).isFile()) continue;
  fs.copyFileSync(path.join(kitSrc, f), path.join(kitOut, f));
}
const threeSrc = path.join(root, "node_modules", "three");
const threeOut = path.join(out, "studio", "vendor", "three");
for (const rel of ["build/three.module.js", "build/three.core.js", "examples/jsm/geometries/RoundedBoxGeometry.js", "LICENSE"]) {
  fs.mkdirSync(path.dirname(path.join(threeOut, rel)), { recursive: true });
  fs.copyFileSync(path.join(threeSrc, rel), path.join(threeOut, rel));
}

// What-If Studio (ShotBuilder engine): chép vào bản desktop (không chép node_modules và out)
console.log("[desktop] chép What-If Studio kit...");
const wiSrc = path.join(root, "app", "what-if-studio");
const wiOut = path.join(out, "app", "what-if-studio");
if (fs.existsSync(wiSrc)) {
  fs.cpSync(wiSrc, wiOut, {
    recursive: true,
    filter: (src) => {
      const b = path.basename(src);
      return b !== "node_modules" && b !== "out" && b !== ".cache";
    },
  });
}

const launcherSrc = path.join(root, "app", "launcher");
const launcherOut = path.join(out, "app", "launcher");
if (fs.existsSync(launcherSrc)) {
  fs.cpSync(launcherSrc, launcherOut, { recursive: true });
}
const shotExeSrc = path.join(root, "app", "Shot Builder.exe");
if (fs.existsSync(shotExeSrc)) {
  fs.copyFileSync(shotExeSrc, path.join(out, "app", "Shot Builder.exe"));
}

const pkg = {
  name: "funnyovs",
  productName: "FunnyOVS",
  version: rootPkg.version,
  description: rootPkg.description,
  author: "luanem2709",
  license: "MIT",
  main: "main.cjs",
  dependencies: Object.fromEntries(external.map((name) => [name, rootPkg.dependencies[name]])),
};
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2));

console.log("[desktop] cài phụ thuộc runtime...");
execSync("npm install --omit=dev --no-audit --no-fund --package-lock=false", { cwd: out, stdio: "inherit" });
console.log("[desktop] xong:", out);
