/**
 * REST bridge cho What-If Studio (ShotBuilder engine).
 * - Quản lý dự án trong <workspace>/whatif/<tên>/
 * - Nhận kịch bản + file cảnh JSON → gọi ShotBuilder engine (Remotion) chạy local
 * - Trả về clip mp4 — KHÔNG gọi AI, không tốn token khi render
 * - Chỉ nhận yêu cầu dựng từ loopback (bảo mật như studio.ts)
 */
import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const MAX_JOBS = 10;
const KIT_CANDIDATES = [
  path.resolve(process.cwd(), "app/what-if-studio"),
  path.resolve(process.cwd(), "../app/what-if-studio"),
  "C:\\ShotBuilder\\what-if-studio",
];

let shotBuilderChild: ChildProcess | null = null;

export function ensureShotBuilderProcess(kitDir?: string): void {
  const kit = kitDir ?? findKitDir();
  if (!kit) return;
  const appPy = path.join(kit, "builder", "app.pyc");
  const appPyAlt = path.join(kit, "builder", "app.py");
  const targetScript = fs.existsSync(appPy) ? appPy : fs.existsSync(appPyAlt) ? appPyAlt : null;
  if (!targetScript) return;

  const py = findPython();
  if (!py) return;

  // Kiểm tra port 7870 đã bật chưa
  const req = http.get("http://127.0.0.1:7870/api/ping", (res) => {
    // Đã chạy, không cần khởi động lại
    res.resume();
  });
  req.on("error", () => {
    // Chưa chạy -> tự khởi động ngầm trong FunnyOVS
    try {
      shotBuilderChild = spawn(py, [targetScript], {
        cwd: kit,
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          BUILDER_NO_BROWSER: "1",
          BUILDER_APP: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });

      const killChild = () => {
        if (shotBuilderChild) {
          killTree(shotBuilderChild);
          shotBuilderChild = null;
        }
      };
      process.once("exit", killChild);
      process.once("SIGINT", killChild);
      process.once("SIGTERM", killChild);
      console.log("[whatif] Đã tự động kích hoạt ShotBuilder server ngầm (cổng 7870)");
    } catch (e) {
      console.warn("[whatif] Không thể khởi động ShotBuilder server ngầm:", e);
    }
  });
}

export interface WiJob {
  id: string;
  project: string;
  status: "idle" | "running" | "done" | "error";
  progress: number;
  step: string;
  output?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

function findKitDir(): string | undefined {
  return KIT_CANDIDATES.find((d) => fs.existsSync(path.join(d, "package.json")));
}

function findPython(): string | null {
  for (const cmd of ["python", "py", "python3"]) {
    const r = spawnSync(cmd, ["-c", "print('ok')"], { windowsHide: true, timeout: 5000 });
    if (r.status === 0) return cmd;
  }
  return null;
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else child.kill("SIGKILL");
}

export class WhatIfService {
  private jobs: WiJob[] = [];
  private current: { job: WiJob; abort: AbortController } | null = null;
  readonly kitDir: string | undefined;

  constructor(private workspaceRoot: string) {
    this.kitDir = findKitDir();
  }

  private root(): string {
    return path.join(this.workspaceRoot, "whatif");
  }

  private projectDir(project: string): string {
    if (!PROJECT_RE.test(project)) throw new Error("Tên dự án không hợp lệ");
    const dir = path.join(this.root(), project);
    const rel = path.relative(this.root(), dir);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Tên dự án không hợp lệ");
    return dir;
  }

  listProjects(): string[] {
    try {
      return fs.readdirSync(this.root(), { withFileTypes: true })
        .filter((e) => e.isDirectory() && PROJECT_RE.test(e.name))
        .map((e) => e.name).sort();
    } catch { return []; }
  }

  state() {
    return { jobs: this.jobs.slice(-MAX_JOBS), projects: this.listProjects(), kitDir: this.kitDir };
  }

  createProject(project: string, script?: string, scenes?: string): { project: string } {
    const dir = this.projectDir(project);
    fs.mkdirSync(dir, { recursive: true });
    if (script) fs.writeFileSync(path.join(dir, "kich_ban.txt"), script, "utf8");
    if (scenes) {
      try {
        const parsed = JSON.parse(scenes);
        fs.writeFileSync(path.join(dir, "canh.json"), JSON.stringify(parsed, null, 2), "utf8");
      } catch { /* scenes không phải JSON hợp lệ */ }
    }
    return { project };
  }

  async startRender(project: string, opts: { preview?: boolean; scenes?: string; script?: string }): Promise<string> {
    if (this.current) throw new Error("Đang có việc chạy, hãy huỷ trước");
    const dir = this.projectDir(project);
    if (!fs.existsSync(dir)) throw new Error(`Dự án "${project}" không tồn tại`);

    // Lưu scenes/script nếu được truyền kèm
    if (opts.script) fs.writeFileSync(path.join(dir, "kich_ban.txt"), opts.script, "utf8");
    if (opts.scenes) {
      try {
        const parsed = JSON.parse(opts.scenes);
        fs.writeFileSync(path.join(dir, "canh.json"), JSON.stringify(parsed, null, 2), "utf8");
      } catch { /* bỏ qua */ }
    }

    const id = crypto.randomUUID().slice(0, 8);
    const job: WiJob = { id, project, status: "running", progress: 0, step: "prepare", startedAt: new Date().toISOString() };
    this.jobs.unshift(job);
    if (this.jobs.length > MAX_JOBS) this.jobs.pop();

    const abort = new AbortController();
    this.current = { job, abort };

    // Chạy nền
    this._runJob(job, dir, opts.preview ?? false, abort.signal).finally(() => {
      if (this.current?.job.id === id) this.current = null;
    });

    return id;
  }

  private async _runJob(job: WiJob, projectDir: string, preview: boolean, signal: AbortSignal): Promise<void> {
    const kit = this.kitDir;
    if (!kit) {
      job.status = "error";
      job.error = "Chưa tìm thấy What-If Studio. Chạy npm install trong app/what-if-studio trước.";
      job.finishedAt = new Date().toISOString();
      return;
    }

    // Kiểm tra file cảnh
    const scenesFile = path.join(projectDir, "canh.json");
    const scriptFile = path.join(projectDir, "kich_ban.txt");

    if (!fs.existsSync(scenesFile) && !preview) {
      job.status = "error";
      job.error = "Chưa có file cảnh (canh.json). Upload file JSON từ chatbot hoặc dùng chế độ Offline trong ShotBuilder.";
      job.finishedAt = new Date().toISOString();
      return;
    }

    // Bước 1: Giọng đọc (edge-tts nếu có kịch bản)
    if (fs.existsSync(scriptFile) && !preview) {
      job.step = "voice";
      job.progress = 0.1;
      const py = findPython();
      if (py) {
        const synthScript = path.join(kit, "synth.py");
        if (fs.existsSync(synthScript)) {
          await this._exec(py, [synthScript, projectDir, "vi-VN-NamMinhNeural"], kit, signal, 8 * 60_000, (p) => { job.progress = 0.1 + p * 0.2; });
        }
      }
    }

    // Bước 2: Render (Node + Remotion)
    job.step = "render";
    job.progress = 0.3;

    // ShotBuilder render: builder/render.mjs <project.json> board|video
    // Chạy từ thư mục what-if-studio; project.json phải không có BOM
    const shotRender = path.join(kit, "builder", "render.mjs");
    const projectJsonPath = path.join(projectDir, "project.json");

    // Đảm bảo project.json không BOM
    if (fs.existsSync(projectJsonPath)) {
      const raw = fs.readFileSync(projectJsonPath);
      if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
        fs.writeFileSync(projectJsonPath, raw.slice(3));
      }
    }

    if (fs.existsSync(shotRender)) {
      const mode = preview ? "board" : "video";
      const r = await this._exec(process.execPath, [shotRender, projectJsonPath, mode], kit, signal, 25 * 60_000, (p) => { job.progress = 0.3 + p * 0.65; });
      if (!r.ok) { job.status = "error"; job.error = r.out.slice(-600); job.finishedAt = new Date().toISOString(); return; }
    } else {
      job.status = "error"; job.error = `Không tìm thấy builder/render.mjs trong ${kit}. Chạy npm install trong app/what-if-studio trước.`; job.finishedAt = new Date().toISOString(); return;
    }

    // Tìm file output — render.mjs xuất vào <kit>/out/<slug>/
    const slug = path.basename(projectDir).replace(/[^a-zA-Z0-9-_]/g, "-");
    const outCandidates = [
      path.join(kit, "out", slug, `${slug}.mp4`),
      path.join(kit, "out", slug, "out.mp4"),
      path.join(projectDir, "clip.mp4"),
      path.join(projectDir, "out.mp4"),
    ];
    const outFile = outCandidates.find((f) => fs.existsSync(f));

    job.status = "done";
    job.output = outFile ?? "";
    job.progress = 1;
    job.step = "done";
    job.finishedAt = new Date().toISOString();
  }

  private _exec(
    cmd: string, args: string[], cwd: string, signal: AbortSignal, timeoutMs: number,
    onProgress?: (p: number) => void,
  ): Promise<{ ok: boolean; out: string }> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve({ ok: false, out: "Đã huỷ" });
      const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PYTHONIOENCODING: "utf-8" } });
      let out = "";
      let dots = 0;
      const addOut = (b: Buffer) => { out = (out + b.toString("utf8")).slice(-4000); };
      child.stdout?.on("data", addOut);
      child.stderr?.on("data", addOut);
      const tick = onProgress ? setInterval(() => { onProgress(Math.min(0.95, (dots++ * 0.05))); }, 3000) : undefined;
      const timer = setTimeout(() => killTree(child), timeoutMs);
      const onAbort = () => killTree(child);
      signal.addEventListener("abort", onAbort, { once: true });
      const done = (code: number | null) => {
        clearTimeout(timer);
        if (tick) clearInterval(tick);
        signal.removeEventListener("abort", onAbort);
        resolve({ ok: code === 0, out });
      };
      child.once("error", (e) => { out += e.message; done(null); });
      child.once("close", (code) => done(code));
    });
  }

  cancel(id: string): boolean {
    if (this.current?.job.id === id) {
      this.current.abort.abort();
      this.current.job.status = "error";
      this.current.job.error = "Đã huỷ";
      this.current.job.finishedAt = new Date().toISOString();
      this.current = null;
      return true;
    }
    return false;
  }

  clipPath(project: string): string | null {
    const dir = this.projectDir(project);
    // ShotBuilder xuất vào kitDir/out/<slug>/
    const kit = this.kitDir ?? "";
    const slug = project.replace(/[^a-zA-Z0-9-_]/g, "-");
    for (const f of [
      path.join(kit, "out", slug, `${slug}.mp4`),
      path.join(kit, "out", slug, "out.mp4"),
      path.join(dir, "clip.mp4"),
      path.join(dir, "out.mp4"),
      path.join(dir, "hoan_chinh", `${project}_hoan_chinh.mp4`),
    ]) {
      if (fs.existsSync(f)) return f;
    }
    return null;
  }
}

export function registerWhatIfRoutes(app: Express, deps: { workspace: () => string; isLoopback: (req: Request) => boolean }): void {
  const svc = new WhatIfService(deps.workspace());

  // Tự động khởi động ShotBuilder server (port 7870) ngầm ngay khi app FunnyOVS mở
  ensureShotBuilderProcess(svc.kitDir);

  const own = (req: Request, res: Response): boolean => {
    if (deps.isLoopback(req)) return true;
    res.status(403).json({ error: "Chỉ cho phép từ máy local" });
    return false;
  };

  app.get("/shotbuilder", (_req, res) => {
    res.redirect("http://127.0.0.1:7870");
  });

  app.get("/api/whatif/state", (_req, res) => { res.json(svc.state()); });

  app.post("/api/whatif/projects", (req, res) => {
    if (!own(req, res)) return;
    try {
      const b = req.body as { project?: unknown; script?: unknown; scenes?: unknown };
      const result = svc.createProject(String(b.project ?? ""), String(b.script ?? ""), String(b.scenes ?? ""));
      res.json({ ok: true, ...result });
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/whatif/render", async (req, res) => {
    if (!own(req, res)) return;
    try {
      const b = req.body as { project?: unknown; preview?: unknown; scenes?: unknown; script?: unknown };
      const id = await svc.startRender(String(b.project ?? ""), {
        preview: Boolean(b.preview),
        scenes: b.scenes ? String(b.scenes) : undefined,
        script: b.script ? String(b.script) : undefined,
      });
      res.status(202).json({ ok: true, id });
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/whatif/cancel", (req, res) => {
    if (!own(req, res)) return;
    const b = req.body as { id?: unknown };
    res.json({ ok: svc.cancel(String(b.id ?? "")) });
  });

  app.get("/api/whatif/projects/:project/clip.mp4", (req, res) => {
    const f = svc.clipPath(req.params.project);
    if (!f) return void res.status(404).json({ error: "Chưa có clip" });
    res.type("video/mp4").sendFile(f, { dotfiles: "deny" });
  });
}
