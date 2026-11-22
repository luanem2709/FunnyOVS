/**
 * Máy chủ xem thử CÁCH LY — dùng để mở giao diện, chụp màn hình, chạy kiểm thử trình duyệt mà không đụng vào dữ liệu thật.
 *
 *  - Cổng riêng (mặc định 8799, đổi bằng PREVIEW_PORT), chỉ lắng nghe 127.0.0.1.
 *  - Thư mục dữ liệu + workspace là thư mục tạm, xoá khi thoát. Không có khoá AI/email nào (trừ biến môi trường bạn truyền vào).
 *  - Phục vụ bản build trong `dist/` (chạy `npx vite build` trước).
 *
 *   node scripts/preview-server.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PREVIEW_PORT ?? "8799";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-preview-"));

const env = {
  ...process.env,
  PORT: port,
  OFFICE_HOST: "127.0.0.1",
  OFFICE_HOME: home,
  OFFICE_DATA_DIR: path.join(home, "data"),
  OFFICE_WORKSPACE: path.join(home, "workspace"),
  OFFICE_CLIENT_DIST: path.join(root, "dist"),
};

// `node --import tsx` chạy thẳng một tiến trình (không qua vỏ tsx) → dừng là dừng hẳn, dọn thư mục tạm được ngay.
const child = spawn(process.execPath, ["--import", "tsx", path.join(root, "src", "server", "main.ts")], {
  cwd: root,
  env,
  stdio: "inherit",
});

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    // Windows giữ khoá file SQLite thêm một chút sau khi tiến trình con thoát → thử lại vài lần.
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch {
    /* thư mục tạm; hệ điều hành sẽ dọn */
  }
}
function stop() {
  // Đợi tiến trình con thoát hẳn rồi mới xoá thư mục dữ liệu tạm (nó còn đang giữ file).
  child.once("exit", () => {
    cleanup();
    process.exit(0);
  });
  child.kill();
  setTimeout(() => {
    cleanup();
    process.exit(0);
  }, 4000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// PREVIEW_STDIN_CLOSE=1 (đặt bởi scripts/verify-ui.mjs): bên cha đóng stdin = dọn dẹp và thoát. Mặc định tắt để không tự dừng khi stdin bị đóng.
if (process.env.PREVIEW_STDIN_CLOSE === "1") {
  process.stdin.on("end", stop);
  process.stdin.resume();
}
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
console.log(`[preview] http://127.0.0.1:${port}/office-3d/  (dữ liệu tạm: ${home})`);
