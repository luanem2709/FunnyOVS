/**
 * FunnyOVS — vỏ ứng dụng desktop (Electron).
 *
 * Electron chỉ làm 3 việc: chạy server Node hiện có như tiến trình con,
 * mở cửa sổ trỏ vào server đó, và dọn dẹp khi thoát. Toàn bộ logic (sandbox,
 * quyền thư mục, token budget...) vẫn nằm trong src/server.
 *
 *  - Đóng gói (app.isPackaged): chạy ./server.mjs bằng chính Electron (ELECTRON_RUN_AS_NODE),
 *    cổng ngẫu nhiên, dữ liệu trong %APPDATA%/FunnyOVS.
 *  - Phát triển: chạy `tsx src/server/main.ts` bằng Node hệ thống (để better-sqlite3 dùng
 *    đúng bản build cho Node), cổng 8787, giao diện từ Vite ở :5173.
 */
const { app, BrowserWindow, Menu, Tray, Notification, dialog, ipcMain, nativeImage, shell } = require("electron");
const { spawn, fork } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const IS_DEV = !app.isPackaged;
const DEV_SERVER_PORT = 8787;
const DEV_CLIENT_URL = "http://localhost:5173";

/** @type {import("node:child_process").ChildProcess | null} */
let serverProc = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let quitting = false;
let pendingCount = 0;
let trayHintShown = false;

function iconPath() {
  return path.join(__dirname, IS_DEV ? path.join("..", "assets") : "assets", "icon.png");
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (serverProc === null || serverProc.exitCode !== null) return reject(new Error("Server đã dừng trước khi sẵn sàng."));
        if (Date.now() > deadline) return reject(new Error("Server không phản hồi sau 30 giây."));
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/** Đọc `.env` đơn giản (KEY=VALUE) trong thư mục dữ liệu người dùng, nếu có. */
function readUserEnv(dir) {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(dir, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
      if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    /* không có .env — bình thường */
  }
  return out;
}

async function startServer() {
  const userDir = app.getPath("userData");
  fs.mkdirSync(userDir, { recursive: true });
  const port = IS_DEV ? DEV_SERVER_PORT : await freePort();
  const appRoot = path.join(__dirname, IS_DEV ? ".." : ".");

  const env = {
    ...process.env,
    ...readUserEnv(userDir),
    PORT: String(port),
    OFFICE_HOST: "127.0.0.1",
  };
  if (!IS_DEV) {
    env.OFFICE_HOME = userDir;
    env.OFFICE_DATA_DIR = path.join(userDir, "data");
    env.OFFICE_CLIENT_DIST = path.join(appRoot, "dist");
  }

  if (IS_DEV) {
    // Node hệ thống + tsx; không ép thư mục dữ liệu để giữ nguyên hành vi `npm run dev:server`.
    const tsxCli = path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs");
    serverProc = spawn("node", [tsxCli, path.join(appRoot, "src", "server", "main.ts")], {
      cwd: appRoot,
      env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
  } else {
    serverProc = fork(path.join(appRoot, "server.mjs"), [], {
      cwd: userDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
  }

  serverProc.once("exit", (code) => {
    serverProc = null;
    if (!quitting) {
      dialog.showErrorBox("FunnyOVS", `Server nội bộ đã dừng bất ngờ (mã ${code}). Ứng dụng sẽ đóng.`);
      app.quit();
    }
  });

  await waitForPort(port);
  return port;
}

function stopServer() {
  const proc = serverProc;
  if (!proc) return;
  try {
    proc.send("shutdown");
  } catch {
    /* kênh IPC đã đóng */
  }
  // Nếu sau 3 giây vẫn chưa thoát thì buộc dừng.
  setTimeout(() => {
    if (proc.exitCode === null) proc.kill();
  }, 3000).unref();
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0d12",
    title: "FunnyOVS — Văn phòng 3D",
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Đóng cửa sổ = thu xuống khay hệ thống, agent và vòng tự học vẫn chạy. Thoát hẳn bằng menu Thoát.
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
      if (!trayHintShown) {
        trayHintShown = true;
        notify("FunnyOVS vẫn đang chạy", "Bấm vào biểu tượng ở khay hệ thống để mở lại. Chọn Thoát để tắt hẳn.");
      }
    }
  });

  // Liên kết ra ngoài (khác server nội bộ) mở bằng trình duyệt hệ thống, không mở trong cửa sổ app.
  const origin = new URL(url).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, target) => {
    if (new URL(target).origin !== origin) {
      e.preventDefault();
      if (/^https?:/i.test(target)) void shell.openExternal(target);
    }
  });

  void mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: iconPath() });
  n.on("click", showWindow);
  n.show();
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(pendingCount > 0 ? `FunnyOVS — ${pendingCount} việc đang chờ bạn duyệt` : "FunnyOVS — Văn phòng 3D");
}

function autostartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 32, height: 32 }));
  updateTray();
  tray.on("click", showWindow);
  const rebuild = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Mở FunnyOVS", click: showWindow },
        {
          label: "Khởi động cùng Windows",
          type: "checkbox",
          checked: autostartEnabled(),
          enabled: app.isPackaged,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ["--hidden"] });
            rebuild();
          },
        },
        { type: "separator" },
        { label: "Thoát hẳn", click: () => app.quit() },
      ]),
    );
  rebuild();
}

ipcMain.on("desktop:notify", (_e, title, body) => {
  // Chỉ báo khi người dùng không đang nhìn app; nếu đang nhìn thì hộp thoại trong cảnh 3D là đủ.
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) return;
  notify(String(title), String(body));
  if (mainWindow && mainWindow.isVisible() && !mainWindow.isFocused()) mainWindow.flashFrame(true);
});
ipcMain.on("desktop:pending", (_e, count) => {
  pendingCount = Math.max(0, Number(count) || 0);
  updateTray();
});

function buildMenu() {
  const userDir = app.getPath("userData");
  const workspace = IS_DEV ? path.join(path.join(__dirname, ".."), "workspace") : path.join(userDir, "workspace");
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Ứng dụng",
        submenu: [
          { label: "Mở thư mục workspace của agent", click: () => void shell.openPath(workspace) },
          { label: "Mở thư mục dữ liệu", click: () => void shell.openPath(IS_DEV ? path.join(__dirname, "..", ".data") : path.join(userDir, "data")) },
          { type: "separator" },
          { role: "quit", label: "Thoát" },
        ],
      },
      {
        label: "Xem",
        submenu: [
          { role: "reload", label: "Tải lại" },
          { role: "togglefullscreen", label: "Toàn màn hình" },
          { role: "resetZoom", label: "Phóng to mặc định" },
          { role: "zoomIn", label: "Phóng to" },
          { role: "zoomOut", label: "Thu nhỏ" },
          { role: "toggleDevTools", label: "Công cụ dev" },
        ],
      },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.whenReady().then(async () => {
    buildMenu();
    buildTray();
    try {
      const port = await startServer();
      createWindow(IS_DEV ? DEV_CLIENT_URL : `http://127.0.0.1:${port}`);
      // Khởi động cùng Windows thì chạy ẩn dưới khay.
      if (process.argv.includes("--hidden")) mainWindow.hide();
      else mainWindow.once("focus", () => mainWindow.flashFrame(false));
    } catch (err) {
      dialog.showErrorBox("FunnyOVS", `Không khởi động được server nội bộ:\n${err instanceof Error ? err.message : err}`);
      quitting = true;
      stopServer();
      app.quit();
    }
  });

  // Cửa sổ chỉ bị ẩn (xuống khay), nên không thoát khi hết cửa sổ.
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    stopServer();
  });
}
