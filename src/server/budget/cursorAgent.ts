/**
 * Backend LLM #1: Cursor CLI (`cursor-agent`).
 *
 * Đây là backend dùng token từ gói Cursor của bạn — không cần API key riêng.
 *
 * Đã kiểm chứng trên máy (2026-11-01):
 *   - Cờ thật: -p/--print, --output-format json, --model, --mode plan|ask,
 *               --workspace, --trust, --header, --list-models, --stream-partial-output
 *   - `--sandbox enabled` KHÔNG chạy trên Windows → ta tự cô lập.
 *   - Token phải truyền qua biến `CURSOR_AUTH_TOKEN`
 *     (truyền `CURSOR_API_KEY` sẽ bị từ chối: "The provided API key is invalid").
 *   - Output JSON có `usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getCursorAuth } from "../budget/cursorAuth.js";

export type CursorAgentMode = "plan" | "ask" | "default";

export interface CursorAgentOptions {
  prompt: string;
  /** Thư mục làm việc — luôn nằm trong sandbox của ứng dụng. */
  workspace: string;
  /** Id model, ví dụ "auto" hoặc "grok-4.7-high". */
  model?: string;
  /** plan = chỉ đọc + lập kế hoạch; ask = hỏi đáp, chỉ đọc. */
  mode?: CursorAgentMode;
  /** Timeout cứng (ms). */
  timeoutMs?: number;
  /** Bổ sung thư mục vào workspace (mặc định KHÔNG dùng). */
  addDirs?: string[];
}

export interface CursorAgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CursorAgentResult {
  ok: boolean;
  text: string;
  usage: CursorAgentUsage;
  /** Model thực tế đã dùng (nếu CLI báo). */
  model?: string;
  /** Thời gian chạy (ms). */
  durationMs: number;
  /** Mã lỗi hoặc thông báo lỗi. */
  error?: string;
  /** Có phải lỗi "hết hạn mức" không. */
  quotaExhausted?: boolean;
}

/** Tìm launcher của Cursor CLI trên máy. */
export function resolveAgentExe(): string | null {
  const fromEnv = process.env.CURSOR_AGENT_EXE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const root = path.join(local, "cursor-agent");
  for (const name of ["agent.cmd", "cursor-agent.cmd", "agent", "cursor-agent"]) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Model mà tài khoản Free được phép dùng (chỉ "auto"). */
export const FREE_TIER_MODELS = ["auto"];

export function buildArgs(opts: CursorAgentOptions): string[] {
  const args = ["-p", "--output-format", "json"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.mode === "plan" || opts.mode === "ask") args.push("--mode", opts.mode);
  args.push("--workspace", opts.workspace);
  // Workspace luôn là sandbox do ứng dụng tạo → tin cậy được.
  // (Không dùng --force/--yolo: chúng cho phép chạy mọi lệnh không hỏi.)
  args.push("--trust");
  for (const d of opts.addDirs ?? []) args.push("--add-dir", d);
  return args;
}

/** Môi trường tối thiểu cho tiến trình con — không rò rỉ secret của máy. */
function cleanEnv(home: string): NodeJS.ProcessEnv {
  const keep = new Set(["PATH", "SystemRoot", "SystemDrive", "TEMP", "TMP", "COMSPEC", "PATHEXT", "WINDIR"]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (keep.has(k.toUpperCase()) && typeof v === "string") out[k] = v;
  }
  out.HOME = home;
  out.USERPROFILE = home;
  out.CURSOR_AUTH_TOKEN = getCursorAuth().token;
  return out;
}

function parseUsage(raw: any): CursorAgentUsage {
  const u = raw?.usage ?? {};
  return {
    inputTokens: Number(u.inputTokens ?? 0),
    outputTokens: Number(u.outputTokens ?? 0),
    cacheReadTokens: Number(u.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(u.cacheWriteTokens ?? 0),
  };
}

/** Phân loại lỗi để biết có phải hết hạn mức hay không. */
function classifyError(msg: string): { quotaExhausted: boolean } {
  const m = msg.toLowerCase();
  const quotaExhausted =
    m.includes("usage limit") ||
    m.includes("out of usage") ||
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("hard_block");
  return { quotaExhausted };
}

/**
 * Chạy Cursor CLI một lượt và trả về kết quả + token thật.
 * Không ném lỗi — lỗi được trả về trong `error` để caller ghi ledger.
 */
export async function runCursorAgent(opts: CursorAgentOptions): Promise<CursorAgentResult> {
  const started = Date.now();
  const exe = resolveAgentExe();
  if (!exe) {
    return {
      ok: false,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 0,
      error: "Không tìm thấy Cursor CLI. Cài bằng: irm 'https://cursor.com/install?win32=true' | iex",
    };
  }
  const auth = getCursorAuth();
  if (!auth.token) {
    return {
      ok: false,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 0,
      error: "Chưa đăng nhập Cursor. Chạy `agent login` hoặc đặt CURSOR_AUTH_TOKEN.",
    };
  }

  // HOME riêng cho tiến trình con → CLI không đọc được khoá/credential của máy bạn.
  const sandboxHome = path.join(opts.workspace, ".cursor-home");
  fs.mkdirSync(sandboxHome, { recursive: true });

  const args = [...buildArgs(opts), opts.prompt];
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return new Promise<CursorAgentResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(exe, args, {
      cwd: opts.workspace,
      env: cleanEnv(sandboxHome),
      shell: true,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: Date.now() - started,
        error: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;

      if (killed) {
        resolve({
          ok: false,
          text: "",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          durationMs,
          error: `Cursor CLI quá thời gian (${timeoutMs}ms) — đã dừng.`,
        });
        return;
      }

      // CLI có thể in log lẫn JSON; lấy dòng JSON cuối cùng bắt đầu bằng '{'.
      const raw = extractJson(stdout);
      if (raw) {
        const usage = parseUsage(raw);
        if (raw.is_error || raw.subtype === "error") {
          const msg = String(raw.result ?? raw.error ?? "Cursor CLI báo lỗi.");
          resolve({
            ok: false,
            text: "",
            usage,
            durationMs,
            error: msg,
            ...classifyError(msg),
          });
          return;
        }
        resolve({
          ok: true,
          text: String(raw.result ?? ""),
          usage,
          durationMs,
          model: raw.model,
        });
        return;
      }

      const errText = (stderr || stdout || `Cursor CLI kết thúc với mã ${code}`).trim();
      resolve({
        ok: false,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs,
        error: errText.slice(0, 2000),
        ...classifyError(errText),
      });
    });
  });
}

/** Tìm đoạn JSON cuối cùng trong output (CLI có thể trộn log). */
function extractJson(stdout: string): any | null {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj && (obj.result !== undefined || obj.is_error !== undefined)) return obj;
    } catch {
      /* thử dòng trước */
    }
  }
  // Thử parse toàn bộ output như JSON (trường hợp output nằm trên nhiều dòng).
  const first = stdout.indexOf("{");
  if (first >= 0) {
    try {
      return JSON.parse(stdout.slice(first));
    } catch {
      /* ignore */
    }
  }
  return null;
}
