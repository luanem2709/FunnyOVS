/**
 * Máy chủ DEMO cách ly với LLM giả CHẬM — để chụp ảnh/kiểm tra những lúc việc còn đang chạy (bảng việc sống, huy hiệu trên bàn).
 * Khởi động một LLM giả (độ trễ lớn) + máy chủ cách ly (dữ liệu tạm), in địa chỉ rồi chạy tới khi bị dừng (Ctrl+C / SIGTERM).
 *
 *   node scripts/demo-server.mjs            # http://127.0.0.1:8820/office-3d/ ; mỗi lệnh gọi LLM mất ~DEMO_DELAY_MS
 *
 * Biến môi trường: DEMO_PORT (8820), DEMO_MOCK_PORT (11440), DEMO_DELAY_MS (12000).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.DEMO_PORT ?? "8820";
const mockPort = process.env.DEMO_MOCK_PORT ?? "11440";
const delay = process.env.DEMO_DELAY_MS ?? "12000";

const mock = spawn(process.execPath, [path.join(root, "scripts", "mock-llm.mjs")], { env: { ...process.env, MOCK_PORT: mockPort, MOCK_DELAY_MS: delay }, stdio: "ignore" });
const server = spawn(process.execPath, [path.join(root, "scripts", "preview-server.mjs")], {
  env: { ...process.env, PREVIEW_PORT: port, PREVIEW_STDIN_CLOSE: "1", OLLAMA_HOST: `127.0.0.1:${mockPort}` },
  stdio: ["pipe", "inherit", "inherit"],
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  mock.kill();
  server.once("exit", () => process.exit(0));
  server.stdin?.end(); // máy chủ cách ly tự dọn thư mục tạm khi stdin đóng
  setTimeout(() => process.exit(0), 9000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Mặc định chạy tới khi bị dừng; đặt DEMO_STDIN_CLOSE=1 để tự dọn khi bên cha đóng stdin.
if (process.env.DEMO_STDIN_CLOSE === "1") {
  process.stdin.on("end", stop);
  process.stdin.resume();
}
console.log(`[demo] http://127.0.0.1:${port}/office-3d/  (LLM giả chậm ${delay} ms/lệnh, cổng ${mockPort})`);
