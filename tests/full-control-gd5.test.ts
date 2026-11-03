/**
 * GĐ 5 — TEST "TOÀN QUYỀN" (chỉ THÊM, không nới lỏng quy tắc nào).
 *
 * Mục tiêu:
 *  1. Xác nhận 2 bước: cụm phải đúng TUYÊN VĂN ("TOAN QUYEN"), có khoảng trắng.
 *  2. Hết hạn theo thời gian → tự hạ về Sandbox.
 *  3. Thùng rác: xóa = khôi phục được; dọn rác = không khôi phục được.
 *  4. Overlay đèn báo + hủy khẩn cấp chặn thao tác tiếp theo.
 *  5. Controller GHI LẠI không đụng máy thật (mặc định an toàn).
 *
 * KHÔNG dùng Cấp 3 thật, KHÔNG mở app, KHÔNG gõ phím thật.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TrashBin } from "../src/server/executor/trashBin.js";
import {
  GuardedInputController,
  RecordingInputController,
} from "../src/server/executor/inputController.js";
import { PermissionLevelManager, FULL_CONFIRM_PHRASE } from "../src/server/security/permissionLevel.js";
import { ActionLog } from "../src/server/executor/actionLog.js";
import { Executor, deviceFromController } from "../src/server/executor/executor.js";

let tmpRoot: string;
let workspace: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "office-gd5-"));
  workspace = path.join(tmpRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "a.txt"), "A", "utf8");
  fs.writeFileSync(path.join(workspace, "b.txt"), "B", "utf8");
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

describe("GĐ 5 · Xác nhận 2 bước — nguyên văn", () => {
  it("cụm xác nhận đúng là 'TOAN QUYEN' (có khoảng trắng)", () => {
    expect(FULL_CONFIRM_PHRASE).toBe("TOAN QUYEN");
  });

  it("chỉ nhận đúng chuỗi nguyên văn", () => {
    const m = new PermissionLevelManager();
    const r = m.requestFullAccess("TOAN QUYEN");
    expect(r.ok).toBe(false);
    expect(r.needPhrase).toBe(false);
    expect(r.step).toBe(2);
  });

  it("từ chối mọi biến thể khác (hoa/thường/underscript/khoảng trắng thừa bên trong)", () => {
    const variants = [
      "toan quyen",
      "Toan Quyen",
      "TOANQUYEN",
      "TOAN_QUYEN",
      "TOAN  QUYEN",
      "TOANQUYEN ",
      "TOAN QUYEN!",
      "",
    ];
    for (const v of variants) {
      const m = new PermissionLevelManager();
      const r = m.requestFullAccess(v);
      expect(r.ok, `phải từ chối "${v}"`).toBe(false);
      expect(r.needPhrase, `phải yêu cầu nhập lại "${v}"`).toBe(true);
      expect(m.level()).toBe("sandbox");
    }
  });

  it("khoảng trắng thừa ở đầu/cuối được chấp nhận (copy-paste cho tiện)", () => {
    const m = new PermissionLevelManager();
    const r = m.requestFullAccess("  TOAN QUYEN  ");
    expect(r.needPhrase).toBe(false);
    expect(r.step).toBe(2);
  });

  it("bước 2 không chạy được nếu chưa làm bước 1", () => {
    const m = new PermissionLevelManager();
    const r = m.confirmFullAccess(60_000);
    expect(r.ok).toBe(false);
    expect(m.level()).toBe("sandbox");
  });

  it("bước 2 sau bước 1 → bật Cấp 3 có hạn", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    const r = m.confirmFullAccess(60_000);
    expect(r.ok).toBe(true);
    expect(m.level()).toBe("full");
    expect(m.remainingSeconds()).toBeGreaterThan(0);
    expect(m.remainingSeconds()).toBeLessThanOrEqual(60);
  });

  it("thời lượng bị giới hạn tối đa 60 phút", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    m.confirmFullAccess(999 * 60 * 60 * 1000);
    expect(m.remainingSeconds()).toBeLessThanOrEqual(60 * 60);
  });

  it("sau khi hết hạn → tự về Sandbox", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    m.confirmFullAccess(1000);
    expect(m.level()).toBe("full");
    // Chờ hết hạn.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(m.level()).toBe("sandbox");
        resolve();
      }, 1600);
    });
  });

  it("tắt thủ công → về Sandbox ngay", () => {
    const m = new PermissionLevelManager();
    m.requestFullAccess(FULL_CONFIRM_PHRASE);
    m.confirmFullAccess(0);
    m.disableFullAccess();
    expect(m.level()).toBe("sandbox");
    expect(m.remainingSeconds()).toBe(0);
  });
});

describe("GĐ 5 · Thùng rác (khôi phục được)", () => {
  it("chuyển file vào thùng rác → file gốc biến mất, bản sao còn", async () => {
    const bin = new TrashBin(path.join(workspace, ".trash"));
    const dest = await bin.move(path.join(workspace, "a.txt"));
    expect(dest).toBeTruthy();
    expect(fs.existsSync(path.join(workspace, "a.txt"))).toBe(false);
    expect(fs.existsSync(dest!)).toBe(true);
    expect(fs.readFileSync(dest!, "utf8")).toBe("A");
  });

  it("khôi phục → file về đúng vị trí cũ", async () => {
    const bin = new TrashBin(path.join(workspace, ".trash"));
    await bin.move(path.join(workspace, "a.txt"));
    const items = bin.list();
    expect(items.length).toBe(1);
    const r = await bin.restore(items[0].id);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "a.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(workspace, "a.txt"), "utf8")).toBe("A");
  });

  it("khôi phục khi chỗ đến đã tồn tại → không ghi đè", async () => {
    const bin = new TrashBin(path.join(workspace, ".trash"));
    await bin.move(path.join(workspace, "a.txt"));
    // Tạo lại file cùng tên với nội dung khác.
    fs.writeFileSync(path.join(workspace, "a.txt"), "KHAC", "utf8");
    const items = bin.list();
    const r = await bin.restore(items[0].id);
    expect(r.ok).toBe(true);
    // File cũ vẫn nguyên vẹn.
    expect(fs.readFileSync(path.join(workspace, "a.txt"), "utf8")).toBe("KHAC");
    // Bản khôi phục nằm ở tên khác.
    expect(r.path).not.toBe(path.join(workspace, "a.txt"));
    expect(fs.readFileSync(r.path!, "utf8")).toBe("A");
  });

  it("dọn rác thật → không khôi phục được", async () => {
    const bin = new TrashBin(path.join(workspace, ".trash"));
    await bin.move(path.join(workspace, "a.txt"));
    const items = bin.list();
    const p = await bin.purge(items[0].id);
    expect(p.ok).toBe(true);
    expect(fs.existsSync(items[0].trashed)).toBe(false);
    // Thử khôi phục → phải báo lỗi.
    const r = await bin.restore(items[0].id);
    expect(r.ok).toBe(false);
  });

  it("dọn toàn bộ thùng rác", async () => {
    const bin = new TrashBin(path.join(workspace, ".trash"));
    await bin.move(path.join(workspace, "a.txt"));
    await bin.move(path.join(workspace, "b.txt"));
    expect(bin.list().length).toBe(2);
    const r = await bin.purgeAll();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
  });

  it("Executor xóa file → vào thùng rác, khôi phục được", async () => {
    const log = new ActionLog(path.join(tmpRoot, "log.jsonl"));
    const exec = new Executor({
      workspace,
      log,
      getLevel: () => "granted",
      isTainted: () => false,
      trashDir: path.join(workspace, ".trash"),
    });
    const r = await exec.execute("a", "A", { type: "delete_file", path: "a.txt" });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "a.txt"))).toBe(false);

    const items = exec.trash.list();
    expect(items.length).toBe(1);
    const back = await exec.trash.restore(items[0].id);
    expect(back.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "a.txt"))).toBe(true);
  });

  it("Executor move_to_trash không xóa hẳn", async () => {
    const log = new ActionLog(path.join(tmpRoot, "log.jsonl"));
    const exec = new Executor({
      workspace,
      log,
      getLevel: () => "granted",
      isTainted: () => false,
      trashDir: path.join(workspace, ".trash"),
    });
    const r = await exec.execute("a", "A", { type: "move_to_trash", path: "b.txt" });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(workspace, "b.txt"))).toBe(false);
    expect(exec.trash.list().length).toBe(1);
  });
});

describe("GĐ 5 · Overlay đèn báo + hủy khẩn cấp", () => {
  it("overlay bật trong lúc thao tác và tắt sau khi xong", async () => {
    const rec = new RecordingInputController();
    const g = new GuardedInputController(rec);
    const states: boolean[] = [];
    g.on("overlay", (o) => states.push(o.active));

    await g.click(10, 20, "left", 1);
    expect(states).toEqual([true, false]);
    expect(rec.events[0]).toMatchObject({ kind: "click", detail: { x: 10, y: 20 } });
  });

  it("hủy khẩn cấp → các thao tác sau KHÔNG chạy", async () => {
    const rec = new RecordingInputController();
    const g = new GuardedInputController(rec);
    await g.click(1, 1, "left", 1);
    expect(rec.events.length).toBe(1);

    g.abort();
    await g.click(2, 2, "left", 1);
    await g.typeText("abc");
    await g.keyPress("enter", []);
    // Không có sự kiện mới nào được ghi.
    expect(rec.events.length).toBe(1);
    expect(g.overlayState.aborted).toBe(true);
  });

  it("reset sau khi hủy → thao tác chạy lại được", async () => {
    const rec = new RecordingInputController();
    const g = new GuardedInputController(rec);
    g.abort();
    g.reset();
    await g.click(3, 3, "left", 1);
    expect(rec.events.length).toBe(1);
  });

  it("controller GHI LẠI không ghi nội dung gõ (bảo mật)", async () => {
    const rec = new RecordingInputController();
    await rec.typeText("MẬT KHẨU=secret123");
    expect(JSON.stringify(rec.events)).not.toContain("secret123");
    expect(rec.events[0].detail).toMatchObject({ length: "MẬT KHẨU=secret123".length });
  });

  it("adapter sang DeviceDriver hoạt động", async () => {
    const rec = new RecordingInputController();
    const g = new GuardedInputController(rec);
    const dev = deviceFromController(g);
    await dev.click(5, 6, "right", 2);
    await dev.typeText("x");
    await dev.keyPress("ctrl", ["ctrl"]);
    expect(rec.events.length).toBe(3);
  });

  it("Executor chặn click/type ở Cấp 2 (chỉ Cấp 3 mới điều khiển máy)", async () => {
    const log = new ActionLog(path.join(tmpRoot, "log.jsonl"));
    const mk = (level: "granted" | "full") =>
      new Executor({
        workspace,
        log,
        device: deviceFromController(new GuardedInputController(new RecordingInputController())),
        getLevel: () => level,
        isTainted: () => false,
        trashDir: path.join(workspace, ".trash"),
      });

    const g2 = await mk("granted").execute("a", "A", { type: "click", x: 1, y: 1 });
    expect(g2.ok).toBe(false);
    expect(g2.code).toBe("need_full");

    const g3 = await mk("full").execute("a", "A", { type: "click", x: 1, y: 1 });
    expect(g3.ok).toBe(true);
  });
});
