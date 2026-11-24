/**
 * Nút "+ Thêm API": nguồn AI tuỳ chỉnh được gom vào cùng bộ router như 9router — thêm/sửa/xoá, thứ tự ưu tiên, xoay vòng, kiểm tra trước khi lưu,
 * khoá chỉ nằm ở kho khoá, không làm chậm cuộc gọi AI khi một nguồn đứt mạng. Dùng `fetch` giả — không gọi mạng thật.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AiHub } from "../src/server/ai/hub.js";
import { MAX_CUSTOM_PROVIDERS, newCustomId, normalizeBaseUrl, normalizeCustomInput, parseCustomRecords } from "../src/server/ai/custom.js";
import { CATALOG } from "../src/server/ai/catalog.js";
import { ValidationError } from "../src/shared/validation.js";
import { msg } from "../src/shared/messages.js";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const completion = (text: string): Response => json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
const header = (init: RequestInit | undefined, name: string): string | undefined => (init?.headers as Record<string, string> | undefined)?.[name];

function fakeFetch(routes: Record<string, Handler>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-aicustom-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const A = "https://llm.acme.test/v1";
const B = "https://api.beta.test/v1";

function hub(routes: Record<string, Handler>, extra: Partial<ConstructorParameters<typeof AiHub>[0]> = {}): AiHub {
  return new AiHub({ dataDir: dir, env: {}, fetchImpl: fakeFetch(routes), ...extra });
}

describe("kiểm tra đầu vào của nguồn tuỳ chỉnh", () => {
  const bad = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      if (e instanceof ValidationError) return e.key;
      throw e;
    }
    return "không-lỗi";
  };

  it("địa chỉ: chỉ http/https, không kèm tài khoản, bỏ query/hash và dấu / cuối", () => {
    expect(normalizeBaseUrl("  https://api.x.test/v1/?a=1#h ")).toBe("https://api.x.test/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:8000/v1///")).toBe("http://127.0.0.1:8000/v1");
    expect(normalizeBaseUrl("https://api.x.test")).toBe("https://api.x.test");
    expect(bad(() => normalizeBaseUrl(""))).toBe("val.ai.baseUrlRequired");
    expect(bad(() => normalizeBaseUrl(undefined))).toBe("val.ai.baseUrlRequired");
    expect(bad(() => normalizeBaseUrl("không phải url"))).toBe("val.ai.baseUrlInvalid");
    expect(bad(() => normalizeBaseUrl("ftp://x.test/v1"))).toBe("val.ai.baseUrlProtocol");
    expect(bad(() => normalizeBaseUrl("javascript:alert(1)"))).toBe("val.ai.baseUrlProtocol");
    expect(bad(() => normalizeBaseUrl("https://user:pass@x.test/v1"))).toBe("val.ai.baseUrlCredentials");
    expect(bad(() => normalizeBaseUrl(`https://x.test/${"a".repeat(400)}`))).toBe("val.ai.baseUrlInvalid");
  });

  it("tên, khoá, model: bắt buộc/giới hạn; khi sửa (partial) chỉ kiểm trường được gửi", () => {
    expect(bad(() => normalizeCustomInput({ baseUrl: A }))).toBe("val.ai.labelRequired");
    expect(bad(() => normalizeCustomInput({ label: "x".repeat(41), baseUrl: A }))).toBe("val.ai.labelTooLong");
    expect(bad(() => normalizeCustomInput({ label: "ok", baseUrl: A, apiKey: "k".repeat(501) }))).toBe("val.ai.keyTooLong");
    expect(normalizeCustomInput({ label: " ACME ", baseUrl: A, apiKey: " k ", model: " m ", free: true })).toEqual({ label: "ACME", baseUrl: A, apiKey: "k", model: "m", free: true });
    expect(normalizeCustomInput({ label: "x", baseUrl: A, free: "true" }).free).toBe(false); // chỉ chấp nhận đúng boolean true
    expect(normalizeCustomInput({ model: "m2" }, { partial: true })).toMatchObject({ baseUrl: "", model: "m2" });
    expect(bad(() => normalizeCustomInput({ label: "" }, { partial: true }))).toBe("val.ai.labelRequired");
  });

  it("id: không trùng danh mục dựng sẵn, bỏ dấu tiếng Việt, tránh va chạm", () => {
    const taken = new Set(CATALOG.map((c) => c.id));
    const id = newCustomId("Máy chủ Đà Nẵng!", taken, () => 0.5);
    expect(id).toMatch(/^u-may-chu-da-nang-[0-9a-z]{4}$/);
    expect(taken.has(id)).toBe(false);
    expect(newCustomId("???", taken, () => 0.1)).toMatch(/^u-api-/);
    // 0.5 * 36^4 = 839808 = "i000" ở hệ 36: id này đã bị chiếm → lần sinh kế tiếp phải ra id khác; nếu mọi lần đều trùng thì dùng dấu thời gian
    const seq = [0.5, 0.5, 0.25];
    let i = 0;
    const next = newCustomId("a", new Set(["u-a-i000"]), () => seq[Math.min(i++, seq.length - 1)]);
    expect(next).toMatch(/^u-a-[0-9a-z]{4}$/);
    expect(next).not.toBe("u-a-i000");
    const stuck = newCustomId("a", new Set(["u-a-i000"]), () => 0.5);
    expect(stuck.startsWith("u-a-")).toBe(true);
    expect(stuck).not.toBe("u-a-i000");
    // mọi mục bị lưu hỏng đều bị bỏ, không ném lỗi
    const parsed = parseCustomRecords([{ id: "u-ok", label: "OK", baseUrl: A }, { id: "x", label: "sai id", baseUrl: A }, { id: "u-no-url", label: "n", baseUrl: "ftp://x" }, null, 5, { id: "u-ok", label: "trùng", baseUrl: A }]);
    expect(parsed.map((r) => r.id)).toEqual(["u-ok"]);
    expect(parseCustomRecords("rác")).toEqual([]);
  });

  it("mọi khoá lỗi dùng ở đây đều có bản dịch vi + en", () => {
    for (const k of ["val.ai.labelRequired", "val.ai.labelTooLong", "val.ai.baseUrlRequired", "val.ai.baseUrlInvalid", "val.ai.baseUrlProtocol", "val.ai.baseUrlCredentials", "val.ai.keyTooLong", "val.ai.tooMany", "val.ai.notCustom", "val.ai.badStrategy", "ai.check.ok", "ai.check.noList"]) {
      expect(msg("vi", k, { max: 1, n: 1 }), `vi ${k}`).not.toBe(k);
      expect(msg("en", k, { max: 1, n: 1 }), `en ${k}`).not.toBe(k);
    }
  });
});

describe("thêm nguồn tuỳ chỉnh và dùng nó như mọi nguồn khác", () => {
  it("thêm → sẵn sàng, chat được qua nó (đúng khoá, bỏ model embedding); khoá chỉ nằm ở kho khoá, không ở trạng thái hay ai.json; nạp lại sau khi mở app", async () => {
    const calls: Array<{ auth?: string; model: string }> = [];
    const routes: Record<string, Handler> = {
      [`${A}/models`]: () => json({ data: [{ id: "acme-embed-v1" }, { id: "acme-70b" }] }),
      [`${A}/chat/completions`]: (_u, init) => {
        calls.push({ auth: header(init, "authorization"), model: JSON.parse(String(init?.body)).model });
        return completion("xin chào từ ACME");
      },
    };
    const h = hub(routes);
    const added = await h.addCustom({ label: "ACME LLM", baseUrl: `${A}/`, apiKey: "acme-secret-key-123456", free: true });
    expect(added).toMatchObject({ custom: true, kind: "custom", label: "ACME LLM", baseUrl: A, state: "ready", free: true, hasKey: true, keySource: "stored", enabled: true });
    expect(added.id).toMatch(/^u-acme-llm-[0-9a-z]{4}$/);
    expect(added.activeModel).toBe("acme-70b");
    expect(added.keyMask).not.toContain("acme-secret-key-123456");

    const r = await h.chat([{ role: "user", content: "chào" }]);
    expect(r).toMatchObject({ providerId: added.id, text: "xin chào từ ACME", model: "acme-70b" });
    expect(calls).toEqual([{ auth: "Bearer acme-secret-key-123456", model: "acme-70b" }]);

    expect(JSON.stringify(await h.status())).not.toContain("acme-secret-key-123456");
    expect(fs.readFileSync(path.join(dir, "ai.json"), "utf8")).not.toContain("acme-secret");
    expect(fs.readFileSync(path.join(dir, "secrets.json"), "utf8")).toContain("acme-secret-key-123456");

    const again = hub(routes);
    expect((await again.status(true)).find((s) => s.id === added.id)).toMatchObject({ custom: true, state: "ready", hasKey: true, label: "ACME LLM" });
    expect(again.knows(added.id)).toBe(true);
    expect(again.knows("u-khong-co")).toBe(false);
    expect(again.knows("groq")).toBe(true);
  });

  it("model do người dùng đặt được dùng khi máy chủ không liệt kê model; máy chủ không có /models vẫn coi là sẵn sàng", async () => {
    let used = "";
    const h = hub({
      [`${A}/models`]: () => json({ error: "not found" }, 404),
      [`${A}/chat/completions`]: (_u, init) => {
        used = JSON.parse(String(init?.body)).model;
        return completion("ok");
      },
    });
    const added = await h.addCustom({ label: "Không /models", baseUrl: A, model: "my-model" });
    expect(added.state).toBe("ready");
    expect((await h.chat([{ role: "user", content: "x" }])).model).toBe("my-model");
    expect(used).toBe("my-model");
  });

  it("nguồn đứt mạng hoặc sai khoá hiện đúng trạng thái; không làm hỏng các nguồn khác", async () => {
    const h = hub({ [`${A}/models`]: () => json({ error: "unauthorized" }, 401) });
    const noKey = await h.addCustom({ label: "Cần khoá", baseUrl: A });
    expect(noKey).toMatchObject({ state: "no-key", detailKey: "ai.detail.needsKey" });
    await h.setKey(noKey.id, "sai-khoa-123456");
    expect((await h.status()).find((s) => s.id === noKey.id)).toMatchObject({ state: "auth-failed", detailKey: "ai.detail.badKey" });
    const off = await h.addCustom({ label: "Tắt máy", baseUrl: "https://down.test/v1" });
    expect(off).toMatchObject({ state: "offline", detailKey: "ai.detail.unreachable" });
  });

  it("giới hạn số nguồn tuỳ chỉnh; sửa/xoá nguồn dựng sẵn bị từ chối", async () => {
    const h = hub({ "https://": () => json({ data: [{ id: "m" }] }) });
    for (let i = 0; i < MAX_CUSTOM_PROVIDERS; i++) await h.addCustom({ label: `n${i}`, baseUrl: `https://s${i}.test/v1` });
    await expect(h.addCustom({ label: "thừa", baseUrl: "https://more.test/v1" })).rejects.toMatchObject({ key: "val.ai.tooMany", vars: { max: MAX_CUSTOM_PROVIDERS } });
    await expect(h.updateCustom("groq", { label: "x" })).rejects.toMatchObject({ key: "val.ai.notCustom" });
    await expect(h.removeCustom("ollama")).rejects.toMatchObject({ key: "val.ai.notCustom" });
  });
});

describe("sửa và xoá", () => {
  it("sửa tên/model/miễn phí; đổi sang địa chỉ khác nơi thì khoá cũ bị xoá (không tự theo sang), cùng nơi thì giữ khoá", async () => {
    const seen: Array<{ url: string; auth?: string }> = [];
    const h = hub({
      "https://": (u, init) => {
        seen.push({ url: u, auth: header(init, "authorization") });
        return json({ data: [{ id: "m" }] });
      },
    });
    const a = await h.addCustom({ label: "Gốc", baseUrl: A, apiKey: "khoa-goc-123456" });
    const edited = await h.updateCustom(a.id, { label: "Đã đổi tên", model: "m", free: true, baseUrl: `${A}/` });
    expect(edited).toMatchObject({ label: "Đã đổi tên", free: true, modelOverride: undefined, hasKey: true, baseUrl: A });

    const moved = await h.updateCustom(a.id, { baseUrl: B });
    expect(moved).toMatchObject({ baseUrl: B, hasKey: false }); // khoá cũ không được gửi sang địa chỉ khác
    expect(seen.filter((s) => s.url.startsWith(B)).every((s) => s.auth === undefined)).toBe(true);

    const withNewKey = await h.updateCustom(a.id, { baseUrl: "https://c.test/v1", apiKey: "khoa-moi-123456" });
    expect(withNewKey).toMatchObject({ baseUrl: "https://c.test/v1", hasKey: true });
    expect(fs.readFileSync(path.join(dir, "ai.json"), "utf8")).not.toContain("khoa-moi");
  });

  it("xoá dọn sạch: bản ghi, khoá, thứ tự, trạng thái bật/tắt; chat không còn dùng nó", async () => {
    const h = hub({ [`${A}/models`]: () => json({ data: [{ id: "m" }] }), [`${A}/chat/completions`]: () => completion("từ A") });
    const a = await h.addCustom({ label: "A", baseUrl: A, apiKey: "khoa-a-123456" });
    h.setOrder([a.id, "groq"]);
    h.setEnabled(a.id, false);
    h.setModel(a.id, "x");
    await h.removeCustom(a.id);
    expect(h.knows(a.id)).toBe(false);
    expect((await h.status(true)).some((s) => s.id === a.id)).toBe(false);
    await expect(h.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ code: "NO_PROVIDER" });
    const files = fs.readFileSync(path.join(dir, "ai.json"), "utf8") + fs.readFileSync(path.join(dir, "secrets.json"), "utf8");
    expect(files).not.toContain(a.id);
    expect(files).not.toContain("khoa-a-123456");
    await expect(h.removeCustom(a.id)).rejects.toMatchObject({ key: "val.ai.notCustom" });
  });
});

describe("gom nhiều nguồn như 9router: thứ tự ưu tiên và xoay vòng", () => {
  const routes = (log: string[]): Record<string, Handler> => ({
    [`${A}/models`]: () => json({ data: [{ id: "a" }] }),
    [`${B}/models`]: () => json({ data: [{ id: "b" }] }),
    [`${A}/chat/completions`]: () => (log.push("A"), completion("từ A")),
    [`${B}/chat/completions`]: () => (log.push("B"), completion("từ B")),
  });

  it("thứ tự do người dùng sắp xếp quyết định nguồn nào được dùng trước; id lạ bị bỏ; nạp lại giữ nguyên", async () => {
    const log: string[] = [];
    const h = hub(routes(log));
    const a = await h.addCustom({ label: "A", baseUrl: A });
    const b = await h.addCustom({ label: "B", baseUrl: B });
    await h.chat([{ role: "user", content: "1" }]);
    expect(log).toEqual(["A"]); // mặc định: theo thứ tự thêm
    h.setOrder([b.id, "id-la", a.id, b.id]);
    await h.chat([{ role: "user", content: "2" }]);
    expect(log).toEqual(["A", "B"]);
    const st = await h.status();
    expect(st.map((s) => s.id).slice(0, 2)).toEqual([b.id, a.id]);
    const again = hub(routes(log));
    expect((await again.status(true)).map((s) => s.id).slice(0, 2)).toEqual([b.id, a.id]);
  });

  it("xoay vòng dàn đều tải giữa các nguồn sẵn sàng và vẫn tự dự phòng khi một nguồn lỗi; đổi cách chọn được lưu", async () => {
    const log: string[] = [];
    const h = hub(routes(log));
    await h.addCustom({ label: "A", baseUrl: A });
    await h.addCustom({ label: "B", baseUrl: B });
    expect(h.strategy()).toBe("priority");
    h.setStrategy("roundrobin");
    for (let i = 0; i < 4; i++) await h.chat([{ role: "user", content: String(i) }]);
    expect(log).toEqual(["A", "B", "A", "B"]);
    expect(() => h.setStrategy("lung-tung")).toThrow();
    expect(hub(routes([])).strategy()).toBe("roundrobin"); // đã lưu

    // B hỏng → các cuộc gọi vẫn thành công nhờ dự phòng
    const log2: string[] = [];
    const broken = hub({ ...routes(log2), [`${B}/chat/completions`]: () => json({ error: "boom" }, 500) });
    await broken.addCustom({ label: "A", baseUrl: A });
    await broken.addCustom({ label: "B", baseUrl: B });
    broken.setStrategy("roundrobin");
    for (let i = 0; i < 4; i++) expect((await broken.chat([{ role: "user", content: String(i) }])).text).toBe("từ A");
  });

  it("một nguồn tuỳ chỉnh chậm/đứt mạng KHÔNG làm chậm cuộc gọi AI sau lần dò đầu (dò ngầm khi kết quả đã cũ)", async () => {
    let t = 0;
    let hang = false;
    const h = hub(
      {
        [`${A}/models`]: () => json({ data: [{ id: "a" }] }),
        [`${A}/chat/completions`]: () => completion("từ A"),
        [`${B}/models`]: (_u, init) => (hang ? new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))) : json({ data: [{ id: "b" }] })),
        [`${B}/chat/completions`]: () => completion("từ B"),
      },
      { now: () => t },
    );
    await h.addCustom({ label: "A", baseUrl: A });
    await h.addCustom({ label: "B", baseUrl: B });
    await h.status(true);
    t = 1_000_000; // kết quả dò đã cũ
    hang = true;
    const started = Date.now();
    const r = await h.chat([{ role: "user", content: "x" }]);
    expect(r.text).toBe("từ A");
    expect(Date.now() - started).toBeLessThan(2000); // không đợi nguồn B (sẽ hết giờ ở ~4 giây)
  });
});

describe("kiểm tra điểm cuối trước khi lưu", () => {
  it("báo số model, thiếu/sai khoá, lỗi HTTP, không kết nối được, địa chỉ sai — mỗi kết quả có khoá i18n", async () => {
    const h = hub({
      "https://ok.test/v1/models": () => json({ data: [{ id: "m1" }, { id: "m2" }] }),
      "https://empty.test/v1/models": () => json({ object: "list" }),
      "https://auth.test/v1/models": (_u, init) => (header(init, "authorization") === "Bearer dung-123456" ? json({ data: [{ id: "x" }] }) : json({}, 401)),
      "https://err.test/v1/models": () => json({}, 404),
    });
    expect(await h.check({ baseUrl: "https://ok.test/v1" })).toMatchObject({ ok: true, key: "ai.check.ok", vars: { n: 2 }, models: ["m1", "m2"] });
    expect(await h.check({ baseUrl: "https://empty.test/v1" })).toMatchObject({ ok: true, key: "ai.check.noList" });
    expect(await h.check({ baseUrl: "https://auth.test/v1" })).toMatchObject({ ok: false, key: "ai.detail.needsKey" });
    expect(await h.check({ baseUrl: "https://auth.test/v1", apiKey: "sai-123456" })).toMatchObject({ ok: false, key: "ai.detail.badKey" });
    expect(await h.check({ baseUrl: "https://auth.test/v1", apiKey: "dung-123456" })).toMatchObject({ ok: true });
    expect(await h.check({ baseUrl: "https://err.test/v1" })).toMatchObject({ ok: false, key: "ai.detail.http", vars: { status: 404 } });
    expect(await h.check({ baseUrl: "https://down.test/v1" })).toMatchObject({ ok: false, key: "ai.detail.unreachable" });
    expect(await h.check({ baseUrl: "ftp://x" })).toMatchObject({ ok: false, key: "val.ai.baseUrlProtocol" });
    expect(await h.check({})).toMatchObject({ ok: false, key: "val.ai.baseUrlRequired" });
  });

  it("khi sửa nguồn đã có: dùng khoá đã lưu CHỈ khi địa chỉ không đổi; không bao giờ gửi khoá của nguồn dựng sẵn", async () => {
    const auth: Array<{ url: string; auth?: string }> = [];
    const h = hub(
      { "https://": (u, init) => (auth.push({ url: u, auth: header(init, "authorization") }), json({ data: [{ id: "m" }] })) },
    );
    const a = await h.addCustom({ label: "A", baseUrl: A, apiKey: "khoa-luu-123456" });
    auth.length = 0;
    await h.check({ id: a.id, baseUrl: A });
    expect(auth).toEqual([{ url: `${A}/models`, auth: "Bearer khoa-luu-123456" }]);
    auth.length = 0;
    await h.check({ id: a.id, baseUrl: "https://evil.test/v1" });
    expect(auth).toEqual([{ url: "https://evil.test/v1/models", auth: undefined }]);
    auth.length = 0;
    await h.setKey("groq", "gsk_abcdefghijklmnop123456");
    await h.check({ id: "groq", baseUrl: "https://evil.test/v1" });
    expect(auth.find((x) => x.url.startsWith("https://evil.test"))?.auth).toBeUndefined();
  });
});

describe("cổng gom OmniRoute / 9router", () => {
  const GW = "http://127.0.0.1:20128/v1";
  type Spawn = NonNullable<ConstructorParameters<typeof AiHub>[0]["spawnImpl"]>;

  it("lệnh đầu không cài (shell thoát lỗi ngay) → thử ngay lệnh kế tiếp, không đợi hết giờ", async () => {
    const spawned: string[] = [];
    let up = false;
    const h = hub(
      { [`${GW}/models`]: () => (up ? json({ data: [{ id: "auto" }] }) : json({}, 503)) },
      {
        omniPollMs: 20,
        spawnImpl: ((cmd: string) => {
          spawned.push(cmd);
          return {
            on: (ev: string, cb: (code: number) => void) => {
              if (ev === "exit" && cmd === "omniroute") setTimeout(() => cb(1), 0); // "omniroute" không được cài
            },
            unref: () => {
              if (cmd === "9router") up = true; // 9router khởi động được
            },
          };
        }) as unknown as Spawn,
      },
    );
    const started = Date.now();
    expect(await h.startOmniRoute(20_000)).toMatchObject({ ok: true, key: "ai.omni.started" });
    expect(spawned).toEqual(["omniroute", "9router"]);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("không lệnh nào chạy được → báo lỗi nhắc cài cả hai; nhãn dựng sẵn gọi đúng tên", async () => {
    const dead = { on: (ev: string, cb: (code: number) => void) => ev === "exit" && setTimeout(() => cb(127), 0), unref: () => undefined };
    const h = hub({}, { omniPollMs: 20, spawnImpl: (() => dead) as unknown as Spawn });
    const r = await h.startOmniRoute(2000);
    expect(r).toMatchObject({ ok: false, key: "ai.omni.failed" });
    expect(msg("en", r.key!)).toMatch(/9router/);
    expect(msg("en", r.key!)).toMatch(/omniroute/);
    expect(CATALOG.find((c) => c.id === "omniroute")!.label).toMatch(/9router/);
  });
});

describe("nguồn miễn phí dựng sẵn (không còn GitHub Models đã ngừng)", () => {
  it("NVIDIA NIM và SambaNova tự nhận khoá từ biến môi trường; GitHub Models không còn trong danh mục", async () => {
    expect(CATALOG.some((c) => c.id === "github" || /models\.github\.ai/.test(c.baseUrl))).toBe(false);
    const h = new AiHub({ dataDir: dir, env: { NVIDIA_API_KEY: "nvapi-abcdefghijklmnop123456", SAMBANOVA_API_KEY: "samba-abcdefghijklmnop123456", GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz123456" }, fetchImpl: fakeFetch({}) });
    const st = await h.status(true);
    for (const id of ["nvidia", "sambanova"]) expect(st.find((s) => s.id === id), id).toMatchObject({ state: "ready", keySource: "env", free: true });
    expect(st.some((s) => s.id === "github")).toBe(false);
    expect(JSON.stringify(st)).not.toContain("nvapi-abcdefghijklmnop123456");
    for (const c of CATALOG) expect(() => new URL(c.baseUrl || "http://x"), c.id).not.toThrow();
  });
});
