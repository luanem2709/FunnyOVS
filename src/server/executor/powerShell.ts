/**
 * Chạy lệnh PowerShell với TIMEOUT CỨNG và KILL CẢ CÂY TIẾN TRÌNH (GĐ 4).
 *
 * Yêu cầu: "PowerShell với timeout cứng, kill cả cây tiến trình."
 *
 * Vì sao cần kill cả cây:
 *  - `powershell.exe -Command "npm run dev"` sẽ sinh ra tiến trình con
 *    (`node.exe`). Nếu chỉ kill tiến trình cha, tiến trình con vẫn sống và giữ
 *    cổng → các lần chạy sau đều lỗi "port in use".
 *  - Windows không có process group như POSIX; ta dùng `taskkill /T /F /PID`.
 *
 * Lưu ý an toàn: lệnh chạy với `-NoProfile` (không nạp profile người dùng,
 * tránh chạy mã lạ từ profile) và không chạy với quyền admin.
 */
import { spawn, type ChildProcess } from "node:child_process";

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** true nếu bị timeout cứng. */
  timedOut: boolean;
  /** true nếu bị hủy (Dừng khẩn cấp). */
  aborted: boolean;
  /** Lỗi khi spawn thất bại. */
  error?: string;
}

/** Giới hạn output để không tràn bộ nhớ. */
const MAX_OUTPUT = 512 * 1024;

/**
 * Chạy lệnh PowerShell.
 *
 * @param command  Lệnh PowerShell (không kèm `powershell -Command`).
 * @param cwd      Thư mục làm việc.
 * @param timeoutMs Timeout cứng (mặc định 60s).
 * @param onSpawn  Callback khi tiến trình đã sinh (để đăng ký kill).
 */
export async function runPowerShell(
  command: string,
  cwd: string,
  timeoutMs = 60_000,
  onSpawn?: (child: ChildProcess) => void,
): Promise<RunResult> {
  const started = Date.now();
  return new Promise<RunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        cwd,
        windowsHide: true,
        // Không dùng shell → không có thêm lớp cmd.exe nào để phải kill.
        shell: false,
        env: { ...process.env, NO_COLOR: "1" },
      },
    );

    const pid = child.pid;

    const killTree = (): void => {
      if (!pid) return;
      try {
        // /T = kill cả cây tiến trình con, /F = ép buộc.
        spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          shell: false,
          stdio: "ignore",
        });
      } catch {
        /* taskkill không chạy được (không phải Windows) → thử child.kill */
      }
      try {
        child.kill("SIGKILL");
      } catch {
        /* đã chết */
      }
    };

    /** Bộ đếm ngược: đủ thời gian cho taskkill chạy xong. */
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
      // Đợi thêm 1.5s để cây tiến trình chết rồi mới kết luận.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          code: null,
          stdout: stdout.slice(0, MAX_OUTPUT),
          stderr: (stderr + `\n[timeout ${timeoutMs}ms — đã kill cây tiến trình]`).slice(0, MAX_OUTPUT),
          durationMs: Date.now() - started,
          timedOut: true,
          aborted,
        });
      }, 1500);
    }, timeoutMs);

    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString("utf8");
    });

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        durationMs: Date.now() - started,
        timedOut,
        aborted,
        error: (e as Error).message,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        durationMs: Date.now() - started,
        timedOut,
        aborted,
      });
    });

    onSpawn?.(child);
  });
}

/**
 * Kill một cây tiến trình theo PID (dùng cho "Dừng khẩn cấp" chạy lệnh dài).
 */
export function killProcessTree(pid: number): boolean {
  try {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      shell: false,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
