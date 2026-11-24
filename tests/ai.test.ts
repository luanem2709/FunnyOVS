/**
 * Test cho lớp kết nối AI: tự dò, khoá, router dự phòng, ngắt mạch, model, kho bí mật, che khoá.
 * Dùng `fetch` giả — không gọi mạng thật.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AiHub } from "../src/server/ai/hub.js";
import { SecretStore } from "../src/server/ai/secrets.js";
import { LlmRouter } from "../src/server/ai/router.js";
import { pickModel, providerDef } from "../src/server/ai/catalog.js";
import { redact, maskKey } from "../src/server/security/redact.js";
import { AiError, type ResolvedProvider } from "../src/server/ai/types.js";
import { aiAttemptsText, aiErrorText } from "../src/shared/aiErrors.js";
import { msg } from "../src/shared/messages.js";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

function completion(text: string, usage = { prompt_tokens: 11, completion_tokens: 7 }): Response {
  return json({ choices: [{ message: { content: text } }], usage });
}

/** fetch giả: handler theo URL; URL không khớp → ném lỗi mạng như khi dịch vụ không chạy. */
function fakeFetch(routes: Record<string, Handler>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-ai-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const OMNI = "http://127.0.0.1:20128/v1";
const OLLAMA = "http://127.0.0.1:11434/v1";
const LMS = "http://127.0.0.1:1234/v1";

describe("tự dò dịch vụ cục bộ (B1)", () => {
  it("nhận ra OmniRoute, Ollama, LM Studio đang chạy và lấy danh sách model", async () => {
    const hub = new AiHub({
      dataDir: dir,
      env: {},
      fetchImpl: fakeFetch({
        [`${OMNI}/models`]: () => json({ data: [{ id: "auto" }, { id: "auto/coding:fast" }] }),
        [`${OLLAMA}/models`]: () => json({ data: [{ id: "nomic-embed-text" }, { id: "qwen2.5:7b" }] }),
        [`${LMS}/models`]: () => json({ data: [{ id: "llama-3.2-3b" }] }),
      }),
    });
    const st = await hub.status(true);
    const by = Object.fromEntries(st.map((s) => [s.id, s]));
    expect(by.omniroute.state).toBe("ready");
    expect(by.omniroute.activeModel).toBe("auto");
    expect(by.ollama.state).toBe("ready");
    expect(by.ollama.activeModel).toBe("qwen2.5:7b"); // bỏ qua model embedding
    expect(by.lmstudio.state).toBe("ready");
    expect(hub.hasProvider()).toBe(true);
  });

  it("dịch vụ không chạy → offline; không có nhà cung cấp nào → hasProvider = false", async () => {
    const hub = new AiHub({ dataDir: dir, env: {}, fetchImpl: fakeFetch({}) });
    const st = await hub.status(true);
    expect(st.find((s) => s.id === "omniroute")!.state).toBe("offline");
    expect(st.find((s) => s.id === "groq")!.state).toBe("no-key");
    expect(hub.hasProvider()).toBe(false);
    await expect(hub.chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  it("OmniRoute yêu cầu khoá → no-key; sau khi nhập khoá và máy chủ chấp nhận → ready", async () => {
    let okKey = false;
    const hub = new AiHub({
      dataDir: dir,
      env: {},
      fetchImpl: fakeFetch({
        [`${OMNI}/models`]: (_u, init) => {
          const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
          return auth === "Bearer omni-secret-key-123" ? ((okKey = true), json({ data: [{ id: "auto" }] })) : json({ error: "unauthorized" }, 401);
        },
      }),
    });
    expect((await hub.status(true)).find((s) => s.id === "omniroute")!.state).toBe("no-key");
    await hub.setKey("omniroute", "omni-secret-key-123");
    const after = (await hub.status()).find((s) => s.id === "omniroute")!;
    expect(okKey).toBe(true);
    expect(after.state).toBe("ready");
    expect(after.keySource).toBe("stored");
    expect(JSON.stringify(after)).not.toContain("omni-secret-key-123");
  });

  it("địa chỉ có thể ghi đè bằng biến môi trường (OLLAMA_HOST, OFFICE_OMNIROUTE_URL)", async () => {
    const hub = new AiHub({
      dataDir: dir,
      env: { OLLAMA_HOST: "10.0.0.7:5555", OFFICE_OMNIROUTE_URL: "http://gw.local:9000/v1" },
      fetchImpl: fakeFetch({
        "http://10.0.0.7:5555/v1/models": () => json({ data: [{ id: "llama3.1" }] }),
        "http://gw.local:9000/v1/models": () => json({ data: [{ id: "auto" }] }),
      }),
    });
    const st = await hub.status(true);
    expect(st.find((s) => s.id === "ollama")!.baseUrl).toBe("http://10.0.0.7:5555/v1");
    expect(st.find((s) => s.id === "ollama")!.state).toBe("ready");
    expect(st.find((s) => s.id === "omniroute")!.state).toBe("ready");
  });
});

describe("tự nhận khoá miễn phí từ môi trường (B2)", () => {
  it("Groq, OpenRouter, Gemini, Cerebras, Mistral, NVIDIA NIM, SambaNova", async () => {
    const hub = new AiHub({
      dataDir: dir,
      env: {
        GROQ_API_KEY: "gsk_abcdefghijklmnop123456",
        OPENROUTER_API_KEY: "sk-or-v1-abcdefghijklmnop123456",
        GOOGLE_API_KEY: "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
        CEREBRAS_API_KEY: "csk-abcdefghijklmnopqrstuv",
        MISTRAL_API_KEY: "mistralkeyabcdefghijk",
        NVIDIA_API_KEY: "nvapi-abcdefghijklmnopqrstuvwxyz123456",
        SAMBANOVA_API_KEY: "samba-abcdefghijklmnopqrstuvwxyz123456",
      },
      fetchImpl: fakeFetch({}),
    });
    const st = await hub.status(true);
    for (const id of ["groq", "openrouter", "gemini", "cerebras", "mistral", "nvidia", "sambanova"]) {
      const s = st.find((x) => x.id === id)!;
      expect(s.state, id).toBe("ready");
      expect(s.keySource, id).toBe("env");
      expect(s.free, id).toBe(true);
    }
    // Khoá không bao giờ nằm trong trạng thái trả cho giao diện.
    const dump = JSON.stringify(st);
    for (const secret of ["gsk_abcdefghijklmnop123456", "sk-or-v1-abcdefghijklmnop123456", "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456", "nvapi-abcdefghijklmnopqrstuvwxyz123456", "samba-abcdefghijklmnopqrstuvwxyz123456"]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("OFFICE_LLM_BASE_URL tạo nhà cung cấp 'custom' ưu tiên cao nhất", async () => {
    const calls: string[] = [];
    const hub = new AiHub({
      dataDir: dir,
      env: { OFFICE_LLM_BASE_URL: "https://llm.example.test/v1", OFFICE_LLM_API_KEY: "k-test-123456", OFFICE_LLM_MODEL: "my-model", GROQ_API_KEY: "gsk_abcdefghijklmnop123456" },
      fetchImpl: fakeFetch({
        "https://llm.example.test/v1/models": () => json({ data: [{ id: "my-model" }] }),
        "https://llm.example.test/v1/chat/completions": (u, init) => {
          calls.push(`custom ${JSON.parse(String(init?.body)).model}`);
          return completion("xin chào");
        },
        "https://api.groq.com": () => {
          calls.push("groq");
          return completion("không nên gọi");
        },
      }),
    });
    const r = await hub.chat([{ role: "user", content: "hi" }]);
    expect(r.providerId).toBe("custom");
    expect(r.text).toBe("xin chào");
    expect(calls).toEqual(["custom my-model"]);
  });
});

describe("router: dự phòng, ngắt mạch, 429 (B3)", () => {
  function provider(id: string, over: Partial<ResolvedProvider> = {}): ResolvedProvider {
    return { def: { ...providerDef("groq")!, id }, baseUrl: `https://${id}.test/v1`, apiKey: "k", model: "m", models: [], ...over };
  }

  it("lỗi 500 ở nguồn đầu → chuyển sang nguồn thứ hai; nguồn đầu bị ngắt mạch", async () => {
    let t = 1_000_000;
    const calls: string[] = [];
    const router = new LlmRouter({
      candidates: async () => [provider("a"), provider("b")],
      now: () => t,
      fetchImpl: fakeFetch({
        "https://a.test": () => {
          calls.push("a");
          return json({ error: "boom" }, 500);
        },
        "https://b.test": () => {
          calls.push("b");
          return completion("từ b");
        },
      }),
    });
    const r1 = await router.chat([{ role: "user", content: "x" }]);
    expect(r1.providerId).toBe("b");
    expect(router.isCooling("a")).toBe(true);
    await router.chat([{ role: "user", content: "x" }]);
    expect(calls).toEqual(["a", "b", "b"]); // lần 2 bỏ qua "a" đang nghỉ
    t += 20_000; // hết 15 giây nghỉ
    expect(router.isCooling("a")).toBe(false);
    await router.chat([{ role: "user", content: "x" }]);
    expect(calls.at(-2)).toBe("a");
  });

  it("thời gian nghỉ tăng gấp đôi theo số lỗi liên tiếp và có trần 5 phút", async () => {
    let t = 0;
    const router = new LlmRouter({
      candidates: async () => [provider("a")],
      now: () => t,
      fetchImpl: fakeFetch({ "https://a.test": () => json({}, 503) }),
    });
    const cools: number[] = [];
    for (let i = 0; i < 8; i++) {
      await expect(router.chat([{ role: "user", content: "x" }], { only: "a" })).rejects.toBeInstanceOf(AiError);
      cools.push((router.stats("a").cooldownUntil ?? 0) - t);
      t += 10 * 60_000;
    }
    expect(cools.slice(0, 4)).toEqual([15_000, 30_000, 60_000, 120_000]);
    expect(Math.max(...cools)).toBe(300_000);
  });

  it("429 tôn trọng Retry-After; 401 nghỉ 10 phút", async () => {
    let t = 0;
    const router = new LlmRouter({
      candidates: async () => [provider("a"), provider("b")],
      now: () => t,
      fetchImpl: fakeFetch({
        "https://a.test": () => json({ error: "slow down" }, 429, { "retry-after": "42" }),
        "https://b.test": () => json({ error: "bad key" }, 401),
      }),
    });
    await expect(router.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ code: "ALL_FAILED" });
    expect((router.stats("a").cooldownUntil ?? 0) - t).toBe(42_000);
    expect((router.stats("b").cooldownUntil ?? 0) - t).toBe(10 * 60_000);
    await expect(router.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  it("quá thời gian chờ → TIMEOUT rồi dự phòng", async () => {
    const router = new LlmRouter({
      candidates: async () => [provider("slow"), provider("fast")],
      fetchImpl: ((url: string, init?: RequestInit) =>
        String(url).startsWith("https://slow.test")
          ? new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))
          : Promise.resolve(completion("nhanh"))) as unknown as typeof fetch,
    });
    const r = await router.chat([{ role: "user", content: "x" }], { timeoutMs: 40 });
    expect(r.providerId).toBe("fast");
    const st = router.stats("slow");
    expect(st.lastError).toContain("timed out"); // chẩn đoán kỹ thuật (tiếng Anh) cho nhật ký
    expect(st.lastErrorKey).toBe("ai.err.TIMEOUT"); // giao diện dịch theo khoá + biến
    expect(st.lastErrorVars).toMatchObject({ s: 1 });
  });

  it("lỗi gọi AI mang mã + biến để dịch: HTTP kèm nội dung, ALL_FAILED liệt kê từng nguồn", async () => {
    const router = new LlmRouter({
      candidates: async () => [provider("a"), provider("b")],
      fetchImpl: fakeFetch({
        "https://a.test": () => json({ error: "slow down" }, 429),
        "https://b.test": () => new Response("", { status: 503 }),
      }),
    });
    const err = (await router.chat([{ role: "user", content: "x" }]).catch((e) => e)) as AiError;
    expect(err.code).toBe("ALL_FAILED");
    expect(err.message).not.toMatch(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i); // không lẫn tiếng Việt vào chẩn đoán
    expect(err.attempts.map((a) => [a.providerId, a.code, a.status])).toEqual([
      ["a", "HTTP", 429],
      ["b", "HTTP", 503],
    ]);
    expect(aiAttemptsText("en", err.attempts)).toMatch(/^a: HTTP 429.*\| b: HTTP 503$/);
    expect(aiAttemptsText("vi", err.attempts)).toMatch(/^a: HTTP 429.*\| b: HTTP 503$/);
    expect(router.stats("a").lastErrorStatus).toBe(429);
  });

  it("aiErrorText: mọi mã lỗi đều có bản dịch vi/en và biến được thay đúng", () => {
    const codes = ["NO_PROVIDER", "ALL_FAILED", "HTTP", "TIMEOUT", "NETWORK", "BAD_RESPONSE", "ABORTED"] as const;
    for (const code of codes) {
      for (const lang of ["vi", "en"] as const) {
        const text = aiErrorText(lang, { code, message: "technical", status: 500, vars: { s: 30, detail: "boom" } });
        expect(text, `${lang}/${code}`).not.toBe("technical"); // có khoá dịch
        expect(text, `${lang}/${code}`).not.toMatch(/[{}]/); // không còn placeholder thừa
      }
    }
    expect(aiErrorText("en", { code: "TIMEOUT", message: "x", vars: { s: 30 } })).toBe("Timed out after 30s.");
    expect(aiErrorText("vi", { code: "TIMEOUT", message: "x", vars: { s: 30 } })).toBe("Quá thời gian chờ (30s).");
    expect(aiErrorText("en", { code: "HTTP", message: "x", status: 429, vars: { detail: ": slow" } })).toBe("HTTP 429: slow");
    expect(aiErrorText("en", { code: "KHONG_CO", message: "tech fallback" })).toBe("tech fallback");
  });

  it("JSON mode: gửi response_format cho nguồn hỗ trợ, tự thử lại không có khi nguồn từ chối", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const router = new LlmRouter({
      candidates: async () => [provider("a")],
      fetchImpl: fakeFetch({
        "https://a.test": (_u, init) => {
          const b = JSON.parse(String(init?.body)) as Record<string, unknown>;
          bodies.push(b);
          return b.response_format ? json({ error: { message: "response_format not supported" } }, 400) : completion('{"ok":true}');
        },
      }),
    });
    const r = await router.chat([{ role: "user", content: "json" }], { json: true });
    expect(r.text).toBe('{"ok":true}');
    expect(bodies).toHaveLength(2);
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[1].response_format).toBeUndefined();
  });

  it("bỏ thẻ <think>, nhận content dạng mảng, ước lượng token khi thiếu usage", async () => {
    const router = new LlmRouter({
      candidates: async () => [provider("a")],
      fetchImpl: fakeFetch({
        "https://a.test": () => json({ choices: [{ message: { content: [{ type: "text", text: "<think>nghĩ</think>Xin " }, { type: "text", text: "chào" }] } }] }),
      }),
    });
    const r = await router.chat([{ role: "user", content: "x".repeat(40) }]);
    expect(r.text).toBe("Xin chào");
    expect(r.usage.inputTokens).toBe(10);
    expect(r.usage.outputTokens).toBeGreaterThan(0);
  });

  it("nội dung rỗng được coi là lỗi và thử nguồn khác; thông điệp lỗi không lộ khoá", async () => {
    const router = new LlmRouter({
      candidates: async () => [provider("a", { apiKey: "sk-supersecretvalue1234567890" })],
      secrets: () => ["sk-supersecretvalue1234567890"],
      fetchImpl: fakeFetch({ "https://a.test": () => json({ error: "invalid key sk-supersecretvalue1234567890" }, 400) }),
    });
    const err = (await router.chat([{ role: "user", content: "x" }]).catch((e) => e)) as AiError;
    expect(err.code).toBe("ALL_FAILED");
    expect(err.message).not.toContain("supersecretvalue");
  });
});

describe("model tự chọn (B7)", () => {
  it("pickModel ưu tiên mặc định, rồi gợi ý, bỏ embedding/whisper", () => {
    const groq = providerDef("groq")!;
    expect(pickModel(groq, ["whisper-large-v3", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"])).toBe("llama-3.3-70b-versatile");
    expect(pickModel(groq, ["whisper-large-v3", "llama-3.1-8b-instant"])).toBe("llama-3.1-8b-instant");
    expect(pickModel(groq, ["whisper-large-v3"])).toBe("llama-3.3-70b-versatile"); // không còn model dùng được → mặc định
    expect(pickModel(providerDef("ollama")!, ["nomic-embed-text", "gemma2:9b"])).toBe("gemma2:9b");
  });

  it("model mặc định không tồn tại (404) → dò /models, chọn model khác và thử lại một lần", async () => {
    const used: string[] = [];
    const hub = new AiHub({
      dataDir: dir,
      env: { GROQ_API_KEY: "gsk_abcdefghijklmnop123456" },
      fetchImpl: fakeFetch({
        "https://api.groq.com/openai/v1/models": () => json({ data: [{ id: "llama-3.1-8b-instant" }] }),
        "https://api.groq.com/openai/v1/chat/completions": (_u, init) => {
          const m = JSON.parse(String(init?.body)).model as string;
          used.push(m);
          return m === "llama-3.3-70b-versatile" ? json({ error: { message: "The model `llama-3.3-70b-versatile` does not exist" } }, 404) : completion("ổn");
        },
      }),
    });
    const r = await hub.chat([{ role: "user", content: "hi" }]);
    expect(r.text).toBe("ổn");
    expect(used).toEqual(["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
  });
});

describe("quản lý nhà cung cấp", () => {
  it("tắt/bật nhà cung cấp, ghi đè model, và kiểm thử từng nguồn", async () => {
    const hub = new AiHub({
      dataDir: dir,
      env: { GROQ_API_KEY: "gsk_abcdefghijklmnop123456" },
      fetchImpl: fakeFetch({
        "https://api.groq.com/openai/v1/chat/completions": (_u, init) => completion(`OK ${JSON.parse(String(init?.body)).model}`),
      }),
    });
    hub.setModel("groq", "my-groq-model");
    const t = await hub.test("groq");
    expect(t.ok).toBe(true);
    expect(t.message).toContain("my-groq-model");
    hub.setEnabled("groq", false);
    expect((await hub.status()).find((s) => s.id === "groq")!.state).toBe("disabled");
    await expect(hub.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ code: "NO_PROVIDER" });
    hub.setEnabled("groq", true);
    expect((await hub.test("khong-co")).ok).toBe(false);
    // cấu hình được lưu và nạp lại
    const hub2 = new AiHub({ dataDir: dir, env: {}, fetchImpl: fakeFetch({}) });
    expect((await hub2.status()).find((s) => s.id === "groq")!.activeModel).toBe("my-groq-model");
  });

  it("khởi động OmniRoute: đã chạy → báo đã chạy; chạy được → báo đã khởi động; không cài → lỗi có khoá, không treo (B5)", async () => {
    type Spawn = NonNullable<ConstructorParameters<typeof AiHub>[0]["spawnImpl"]>;
    const spawned: string[] = [];
    const fakeSpawn = ((cmd: string) => {
      spawned.push(cmd);
      return { on: () => undefined, unref: () => undefined };
    }) as unknown as Spawn;

    // 1) đã chạy sẵn: không spawn gì
    const running = new AiHub({ dataDir: dir, env: {}, spawnImpl: fakeSpawn, omniPollMs: 20, fetchImpl: fakeFetch({ [`${OMNI}/models`]: () => json({ data: [{ id: "auto" }] }) }) });
    expect(await running.startOmniRoute(50)).toMatchObject({ ok: true, key: "ai.omni.running" });
    expect(spawned).toEqual([]);

    // 2) chưa chạy → spawn → vài giây sau dịch vụ lên
    let up = false;
    const starting = new AiHub({
      dataDir: dir,
      env: {},
      omniPollMs: 20,
      spawnImpl: ((cmd: string) => {
        spawned.push(cmd);
        up = true;
        return { on: () => undefined, unref: () => undefined };
      }) as unknown as Spawn,
      fetchImpl: fakeFetch({ [`${OMNI}/models`]: () => (up ? json({ data: [{ id: "auto" }] }) : json({ error: "x" }, 503)) }),
    });
    expect(await starting.startOmniRoute(4000)).toMatchObject({ ok: true, key: "ai.omni.started" });
    expect(spawned).toEqual(["omniroute"]);

    // 3) không cài: hết thời gian chờ → lỗi có khoá + gợi ý cài, bản dịch tiếng Anh đúng
    const absent = new AiHub({ dataDir: dir, env: {}, spawnImpl: fakeSpawn, omniPollMs: 20, fetchImpl: fakeFetch({}) });
    const r = await absent.startOmniRoute(10);
    expect(r).toMatchObject({ ok: false, key: "ai.omni.failed" });
    expect(msg("en", r.key!)).toMatch(/npm i -g omniroute/);

    // 4) cần khoá → báo cần khoá (không phải "không cài")
    const needsKey = new AiHub({ dataDir: dir, env: {}, spawnImpl: fakeSpawn, omniPollMs: 20, fetchImpl: fakeFetch({ [`${OMNI}/models`]: () => json({ error: "unauthorized" }, 401) }) });
    expect(await needsKey.startOmniRoute(4000)).toMatchObject({ ok: false, key: "ai.omni.needsKey" });
  });

  it("trạng thái và kết quả thao tác mang khoá i18n, nhãn nhà cung cấp không chứa tiếng Việt (E1)", async () => {
    const hub = new AiHub({
      dataDir: dir,
      env: { GROQ_API_KEY: "gsk_abcdefghijklmnop123456" },
      fetchImpl: fakeFetch({
        [`${OMNI}/models`]: () => json({ error: "unauthorized" }, 401),
        "https://api.groq.com/openai/v1/chat/completions": () => json({ error: { message: "invalid api key" } }, 401),
      }),
    });
    const st = await hub.status(true);
    const by = Object.fromEntries(st.map((s) => [s.id, s]));
    expect(by.omniroute).toMatchObject({ state: "no-key", detailKey: "ai.detail.needsKey" });
    expect(by.ollama).toMatchObject({ state: "offline", detailKey: "ai.detail.notRunning" });
    expect(by.openrouter).toMatchObject({ state: "no-key", detailKey: "ai.detail.noKey" });
    expect(by.openrouter.detail).toBe(msg("vi", "ai.detail.noKey")); // bản tiếng Việt dự phòng
    for (const s of st) {
      expect(s.label, s.id).not.toMatch(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i);
      expect(Object.keys(s)).not.toContain("note");
    }

    // Khoá bị từ chối khi gọi → kết quả kiểm thử có khoá + mã HTTP, trạng thái chuyển auth-failed dựa vào mã (không đoán từ chữ).
    const t = await hub.test("groq");
    expect(t).toMatchObject({ ok: false, key: "ai.err.HTTP" });
    expect(t.vars).toMatchObject({ status: 401 });
    expect(t.message).toMatch(/^HTTP 401/);
    const after = (await hub.status()).find((s) => s.id === "groq")!;
    expect(after.state).toBe("auth-failed");
    expect(after.detailKey).toBe("ai.err.HTTP");
    expect(after.stats.lastErrorStatus).toBe(401);

    const unknown = await hub.test("khong-co");
    expect(unknown).toMatchObject({ ok: false, key: "err.api.unknownProvider", vars: { id: "khong-co" } });
  });
});

describe("kho bí mật và che khoá (B4, D4)", () => {
  it("lưu file, nạp lại, xoá; trả về bản che và không bao giờ ghi giá trị ra nơi khác", () => {
    const file = path.join(dir, "secrets.json");
    const s = new SecretStore(file);
    s.set("ai.groq.key", "gsk_abcdefghijklmnop123456");
    s.set("smtp.pass", "  hunter2hunter2  ");
    expect(s.get("smtp.pass")).toBe("hunter2hunter2");
    expect(s.mask("ai.groq.key")).toBe("gsk_…3456");
    expect(new SecretStore(file).get("ai.groq.key")).toBe("gsk_abcdefghijklmnop123456");
    s.set("smtp.pass", "   "); // chuỗi rỗng = xoá
    expect(s.has("smtp.pass")).toBe(false);
    s.delete("ai.groq.key");
    expect(fs.readFileSync(file, "utf8")).not.toContain("gsk_");
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("file hỏng không làm sập; redact che cả giá trị đã biết và mẫu khoá phổ biến", () => {
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, "{không phải json");
    expect(new SecretStore(bad).names()).toEqual([]);
    const text = "lỗi: Bearer abcdefghijklmnop12345 và gsk_abcdefghijklmnop123456, mật khẩu my-own-password, api_key=ZZZZZZZZZZZZ";
    const out = redact(text, ["my-own-password"]);
    expect(out).not.toMatch(/abcdefghijklmnop|my-own-password|ZZZZZZZZ/);
    expect(maskKey("short")).toBe("••••");
  });
});
