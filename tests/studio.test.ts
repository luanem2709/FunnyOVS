/**
 * Studio dựng clip: dữ liệu mẫu hợp lệ, kiểm dữ liệu chặt, dự án nằm trong workspace, việc dựng (một việc một lúc, tiến độ, huỷ, dừng khẩn cấp),
 * hộp duyệt trước khi gửi lời đọc ra dịch vụ giọng, công cụ cho agent + chính sách quyền. Dùng runner giả — không chạy Chrome/ffmpeg/mạng.
 */
import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ActionGate } from "../src/server/agent/gate.js";
import { AuditLog } from "../src/server/security/audit.js";
import { StudioService, voiceDigest, type Runner, type StepContext, type StepName } from "../src/server/studio/service.js";
import { registerStudioRoutes } from "../src/server/routes/studio.js";
import { TOOL_POLICY, buildTools } from "../src/server/agent/tools.js";
import { CharactersSchema, KIND_FILE, ScriptSchema, ShotsSchema, STUDIO_KINDS } from "../src/shared/studio.js";
import { isOfficeEvent } from "../src/shared/officeEntity.js";
import { AUDIT_KINDS } from "../src/shared/audit.js";
import { MESSAGES_EN, MESSAGES_VI } from "../src/shared/messages.js";
import { ValidationError } from "../src/shared/validation.js";

const KIT = path.resolve(__dirname, "..", "studio", "roblox-clip");
const dirs: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-studio-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const sample = (k: (typeof STUDIO_KINDS)[number]): unknown => JSON.parse(fs.readFileSync(path.join(KIT, KIND_FILE[k]), "utf8"));

interface FakeOpts {
  tools?: { ffmpeg: boolean; chrome: boolean; voice: boolean };
  /** render chờ tới khi `release()` được gọi hoặc bị huỷ. */
  hold?: boolean;
  failStep?: StepName;
}
function fakeRunner(opts: FakeOpts = {}) {
  const calls: StepName[] = [];
  let release: () => void = () => undefined;
  const runner: Runner = {
    probe: async () => opts.tools ?? { ffmpeg: true, chrome: true, voice: true },
    run: async (step: StepName, ctx: StepContext) => {
      calls.push(step);
      if (opts.failStep === step) return { ok: false, detail: "boom api_key=sk-secretsecretsecret0000" };
      if (step === "voice") {
        const lines = JSON.parse(fs.readFileSync(path.join(ctx.projectDir, "loi-doc.json"), "utf8")) as Array<{ text: string }>;
        fs.mkdirSync(path.join(ctx.projectDir, "voice"), { recursive: true });
        const idx: Record<string, string> = {};
        lines.forEach((l, i) => {
          fs.writeFileSync(path.join(ctx.projectDir, "voice", `v${i}.mp3`), "x");
          idx[String(i)] = voiceDigest(ctx.voiceName, l.text);
        });
        fs.writeFileSync(path.join(ctx.projectDir, "voice", "index.json"), JSON.stringify(idx));
      }
      if (step === "render") {
        ctx.progress(0.5);
        if (opts.hold) await new Promise<void>((res) => { release = res; ctx.signal.addEventListener("abort", () => res(), { once: true }); });
        if (ctx.signal.aborted) return { ok: false };
        if (ctx.preview) {
          fs.mkdirSync(path.join(ctx.projectDir, "preview"), { recursive: true });
          for (let n = 0; n < 10; n++) fs.writeFileSync(path.join(ctx.projectDir, "preview", `f${String(n).padStart(5, "0")}.jpg`), "j");
        } else fs.writeFileSync(path.join(ctx.projectDir, "clip-co-giong.mp4"), "mp4");
      }
      return { ok: true };
    },
  };
  return { runner, calls, release: () => release() };
}

function setup(opts: FakeOpts & { emergency?: () => boolean } = {}) {
  const ws = mk();
  const gate = new ActionGate(60_000);
  const audit = new AuditLog(path.join(mk(), "audit.log"));
  const fake = fakeRunner(opts);
  const states: unknown[] = [];
  const studio = new StudioService({ workspace: () => ws, kitDir: KIT, gate, audit, emergency: opts.emergency ?? (() => false), runner: fake.runner, secretValues: () => ["sk-secretsecretsecret0000"], onState: (s) => states.push(s) });
  return { ws, gate, audit, fake, studio, states };
}

const waitFor = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("hết giờ chờ");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("dữ liệu mẫu và bộ kiểm tra", () => {
  it("dữ liệu mẫu của kit qua được bộ kiểm tra (script, shots, characters)", () => {
    expect(ScriptSchema.safeParse(sample("script")).success).toBe(true);
    expect(ShotsSchema.safeParse(sample("shots")).success).toBe(true);
    expect(CharactersSchema.safeParse(sample("characters")).success).toBe(true);
  });

  it("shots: hở giữa hai shot, thiếu cảnh, trùng id, toạ độ quá lớn đều bị từ chối", () => {
    const base = sample("shots") as { shots: Array<Record<string, unknown>> };
    const clone = () => JSON.parse(JSON.stringify(base)) as typeof base;
    const gap = clone();
    const first = gap.shots.find((s) => s.scene === "s1")!;
    (first.f as number[])[1] = 0.3; // hở: shot kế tiếp bắt đầu ở giá trị khác
    expect(ShotsSchema.safeParse(gap).success).toBe(false);
    const missing = clone();
    missing.shots = missing.shots.filter((s) => s.scene !== "s5");
    expect(ShotsSchema.safeParse(missing).success).toBe(false);
    const dup = clone();
    dup.shots[1].id = dup.shots[0].id;
    expect(ShotsSchema.safeParse(dup).success).toBe(false);
    const far = clone();
    (far.shots[0].from as number[])[0] = 1e9;
    expect(ShotsSchema.safeParse(far).success).toBe(false);
  });

  it("script: đúng 10 câu, mỗi câu không rỗng và không quá dài", () => {
    const s = sample("script") as Array<{ text: string }>;
    expect(ScriptSchema.safeParse(s.slice(0, 9)).success).toBe(false);
    expect(ScriptSchema.safeParse(s.map((l, i) => (i === 0 ? { text: "  " } : l))).success).toBe(false);
    expect(ScriptSchema.safeParse(s.map((l, i) => (i === 0 ? { text: "a".repeat(300) } : l))).success).toBe(false);
  });
});

describe("StudioService: lưu dữ liệu", () => {
  it("tạo dự án từ mẫu, ghi nguyên tử, ghi nhật ký; đọc lại đúng", () => {
    const { studio, ws, audit } = setup();
    const lines = (sample("script") as Array<{ text: string }>).map((l, i) => ({ text: i === 1 ? "Câu sửa lại cho cảnh một." : l.text }));
    const r = studio.save("demo-clip", "script", lines, { id: "mkt", name: "Marketing" });
    expect(r).toEqual({ project: "demo-clip", kind: "script", created: true });
    for (const k of STUDIO_KINDS) expect(fs.existsSync(path.join(ws, "studio", "demo-clip", KIND_FILE[k]))).toBe(true); // 2 bộ còn lại lấy từ mẫu
    expect((studio.read("demo-clip", "script") as Array<{ text: string }>)[1].text).toBe("Câu sửa lại cho cảnh một.");
    expect(studio.listProjects()).toEqual(["demo-clip"]);
    expect(studio.save("demo-clip", "script", lines).created).toBe(false);
    const log = audit.tail(5);
    expect(log[0].kind).toBe("studio.save");
    expect(log[0].actor).toBe("user");
    expect(log[1].actor).toBe("agent");
  });

  it("tên dự án sai / thoát khỏi thư mục / loại sai / dữ liệu sai → ValidationError có khoá", () => {
    const { studio } = setup();
    const lines = sample("script");
    for (const bad of ["../x", "a/b", "A_B", "x", "..", "a b", "a".repeat(60)]) expect(() => studio.save(bad, "script", lines)).toThrow(ValidationError);
    expect(() => studio.save("demo", "video", lines)).toThrowError(expect.objectContaining({ key: "val.studio.kindInvalid" }));
    expect(() => studio.save("demo", "script", [{ text: "chỉ một câu" }])).toThrowError(expect.objectContaining({ key: "val.studio.invalid" }));
    expect(() => studio.read("khong-co", "script")).toThrowError(expect.objectContaining({ key: "val.studio.fileMissing" }));
    expect(studio.clipPath("../x")).toBeNull();
    expect(studio.previewPath("demo", -1)).toBeNull();
  });

  it("lời đọc chứa thứ giống khoá/bí mật không được lưu (vì sẽ gửi ra dịch vụ giọng)", () => {
    const { studio, ws } = setup();
    const lines = (sample("script") as Array<{ text: string }>).map((l, i) => ({ text: i === 2 ? "khóa của tôi là sk-secretsecretsecret0000 nhé" : l.text }));
    expect(() => studio.save("demo", "script", lines)).toThrowError(expect.objectContaining({ key: "val.studio.secretInText" }));
    expect(fs.existsSync(path.join(ws, "studio", "demo", "loi-doc.json"))).toBe(false);
  });

  it("dừng khẩn cấp: không lưu, không dựng", async () => {
    const { studio } = setup({ emergency: () => true });
    expect(() => studio.save("demo", "script", sample("script"))).toThrowError(expect.objectContaining({ key: "val.studio.emergency" }));
    await expect(studio.start("demo")).rejects.toMatchObject({ key: "val.studio.emergency" });
  });
});

describe("StudioService: việc dựng", () => {
  it("dựng video không giọng: timing → mix → render, tiến độ tăng, xong có sản phẩm, KHÔNG gửi gì ra ngoài", async () => {
    const { studio, fake, gate, states } = setup();
    studio.create("demo");
    const job = await studio.start("demo");
    expect(job.status).not.toBe("failed");
    await studio.idle();
    expect(fake.calls).toEqual(["timing", "mix", "render"]);
    expect(gate.list()).toHaveLength(0);
    const j = studio.job(job.id)!;
    expect(j).toMatchObject({ status: "done", step: "done", progress: 1, output: "studio/demo/clip-co-giong.mp4" });
    expect(studio.clipPath("demo")).toBeTruthy();
    expect(states.length).toBeGreaterThan(3); // mỗi thay đổi đều đẩy trạng thái cho giao diện
    expect(isOfficeEvent({ type: "studio.state", state: studio.state(), at: new Date().toISOString() })).toBe(true);
  });

  it("xem thử: chỉ ảnh mỗi cảnh, đếm đúng số ảnh, không cần ffmpeg", async () => {
    const { studio } = setup({ tools: { ffmpeg: false, chrome: true, voice: false } });
    studio.create("demo");
    const job = await studio.start("demo", { preview: true });
    await studio.idle();
    expect(studio.job(job.id)).toMatchObject({ status: "done", previewCount: 10, output: "studio/demo/preview" });
    expect(studio.previewPath("demo", 3)).toBeTruthy();
  });

  it("thiếu công cụ ngoài → báo rõ trước khi chạy; dự án chưa có → báo rõ", async () => {
    const a = setup({ tools: { ffmpeg: false, chrome: true, voice: true } });
    a.studio.create("demo");
    await expect(a.studio.start("demo")).rejects.toMatchObject({ key: "val.studio.noFfmpeg" });
    const b = setup({ tools: { ffmpeg: true, chrome: false, voice: true } });
    b.studio.create("demo");
    await expect(b.studio.start("demo")).rejects.toMatchObject({ key: "val.studio.noChrome" });
    const c = setup({ tools: { ffmpeg: true, chrome: true, voice: false } });
    c.studio.create("demo");
    await expect(c.studio.start("demo", { voice: true })).rejects.toMatchObject({ key: "val.studio.noVoiceTool" });
    await expect(c.studio.start("khong-co")).rejects.toMatchObject({ key: "val.studio.projectMissing" });
  });

  it("một việc một lúc; huỷ giữa chừng dừng runner và nhả chỗ", async () => {
    const { studio, fake } = setup({ hold: true });
    studio.create("demo");
    const job = await studio.start("demo");
    await waitFor(() => fake.calls.includes("render"));
    await expect(studio.start("demo")).rejects.toMatchObject({ key: "val.studio.busy" });
    expect(studio.cancel(job.id)).toBe(true);
    await studio.idle();
    expect(studio.job(job.id)).toMatchObject({ status: "cancelled" });
    expect(studio.cancel(job.id)).toBe(false);
    expect(studio.clipPath("demo")).toBeNull();
    const next = await studio.start("demo", { preview: true }); // chỗ đã nhả
    expect(next.id).not.toBe(job.id);
    await waitFor(() => fake.calls.filter((c) => c === "render").length === 2);
    fake.release();
    await studio.idle();
  });

  it("một bước lỗi → failed, chi tiết bị che bí mật, các bước sau không chạy", async () => {
    const { studio, fake } = setup({ failStep: "mix" });
    studio.create("demo");
    const job = await studio.start("demo");
    await studio.idle();
    const j = studio.job(job.id)!;
    expect(j.status).toBe("failed");
    expect(j.error?.key).toBe("val.studio.step.mix");
    expect(j.error?.detail).not.toContain("sk-secretsecretsecret0000");
    expect(fake.calls).toEqual(["timing", "mix"]);
  });

  it("dừng khẩn cấp huỷ việc đang chạy", async () => {
    let on = false;
    const { studio, fake } = setup({ hold: true, emergency: () => on });
    studio.create("demo");
    const job = await studio.start("demo");
    await waitFor(() => fake.calls.includes("render"));
    on = true;
    studio.abortAll();
    await studio.idle();
    expect(studio.job(job.id)?.status).toBe("cancelled");
  });
});

describe("StudioService: duyệt trước khi gửi lời đọc ra ngoài", () => {
  it("dựng có giọng phải qua hộp duyệt; duyệt xong mới tổng hợp giọng; hộp duyệt mang đủ thông tin", async () => {
    const { studio, gate, fake } = setup();
    studio.create("demo");
    const job = await studio.start("demo", { voice: true }, { id: "mkt", name: "Marketing" });
    await waitFor(() => gate.list().length === 1);
    const req = gate.list()[0];
    expect(req).toMatchObject({ action: "studio_voice", agentId: "mkt" });
    expect(req.vars).toMatchObject({ project: "demo", chars: expect.any(Number) });
    expect(req.detail).toContain("1.");
    expect(studio.job(job.id)?.status).toBe("awaiting-approval");
    expect(fake.calls).toEqual([]); // chưa gửi gì
    gate.decide(req.id, true);
    await studio.idle();
    expect(fake.calls).toEqual(["voice", "timing", "mix", "render"]);
    expect(studio.job(job.id)?.status).toBe("done");
  });

  it("từ chối hoặc hết hạn → huỷ, KHÔNG chạy bước giọng", async () => {
    const { studio, gate, fake } = setup();
    studio.create("demo");
    const job = await studio.start("demo", { voice: true });
    await waitFor(() => gate.list().length === 1);
    gate.decide(gate.list()[0].id, false);
    await studio.idle();
    expect(studio.job(job.id)).toMatchObject({ status: "cancelled", error: { key: "val.studio.voiceDenied" } });
    expect(fake.calls).toEqual([]);
    const gate2 = new ActionGate(30);
    const ws = mk();
    const s2 = new StudioService({ workspace: () => ws, kitDir: KIT, gate: gate2, audit: new AuditLog(path.join(mk(), "a.log")), emergency: () => false, runner: fakeRunner().runner });
    s2.create("demo");
    const j2 = await s2.start("demo", { voice: true });
    await s2.idle();
    expect(s2.job(j2.id)).toMatchObject({ status: "cancelled", error: { key: "val.studio.voiceExpired" } });
  });

  it("giọng đã tổng hợp khớp văn bản + giọng thì dùng lại, không cần duyệt; sửa một câu thì phải duyệt lại", async () => {
    const { studio, gate, fake } = setup();
    studio.create("demo");
    await studio.start("demo", { voice: true });
    await waitFor(() => gate.list().length === 1);
    gate.decide(gate.list()[0].id, true);
    await studio.idle();
    fake.calls.length = 0;
    await studio.start("demo", { voice: true });
    await studio.idle();
    expect(fake.calls).toEqual(["timing", "mix", "render"]); // không có "voice", không có hộp duyệt
    const edited = (studio.read("demo", "script") as Array<{ text: string }>).map((l, i) => (i === 4 ? { text: "Một câu hoàn toàn khác." } : l));
    studio.save("demo", "script", edited);
    fake.calls.length = 0;
    await studio.start("demo", { voice: true });
    await waitFor(() => gate.list().length === 1);
    expect(fake.calls).toEqual([]);
    gate.decide(gate.list()[0].id, false);
    await studio.idle();
  });

  it("huỷ khi đang chờ duyệt thì từ chối luôn hộp duyệt", async () => {
    const { studio, gate } = setup();
    studio.create("demo");
    const job = await studio.start("demo", { voice: true });
    await waitFor(() => gate.list().length === 1);
    studio.cancel(job.id);
    await studio.idle();
    expect(gate.list()).toHaveLength(0);
    expect(studio.job(job.id)?.status).toBe("cancelled");
  });
});

describe("công cụ cho agent + chính sách quyền", () => {
  it("chỉ Marketing và Automation Lab có công cụ studio; Sales/Support/Finance thì không", () => {
    const names = ["studio_save", "studio_render", "studio_status"];
    for (const d of ["marketing", "automation"]) for (const n of names) expect(TOOL_POLICY[d]).toContain(n);
    for (const d of Object.keys(TOOL_POLICY).filter((x) => x !== "marketing" && x !== "automation")) for (const n of names) expect(TOOL_POLICY[d]).not.toContain(n);
  });

  it("studio_save / studio_render / studio_status chạy qua service; dữ liệu sai trả lỗi dễ hiểu; dừng khẩn cấp từ chối", async () => {
    const { studio } = setup();
    let emergency = false;
    const tools = buildTools({
      fs: {} as never, perms: {} as never, kb: {} as never, db: {} as never, mail: {} as never, gate: new ActionGate(), secrets: {} as never,
      policy: () => ({}) as never,
      emergency: () => emergency,
      studio: { save: (p, k, d, by) => studio.save(p, k, d, by), start: (p, o, by) => studio.start(p, o, by), state: () => studio.state() },
    });
    const t = (n: string) => tools.find((x) => x.name === n)!;
    const ctx = { agent: { id: "mkt", name: "Marketing", department: "marketing" }, lang: "en" } as never;
    const saved = await t("studio_save").run({ project: "from-agent", kind: "script", data: JSON.stringify(sample("script")) }, ctx);
    expect(saved.ok).toBe(true);
    const bad = await t("studio_save").run({ project: "from-agent", kind: "script", data: [{ text: "x" }] }, ctx);
    expect(bad.ok).toBe(false);
    const started = await t("studio_render").run({ project: "from-agent", preview: true }, ctx);
    expect(started.ok).toBe(true);
    expect(started.output).toContain("studio_");
    await studio.idle();
    const status = await t("studio_status").run({}, ctx);
    expect(status.output).toContain("from-agent");
    expect(status.output).toContain("done");
    emergency = true;
    expect((await t("studio_render").run({ project: "from-agent" }, ctx)).ok).toBe(false);
    expect((await t("studio_save").run({ project: "from-agent", kind: "script", data: sample("script") }, ctx)).ok).toBe(false);
  });

  it("không có Studio (kit thiếu) → công cụ báo không dùng được, không ném lỗi", async () => {
    const tools = buildTools({ fs: {} as never, perms: {} as never, kb: {} as never, db: {} as never, mail: {} as never, gate: new ActionGate(), secrets: {} as never, policy: () => ({}) as never, emergency: () => false });
    const ctx = { agent: { id: "mkt", name: "Marketing", department: "marketing" }, lang: "en" } as never;
    expect((await tools.find((x) => x.name === "studio_status")!.run({}, ctx)).ok).toBe(false);
  });
});

describe("REST và i18n", () => {
  it("REST: đọc/ghi/dựng/huỷ, chỉ loopback được ghi; phục vụ clip và ảnh xem thử; khoá dữ liệu lạ → 404", async () => {
    const { studio } = setup();
    const app = express();
    app.use(express.json());
    let loop = true;
    registerStudioRoutes(app, { studio, isLoopback: () => loop });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const call = async (method: string, url: string, body?: unknown) => {
      const r = await fetch(base + url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
    };
    try {
      expect((await call("POST", "/api/studio/projects", { project: "rest-demo" })).body).toMatchObject({ ok: true, created: true });
      expect((await call("GET", "/api/studio/projects/rest-demo/script")).status).toBe(200);
      expect((await call("PUT", "/api/studio/projects/rest-demo/script", [{ text: "x" }])).status).toBe(400);
      expect((await call("PUT", "/api/studio/projects/rest-demo/script", sample("script"))).status).toBe(200);
      expect((await call("GET", "/api/studio/projects/rest-demo/passwd")).status).toBe(404);
      expect((await call("POST", "/api/studio/projects", { project: "../evil" })).status).toBe(400);
      const r = await call("POST", "/api/studio/render", { project: "rest-demo" });
      expect(r.status).toBe(202);
      await studio.idle();
      const st = await call("GET", "/api/studio/state");
      expect((st.body as { jobs: Array<{ status: string }> }).jobs[0].status).toBe("done");
      expect((await call("GET", "/api/studio/projects/rest-demo/clip.mp4")).status).toBe(200);
      expect((await call("GET", "/api/studio/projects/rest-demo/preview/0")).status).toBe(404); // chưa dựng xem thử
      expect((await call("GET", "/api/studio/projects/khong-co/clip.mp4")).status).toBe(404);
      loop = false;
      expect((await call("POST", "/api/studio/render", { project: "rest-demo" })).status).toBe(403);
      expect((await call("PUT", "/api/studio/projects/rest-demo/script", sample("script"))).status).toBe(403);
      expect((await call("POST", "/api/studio/cancel", { id: "x" })).status).toBe(403);
      expect((await call("GET", "/api/studio/state")).status).toBe(200); // đọc vẫn được
    } finally {
      srv.close();
    }
  });

  it("mọi khoá thông điệp Studio có đủ tiếng Việt và tiếng Anh; nhật ký có loại mới", () => {
    const keys = Object.keys(MESSAGES_VI).filter((k) => k.startsWith("val.studio.") || k === "approval.action.studio_voice.summary");
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys) expect((MESSAGES_EN as Record<string, string>)[k], k).toBeTruthy();
    for (const k of ["studio.save", "studio.render", "studio.cancel"]) expect(AUDIT_KINDS as readonly string[]).toContain(k);
  });
});
