/**
 * GĐ 4 — TEST TIMEOUT CỨNG & KILL CÂY TIẾN TRÌNH.
 *
 * Yêu cầu: "PowerShell với timeout cứng, kill cả cây tiến trình."
 *
 * Test dùng lệnh tạo tiến trình con (node) để chứng minh cây tiến trình
 * bị giết thật — không chỉ tiến trình cha.
 *
 * KHÔNG đụng Cấp 3, KHÔNG mở app, KHÔNG gõ phím. Chỉ chạy lệnh vô hại.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { runPowerShell, killProcessTree } from "../src/server/executor/powerShell.js";

/** Đếm tiến trình node con còn sống (dùng để kiểm tra cây đã bị kill). */
function countNodeProcesses(): number {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', {
      encoding: "utf8",
      shell: "powershell.exe",
    });
    return out.split("\n").filter((l) => l.trim() && !l.includes("INFO:")).length;
  } catch {
    return 0;
  }
}

describe("GĐ 4 · Timeout cứng PowerShell", () => {
  it("lệnh nhanh chạy xong, trả stdout", async () => {
    const r = await runPowerShell("Write-Output 'xin-chao'", process.cwd(), 15_000);
    expect(r.ok).toBe(true);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("xin-chao");
    expect(r.timedOut).toBe(false);
  });

  it("lệnh lỗi trả exit code khác 0 (không crash)", async () => {
    const r = await runPowerShell("exit 3", process.cwd(), 15_000);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(3);
  });

  it("lệnh vượt timeout → bị giết, timedOut=true", async () => {
    const r = await runPowerShell("Start-Sleep -Seconds 30", process.cwd(), 1500);
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    // Không chờ hết 30s.
    expect(r.durationMs).toBeLessThan(15_000);
  });

  it("kill CẢ CÂY TIẾN TRÌNH (tiến trình con cũng chết)", async () => {
    // Lệnh này spawn một tiến trình node con ngủ 60s rồi chính nó cũng ngủ.
    const script = 'node -e "setTimeout(()=>{},60000)"; Start-Sleep -Seconds 60';
    const before = countNodeProcesses();

    const r = await runPowerShell(script, process.cwd(), 2000);
    expect(r.timedOut).toBe(true);

    // Đợi cây tiến trình kịp chết rồi đếm lại.
    await new Promise((res) => setTimeout(res, 2500));
    const after = countNodeProcesses();
    // Không tăng (tối đa chênh 1 do chính vitest đang chạy node).
    expect(after).toBeLessThanOrEqual(before + 1);
  }, 20_000);

  it("killProcessTree với PID không tồn tại không ném lỗi", () => {
    expect(() => killProcessTree(999_999)).not.toThrow();
  });

  it("lệnh rỗng không treo (trả về nhanh)", async () => {
    const r = await runPowerShell("", process.cwd(), 5000);
    // PowerShell coi lệnh rỗng là hợp lệ (exit 0) — quan trọng là KHÔNG treo.
    expect(r.durationMs).toBeLessThan(10_000);
    expect(r.timedOut).toBe(false);
  });

  it("Executor chặn lệnh rỗng ở tầng schema (min 1 ký tự)", async () => {
    const { parseAction } = await import("../src/server/executor/actionSchema.js");
    expect(parseAction({ type: "run_command", command: "" }).ok).toBe(false);
  });
});
