/**
 * Studio: dựng clip hoạt hình khối từ dữ liệu — dịch vụ điều phối. Dự án nằm ở `<workspace>/studio/<tên>/` (agent chỉ được chạm vùng workspace).
 *
 * An toàn (không đổi cơ chế sẵn có, mọi thứ đi qua chúng):
 *  - Chỉ MỘT việc chạy tại một thời điểm; kết xuất chạy nền (agent nhận ngay mã việc, không bị giữ máy hàng phút).
 *  - Gửi lời đọc ra dịch vụ giọng online (Microsoft) là hành động ra ngoài → luôn qua `ActionGate` (hộp duyệt, hết hạn 10 phút = từ chối);
 *    giọng đã tổng hợp từ trước (cùng văn bản + cùng giọng) dùng lại, không cần duyệt vì không gửi gì ra ngoài.
 *  - Dữ liệu kiểm chặt (zod) trước khi ghi; lời đọc chứa thứ giống khoá/bí mật bị từ chối (không để lọt ra dịch vụ ngoài).
 *  - Dừng khẩn cấp: huỷ việc đang chạy, giết tiến trình con; không nhận việc mới.
 *  - Nhật ký bảo mật: lưu dữ liệu, chạy dựng, kết quả duyệt gửi giọng, huỷ.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ActionGate } from "../agent/gate.js";
import type { AuditLog } from "../security/audit.js";
import { redact } from "../security/redact.js";
import { ValidationError } from "../../shared/validation.js";
import { KIND_FILE, PROJECT_RE, SCHEMAS, SCRIPT_LINES, STUDIO_KINDS, type JobStatus, type JobStep, type StudioJob, type StudioKind, type StudioState } from "../../shared/studio.js";

export type StepName = "voice" | "timing" | "mix" | "render";

export interface StepContext {
  project: string;
  projectDir: string;
  kitDir: string;
  voiceName: string;
  preview: boolean;
  signal: AbortSignal;
  /** 0..1 trong bước hiện tại (chỉ bước render báo tiến độ chi tiết). */
  progress: (p: number) => void;
}
export interface StepResult {
  ok: boolean;
  /** Đoạn cuối đầu ra để chẩn đoán (không chứa bí mật: đã che bởi người gọi). */
  detail?: string;
  /** Lý do ngắn có khoá i18n (vd. thiếu công cụ ngoài). */
  key?: string;
}
export interface Runner {
  run(step: StepName, ctx: StepContext): Promise<StepResult>;
  /** Công cụ ngoài có sẵn trên máy không. */
  probe(): Promise<{ ffmpeg: boolean; chrome: boolean; voice: boolean }>;
}

export interface StudioDeps {
  workspace: () => string;
  /** Thư mục kit mẫu (studio/roblox-clip) — chứa mã dựng + dữ liệu mẫu. */
  kitDir: string;
  gate: ActionGate;
  audit: AuditLog;
  emergency: () => boolean;
  runner: Runner;
  secretValues?: () => string[];
  voiceName?: string;
  /** Nhân vật đứng tên hộp duyệt khi người dùng tự bấm dựng (mặc định: giám đốc). */
  desk?: () => { id: string; name: string };
  onState?: (s: StudioState) => void;
  now?: () => number;
}

const MAX_JOBS = 12;
const short = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const voiceDigest = (voice: string, text: string): string => crypto.createHash("sha1").update(`${voice}|${text}`, "utf8").digest("hex");

export class StudioService {
  private jobs: StudioJob[] = [];
  private seq = 0;
  private current: { job: StudioJob; abort: AbortController; done: Promise<void> } | null = null;
  private toolCache: { at: number; v: { ffmpeg: boolean; chrome: boolean; voice: boolean } } | null = null;
  readonly voiceName: string;
  private readonly now: () => number;

  constructor(private readonly d: StudioDeps) {
    this.voiceName = d.voiceName ?? "vi-VN-NamMinhNeural";
    this.now = d.now ?? Date.now;
  }

  // ------------------------------------------------------------------ đường dẫn và trạng thái

  private root(): string {
    return path.join(this.d.workspace(), "studio");
  }

  /** Thư mục dự án (đã kiểm tên); ném lỗi nếu tên sai hoặc thoát khỏi vùng studio. */
  projectDir(project: string): string {
    if (!PROJECT_RE.test(project)) throw new ValidationError("val.studio.projectInvalid");
    const dir = path.join(this.root(), project);
    const rel = path.relative(this.root(), dir);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new ValidationError("val.studio.projectInvalid");
    return dir;
  }

  listProjects(): string[] {
    try {
      return fs
        .readdirSync(this.root(), { withFileTypes: true })
        .filter((e) => e.isDirectory() && PROJECT_RE.test(e.name))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  state(): StudioState {
    return { jobs: this.jobs.slice(-MAX_JOBS).reverse(), projects: this.listProjects(), tools: this.toolCache?.v, at: new Date(this.now()).toISOString() };
  }

  async tools(force = false): Promise<{ ffmpeg: boolean; chrome: boolean; voice: boolean }> {
    if (!force && this.toolCache && this.now() - this.toolCache.at < 60_000) return this.toolCache.v;
    const v = await this.d.runner.probe();
    this.toolCache = { at: this.now(), v };
    return v;
  }

  private push(): void {
    try {
      this.d.onState?.(this.state());
    } catch {
      /* không làm hỏng việc chính */
    }
  }

  job(id: string): StudioJob | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  // ------------------------------------------------------------------ dữ liệu dự án

  /** Ghi một bộ dữ liệu (lời đọc / shot list / nhân vật) sau khi kiểm. Dự án mới được tạo từ dữ liệu mẫu của kit. */
  save(project: string, kind: string, data: unknown, by: { id: string; name: string } | "user" = "user"): { project: string; kind: StudioKind; created: boolean } {
    if (this.d.emergency()) throw new ValidationError("val.studio.emergency");
    if (!(STUDIO_KINDS as readonly string[]).includes(kind)) throw new ValidationError("val.studio.kindInvalid");
    const k = kind as StudioKind;
    const dir = this.projectDir(project);
    const parsed = SCHEMAS[k].safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError("val.studio.invalid", { kind: k, detail: short(`${issue.path.join(".") || "(gốc)"}: ${issue.message}`, 160) });
    }
    if (k === "script") {
      const secrets = this.d.secretValues?.() ?? [];
      for (const l of parsed.data as Array<{ text: string }>) if (redact(l.text, secrets) !== l.text) throw new ValidationError("val.studio.secretInText");
    }
    const created = !fs.existsSync(dir);
    fs.mkdirSync(dir, { recursive: true });
    for (const other of STUDIO_KINDS) {
      const f = path.join(dir, KIND_FILE[other]);
      if (other !== k && !fs.existsSync(f)) fs.copyFileSync(path.join(this.d.kitDir, KIND_FILE[other]), f); // dữ liệu mẫu làm điểm xuất phát
    }
    const out = k === "script" ? (parsed.data as Array<{ text: string }>).map((l) => ({ text: l.text })) : parsed.data;
    const target = path.join(dir, KIND_FILE[k]);
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(out, null, 2), "utf8");
    fs.renameSync(`${target}.tmp`, target);
    this.d.audit.append("studio.save", by === "user" ? "user" : "agent", { project, kind: k, ...(by === "user" ? {} : { agent: by.id }), created });
    this.push();
    return { project, kind: k, created };
  }

  /** Tạo dự án mới từ dữ liệu mẫu của kit (không ghi đè dự án đã có). */
  create(project: string, by: { id: string; name: string } | "user" = "user"): { project: string; created: boolean } {
    if (this.d.emergency()) throw new ValidationError("val.studio.emergency");
    const dir = this.projectDir(project);
    if (fs.existsSync(dir)) return { project, created: false };
    fs.mkdirSync(dir, { recursive: true });
    for (const k of STUDIO_KINDS) fs.copyFileSync(path.join(this.d.kitDir, KIND_FILE[k]), path.join(dir, KIND_FILE[k]));
    this.d.audit.append("studio.save", by === "user" ? "user" : "agent", { project, kind: "template", created: true });
    this.push();
    return { project, created: true };
  }

  /** Đọc dữ liệu một bộ của dự án (cho giao diện/agent xem trước khi sửa). */
  read(project: string, kind: string): unknown {
    if (!(STUDIO_KINDS as readonly string[]).includes(kind)) throw new ValidationError("val.studio.kindInvalid");
    const f = path.join(this.projectDir(project), KIND_FILE[kind as StudioKind]);
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      throw new ValidationError("val.studio.fileMissing", { kind });
    }
  }

  /** Đọc và kiểm tra đủ 3 bộ dữ liệu của dự án. */
  private loadProject(project: string): { dir: string; lines: string[] } {
    const dir = this.projectDir(project);
    if (!fs.existsSync(dir)) throw new ValidationError("val.studio.projectMissing", { project });
    let lines: string[] = [];
    for (const k of STUDIO_KINDS) {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, KIND_FILE[k]), "utf8"));
      } catch {
        throw new ValidationError("val.studio.fileMissing", { kind: k });
      }
      const p = SCHEMAS[k].safeParse(raw);
      if (!p.success) throw new ValidationError("val.studio.invalid", { kind: k, detail: short(`${p.error.issues[0].path.join(".")}: ${p.error.issues[0].message}`, 160) });
      if (k === "script") lines = (p.data as Array<{ text: string }>).map((l) => l.text);
    }
    return { dir, lines };
  }

  /** Giữ lại giọng đã tổng hợp còn khớp văn bản + giọng; xoá câu lỗi thời (để không ghép nhầm giọng cũ vào lời mới). Trả: mọi câu còn dùng được? */
  private pruneVoice(dir: string, lines: string[]): boolean {
    const vdir = path.join(dir, "voice");
    let index: Record<string, string> = {};
    try {
      index = JSON.parse(fs.readFileSync(path.join(vdir, "index.json"), "utf8"));
    } catch {
      /* chưa có */
    }
    let all = true;
    lines.forEach((text, i) => {
      const f = path.join(vdir, `v${i}.mp3`);
      const ok = index[String(i)] === voiceDigest(this.voiceName, text) && fs.existsSync(f);
      if (!ok) {
        all = false;
        fs.rmSync(f, { force: true });
      }
    });
    return all;
  }

  // ------------------------------------------------------------------ việc dựng

  /** Bắt đầu một việc dựng (chạy nền). Trả ngay thông tin việc; `done()` đợi xong (dùng cho test). */
  async start(project: string, opts: { voice?: boolean; preview?: boolean } = {}, by: { id: string; name: string } | "user" = "user"): Promise<StudioJob> {
    if (this.d.emergency()) throw new ValidationError("val.studio.emergency");
    if (this.current) throw new ValidationError("val.studio.busy");
    const { dir, lines } = this.loadProject(project);
    const voice = Boolean(opts.voice);
    const preview = Boolean(opts.preview);
    const tools = await this.tools();
    if (this.current) throw new ValidationError("val.studio.busy"); // có yêu cầu khác lọt vào trong lúc dò công cụ
    if (!tools.chrome) throw new ValidationError("val.studio.noChrome");
    if (!preview && !tools.ffmpeg) throw new ValidationError("val.studio.noFfmpeg");
    if (voice && !tools.voice) throw new ValidationError("val.studio.noVoiceTool");
    const agentName = by === "user" ? "user" : by.name;
    const job: StudioJob = { id: `studio_${this.now().toString(36)}${++this.seq}`, project, status: "queued", step: "timing", progress: 0, voice, preview, by: agentName, startedAt: new Date(this.now()).toISOString() };
    this.jobs.push(job);
    if (this.jobs.length > 60) this.jobs.shift();
    const abort = new AbortController();
    const done = this.execute(job, dir, lines, abort, by).catch(() => undefined);
    this.current = { job, abort, done };
    void done.finally(() => {
      if (this.current?.job === job) this.current = null;
      this.push();
    });
    this.d.audit.append("studio.render", by === "user" ? "user" : "agent", { project, voice, preview, ...(by === "user" ? {} : { agent: by.id }) });
    this.push();
    return job;
  }

  /** Đợi việc đang chạy xong (test). */
  async idle(): Promise<void> {
    await this.current?.done;
  }

  private set(job: StudioJob, patch: Partial<StudioJob>): void {
    Object.assign(job, patch);
    this.push();
  }

  private fail(job: StudioJob, status: JobStatus, key: string, vars?: Record<string, string | number>, detail?: string): void {
    this.set(job, { status, error: { key, vars, ...(detail ? { detail: short(redact(detail, this.d.secretValues?.() ?? []), 300) } : {}) }, finishedAt: new Date(this.now()).toISOString() });
  }

  private async execute(job: StudioJob, dir: string, lines: string[], abort: AbortController, by: { id: string; name: string } | "user"): Promise<void> {
    const ctxFor = (step: StepName, base: number, span: number): StepContext => ({
      project: job.project,
      projectDir: dir,
      kitDir: this.d.kitDir,
      voiceName: this.voiceName,
      preview: job.preview,
      signal: abort.signal,
      progress: (p) => this.set(job, { progress: Math.min(0.99, base + span * p) }),
    });
    const run = async (step: StepName, label: JobStep, base: number, span: number): Promise<boolean> => {
      if (abort.signal.aborted) return false;
      this.set(job, { status: "running", step: label, progress: base });
      const r = await this.d.runner.run(step, ctxFor(step, base, span));
      if (abort.signal.aborted) return false;
      if (!r.ok) {
        this.fail(job, "failed", r.key ?? `val.studio.step.${step}`, undefined, r.detail);
        return false;
      }
      return true;
    };
    try {
      // 1. giọng: chỉ khi người dùng/agent yêu cầu; gửi văn bản ra ngoài nên cần duyệt (trừ khi mọi câu đã có giọng khớp)
      if (job.voice) {
        const cached = this.pruneVoice(dir, lines);
        if (!cached) {
          this.set(job, { status: "awaiting-approval", step: "approval" });
          const agent = by === "user" ? (this.d.desk?.() ?? { id: "giamdoc", name: "Studio" }) : by;
          const chars = lines.reduce((n, t) => n + t.length, 0);
          const outcome = await this.d.gate.request({
            agentId: agent.id,
            agentName: agent.name,
            action: "studio_voice",
            vars: { agent: agent.name, project: job.project, job: job.id, chars },
            detail: lines.map((t, i) => `${i + 1}. ${t}`).join("\n").slice(0, 900),
          });
          if (abort.signal.aborted) return;
          if (outcome !== "approved") return this.fail(job, "cancelled", outcome === "expired" ? "val.studio.voiceExpired" : "val.studio.voiceDenied");
          if (!(await run("voice", "voice", 0, 0.1))) return;
        }
      } else {
        this.pruneVoice(dir, lines); // không gửi gì ra ngoài: chỉ dùng giọng đã có và còn khớp, câu khác ước lượng thời lượng
      }
      if (!(await run("timing", "timing", 0.1, 0.03))) return;
      if (!(await run("mix", "mix", 0.13, 0.04))) return;
      if (!(await run("render", "render", 0.17, 0.78))) return;
      const out = job.preview ? `studio/${job.project}/preview` : `studio/${job.project}/clip-co-giong.mp4`;
      const count = job.preview ? (fs.existsSync(path.join(dir, "preview")) ? fs.readdirSync(path.join(dir, "preview")).filter((f) => f.endsWith(".jpg")).length : 0) : undefined;
      if (!job.preview && !fs.existsSync(path.join(dir, "clip-co-giong.mp4"))) return this.fail(job, "failed", "val.studio.noOutput");
      this.set(job, { status: "done", step: "done", progress: 1, output: out, previewCount: count, finishedAt: new Date(this.now()).toISOString() });
    } catch (e) {
      if (!abort.signal.aborted) this.fail(job, "failed", "val.studio.internal", undefined, e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.signal.aborted && job.status !== "cancelled" && job.status !== "failed") this.fail(job, "cancelled", "val.studio.cancelled");
    }
  }

  /** Huỷ một việc (đang duyệt hoặc đang chạy). */
  cancel(id: string, who: "user" | "system" = "user"): boolean {
    const cur = this.current;
    if (!cur || cur.job.id !== id) return false;
    cur.abort.abort();
    const pending = this.d.gate.list().find((r) => r.action === "studio_voice" && r.vars.job === id);
    if (pending) this.d.gate.decide(pending.id, false);
    this.d.audit.append("studio.cancel", who, { project: cur.job.project });
    if (cur.job.status !== "done" && cur.job.status !== "failed") this.fail(cur.job, "cancelled", "val.studio.cancelled");
    return true;
  }

  /** Dừng khẩn cấp: huỷ mọi việc đang chạy. */
  abortAll(): void {
    if (this.current) this.cancel(this.current.job.id, "system");
  }

  // ------------------------------------------------------------------ truy cập sản phẩm (đã kiểm đường dẫn)

  clipPath(project: string): string | null {
    try {
      const f = path.join(this.projectDir(project), "clip-co-giong.mp4");
      return fs.existsSync(f) ? f : null;
    } catch {
      return null;
    }
  }

  previewPath(project: string, n: number): string | null {
    try {
      if (!Number.isInteger(n) || n < 0 || n > 20) return null;
      const f = path.join(this.projectDir(project), "preview", `f${String(n).padStart(5, "0")}.jpg`);
      return fs.existsSync(f) ? f : null;
    } catch {
      return null;
    }
  }
}

export { SCRIPT_LINES };
