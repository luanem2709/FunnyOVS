/**
 * Executor — lớp thực thi hành động (GĐ 4).
 *
 * Ranh giới kiến trúc quan trọng nhất của GĐ 4:
 *
 *   LLM  ──đề xuất──▶  JSON hành động  ──parse (có kiểu)──▶  Executor
 *                                                                  │
 *                                          kiểm tra quyền ◀─────┤
 *                                          kiểm tra taint ◀─────┤
 *                                          chốt chặn (chặt) ◀───┤
 *                                          chống vòng lặp ◀─────┤
 *                                          ghi nhật ký ◀─────────┘
 *
 * LLM **không bao giờ** gọi trực tiếp `child_process`, `fs`, hay bất kỳ
 * hành động máy nào. Mọi thứ đều đi qua `Action` đã được kiểm tra kiểu.
 *
 * Ba cấp quyền:
 *   - `sandbox` (mặc định): chỉ đọc/ghi trong workspace, không chạy lệnh,
 *     không điều khiển chuột/bàn phím.
 *   - `granted`: đã được người dùng cấp quyền cụ thể (hộp thoại 4 lựa chọn).
 *   - `full` (Toàn quyền): mặc định **TẮT**; phải xác nhận 2 bước + hẹn giờ.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  parseAction,
  actionDoc,
  describe,
  type Action,
  type ActionType,
  type PermissionLevel,
} from "./actionSchema.js";
import { ActionLog, type ActionLogEntry } from "./actionLog.js";
import { LoopGuard, type LoopGuardOptions } from "./loopGuard.js";
import { runPowerShell, killProcessTree, type RunResult } from "./powerShell.js";
import { checkPath, isWithin, workspaceRoot } from "../sandbox/pathGuard.js";
import { evaluateUrl, DEFAULT_POLICY } from "../browser/policy.js";
import { TrashBin } from "./trashBin.js";
import {
  RecordingInputController,
  type InputController,
  type Screenshot,
} from "./inputController.js";

export interface ExecResult {
  ok: boolean;
  /** Dữ liệu trả về (tùy hành động). */
  data?: unknown;
  /** Thông báo lỗi. */
  error?: string;
  /** Mã lỗi chuẩn. */
  code?: string;
  /** Hành động có cần người dùng duyệt không (khi bị chặn). */
  needsApproval?: boolean;
  /** Lý do bị chặn (để hiển thị). */
  blockedReason?: string;
  /** Thời gian chạy (ms) — gán sau khi dispatch trả về. */
  durationMs?: number;
}

/**
 * Driver cho thiết bị (chuột/bàn phím/màn hình).
 *
 * Tách ra để:
 *  - Test dùng MOCK (không đụng máy thật — quy tắc an toàn khi phát triển).
 *  - Thư viện thật (nut.js / robotjs) cắm vào sau này mà không sửa Executor.
 */
export interface DeviceDriver {
  click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(key: string, modifiers: string[]): Promise<void>;
  screenshot(region?: { x: number; y: number; w: number; h: number }): Promise<{
    mimeType: string;
    base64: string;
  }>;
}

/** Driver mặc định: KHÔNG làm gì cả (an toàn khi phát triển). */
export const NOOP_DEVICE: DeviceDriver = {
  async click() {
    throw new Error("Chưa cài driver điều khiển chuột/bàn phím.");
  },
  async typeText() {
    throw new Error("Chưa cài driver điều khiển chuột/bàn phím.");
  },
  async keyPress() {
    throw new Error("Chưa cài driver điều khiển chuột/bàn phím.");
  },
  async screenshot() {
    throw new Error("Chưa cài driver chụp màn hình.");
  },
};

/** Adapter: dùng InputController (có overlay) làm DeviceDriver. */
export function deviceFromController(controller: InputController): DeviceDriver {
  return {
    async click(x, y, button, clicks) {
      await controller.click(x, y, button, clicks);
    },
    async typeText(text) {
      await controller.typeText(text);
    },
    async keyPress(key, modifiers) {
      await controller.keyPress(key, modifiers);
    },
    async screenshot(region) {
      const s: Screenshot = await controller.screenshot(region);
      return { mimeType: s.mimeType, base64: s.base64 };
    },
  };
}

/** Kết quả kiểm tra quyền trước khi chạy. */
export type Precheck =
  | { ok: true }
  | { ok: false; code: string; reason: string; needsApproval: boolean };

export interface ExecutorDeps {
  /** Thư mục làm việc (mặc định workspace). */
  workspace?: string;
  /** Nhật ký hành động. */
  log: ActionLog;
  /** Driver thiết bị (mặc định NOOP). */
  device?: DeviceDriver;
  /** Cấp quyền hiện hành. */
  getLevel: () => PermissionLevel;
  /** Phiên có bị nhiễm (taint) không. */
  isTainted: () => boolean;
  /** Thùng rác để chuyển file vào (thay vì xóa hẳn). */
  trashDir?: string;
  /** Hỏi người dùng (trả về true = được phép). */
  askUser?: (action: Action, reason: string) => Promise<boolean>;
  /** Kiểm tra một đường dẫn có được phép thao tác không (theo grant hiện có). */
  checkPathPermission?: (
    agentId: string,
    target: string,
    need: "read" | "write" | "delete",
  ) => { allowed: boolean; reason?: string; needsApproval?: boolean };
}

/** Hành động chỉ được chạy ở Cấp 2+ (Cấp 1 luôn chặn). */
const NEEDS_GRANTED: ActionType[] = [
  "run_command",
  "write_file",
  "delete_file",
  "move_to_trash",
  "open_app",
  "click",
  "type_text",
  "key_press",
  "http_request",
];

/** Hành động chỉ chạy được ở Cấp 3 (Toàn quyền). */
const NEEDS_FULL: ActionType[] = ["click", "type_text", "key_press", "screenshot", "open_app"];

/**
 * Việc khó hoàn tác → LUÔN hỏi lại người dùng, kể cả ở Cấp 3.
 *
 * Yêu cầu của người dùng (GĐ 5): "Luôn hỏi lại việc khó hoàn tác: xóa hàng loạt,
 * format, registry, tắt tường lửa/antivirus, đổi mật khẩu, thanh toán,
 * gửi tin/email/đăng bài, gửi file ra internet, cài driver."
 */
const ALWAYS_ASK_PATTERNS: RegExp[] = [
  // Xóa hàng loạt.
  /\b(remove-item|rm|del|rmdir|rd)\b/i,
  /\b(format|diskpart|clean)\b/i,
  // Registry.
  /\b(reg(\.exe)?\s+(add|delete|import|regedit)|set-itemproperty.*registry|hkey_)\b/i,
  // Tường lửa / antivirus / quyền hệ thống.
  /\b(netsh\s+advfirewall|set-executionpolicy|set-mppreference|disable-windowsoptionalfeature|new-item.*hklm:)\b/i,
  // Đổi mật khẩu / tài khoản.
  /\b(net\s+user|passwd|set-password|change-password|convertto-securestring|set-credential)\b/i,
  // Thanh toán / gửi tin / đăng bài.
  /\b(payment|paypal|stripe|checkout|buy|purchase)\b/i,
  /\b(sendmail|send-mail|smtp|telegram|discord-webhook|slack-webhook|whatsapp|post-to)\b/i,
  // Gửi dữ liệu ra ngoài.
  /\b(curl|invoke-webrequest|invoke-restmethod|wget|scp|sftp|rsync|azcopy)\b/i,
  // Cài driver / phần mềm hệ thống.
  /\b(install|msiexec|dism|driver|setup\.exe)\b/i,
];

/** Lệnh nguy hiểm bất kể nội dung — luôn hỏi. */
const ALWAYS_ASK_COMMANDS = [
  "shutdown",
  "restart-computer",
  "stop-computer",
  "format-volume",
  "clear-disk",
  "initialize-disk",
  "remove-item",
  "del ",
  "rd /s",
  "reg delete",
  "reg add",
  "netsh advfirewall",
  "set-mppreference",
  "set-executionpolicy",
  "install",
  "msiexec",
  "certutil",
  "bitsadmin",
  "vssadmin delete",
  "wbadmin delete",
  "cipher /w",
  "takeown",
  "icacls",
  "attrib",
];

/** Hành động làm nhiễm phiên (đọc nội dung không tin cậy). */
const TAINTING: ActionType[] = ["read_file", "http_request"];

export class Executor {
  private readonly workspace: string;
  private readonly device: DeviceDriver;
  private readonly trashDir: string;
  private readonly trashBin: TrashBin;
  /** Các tiến trình đang chạy (để Dừng khẩn cấp kill được). */
  private running = new Map<string, number>();

  constructor(private readonly deps: ExecutorDeps) {
    this.workspace = deps.workspace ?? workspaceRoot();
    this.device = deps.device ?? NOOP_DEVICE;
    this.trashDir = deps.trashDir ?? path.join(this.workspace, ".trash");
    this.trashBin = new TrashBin(this.trashDir);
  }

  /**
   * Parse + kiểm tra + chạy một hành động.
   *
   * @param raw JSON do LLM sinh (object hoặc chuỗi JSON).
   */
  async execute(
    agentId: string,
    agentName: string,
    raw: unknown,
    guard?: LoopGuard,
  ): Promise<ExecResult> {
    const started = Date.now();

    // 1) Parse có kiểu.
    const parsed = typeof raw === "string" ? safeJsonParse(raw) : raw;
    const p = parseAction(parsed);
    if (!p.ok) {
      this.deps.log.append({
        agentId,
        agentName,
        type: "invalid",
        description: "Hành động không hợp lệ",
        ok: false,
        code: "invalid_action",
        error: p.error,
        durationMs: Date.now() - started,
        level: this.deps.getLevel(),
      });
      return { ok: false, error: p.error, code: "invalid_action", durationMs: Date.now() - started };
    }

    const action = p.action;
    const doc = actionDoc(action.type);

    // 2) Kiểm tra quyền (trước khi chạm bất cứ thứ gì).
    const pre = await this.precheck(agentId, action);
    if (!pre.ok) {
      this.deps.log.append({
        agentId,
        agentName,
        type: action.type,
        description: action.description,
        params: this.sanitizeParams(action),
        ok: false,
        code: pre.code,
        error: pre.reason,
        durationMs: Date.now() - started,
        level: this.deps.getLevel(),
        tainted: TAINTING.includes(action.type) ? this.deps.isTainted() : false,
      });
      return {
        ok: false,
        error: pre.reason,
        code: pre.code,
        needsApproval: pre.needsApproval,
        blockedReason: pre.reason,
        durationMs: Date.now() - started,
      };
    }

    // 3) Chạy.
    let result: ExecResult;
    try {
      result = await this.dispatch(agentId, action);
    } catch (e) {
      result = { ok: false, error: (e as Error).message, code: "exception", durationMs: 0 };
    }
    result.durationMs = Date.now() - started;

    // 4) Ghi nhật ký (chỉ ghi thêm).
    this.deps.log.append({
      agentId,
      agentName,
      type: action.type,
      description: action.description,
      params: this.sanitizeParams(action),
      ok: result.ok,
      code: result.code,
      error: result.error,
      durationMs: result.durationMs,
      level: this.deps.getLevel(),
      tainted: TAINTING.includes(action.type) ? this.deps.isTainted() : false,
    });

    // 5) Chống vòng lặp.
    if (guard) {
      const g = guard.record(action.type, action.params, { ok: result.ok, error: result.error });
      if (!g.ok) {
        return { ok: false, error: g.reason, code: `limit_${g.limit}`, durationMs: result.durationMs };
      }
    }

    return result;
  }

  /**
   * Kiểm tra quyền cho một hành động.
   * Trả về `{ok:true}` nếu được chạy.
   */
  async precheck(agentId: string, action: Action): Promise<Precheck> {
    const level = this.deps.getLevel();

    // Cấp 1 (Sandbox): chặn mọi hành động nguy hiểm.
    if (level === "sandbox" && NEEDS_GRANTED.includes(action.type)) {
      return {
        ok: false,
        code: "need_grant",
        reason: `Hành động "${action.type}" cần cấp quyền "Được cấp" (Cấp 2).`,
        needsApproval: true,
      };
    }

    // Điều khiển chuột/bàn phím/chụp màn hình: chỉ ở Cấp 3.
    if (level !== "full" && NEEDS_FULL.includes(action.type)) {
      return {
        ok: false,
        code: "need_full",
        reason: `Hành động "${action.type}" chỉ chạy được ở Cấp 3 (Toàn quyền).`,
        needsApproval: true,
      };
    }

    // Taint: sau khi đọc nội dung không tin cậy, hành động nguy hiểm phải hỏi.
    if (this.deps.isTainted() && NEEDS_GRANTED.includes(action.type)) {
      const approved = (await this.deps.askUser?.(action, "Phiên đang bị nhiễm (đã đọc nội dung không tin cậy).")) ?? false;
      if (!approved) {
        return {
          ok: false,
          code: "tainted",
          reason: "Phiên bị nhiễm — hành động nguy hiểm cần bạn duyệt (chưa được duyệt).",
          needsApproval: true,
        };
      }
    }

    // Việc khó hoàn tác → luôn hỏi (kể cả Cấp 3).
    if (this.mustAlwaysAsk(action)) {
      const approved = (await this.deps.askUser?.(action, "Việc khó hoàn tác — cần bạn xác nhận.")) ?? false;
      if (!approved) {
        return {
          ok: false,
          code: "always_ask",
          reason: "Việc khó hoàn tác — chưa được bạn xác nhận.",
          needsApproval: true,
        };
      }
    }

    // Đường dẫn: chuẩn hóa + kiểm tra quyền file.
    const pathAction = this.pathOf(action);
    if (pathAction) {
      const check = checkPath(pathAction.target, this.workspace);
      if (!check.ok) {
        // Ngoài workspace → cần grant (Cấp 2+). Trong Cấp 3 vẫn cần grant
        // cho vùng bị chặn cứng; vùng khác thì Cấp 3 cho phép.
        if (level === "full" && check.code === "outside_workspace") {
          // Cấp 3 được phép ngoài workspace (trừ vùng chặn cứng).
        } else if (check.code === "hard_blocked") {
          return {
            ok: false,
            code: "hard_blocked",
            reason: check.reason ?? "Đường dẫn nằm trong vùng bị chặn cứng.",
            needsApproval: false,
          };
        } else {
          const perm = this.deps.checkPathPermission?.(
            agentId,
            pathAction.target,
            pathAction.need,
          );
          // FAIL-CLOSED: nếu không có cơ chế kiểm tra quyền đường dẫn thì
          // KHÔNG được chạy — tuyệt đối không "mặc định cho phép".
          if (!perm) {
            return {
              ok: false,
              code: "need_path_grant",
              reason:
                check.reason ??
                "Đường dẫn nằm ngoài thư mục làm việc và chưa có cơ chế kiểm tra quyền.",
              needsApproval: true,
            };
          }
          if (!perm.allowed) {
            return {
              ok: false,
              code: "need_path_grant",
              reason: perm.reason ?? "Cần cấp quyền cho đường dẫn này.",
              needsApproval: perm.needsApproval ?? true,
            };
          }
        }
      }
    }

    // URL: chặn SSRF / metadata.
    if (action.type === "http_request") {
      const url = (action.params as { url: string }).url;
      const v = evaluateUrl(url, DEFAULT_POLICY);
      if (!v.allowed) {
        return {
          ok: false,
          code: "url_blocked",
          reason: v.reason ?? "URL bị chặn.",
          needsApproval: false,
        };
      }
    }

    return { ok: true };
  }

  /**
   * Nếu hành động có tham số đường dẫn → trả về đường dẫn + mức quyền cần.
   */
  private pathOf(action: Action): { target: string; need: "read" | "write" | "delete" } | null {
    const p = action.params as Record<string, unknown>;
    switch (action.type) {
      case "read_file":
        return { target: String(p.path), need: "read" };
      case "list_dir":
      case "search_files":
        return { target: String(p.path ?? p.root ?? "."), need: "read" };
      case "write_file":
        return { target: String(p.path), need: "write" };
      case "delete_file":
      case "move_to_trash":
        return { target: String(p.path), need: "delete" };
      default:
        return null;
    }
  }

  /** Hành động này có phải việc khó hoàn tác không (luôn phải hỏi)? */
  mustAlwaysAsk(action: Action): boolean {
    const doc = actionDoc(action.type);
    if (doc?.alwaysAsk) return true;
    // Xóa hẳn (không qua Thùng rác) → không hoàn tác được → phải hỏi.
    // Xóa qua Thùng rác → hoàn tác được → chỉ cần ở Cấp 2/3.
    if (action.type === "delete_file") {
      const toTrash = (action.params as { toTrash?: boolean }).toTrash;
      return toTrash === false;
    }
    if (action.type !== "run_command") return false;
    const cmd = String((action.params as { command: string }).command);
    if (ALWAYS_ASK_COMMANDS.some((c) => cmd.toLowerCase().includes(c))) return true;
    return ALWAYS_ASK_PATTERNS.some((re) => re.test(cmd));
  }

  /** Thực thi hành động đã qua kiểm tra. */
  private async dispatch(agentId: string, action: Action): Promise<ExecResult> {
    switch (action.type) {
      case "run_command": {
        const { command, cwd, timeoutMs } = action.params as {
          command: string;
          cwd?: string;
          timeoutMs?: number;
        };
        // cwd phải nằm trong workspace (chuẩn hóa trước).
        let workDir = this.workspace;
        if (cwd) {
          const c = checkPath(cwd, this.workspace);
          workDir = c.ok && c.resolved ? c.resolved : this.workspace;
        }
        const run: RunResult = await runPowerShell(command, workDir, timeoutMs ?? 60_000, (child) => {
          if (child.pid) this.running.set(agentId, child.pid);
        });
        // Dọn bản ghi tiến trình (nếu không, số tiến trình "đang chạy" tích luỹ).
        this.running.delete(agentId);
        if (run.timedOut) {
          return { ok: false, code: "timeout", error: `Lệnh vượt thời gian — đã kill cây tiến trình.` };
        }
        if (run.error) {
          return { ok: false, code: "spawn_failed", error: run.error };
        }
        return {
          ok: run.ok,
          code: run.ok ? undefined : "exit_code",
          error: run.ok ? undefined : `Lệnh thất bại (exit ${run.code}): ${run.stderr.slice(0, 500)}`,
          data: { stdout: run.stdout, stderr: run.stderr, code: run.code },
        };
      }

      case "read_file": {
        const { path: target } = action.params as { path: string };
        const abs = this.resolveSafe(target);
        const data = await fs.readFile(abs, "utf8");
        return { ok: true, data };
      }

      case "write_file": {
        const { path: target, content, mode } = action.params as {
          path: string;
          content: string;
          mode?: "overwrite" | "append";
        };
        const abs = this.resolveSafe(target);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        if (mode === "append") await fs.appendFile(abs, content, "utf8");
        else await fs.writeFile(abs, content, "utf8");
        return { ok: true, data: { path: abs, bytes: content.length } };
      }

      case "list_dir": {
        const { path: target } = action.params as { path: string };
        const abs = this.resolveSafe(target);
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return {
          ok: true,
          data: entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
          })),
        };
      }

      case "delete_file": {
        const { path: target, toTrash } = action.params as { path: string; toTrash?: boolean };
        const abs = this.resolveSafe(target);
        // Mặc định chuyển vào Thùng rác (Cấp 2/3); Cấp 1 không tới đây.
        if (toTrash !== false) {
          const moved = await this.toTrash(abs);
          return { ok: true, data: { trashed: moved, original: abs } };
        }
        await fs.rm(abs, { recursive: true, force: true });
        return { ok: true, data: { deleted: abs } };
      }

      case "move_to_trash": {
        const { path: target } = action.params as { path: string };
        const abs = this.resolveSafe(target);
        const moved = await this.toTrash(abs);
        return { ok: true, data: { trashed: moved, original: abs } };
      }

      case "search_files": {
        const { root, pattern, maxResults } = action.params as {
          root?: string;
          pattern: string;
          maxResults?: number;
        };
        const base = root ? this.resolveSafe(root) : this.workspace;
        const limit = maxResults ?? 100;
        const re = globToRegExp(pattern);
        const out: string[] = [];
        const walk = async (dir: string, depth: number): Promise<void> => {
          if (out.length >= limit || depth > 8) return;
          let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
          try {
            entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as Array<{
              name: string;
              isDirectory: () => boolean;
              isFile: () => boolean;
            }>;
          } catch {
            return;
          }
          for (const e of entries) {
            if (out.length >= limit) return;
            if (e.name.startsWith(".")) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await walk(full, depth + 1);
            else if (re.test(e.name)) out.push(full);
          }
        };
        await walk(base, 0);
        return { ok: true, data: out.slice(0, limit) };
      }

      case "open_app": {
        const { app, args } = action.params as { app: string; args?: string[] };
        // Mở app = chạy lệnh; chỉ Cấp 3 mới tới được đây.
        const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
        const cmd = [`Start-Process`, quote(app), ...(args ?? []).map(quote)].join(" ");
        const run = await runPowerShell(cmd, this.workspace, 20_000);
        return {
          ok: run.ok,
          code: run.ok ? undefined : "open_failed",
          error: run.ok ? undefined : run.stderr.slice(0, 300),
        };
      }

      case "click": {
        const { x, y, button, clicks } = action.params as {
          x: number;
          y: number;
          button?: "left" | "right" | "middle";
          clicks?: number;
        };
        await this.device.click(x, y, button ?? "left", clicks ?? 1);
        return { ok: true, data: { x, y, button: button ?? "left" } };
      }

      case "type_text": {
        const { text } = action.params as { text: string };
        await this.device.typeText(text);
        return { ok: true };
      }

      case "key_press": {
        const { key, modifiers } = action.params as { key: string; modifiers?: string[] };
        await this.device.keyPress(key, modifiers ?? []);
        return { ok: true };
      }

      case "screenshot": {
        const { region } = action.params as { region?: { x: number; y: number; w: number; h: number } };
        const shot = await this.device.screenshot(region);
        return { ok: true, data: shot };
      }

      case "http_request": {
        const { url, method, body } = action.params as {
          url: string;
          method?: string;
          body?: string;
        };
        const res = await fetch(url, {
          method: method ?? "GET",
          body,
          redirect: "follow",
        });
        const text = await res.text();
        return { ok: res.ok, code: res.ok ? undefined : "http_error", data: { status: res.status, body: text.slice(0, 100_000) } };
      }

      case "wait": {
        const { ms } = action.params as { ms: number };
        await new Promise((r) => setTimeout(r, ms));
        return { ok: true };
      }

      default:
        return { ok: false, code: "unsupported", error: `Hành động chưa hỗ trợ: ${action.type}` };
    }
  }

  /**
   * Chuyển file/thư mục vào Thùng rác (không xóa hẳn — có thể khôi phục).
   */
  private async toTrash(abs: string): Promise<string> {
    const dest = await this.trash.move(abs);
    return dest ?? abs;
  }

  /** Thùng rác (để UI liệt kê + khôi phục). */
  get trash(): TrashBin {
    return this.trashBin;
  }

  /** Đường dẫn tuyệt đối đã chuẩn hóa, luôn nằm trong workspace. */
  private resolveSafe(target: string): string {
    const c = checkPath(target, this.workspace);
    if (c.ok && c.resolved) return c.resolved;
    // Ngoài workspace mà đã qua precheck → dùng đường dẫn tuyệt đối.
    const abs = path.resolve(this.workspace, target);
    return isWithin(this.workspace, abs) ? abs : abs;
  }

  /** Tham số để ghi log (bỏ nội dung nhạy cảm). */
  private sanitizeParams(action: Action): Record<string, unknown> {
    const p = { ...(action.params as Record<string, unknown>) };
    if (typeof p.content === "string") p.content = `<${p.content.length} ký tự>`;
    if (typeof p.text === "string") p.text = `<${p.text.length} ký tự>`;
    if (typeof p.body === "string") p.body = `<${p.body.length} ký tự>`;
    return p;
  }

  /** Kill mọi lệnh đang chạy (Dừng khẩn cấp). */
  killAll(): number {
    let n = 0;
    for (const pid of this.running.values()) {
      if (killProcessTree(pid)) n++;
    }
    this.running.clear();
    return n;
  }

  /** Có lệnh nào đang chạy không. */
  get runningCount(): number {
    return this.running.size;
  }
}

/** Parse JSON an toàn. */
function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    return { __parseError: (e as Error).message };
  }
}

/** Chuyển mẫu glob đơn giản (`*.ts`, `a*`) thành RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const rx = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${rx}$`, "i");
}

export { describe, ActionLog };
export type { Action, ActionType, PermissionLevel, ActionLogEntry };
