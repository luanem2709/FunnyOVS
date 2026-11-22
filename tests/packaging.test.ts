/**
 * Kiểm tra cấu hình đóng gói: mọi gói runtime mà server nạp lười/động phải được giữ ngoài bundle và có trong package.json,
 * và vỏ Electron chỉ lộ đúng các hàm đã định (không lộ ipcRenderer thô).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");

describe("đóng gói desktop", () => {
  const script = read("scripts/build-desktop.mjs");
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; scripts: Record<string, string> };
  const external = (/const external = \[([^\]]*)\]/.exec(script)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  it("native và gói nạp động nằm ngoài bundle, và đều có phiên bản trong dependencies", () => {
    for (const name of ["better-sqlite3", "playwright-core", "nodemailer", "imapflow"]) {
      expect(external, name).toContain(name);
      expect(pkg.dependencies[name], `package.json thiếu ${name}`).toBeTruthy();
    }
  });

  it("mọi import() động tới gói trong dependencies đều thuộc danh sách external (không bị gom nhầm vào bundle)", () => {
    const dynamic = new Set<string>();
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) for (const m of fs.readFileSync(p, "utf8").matchAll(/\bimport\(\s*["']([^"'./][^"']*)["']\s*\)/g)) dynamic.add(m[1]);
      }
    };
    walk(path.join(root, "src", "server"));
    for (const name of dynamic) {
      if (name.startsWith("node:")) continue;
      expect(external, `import("${name}") phải được liệt kê trong external của scripts/build-desktop.mjs`).toContain(name);
    }
  });

  it("package.json có lệnh score và đóng gói", () => {
    expect(pkg.scripts["desktop:dist"]).toContain("electron-builder");
    expect(pkg.scripts.score).toBe("node scripts/score.mjs");
  });
});

describe("vỏ Electron", () => {
  const preload = read("electron/preload.cjs");
  const main = read("electron/main.cjs");

  it("preload chỉ lộ notify, setPending, restart — không lộ ipcRenderer", () => {
    const exposed = /exposeInMainWorld\("funnyDesktop", \{([\s\S]*?)\}\);/.exec(preload)?.[1] ?? "";
    const names = [...exposed.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(["notify", "restart", "setPending"]);
    expect(exposed).not.toMatch(/ipcRenderer\s*[,}]/);
    expect(preload).toContain("contextBridge");
  });

  it("mọi kênh IPC phía chính đều có phía preload tương ứng; restart chỉ nhận từ cửa sổ chính", () => {
    for (const channel of ["desktop:notify", "desktop:pending", "desktop:restart"]) {
      expect(main, channel).toContain(`ipcMain.on("${channel}"`);
      expect(preload, channel).toContain(`"${channel}"`);
    }
    const restartHandler = /ipcMain\.on\("desktop:restart"[\s\S]*?\n\}\);/.exec(main)?.[0] ?? "";
    expect(restartHandler).toContain("e.sender !== mainWindow.webContents");
    expect(restartHandler).toContain("app.relaunch()");
  });

  it("cửa sổ chính bật contextIsolation, tắt nodeIntegration và chặn mọi quyền trình duyệt", () => {
    expect(main).toMatch(/contextIsolation:\s*true/);
    expect(main).toMatch(/nodeIntegration:\s*false/);
    expect(main).toContain("setPermissionRequestHandler((_wc, _perm, cb) => cb(false))");
  });
});
