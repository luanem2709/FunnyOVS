/**
 * Bộ chạy thật của Studio: gọi các script của kit (timing/mix/render bằng Node, giọng bằng Python edge-tts) dưới dạng tiến trình con.
 *  - Node: chính `process.execPath` (Node khi chạy dev, Electron + ELECTRON_RUN_AS_NODE khi đóng gói) — không cần Node cài sẵn.
 *  - Công cụ ngoài (ffmpeg, Chrome/Edge, Python + edge-tts) được dò khi cần; thiếu thì báo rõ, không chạy nửa chừng.
 *  - Huỷ/dừng khẩn cấp: giết cả cây tiến trình (Chrome do render.mjs mở cũng chết).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findChrome } from "../browser/sandboxBrowser.js";
import type { Runner, StepContext, StepName, StepResult } from "./service.js";

const TIMEOUT_MS: Record<StepName, number> = { voice: 8 * 60_000, timing: 60_000, mix: 3 * 60_000, render: 25 * 60_000 };
const TAIL = 600;

/** Thư mục kit: bản đóng gói (cạnh server.mjs) hoặc mã nguồn (studio/roblox-clip). */
export function findKitDir(from: string): string | undefined {
  const candidates = [path.join(from, "studio", "roblox-clip"), path.resolve(from, "..", "..", "studio", "roblox-clip"), path.resolve(process.cwd(), "studio", "roblox-clip")];
  return candidates.find((d) => fs.existsSync(path.join(d, "index.html")));
}

let pythonCache: string[] | null | undefined;
/** Lệnh Python có edge-tts (python / py -3), hoặc null. */
function findPython(): string[] | null {
  if (pythonCache !== undefined) return pythonCache;
  for (const cmd of [["python"], ["py", "-3"], ["python3"]]) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), "-c", "import edge_tts"], { windowsHide: true, timeout: 15_000 });
    if (r.status === 0) return (pythonCache = cmd);
  }
  return (pythonCache = null);
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else child.kill("SIGKILL");
}

function exec(cmd: string, args: string[], opts: { cwd: string; signal: AbortSignal; timeoutMs: number; env?: NodeJS.ProcessEnv; onTick?: () => void }): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    if (opts.signal.aborted) return resolve({ code: null, out: "" });
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const add = (b: Buffer): void => {
      out = (out + b.toString("utf8")).slice(-4000);
    };
    child.stdout?.on("data", add);
    child.stderr?.on("data", add);
    const tick = opts.onTick ? setInterval(opts.onTick, 600) : undefined;
    const timer = setTimeout(() => killTree(child), opts.timeoutMs);
    const onAbort = (): void => killTree(child);
    opts.signal.addEventListener("abort", onAbort, { once: true });
    const done = (code: number | null): void => {
      clearTimeout(timer);
      if (tick) clearInterval(tick);
      opts.signal.removeEventListener("abort", onAbort);
      resolve({ code, out });
    };
    child.once("error", (e) => {
      out += String(e.message);
      done(null);
    });
    child.once("close", (code) => done(code));
  });
}

export function createRunner(kitDir: string): Runner {
  const script = (n: string): string => path.join(kitDir, n);
  const node = (file: string, args: string[], ctx: StepContext, step: StepName, onTick?: () => void) =>
    exec(process.execPath, [script(file), "--project", ctx.projectDir, ...args], { cwd: kitDir, signal: ctx.signal, timeoutMs: TIMEOUT_MS[step], env: { ELECTRON_RUN_AS_NODE: "1" }, onTick });

  return {
    async probe() {
      const ff = spawnSync("ffmpeg", ["-version"], { windowsHide: true, timeout: 10_000 });
      return { ffmpeg: ff.status === 0, chrome: Boolean(findChrome()), voice: findPython() !== null };
    },

    async run(step: StepName, ctx: StepContext): Promise<StepResult> {
      const tail = (o: string): string => o.trim().split("\n").slice(-4).join("\n").slice(-TAIL);
      if (step === "voice") {
        const py = findPython();
        if (!py) return { ok: false, key: "val.studio.noVoiceTool" };
        const r = await exec(py[0], [...py.slice(1), script("synth.py"), ctx.projectDir, ctx.voiceName], { cwd: kitDir, signal: ctx.signal, timeoutMs: TIMEOUT_MS.voice, env: { PYTHONIOENCODING: "utf-8" } });
        return r.code === 0 ? { ok: true } : { ok: false, key: "val.studio.step.voice", detail: tail(r.out) };
      }
      if (step === "timing") {
        const r = await node("timing.mjs", [], ctx, step);
        return r.code === 0 ? { ok: true } : { ok: false, key: "val.studio.step.timing", detail: tail(r.out) };
      }
      if (step === "mix") {
        const r = await node("mix.mjs", [], ctx, step);
        return r.code === 0 ? { ok: true } : { ok: false, key: "val.studio.step.mix", detail: tail(r.out) };
      }
      // render: tiến độ qua file JSON do render.mjs ghi
      const chrome = findChrome();
      if (!chrome) return { ok: false, key: "val.studio.noChrome" };
      const progressFile = path.join(ctx.projectDir, ".progress.json");
      fs.rmSync(progressFile, { force: true });
      const r = await node("render.mjs", ["--chrome", chrome, "--progress", progressFile, ...(ctx.preview ? ["--preview"] : [])], ctx, step, () => {
        try {
          const p = JSON.parse(fs.readFileSync(progressFile, "utf8")) as { phase?: string; frame?: number; total?: number };
          if (p.total) ctx.progress(Math.min(1, (p.frame ?? 0) / p.total));
        } catch {
          /* chưa có / đang ghi dở */
        }
      });
      fs.rmSync(progressFile, { force: true });
      return r.code === 0 ? { ok: true } : { ok: false, key: "val.studio.step.render", detail: tail(r.out) };
    },
  };
}
