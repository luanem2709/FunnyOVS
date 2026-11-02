/**
 * Kiểm chứng từng cờ (flag) của Cursor CLI trên máy Windows.
 *
 * Chạy: npx tsx scripts/check-cursor-flags.ts
 *
 * Mỗi lượt dùng prompt cực ngắn và timeout ngắn để tiêu tối ít token.
 * Chỉ đọc trong sandbox — không đụng Cấp 3, không ghi ra ngoài dự án.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function resolveExe(): string | null {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const root = path.join(local, "cursor-agent");
  for (const n of ["agent.cmd", "cursor-agent.cmd", "agent", "cursor-agent"]) {
    const p = path.join(root, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

interface FlagCase {
  /** Tên cờ. */
  flag: string;
  /** Tham số bổ sung. */
  extra: string[];
  /** Có cần gọi LLM thật không (false = chỉ kiểm tra parse lỗi). */
  callLlm: boolean;
}

const CASES: FlagCase[] = [
  { flag: "-p (print)", extra: [], callLlm: true },
  { flag: "--output-format json", extra: ["--output-format", "json"], callLlm: true },
  { flag: "--output-format stream-json", extra: ["--output-format", "stream-json"], callLlm: true },
  { flag: "--stream-partial-output", extra: ["--output-format", "stream-json", "--stream-partial-output"], callLlm: true },
  { flag: "--model auto", extra: ["--model", "auto"], callLlm: true },
  { flag: "--mode plan", extra: ["--mode", "plan"], callLlm: true },
  { flag: "--mode ask", extra: ["--mode", "ask"], callLlm: true },
  { flag: "--trust", extra: ["--trust"], callLlm: true },
  { flag: "--sandbox enabled", extra: ["--sandbox", "enabled"], callLlm: true },
  { flag: "--sandbox disabled", extra: ["--sandbox", "disabled"], callLlm: true },
  { flag: "--auto-review", extra: ["--auto-review"], callLlm: false },
  { flag: "--force (yolo)", extra: ["--force"], callLlm: false },
  { flag: "--workspace <dir>", extra: [], callLlm: false },
  { flag: "--add-dir <dir>", extra: [], callLlm: false },
  { flag: "--list-models", extra: ["--list-models"], callLlm: false },
];

const PROMPT = "Trả lời đúng một chữ: OK";

function run(exe: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; err: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, shell: true, windowsHide: true });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, out, err: err + e.message, timedOut });
    });
  });
}

async function main(): Promise<void> {
  const exe = resolveExe();
  if (!exe) {
    console.log("KHÔNG tìm thấy Cursor CLI.");
    return;
  }
  const ws = path.resolve(".data", "workspace", "flagcheck");
  fs.mkdirSync(ws, { recursive: true });

  const results: Array<{ flag: string; ok: boolean; note: string }> = [];

  for (const c of CASES) {
    const args = ["-p", "--output-format", "json", ...c.extra];
    if (c.flag.startsWith("--workspace")) args.push("--workspace", ws);
    if (c.flag.startsWith("--add-dir")) args.push("--workspace", ws, "--add-dir", ws);
    if (c.flag === "--list-models") {
      const r = await run(exe, ["--list-models"], os.tmpdir(), 25_000);
      const ok = !r.err.toLowerCase().includes("error") && r.out.trim().length > 0;
      results.push({ flag: c.flag, ok, note: r.err.split("\n")[0]?.slice(0, 120) || `${r.out.split("\n").length} dòng` });
      console.log(`${ok ? "OK  " : "LỖI"} ${c.flag} — ${results.at(-1)!.note}`);
      continue;
    }
    if (c.callLlm) args.push(PROMPT);
    else args.push("--help");

    await new Promise((r) => setTimeout(r, 1500));
    const r = await run(exe, args, ws, c.callLlm ? 90_000 : 20_000);
    const lower = (r.err + r.out).toLowerCase();
    const hardFail =
      lower.includes("unknown option") ||
      lower.includes("unrecognized option") ||
      lower.includes("invalid choice") ||
      lower.includes("error: unknown");
    let ok = !hardFail;
    let note = "";
    if (r.timedOut) {
      ok = false;
      note = "quá thời gian";
    } else if (hardFail) {
      note = (r.err.split("\n").find((l) => l.trim()) ?? "lỗi cờ").slice(0, 200);
    } else if (c.callLlm) {
      // Có JSON với usage?
      const hasUsage = /"usage"\s*:\s*\{/.test(r.out);
      const hasResult = /"result"\s*:/.test(r.out);
      note = hasUsage
        ? `có usage${hasResult ? " + result" : ""}`
        : hasResult
          ? "có result, KHÔNG có usage"
          : `không có JSON (code=${r.code}) ${r.err.split("\n").find((l) => l.trim())?.slice(0, 120) ?? ""}`;
      if (!hasUsage && !hasResult) ok = false;
    } else {
      note = r.code === 0 ? "parse OK" : `code=${r.code}`;
      if (r.code !== 0) ok = false;
    }
    results.push({ flag: c.flag, ok, note });
    console.log(`${ok ? "OK  " : "LỖI"} ${c.flag} — ${note}`);
  }

  console.log("\n== Tóm tắt ==");
  for (const r of results) console.log(`  ${r.ok ? "✔" : "✘"} ${r.flag}: ${r.note}`);

  const out = path.resolve("docs", "cursor-flags.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\n→ ghi ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
