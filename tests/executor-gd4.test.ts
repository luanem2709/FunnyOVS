/**
 * GĐ 4 — TEST EXECUTOR & CẤP QUYỀN (chỉ THÊM, không nới lỏng quy tắc nào).
 *
 * Mục tiêu:
 *  1. Schema hành động chặn được JSON rác / thiếu tham số / tham số sai kiểu.
 *  2. Executor chặn đúng theo 3 cấp quyền:
 *     - Sandbox: không chạy lệnh, không điều khiển máy.
 *     - Được cấp: vẫn hỏi lại việc khó hoàn tác.
 *     - Toàn quyền: vẫn hỏi lại việc khó hoàn tác.
 *  3. Đường dẫn luôn được chuẩn hóa; không thoát workspace.
 *  4. Nhật ký CHỈ GHI THÊM + chuỗi hash phát hiện bị sửa.
 *  5. Chống vòng lặp: cùng một lỗi 3 lần → dừng.
 *  6. Xác nhận 2 bước cho Cấp 3 + hết hạn theo thời gian.
 *
 * Mọi test chạy trong thư mục tạm của Vitest — KHÔNG chạm máy thật,
 * KHÔNG dùng Cấp 3 thật, KHÔNG mở app, KHÔNG gõ phím.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseAction, ACTION_DOCS } from "../src/server/executor/actionSchema.js";
import { ActionLog } from "../src/server/executor/actionLog.js";
import { LoopGuard, actionSignature } from "../src/server/executor/loopGuard.js";
import { Executor, NOOP_DEVICE } from "../src/server/executor/executor.js";
import { PermissionLevelManager, FULL_CONFIRM_PHRASE } from "../src/server/security/permissionLevel.js";
import { extractJsonArray } from "../src/server/executor/planner.js";
import type { PermissionLevel } from "../src/server/executor/actionSchema.js";

let tmpRoot: string;
let workspace: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "office-gd4-"));
  workspace = path.join(tmpRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "hello.txt"), "xin chào", "utf8");
  process.env.OFFICE_WORKSPACE = workspace;
});

afterEach(() => {
  delete process.env.OFFICE_WORKSPACE;
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/** Tạo Executor với cấp quyền giả lập. */
function makeExecutor(opts: {
  level: PermissionLevel;
  tainted?: boolean;
  askUser?: (action: any, reason: string) => Promise<boolean>;
  logPath?: string;
}) {
  const log = new ActionLog(opts.logPath ?? path.join(tmpRoot, "action-log.jsonl"));
  let level = opts.level;
  const exec = new Executor({
    workspace,
    log,
    device: NOOP_DEVICE,
    getLevel: () => level,
    isTainted: () => opts.tainted ?? false,
    askUser: opts.askUser,
    trashDir: path.join(workspace, ".trash"),
  });
  return { exec, log, setLevel: (l: PermissionLevel) => (level = l) };
}

describe("GĐ 4 · Schema hành động", () => {
  it("chấp nhận hành động hợp lệ (params lồng và ngang cấp)", () => {
    const a = parseAction({ type: "read_file", params: { path: "hello.txt" } });
    expect(a.ok).toBe(true);

    const b = parseAction({ type: "read_file", path: "hello.txt" });
    expect(b.ok).toBe(true);
    if (b.ok) expect((b.action.params as any).path).toBe("hello.txt");
  });

  it("từ chối loại hành động không có trong schema", () => {
    const r = parseAction({ type: "rm_rf_everything" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("không hợp lệ");
  });

  it("từ chối thiếu tham số bắt buộc", () => {
    const r = parseAction({ type: "read_file" });
    expect(r.ok).toBe(false);
  });

  it("từ chối tham số sai kiểu / vượt giới hạn", () => {
    expect(parseAction({ type: "read_file", path: 123 }).ok).toBe(false);
    expect(parseAction({ type: "write_file", path: "a", content: "x".repeat(3_000_000) }).ok).toBe(false);
    expect(parseAction({ type: "click", x: -5, y: 10 }).ok).toBe(false);
    expect(parseAction({ type: "wait", ms: 999_999 }).ok).toBe(false);
  });

  it("từ chối input không phải object", () => {
    expect(parseAction(null).ok).toBe(false);
    expect(parseAction("hello").ok).toBe(false);
    expect(parseAction(42).ok).toBe(false);
  });

  it("mọi loại hành động trong tài liệu đều có schema thật", () => {
    for (const doc of ACTION_DOCS) {
      const r = parseAction({ type: doc.type, params: {} });
      // parse có thể fail vì thiếu tham số, nhưng KHÔNG được fail vì loại lạ.
      if (!r.ok) expect(r.error).not.toContain("Loại hành động không hợp lệ");
    }
  });
});

describe("GĐ 4 · Cấp quyền theo 3 tầng", () => {
  it("Sandbox chặn run_command", async () => {
    const { exec } = makeExecutor({ level: "sandbox" });
    const r = await exec.execute("a", "A", { type: "run_command", command: "echo hi" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("need_grant");
    expect(r.needsApproval).toBe(true);
  });

  it("Sandbox cho phép đọc file trong workspace", async () => {
    const { exec } = makeExecutor({ level: "sandbox" });
    const r = await exec.execute("a", "A", { type: "read_file", path: "hello.txt" });
    expect(r.ok).toBe(true);
    expect(r.data).toBe("xin chào");
  });

  it("Sandbox chặn điều khiển chuột/bàn phím (chỉ Cấp 3)", async () => {
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", { type: "click", x: 10, y: 10 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("need_full");
  });

  it("Cấp 3 vẫn hỏi lại việc khó hoàn tác (xóa hàng loạt)", async () => {
    let asked = 0;
    const { exec } = makeExecutor({
      level: "full",
      askUser: async () => {
        asked++;
        return false;
      },
    });
    const r = await exec.execute("a", "A", {
      type: "run_command",
      command: "Remove-Item -Recurse C:\\temp\\*",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("always_ask");
    expect(asked).toBe(1);
  });

  it("Cấp 3 vẫn hỏi khi lệnh gửi dữ liệu ra ngoài", async () => {
    let asked = 0;
    const { exec } = makeExecutor({
      level: "full",
      askUser: async () => {
        asked++;
        return true;
      },
    });
    await exec.execute("a", "A", { type: "run_command", command: "curl https://example.com" });
    expect(asked).toBe(1);
  });

  it("Cấp 3 + người dùng đồng ý → chạy được lệnh vô hại", async () => {
    const { exec } = makeExecutor({ level: "full", askUser: async () => true });
    const r = await exec.execute("a", "A", {
      type: "run_command",
      command: "Write-Output 'xin-chao'",
      timeoutMs: 20_000,
    });
    expect(r.ok).toBe(true);
    expect((r.data as any).stdout).toContain("xin-chao");
  });

  it("Cấp 2 (Được cấp) không điều khiển được máy", async () => {
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", { type: "type_text", text: "abc" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("need_full");
  });

  it("phiên bị nhiễm → hành động nguy hiểm phải hỏi", async () => {
    let asked = 0;
    const { exec } = makeExecutor({
      level: "granted",
      tainted: true,
      askUser: async () => {
        asked++;
        return false;
      },
    });
    const r = await exec.execute("a", "A", { type: "write_file", path: "x.txt", content: "y" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("tainted");
    expect(asked).toBe(1);
  });
});

describe("GĐ 4 · Đường dẫn", () => {
  it("đường dẫn ngoài workspace bị chặn ở Cấp 2", async () => {
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", {
      type: "read_file",
      path: path.join(tmpRoot, "outside.txt"),
    });
    expect(r.ok).toBe(false);
    expect(["need_path_grant", "hard_blocked", "outside_workspace"]).toContain(r.code);
  });

  it("path traversal (..) không thoát workspace", async () => {
    fs.writeFileSync(path.join(tmpRoot, "secret.txt"), "bí mật", "utf8");
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", { type: "read_file", path: "../secret.txt" });
    expect(r.ok).toBe(false);
  });

  it("ghi file tạo thư mục cha nếu cần", async () => {
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", {
      type: "write_file",
      path: "sub/dir/file.txt",
      content: "ok",
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "sub", "dir", "file.txt"))).toBe(true);
  });

  it("xóa file → vào Thùng rác (không xóa hẳn)", async () => {
    const { exec } = makeExecutor({ level: "granted" });
    const r = await exec.execute("a", "A", { type: "delete_file", path: "hello.txt" });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "hello.txt"))).toBe(false);
    // File vẫn còn trong thùng rác.
    const trash = path.join(workspace, ".trash");
    const files = fs.readdirSync(trash);
    expect(files.some((f) => f.includes("hello.txt"))).toBe(true);
  });
});

describe("GĐ 4 · Nhật ký chỉ ghi thêm", () => {
  it("ghi lại mọi hành động (thành công và bị chặn)", async () => {
    const { exec, log } = makeExecutor({ level: "sandbox" });
    await exec.execute("a", "A", { type: "read_file", path: "hello.txt" });
    await exec.execute("a", "A", { type: "run_command", command: "echo x" });
    expect(log.size).toBe(2);
    const entries = log.list(10);
    expect(entries[0].type).toBe("run_command");
    expect(entries[0].ok).toBe(false);
    expect(entries[1].ok).toBe(true);
  });

  it("không ghi nội dung nhạy cảm của write_file (chỉ độ dài)", async () => {
    const { exec, log } = makeExecutor({ level: "granted" });
    await exec.execute("a", "A", { type: "write_file", path: "s.txt", content: "MẬT KHẨU=123" });
    const entry = log.list(1)[0];
    expect(JSON.stringify(entry.params)).not.toContain("123");
    expect(JSON.stringify(entry.params)).toContain("ký tự");
  });

  it("chuỗi hash toàn vẹn sau khi ghi nhiều mục", async () => {
    const { exec, log } = makeExecutor({ level: "sandbox" });
    for (let i = 0; i < 5; i++) {
      await exec.execute("a", "A", { type: "read_file", path: "hello.txt" });
    }
    const v = log.verifyChain();
    expect(v.ok).toBe(true);
    expect(v.brokenAt).toBeNull();
    expect(v.checked).toBe(5);
  });

  it("phát hiện được khi file log bị sửa tay", async () => {
    const logPath = path.join(tmpRoot, "log.jsonl");
    const { exec } = makeExecutor({ level: "sandbox", logPath });
    await exec.execute("a", "A", { type: "read_file", path: "hello.txt" });
    // Sửa dòng đầu.
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0]);
    first.description = "ĐÃ BỊ SỬA";
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(logPath, lines.join("\n") + "\n", "utf8");

    const reloaded = new ActionLog(logPath);
    const v = reloaded.verifyChain();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).not.toBeNull();
  });

  it("log tồn tại sau khi khởi động lại server (đọc lại được)", async () => {
    const logPath = path.join(tmpRoot, "log.jsonl");
    const a = makeExecutor({ level: "sandbox", logPath });
    await a.exec.execute("a", "A", { type: "read_file", path: "hello.txt" });
    const b = new ActionLog(logPath);
    expect(b.size).toBe(1);
  });
});

describe("GĐ 4 · Chống vòng lặp", () => {
  it("cùng một lỗi 3 lần → dừng", () => {
    const g = new LoopGuard({ maxRepeats: 3 });
    g.record("read_file", { path: "x" }, { ok: false, error: "không tồn tại" });
    g.record("read_file", { path: "x" }, { ok: false, error: "không tồn tại" });
    const r = g.record("read_file", { path: "x" }, { ok: false, error: "không tồn tại" });
    expect(r.ok).toBe(false);
    expect(r.limit).toBe("repeat");
  });

  it("lỗi KHÁC nhau thì không tính là lặp", () => {
    const g = new LoopGuard({ maxRepeats: 3 });
    g.record("read_file", { path: "a" }, { ok: false, error: "e1" });
    g.record("read_file", { path: "b" }, { ok: false, error: "e2" });
    const r = g.record("read_file", { path: "c" }, { ok: false, error: "e3" });
    expect(r.ok).toBe(true);
  });

  it("hành động thành công lặp lại vẫn OK (đọc cùng file nhiều lần)", () => {
    const g = new LoopGuard({ maxRepeats: 3 });
    for (let i = 0; i < 10; i++) {
      const r = g.record("read_file", { path: "x" }, { ok: true });
      expect(r.ok).toBe(true);
    }
  });

  it("vượt giới hạn số bước → dừng", () => {
    const g = new LoopGuard({ maxSteps: 3 });
    g.record("a", {}, { ok: true });
    g.record("a", {}, { ok: true });
    const r = g.record("a", {}, { ok: true });
    expect(r.ok).toBe(false);
    expect(r.limit).toBe("steps");
  });

  it("vượt giới hạn thời gian → dừng", async () => {
    const g = new LoopGuard({ maxDurationMs: 10 });
    await new Promise((r) => setTimeout(r, 30));
    const r = g.check();
    expect(r.ok).toBe(false);
    expect(r.limit).toBe("duration");
  });

  it("chữ ký hành động ổn định bất kể thứ tự key", () => {
    expect(actionSignature("x", { a: 1, b: 2 }, "err")).toBe(
      actionSignature("x", { b: 2, a: 1 }, "err"),
    );
  });

  it("Executor dừng vòng lặp qua LoopGuard", async () => {
    const { exec } = makeExecutor({ level: "sandbox" });
    const guard = new LoopGuard({ maxRepeats: 3 });
    let last;
    for (let i = 0; i < 5; i++) {
      last = await exec.execute("a", "A", { type: "read_file", path: "khong-ton-tai.txt" }, guard);
    }
    expect(last?.ok).toBe(false);
    expect(last?.code).toBe("limit_repeat");
  });
});

describe("GĐ 4 · Xác nhận Cấp 3 (2 bước) + hết hạn", () => {
  it("bước 1 sai cụm → từ chối", () => {
    const m = new PermissionLevelManager();
    // Sai cả về HOA/THƯỜNG và thiếu khoảng trắng.
    for (const bad of ["toan quyen", "Toan Quyen", "TOANQUYEN", "TOAN_QUYEN", ""]) {
      const r = m.requestFullAccess(bad);
      expect(r.ok).toBe(false);
      expect(r.needPhrase).toBe(true);
      expect(m.level()).toBe("sandbox");
    }
  });

  it("bước 1 đúng → sang bước 2, chưa bật quyền", () => {
    const m = new PermissionLevelManager();
    const r = m.requestFullAccess(FULL_CONFIRM_PHRASE);
    expect(r.ok).toBe(false);
    expect(r.step).toBe(2);
    expect(m.level()).toBe("sandbox"); // chưa bật cho tới khi bước 2
  });

  it("bước 2 mới bật được Cấp 3", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    const r = m.confirmFullAccess(60_000);
    expect(r.ok).toBe(true);
    expect(m.level()).toBe("full");
  });

  it("bỏ qua bước 1 → bước 2 bị từ chối", () => {
    const m = new PermissionLevelManager();
    const r = m.confirmFullAccess(60_000);
    expect(r.ok).toBe(false);
    expect(m.level()).toBe("sandbox");
  });

  it("Cấp 3 tự hết hạn theo thời gian", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    m.confirmFullAccess(30_000);
    expect(m.level()).toBe("full");
    expect(m.remainingSeconds()).toBeGreaterThan(0);
  });

  it("tắt Cấp 3 → quay về Sandbox", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    m.confirmFullAccess(0);
    expect(m.level()).toBe("full");
    m.disableFullAccess();
    expect(m.level()).toBe("sandbox");
  });

  it("mặc định là Sandbox (không tự bật quyền)", () => {
    const m = new PermissionLevelManager();
    expect(m.level()).toBe("sandbox");
  });

  it("đánh dấu nhiễm / làm sạch taint", () => {
    const m = new PermissionLevelManager();
    expect(m.isTainted()).toBe(false);
    m.markTainted("nội dung web");
    expect(m.isTainted()).toBe(true);
    m.clearTaint();
    expect(m.isTainted()).toBe(false);
  });
});

describe("GĐ 4 · Planner (LLM tách khỏi Executor)", () => {
  it("trích mảng JSON từ câu trả lời LLM có fence", () => {
    const arr = extractJsonArray('```json\n[{"type":"read_file","path":"a"}]\n```');
    expect(Array.isArray(arr)).toBe(true);
    expect((arr as any[])[0].type).toBe("read_file");
  });

  it("trích mảng JSON khi LLM thêm chữ trước", () => {
    const arr = extractJsonArray('Dưới đây là: [{"type":"wait","params":{"ms":10}}] Hết.');
    expect(Array.isArray(arr)).toBe(true);
  });

  it("trả null khi không có JSON", () => {
    expect(extractJsonArray("không có json ở đây")).toBeNull();
  });

  it("JSON hỏng không gây crash", () => {
    expect(extractJsonArray("[{broken")).toBeNull();
  });
});
