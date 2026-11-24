/**
 * Lớp kinh tế tự trị (EAL): sổ cái băm nối, cổng thanh toán (x402/Stripe/mock), dịch vụ (xuất bản, paywall, đề xuất, chu kỳ), cổng công khai riêng,
 * REST, và các ràng buộc an toàn (duyệt, nhật ký, dừng khẩn cấp, riêng tư). Không gọi mạng thật: `fetch` được tiêm.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ActionGate } from "../src/server/agent/gate.js";
import { AuditLog } from "../src/server/security/audit.js";
import { EconomyLedger, GENESIS, hashOf, verifyRecords, type LedgerRecord } from "../src/server/economy/ledger.js";
import { RailConfigError, createMockRail, createStripeRail, createX402Rail, railFromEnv } from "../src/server/economy/payment.js";
import { EconomyService, configFromEnv, type EconomyConfig } from "../src/server/economy/service.js";
import { privacyProblem, readTopic } from "../src/server/economy/products.js";
import { createPublicApp } from "../src/server/economy/publicServer.js";
import { registerEconomyRoutes } from "../src/server/routes/economy.js";
import { ValidationError } from "../src/shared/validation.js";
import { isOfficeEvent } from "../src/shared/officeEntity.js";
import { formatUsd, usdToMicro } from "../src/shared/economy.js";
import { msg } from "../src/shared/messages.js";

const dirs: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-eco-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const PAY_TO = "0x1234567890abcdef1234567890abcdef12345678";
const resp = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---------------------------------------------------------------------------
describe("sổ cái băm nối (economy.ledger)", () => {
  it("ghi, đọc lại sau khi khởi động lại, chuỗi băm đúng; tổng theo loại và khoảng thời gian", () => {
    const file = path.join(mk(), "l.jsonl");
    let t = Date.parse("2026-02-01T00:00:00Z");
    const l = new EconomyLedger(file, () => [], () => (t += 1000));
    const a = l.append({ kind: "settled", amount: 500_000, topic: "x", ref: "p:1" });
    const b = l.append({ kind: "cost", amount: 100_000 });
    l.append({ kind: "settled", amount: 250_000, ref: "p:2" });
    expect(a.prev).toBe(GENESIS);
    expect(b.prev).toBe(a.hash);
    expect(l.verify()).toEqual({ ok: true, count: 3 });
    expect(l.sum("settled")).toBe(750_000);
    expect(l.sum("settled", Date.parse("2026-02-01T00:00:03Z"))).toBe(250_000);
    expect(l.hasSettledRef("p:1")).toBe(true);
    expect(l.hasSettledRef("p:9")).toBe(false);
    const again = new EconomyLedger(file, () => [], () => (t += 1000));
    expect(again.all()).toHaveLength(3);
    expect(again.verify().ok).toBe(true);
    expect(again.append({ kind: "cost", amount: 1 }).seq).toBe(4); // tiếp nối đúng chuỗi
    expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(4);
  });

  it("sửa số tiền, xoá dòng giữa, chèn dòng hoặc đổi thứ tự đều bị phát hiện", () => {
    const file = path.join(mk(), "l.jsonl");
    const l = new EconomyLedger(file);
    for (let i = 0; i < 4; i++) l.append({ kind: "settled", amount: 100_000 * (i + 1), ref: `p:${i}` });
    const rows = l.all().map((r) => ({ ...r })) as LedgerRecord[];
    expect(verifyRecords(rows).ok).toBe(true);
    const edited = rows.map((r) => ({ ...r }));
    edited[1].amount = 9_000_000;
    expect(verifyRecords(edited)).toMatchObject({ ok: false, brokenAt: 2 });
    expect(verifyRecords([rows[0], rows[2], rows[3]]).ok).toBe(false); // xoá
    expect(verifyRecords([rows[1], rows[0], rows[2], rows[3]]).ok).toBe(false); // đổi chỗ
    const forged = { ...rows[1], amount: 1, seq: 2 } as LedgerRecord;
    forged.hash = hashOf({ ...forged }); // sửa luôn băm của chính nó
    expect(verifyRecords([rows[0], forged, rows[2], rows[3]]).ok).toBe(false); // nhưng dòng sau không nối được
    // sửa trực tiếp trên đĩa
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"amount":200000', '"amount":999999'));
    expect(new EconomyLedger(file).verify().ok).toBe(false);
  });

  it("không bao giờ ghi bí mật; chuỗi dài bị cắt; dòng rác trong tệp làm verify báo hỏng", () => {
    const file = path.join(mk(), "l.jsonl");
    const l = new EconomyLedger(file, () => ["supersecretvalue"]);
    const r = l.append({ kind: "failed", note: `key supersecretvalue and sk-abcdefghijklmnopqrstuvwxyz ${"x".repeat(500)}` });
    expect(r.note).not.toContain("supersecretvalue");
    expect(r.note).not.toContain("sk-abcdef");
    expect(r.note!.length).toBeLessThanOrEqual(160);
    fs.appendFileSync(file, "not json\n");
    expect(new EconomyLedger(file).verify().ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("cổng thanh toán (economy.payment)", () => {
  const spec = { topic: "ai-trends", resource: "https://x.test/api/public/insights/ai-trends", description: "AI trends", priceMicro: 500_000 };
  const payment = (value: string, to = PAY_TO, network = "base-sepolia") => Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network, payload: { signature: "0xsig", authorization: { from: "0xpayer", to, value, nonce: "0x01" } } })).toString("base64");

  it("x402: yêu cầu 402 đúng định dạng (USDC testnet, đơn vị nhỏ nhất = micro-USD, chỉ có ĐỊA CHỈ nhận)", async () => {
    const rail = createX402Rail({ payTo: PAY_TO, fetchImpl: async () => resp({}) });
    expect(rail.mode).toBe("test");
    const c = (await rail.challenge(spec)) as { x402Version: number; accepts: Array<Record<string, unknown>> };
    expect(c.x402Version).toBe(1);
    expect(c.accepts[0]).toMatchObject({ scheme: "exact", network: "base-sepolia", maxAmountRequired: "500000", payTo: PAY_TO, resource: spec.resource, asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" });
  });

  it("x402: từ chối cấu hình nguy hiểm — khoá riêng làm địa chỉ nhận, mạng chính khi chưa cho phép, facilitator http, mạng lạ", () => {
    expect(() => createX402Rail({ payTo: "0x" + "ab".repeat(32) })).toThrow(RailConfigError); // 64 hex = khoá riêng
    expect(() => createX402Rail({ payTo: PAY_TO, network: "base" })).toThrow(/ECONOMY_ALLOW_LIVE/);
    expect(createX402Rail({ payTo: PAY_TO, network: "base", allowLive: true }).mode).toBe("live");
    expect(() => createX402Rail({ payTo: PAY_TO, facilitatorUrl: "http://evil.test" })).toThrow(/https/);
    expect(() => createX402Rail({ payTo: PAY_TO, network: "ethereum" })).toThrow(/unsupported/);
    expect(railFromEnv({ ECONOMY_RAIL: "x402" } as NodeJS.ProcessEnv).error).toMatch(/address/);
    expect(railFromEnv({ ECONOMY_RAIL: "wat" } as NodeJS.ProcessEnv).error).toMatch(/must be/);
    expect(railFromEnv({} as NodeJS.ProcessEnv)).toEqual({}); // không đặt = tắt
  });

  it("x402: kiểm tại chỗ (sai mạng, sai người nhận, thiếu tiền, rác) rồi mới hỏi facilitator; verify + settle gửi đúng nội dung", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const rail = createX402Rail({
      payTo: PAY_TO,
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push({ url: String(url), body });
        return String(url).endsWith("/verify") ? resp({ isValid: true, payer: "0xpayer" }) : resp({ success: true, transaction: "0xabc123", network: "base-sepolia", payer: "0xpayer" });
      },
    });
    expect((await rail.verify(spec, payment("500000", PAY_TO, "base"))).error).toMatch(/network/);
    expect((await rail.verify(spec, payment("500000", "0x" + "9".repeat(40)))).error).toMatch(/someone else/);
    expect((await rail.verify(spec, payment("499999"))).error).toMatch(/below/);
    expect((await rail.verify(spec, "%%%")).ok).toBe(false);
    expect(calls).toHaveLength(0); // chưa chạm facilitator
    const good = payment("500000");
    expect(await rail.verify(spec, good)).toEqual({ ok: true, payer: "0xpayer" });
    const s = await rail.settle(spec, good);
    expect(s).toMatchObject({ ok: true, txRef: "0xabc123" });
    expect(s.proofRef).toBe(rail.proofRef(good));
    expect(JSON.parse(Buffer.from(s.responseHeaders!["X-PAYMENT-RESPONSE"], "base64").toString())).toMatchObject({ success: true, transaction: "0xabc123" });
    expect(calls.map((c) => c.url)).toEqual(["https://x402.org/facilitator/verify", "https://x402.org/facilitator/settle"]);
    expect(calls[0].body).toMatchObject({ x402Version: 1, paymentHeader: good });
  });

  it("x402: facilitator báo lỗi/đứt mạng → không thu, không ném", async () => {
    const bad = createX402Rail({ payTo: PAY_TO, fetchImpl: async () => resp({ isValid: false, invalidReason: "insufficient_funds" }) });
    expect(await bad.verify(spec, payment("500000"))).toEqual({ ok: false, error: "insufficient_funds" });
    const down = createX402Rail({ payTo: PAY_TO, fetchImpl: async () => { throw new Error("ECONNRESET"); } });
    expect((await down.verify(spec, payment("500000"))).ok).toBe(false);
    expect((await down.settle(spec, payment("500000"))).ok).toBe(false);
    const nosettle = createX402Rail({ payTo: PAY_TO, fetchImpl: async () => resp({ success: false, errorReason: "nonce_used" }) });
    expect(await nosettle.settle(spec, payment("500000"))).toMatchObject({ ok: false, error: "nonce_used" });
  });

  it("Stripe: từ chối khoá live khi chưa cho phép và khoá sai dạng; giá tối thiểu 0,50 USD", async () => {
    expect(() => createStripeRail({ secretKey: "sk_live_abcdefghijkl" })).toThrow(/ECONOMY_ALLOW_LIVE/);
    expect(() => createStripeRail({ secretKey: "pk_test_abcdefghijkl" })).toThrow(RailConfigError);
    const rail = createStripeRail({ secretKey: "sk_test_abcdefghijkl", fetchImpl: async () => resp({}) });
    expect(rail.mode).toBe("test");
    await expect(rail.challenge({ ...spec, priceMicro: 100_000 })).rejects.toThrow(/\$0\.50/);
    await expect(rail.challenge({ ...spec, priceMicro: 500_001 })).rejects.toThrow(/whole cents/);
  });

  it("Stripe: tạo phiên Checkout đúng tham số; chỉ chấp nhận phiên ĐÃ TRẢ, đúng số tiền, đúng sản phẩm, đúng chế độ", async () => {
    let created: URLSearchParams | undefined;
    let session: Record<string, unknown> = {};
    const rail = createStripeRail({
      secretKey: "sk_test_abcdefghijkl",
      baseUrl: "https://shop.test/",
      fetchImpl: async (url, init) => {
        if (init?.method === "POST") {
          created = new URLSearchParams(String(init.body));
          expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk_test_abcdefghijkl");
          return resp({ id: "cs_test_abc12345", url: "https://checkout.stripe.com/c/pay/cs_test_abc12345" });
        }
        expect(String(url)).toContain("/v1/checkout/sessions/cs_test_abc12345");
        return resp(session);
      },
    });
    const c = (await rail.challenge(spec)) as { checkoutUrl: string; sessionId: string; priceUsd: number };
    expect(c).toMatchObject({ sessionId: "cs_test_abc12345", priceUsd: 0.5 });
    expect(created!.get("mode")).toBe("payment");
    expect(created!.get("line_items[0][price_data][unit_amount]")).toBe("50");
    expect(created!.get("metadata[topic]")).toBe("ai-trends");
    expect(created!.get("success_url")).toBe("https://shop.test/?paid=1");
    const paid = { livemode: false, payment_status: "paid", amount_total: 50, currency: "usd", metadata: { topic: "ai-trends" } };
    session = { ...paid, payment_status: "unpaid" };
    expect((await rail.verify(spec, "cs_test_abc12345")).error).toMatch(/not paid/);
    session = { ...paid, amount_total: 10 };
    expect((await rail.verify(spec, "cs_test_abc12345")).error).toMatch(/amount/);
    session = { ...paid, metadata: { topic: "other" } };
    expect((await rail.verify(spec, "cs_test_abc12345")).error).toMatch(/another product/);
    session = { ...paid, livemode: true };
    expect((await rail.verify(spec, "cs_test_abc12345")).error).toMatch(/mode/);
    expect((await rail.verify(spec, "../../etc/passwd")).error).toMatch(/bad session/);
    session = paid;
    expect((await rail.verify(spec, "cs_test_abc12345")).ok).toBe(true);
    expect(await rail.settle(spec, "cs_test_abc12345")).toMatchObject({ ok: true, proofRef: "stripe:cs_test_abc12345" });
  });

  it("mock: chỉ nhận bằng chứng đúng dạng và đủ tiền", async () => {
    const rail = createMockRail();
    expect((await rail.verify(spec, "mock:500000:n1")).ok).toBe(true);
    expect((await rail.verify(spec, "mock:100:n1")).ok).toBe(false);
    expect((await rail.verify(spec, "garbage")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("sản phẩm và quét riêng tư (economy.products)", () => {
  it("chỉ đọc public/insights: tên chủ đề chặt, không thoát thư mục, giới hạn kích thước, lấy tiêu đề từ H1", () => {
    const ws = mk();
    const dir = path.join(ws, "public", "insights");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ok-topic.md"), "# My Report\n\nPublic stats only.");
    fs.writeFileSync(path.join(dir, "big.md"), "x".repeat(25_000));
    fs.writeFileSync(path.join(ws, "secret.md"), "# secret");
    expect(readTopic(ws, "ok-topic")).toMatchObject({ title: "My Report" });
    expect(readTopic(ws, "big")).toBeNull();
    expect(readTopic(ws, "../secret")).toBeNull();
    expect(readTopic(ws, "OK")).toBeNull();
    expect(readTopic(ws, "missing")).toBeNull();
  });

  it("chặn email, số điện thoại, IP, khoá/bí mật và tên liên hệ CRM; nội dung sạch qua", () => {
    expect(privacyProblem("write to bob@example.com")).toMatch(/email/);
    expect(privacyProblem("call +84 912 345 678")).toMatch(/phone/);
    expect(privacyProblem("server 10.0.0.12 is up")).toMatch(/ip/);
    expect(privacyProblem("key sk-abcdefghijklmnopqrstuvwxyz")).toMatch(/secret/);
    expect(privacyProblem("deal with Acme Holdings closed", ["Acme Holdings"])).toMatch(/crm/);
    expect(privacyProblem("AI chip demand grew 40% in 2025.", ["Acme Holdings"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
type Mode = "approve" | "deny" | "ignore";
interface Env {
  svc: EconomyService;
  gate: ActionGate;
  audit: AuditLog;
  dir: string;
  ws: string;
  mode: { v: Mode };
  emergency: { v: boolean };
  scouts: { calls: boolean[]; on: boolean };
  clock: { t: number };
  tokens: { v: number };
  terms: string[];
  events: string[];
  write(topic: string, body: string): void;
  paid(topic: string, amount?: number): Record<string, string>;
}

const CFG: EconomyConfig = { maxPriceMicro: usdToMicro(5), negativeLimit: 3, loopHours: 6, tokenPriceMicroPerMTok: usdToMicro(1), computeMicroPerDay: usdToMicro(0.24), reinvestShare: 0.5, maxPending: 3, reinvestMinMicro: 10_000, reinvestCooldownHours: 0 };

function setup(over: { rail?: ReturnType<typeof createMockRail> | null; config?: Partial<EconomyConfig> } = {}): Env {
  const dir = mk();
  const ws = path.join(dir, "ws");
  fs.mkdirSync(path.join(ws, "public", "insights"), { recursive: true });
  const gate = new ActionGate(60_000);
  const mode: { v: Mode } = { v: "approve" };
  gate.on("request", (r: { id: string }) => {
    if (mode.v !== "ignore") gate.decide(r.id, mode.v === "approve");
  });
  const audit = new AuditLog(path.join(dir, "audit.log"));
  const emergency = { v: false };
  const scouts = { calls: [] as boolean[], on: true };
  const clock = { t: Date.parse("2026-03-01T00:00:00Z") };
  const tokens = { v: 0 };
  const terms: string[] = [];
  const events: string[] = [];
  const svc = new EconomyService({
    dataDir: dir,
    workspace: () => ws,
    rail: over.rail === null ? undefined : (over.rail ?? createMockRail()),
    gate,
    audit,
    emergency: () => emergency.v,
    desk: () => ({ id: "thu", name: "Thu" }),
    contactTerms: () => terms,
    tokensSince: () => tokens.v,
    scouts: { setActive: (on) => (scouts.calls.push(on), (scouts.on = on)), active: () => scouts.on },
    config: { ...CFG, ...over.config },
    now: () => clock.t,
    onEvent: (e) => events.push(e.kind),
  });
  return {
    svc, gate, audit, dir, ws, mode, emergency, scouts, clock, tokens, terms, events,
    write: (topic, body) => fs.writeFileSync(path.join(ws, "public", "insights", `${topic}.md`), body),
    paid: (_t, amount = 500_000) => ({ "x-mock-payment": `mock:${amount}:n${Math.random().toString(36).slice(2, 10)}` }),
  };
}

const publish = async (e: Env, topic = "ai-trends", price = 0.5) => {
  e.write(topic, `# ${topic} report\n\nOnly public aggregate numbers here.`);
  return e.svc.publish(topic, price).done;
};

describe("xuất bản sản phẩm (economy.publish)", () => {
  let e: Env;
  beforeEach(() => (e = setup()));

  it("phải được người dùng duyệt qua hộp duyệt; duyệt xong mới vào gian hàng, ghi sổ cái + nhật ký", async () => {
    e.mode.v = "ignore";
    e.write("ai-trends", "# AI trends\n\nPublic data.");
    const r = e.svc.publish("ai-trends", 0.5);
    expect(e.gate.list()).toHaveLength(1);
    expect(e.gate.list()[0]).toMatchObject({ action: "economy_publish", agentId: "thu" });
    expect(e.svc.catalog()).toEqual([]); // chưa duyệt → chưa bán
    e.gate.decide(e.gate.list()[0].id, true);
    expect(await r.done).toBe("approved");
    expect(e.svc.catalog()).toEqual([{ topic: "ai-trends", title: "AI trends", priceUsd: 0.5 }]);
    expect(e.svc.ledger.all().map((x) => x.kind)).toEqual(["published"]);
    expect(e.audit.tail(5).some((a) => a.kind === "economy.publish" && a.detail.outcome === "approved")).toBe(true);
  });

  it("từ chối / hết hạn → không bán; trạng thái ghi vào nhật ký", async () => {
    e.mode.v = "deny";
    expect(await publish(e)).toBe("denied");
    expect(e.svc.catalog()).toEqual([]);
    expect(e.audit.tail(3)[0]).toMatchObject({ kind: "economy.publish", detail: { outcome: "denied" } });
  });

  it("kiểm tra đầu vào: chủ đề, giá trần, giá Stripe, thiếu tệp, riêng tư (email, tên liên hệ CRM), tắt, dừng khẩn cấp", () => {
    e.write("ok-one", "# Ok\n\nclean");
    const code = (fn: () => unknown): string => {
      try {
        fn();
      } catch (x) {
        return (x as ValidationError).key;
      }
      return "none";
    };
    expect(code(() => e.svc.publish("Bad Topic!", 1))).toBe("val.economy.topicInvalid");
    expect(code(() => e.svc.publish("ok-one", 0))).toBe("val.economy.priceInvalid");
    expect(code(() => e.svc.publish("ok-one", 5.01))).toBe("val.economy.priceInvalid");
    expect(code(() => e.svc.publish("missing-one", 1))).toBe("val.economy.topicMissing");
    e.write("leaky", "# Leak\n\nask bob@example.com");
    expect(code(() => e.svc.publish("leaky", 1))).toBe("val.economy.privacy");
    e.terms.push("Globex Corp");
    e.write("crm-leak", "# Leak\n\nGlobex Corp bought a licence");
    expect(code(() => e.svc.publish("crm-leak", 1))).toBe("val.economy.privacy");
    e.emergency.v = true;
    expect(code(() => e.svc.publish("ok-one", 1))).toBe("val.economy.emergency");
    expect(code(() => setup({ rail: null }).svc.publish("ok-one", 1))).toBe("val.economy.disabled");
    expect(e.gate.list()).toHaveLength(0); // không có yêu cầu duyệt nào được tạo cho đầu vào sai
    expect(msg("vi", "val.economy.priceInvalid", { max: "$5" })).toContain("$5");
    expect(msg("en", "val.economy.privacy", { why: "$t:val.economy.why.email" })).toBe("This report cannot be sold because it contains an email address"); // lý do được dịch theo ngôn ngữ
  });

  it("tệp bị sửa SAU khi người dùng bấm duyệt (trước khi lưu) → không xuất bản (chống đánh tráo)", async () => {
    e.mode.v = "ignore";
    e.write("swap", "# Swap\n\nclean at request time");
    const r = e.svc.publish("swap", 1);
    e.write("swap", "# Swap\n\nnow contains bob@example.com");
    e.gate.decide(e.gate.list()[0].id, true);
    expect(await r.done).toBe("changed");
    expect(e.svc.catalog()).toEqual([]);
  });

  it("gỡ khỏi gian hàng được ghi nhật ký", async () => {
    await publish(e);
    expect(e.svc.unpublish("ai-trends")).toBe(true);
    expect(e.svc.unpublish("ai-trends")).toBe(false);
    expect(e.audit.tail(2)[0].kind).toBe("economy.unpublish");
  });
});

describe("paywall công khai (economy.paywall)", () => {
  let e: Env;
  beforeEach(async () => {
    e = setup();
    await publish(e);
  });

  it("chưa trả tiền → 402 + yêu cầu thanh toán và sự kiện quote; chủ đề lạ / chưa xuất bản → 404", async () => {
    const r = await e.svc.handlePublic("ai-trends", {}, "https://x.test/r");
    expect(r.status).toBe(402);
    expect(r.body).toMatchObject({ error: "payment_required", priceMicro: 500_000 });
    expect(e.events).toContain("quote");
    expect((await e.svc.handlePublic("nope", {}, "x")).status).toBe(404);
    expect((await e.svc.handlePublic("../etc/passwd", {}, "x")).status).toBe(404);
    e.write("unpublished", "# U\n\nbody here");
    expect((await e.svc.handlePublic("unpublished", {}, "x")).status).toBe(404);
  });

  it("trả đủ tiền → 200 + nội dung; ghi sổ cái settled + nhật ký sale; số liệu trạng thái khớp", async () => {
    const r = await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ topic: "ai-trends", paidUsd: 0.5 });
    expect((r.body as { content: string }).content).toContain("public aggregate numbers");
    const s = e.svc.state();
    expect(s.receivedMicro).toBe(500_000);
    expect(s.netMicro).toBe(500_000);
    expect(e.svc.ledger.all().filter((x) => x.kind === "settled")).toHaveLength(1);
    expect(e.audit.tail(3).some((a) => a.kind === "economy.sale" && a.detail.amountMicro === 500_000)).toBe(true);
    expect(s.ledgerOk).toBe(true);
    expect(e.events).toContain("settled");
  });

  it("phát lại cùng một bằng chứng không dùng được hai lần (kể cả sau khi khởi động lại dịch vụ)", async () => {
    const h = e.paid("ai-trends");
    expect((await e.svc.handlePublic("ai-trends", h, "x")).status).toBe(200);
    expect(await e.svc.handlePublic("ai-trends", h, "x")).toMatchObject({ status: 402, body: { error: "payment_already_used" } });
    const e2Svc = new EconomyService({ ...(e.svc as unknown as { d: ConstructorParameters<typeof EconomyService>[0] }).d });
    expect(await e2Svc.handlePublic("ai-trends", h, "x")).toMatchObject({ status: 402, body: { error: "payment_already_used" } });
    expect(e.svc.state().receivedMicro).toBe(500_000); // chỉ thu một lần
  });

  it("thanh toán thiếu tiền / sai dạng → 402, ghi failed (chống ghi dồn dập: tối đa 1 dòng / 5 giây), không trả nội dung", async () => {
    const r = await e.svc.handlePublic("ai-trends", e.paid("ai-trends", 1), "x");
    expect(r.status).toBe(402);
    expect(JSON.stringify(r.body)).not.toContain("public aggregate");
    for (let i = 0; i < 5; i++) await e.svc.handlePublic("ai-trends", { "x-mock-payment": `bad${i}` }, "x");
    expect(e.svc.ledger.all().filter((x) => x.kind === "failed")).toHaveLength(1);
    e.clock.t += 6000;
    await e.svc.handlePublic("ai-trends", { "x-mock-payment": "bad" }, "x");
    expect(e.svc.ledger.all().filter((x) => x.kind === "failed")).toHaveLength(2);
    expect(e.svc.state().receivedMicro).toBe(0);
  });

  it("nội dung bị sửa sau khi duyệt → 409 và KHÔNG thu tiền", async () => {
    e.write("ai-trends", "# AI trends\n\nsomething else entirely");
    const r = await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x");
    expect(r.status).toBe(409);
    expect(e.svc.state().receivedMicro).toBe(0);
  });

  it("DỪNG KHẨN CẤP → 503, không thu tiền, không gọi bên thanh toán", async () => {
    e.emergency.v = true;
    const r = await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x");
    expect(r.status).toBe(503);
    expect(e.svc.state()).toMatchObject({ emergency: true, receivedMicro: 0 });
    e.emergency.v = false;
    expect((await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x")).status).toBe(200); // hết dừng → bán lại bình thường
  });

  it("rail báo lỗi khi thanh toán → 402 và không đánh dấu đã dùng (người mua thử lại được)", async () => {
    const rail = createMockRail();
    let fail = true;
    const orig = rail.settle.bind(rail);
    rail.settle = async (s, p) => (fail ? { ok: false, proofRef: rail.proofRef(p), error: "boom" } : orig(s, p));
    const e2 = setup({ rail });
    await publish(e2);
    const h = e2.paid("ai-trends");
    expect((await e2.svc.handlePublic("ai-trends", h, "x")).status).toBe(402);
    fail = false;
    expect((await e2.svc.handlePublic("ai-trends", h, "x")).status).toBe(200);
  });
});

describe("đề xuất của Scout (economy.propose)", () => {
  let e: Env;
  beforeEach(() => (e = setup()));
  const good = { title: "Sell a GPU price report", rationale: "Public price data is easy to aggregate weekly.", estRevenueUsd: 20, estCostUsd: 2, risk: "low", source: "https://example.com/a?token=zzz#frag" };

  it("luôn đi qua hộp duyệt; ghi nhận quyết định vào sổ cái và nhật ký; KHÔNG tự thực thi gì", async () => {
    e.mode.v = "ignore";
    const p = e.svc.propose(good, { id: "an", name: "An" });
    expect(e.gate.list()[0]).toMatchObject({ action: "economy_opportunity", agentId: "an" });
    expect(e.gate.list()[0].detail).toContain("https://example.com/a"); // nguồn chỉ giữ origin + path
    expect(e.gate.list()[0].detail).not.toContain("token=zzz");
    expect(e.svc.state().pending).toHaveLength(1);
    e.gate.decide(e.gate.list()[0].id, true);
    expect(await p).toBe("approved");
    const s = e.svc.state();
    expect(s.pending).toHaveLength(0);
    expect(s.approvedCount).toBe(1);
    expect(e.svc.ledger.all().filter((x) => x.kind === "opportunity").map((x) => x.note)).toEqual(["proposed", "approved"]);
    expect(e.audit.tail(3)[0]).toMatchObject({ kind: "economy.opportunity", detail: { outcome: "approved", agent: "an" } });
    expect(e.svc.state().receivedMicro).toBe(0); // không có dòng tiền nào phát sinh
  });

  it("bị từ chối thì ghi 'denied'; kiểm tra từng trường; giới hạn số đề xuất đang chờ", async () => {
    e.mode.v = "deny";
    expect(await e.svc.propose(good, { id: "an", name: "An" })).toBe("denied");
    const bad = async (patch: Record<string, unknown>): Promise<string> => {
      try {
        await e.svc.propose({ ...good, ...patch }, { id: "an", name: "An" });
      } catch (x) {
        return `${(x as ValidationError).key}:${(x as ValidationError).vars?.field}`;
      }
      return "none";
    };
    expect(await bad({ title: "x" })).toBe("val.economy.fieldInvalid:title");
    expect(await bad({ rationale: "short" })).toBe("val.economy.fieldInvalid:rationale");
    expect(await bad({ estRevenueUsd: -1 })).toBe("val.economy.fieldInvalid:estRevenueUsd");
    expect(await bad({ estCostUsd: "abc" })).toBe("val.economy.fieldInvalid:estCostUsd");
    expect(await bad({ risk: "yolo" })).toBe("val.economy.fieldInvalid:risk");
    e.mode.v = "ignore";
    for (let i = 0; i < 3; i++) void e.svc.propose({ ...good, title: `Idea number ${i}` }, { id: "an", name: "An" });
    expect(await bad({ title: "One idea too many" })).toBe("val.economy.tooManyPending:undefined");
  });

  it("hết hạn (không ai duyệt) = 'expired', không phải chấp thuận", async () => {
    const gate = new ActionGate(5);
    const e2 = setup();
    const svc = new EconomyService({ ...(e2.svc as unknown as { d: ConstructorParameters<typeof EconomyService>[0] }).d, gate });
    expect(await svc.propose(good, { id: "an", name: "An" })).toBe("expired");
    expect(svc.state().approvedCount).toBe(0);
  });

  it("dừng khẩn cấp, đang tạm dừng, hoặc EAL tắt → từ chối ngay, không tạo hộp duyệt", async () => {
    e.emergency.v = true;
    await expect(e.svc.propose(good, { id: "an", name: "An" })).rejects.toMatchObject({ key: "val.economy.emergency" });
    e.emergency.v = false;
    e.svc.pause("operator");
    await expect(e.svc.propose(good, { id: "an", name: "An" })).rejects.toMatchObject({ key: "val.economy.paused" });
    await expect(setup({ rail: null }).svc.propose(good, { id: "an", name: "An" })).rejects.toMatchObject({ key: "val.economy.disabled" });
    expect(e.gate.list()).toHaveLength(0);
  });

  it("Scout xếp hạng: lãi kỳ vọng nhân hệ số rủi ro (đề xuất chờ duyệt hiện đúng thứ tự)", async () => {
    e.mode.v = "ignore";
    void e.svc.propose({ ...good, title: "Small safe idea", estRevenueUsd: 10, estCostUsd: 0, risk: "low" }, { id: "an", name: "An" });
    void e.svc.propose({ ...good, title: "Big risky idea", estRevenueUsd: 30, estCostUsd: 0, risk: "high" }, { id: "an", name: "An" }); // 30×0,3 = 9 < 10
    void e.svc.propose({ ...good, title: "Medium good idea", estRevenueUsd: 25, estCostUsd: 0, risk: "medium" }, { id: "an", name: "An" }); // 15
    expect(e.svc.state().pending.map((o) => o.title)).toEqual(["Medium good idea", "Small safe idea", "Big risky idea"]);
  });
});

describe("vòng lặp kinh tế (economy.loop)", () => {
  let e: Env;
  const H = 3_600_000;
  beforeEach(async () => {
    e = setup();
    await publish(e);
  });
  const advance = (hours = 6): void => void (e.clock.t += hours * H);

  it("chu kỳ = doanh thu − (suy luận quy ước + hạ tầng + chi phí ghi tay); ghi sổ cái + nhật ký", () => {
    e.svc.runCycle(); // mốc đầu: cửa sổ 6 giờ trước
    e.tokens.v = 500_000; // 0,5 triệu token × $1 = $0,50
    e.svc.recordCost(0.1, "domain");
    advance();
    const c = e.svc.runCycle()!;
    expect(c.cost).toBe(usdToMicro(0.5) + usdToMicro(0.1) + usdToMicro(0.06)); // + hạ tầng 0,24/ngày × 6 giờ
    expect(c.revenue).toBe(0);
    expect(c.net).toBe(-c.cost);
    const row = e.svc.ledger.all().filter((x) => x.kind === "cycle").at(-1)!;
    expect(row.data).toMatchObject({ revenue: 0, cost: c.cost, inference: usdToMicro(0.5), compute: usdToMicro(0.06), manual: usdToMicro(0.1) });
    expect(e.audit.tail(5).some((a) => a.kind === "economy.cycle")).toBe(true);
    expect(e.svc.state().costMicro).toBe(c.cost + usdToMicro(0.06)); // chu kỳ đầu cũng tính hạ tầng
  });

  it("LỖ 3 chu kỳ liên tiếp → tự tạm dừng Scout, báo người vận hành; đề xuất mới bị từ chối; việc bán vẫn chạy", async () => {
    for (let i = 0; i < 3; i++) {
      expect(e.svc.state().paused).toBe(false);
      advance();
      e.svc.runCycle();
    }
    const s = e.svc.state();
    expect(s).toMatchObject({ paused: true, pausedReason: "negative", negativeStreak: 3, scoutsActive: false });
    expect(e.scouts.calls).toEqual([false]);
    expect(e.events).toContain("paused");
    expect(e.audit.tail(5).some((a) => a.kind === "economy.paused" && a.detail.reason === "negative")).toBe(true);
    await expect(e.svc.propose({ title: "Another idea", rationale: "long enough rationale", estRevenueUsd: 1, estCostUsd: 0, risk: "low" }, { id: "an", name: "An" })).rejects.toMatchObject({ key: "val.economy.paused" });
    expect((await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x")).status).toBe(200); // vẫn bán được để hồi phục
    expect(() => e.svc.setScouts(true)).toThrow(ValidationError); // không bật lại khi đang tạm dừng
  });

  it("một chu kỳ lãi giữa chừng đặt lại bộ đếm; tiếp tục thủ công đặt lại và bật lại Scout", async () => {
    advance();
    e.svc.runCycle();
    advance();
    e.svc.runCycle();
    expect(e.svc.state().negativeStreak).toBe(2);
    await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x"); // +$0,50 > chi phí 0,06
    advance();
    e.svc.runCycle();
    expect(e.svc.state().negativeStreak).toBe(0);
    for (let i = 0; i < 3; i++) (advance(), e.svc.runCycle());
    expect(e.svc.state().paused).toBe(true);
    e.svc.resume();
    expect(e.svc.state()).toMatchObject({ paused: false, negativeStreak: 0 });
    e.svc.setScouts(true);
    expect(e.scouts.calls.at(-1)).toBe(true);
    expect(e.audit.tail(5).map((a) => a.kind)).toEqual(expect.arrayContaining(["economy.resumed", "economy.scouts"]));
  });

  it("chu kỳ lãi → ĐỀ XUẤT tái đầu tư (một phần thặng dư) qua hộp duyệt; duyệt chỉ ghi quyết định, không tự chi tiền", async () => {
    await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x");
    advance();
    const c = e.svc.runCycle()!;
    expect(c.net).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 0));
    const row = e.svc.ledger.all().find((x) => x.kind === "reinvest")!;
    expect(row).toMatchObject({ note: "add_api_key", amount: Math.floor(c.net * 0.5) });
    expect(e.audit.tail(5).some((a) => a.kind === "economy.reinvest" && a.detail.outcome === "approved")).toBe(true);
    // lần sau xoay sang lựa chọn khác; bị từ chối thì không ghi reinvest
    e.mode.v = "deny";
    await e.svc.handlePublic("ai-trends", e.paid("ai-trends"), "x");
    advance();
    e.svc.runCycle();
    await new Promise((r) => setTimeout(r, 0));
    expect(e.svc.ledger.all().filter((x) => x.kind === "reinvest")).toHaveLength(1);
    expect(e.audit.tail(5).some((a) => a.kind === "economy.reinvest" && a.detail.outcome === "denied" && a.detail.option === "add_agent")).toBe(true);
  });

  it("không chạy chu kỳ khi dừng khẩn cấp hoặc EAL tắt; chi phí ghi tay phải hợp lệ", () => {
    e.emergency.v = true;
    advance();
    expect(e.svc.runCycle()).toBeNull();
    e.emergency.v = false;
    expect(setup({ rail: null }).svc.runCycle()).toBeNull();
    expect(() => e.svc.recordCost(-1, "x")).toThrow(ValidationError);
    expect(() => e.svc.recordCost(Number.NaN, "x")).toThrow(ValidationError);
  });

  it("trạng thái bền qua khởi động lại: tạm dừng, bộ đếm, chu kỳ gần nhất, sản phẩm và tổng tiền", () => {
    for (let i = 0; i < 3; i++) (advance(), e.svc.runCycle());
    const d = (e.svc as unknown as { d: ConstructorParameters<typeof EconomyService>[0] }).d;
    const again = new EconomyService({ ...d });
    expect(again.state()).toMatchObject({ paused: true, negativeStreak: 3, products: [{ topic: "ai-trends" }] });
    expect(again.state().lastCycle).toEqual(e.svc.state().lastCycle);
    expect(again.state().costMicro).toBe(e.svc.state().costMicro);
  });
});

describe("tiếp tục và tái đầu tư có ngưỡng (economy.loop.policy)", () => {
  const H = 3_600_000;

  it("tiếp tục bật lại Scout ĐÚNG như trước khi bị tạm dừng: đang bật thì bật lại, đang tắt thì để tắt", () => {
    const on = setup();
    on.svc.pause("operator");
    expect(on.scouts.calls).toEqual([false]);
    on.svc.resume();
    expect(on.scouts.calls).toEqual([false, true]);
    const off = setup();
    off.scouts.on = false;
    off.svc.pause("operator");
    off.svc.resume();
    expect(off.scouts.calls).toEqual([false]); // không tự bật thứ người dùng chưa từng bật
  });

  it("đề xuất tái đầu tư chỉ khi khoản ≥ ngưỡng tối thiểu và cách lần trước ≥ thời gian chờ (không làm phiền mỗi chu kỳ)", async () => {
    const e = setup({ config: { reinvestMinMicro: usdToMicro(0.1), reinvestCooldownHours: 24 } });
    e.mode.v = "ignore";
    await (async () => {
      e.write("t-one", "# T\n\nclean public text");
      e.mode.v = "approve";
      await e.svc.publish("t-one", 0.5).done;
      e.mode.v = "ignore";
    })();
    const sell = () => e.svc.handlePublic("t-one", e.paid("t-one"), "x");
    const cycle = async (hours: number) => {
      e.clock.t += hours * H;
      await sell();
      e.svc.runCycle();
      await new Promise((r) => setTimeout(r, 0));
    };
    await cycle(6);
    expect(e.gate.list().filter((r) => r.action === "economy_reinvest")).toHaveLength(1);
    await cycle(6); // lãi nhưng còn trong thời gian chờ
    expect(e.gate.list().filter((r) => r.action === "economy_reinvest")).toHaveLength(1);
    await cycle(24);
    expect(e.gate.list().filter((r) => r.action === "economy_reinvest")).toHaveLength(2);
    // khoản quá nhỏ (dưới ngưỡng) thì im lặng
    const small = setup({ config: { reinvestMinMicro: usdToMicro(5), reinvestCooldownHours: 0 } });
    small.mode.v = "approve";
    small.write("t-two", "# T\n\nclean public text");
    await small.svc.publish("t-two", 0.5).done;
    small.mode.v = "ignore";
    small.clock.t += 6 * H;
    await small.svc.handlePublic("t-two", small.paid("t-two"), "x");
    small.svc.runCycle();
    await new Promise((r) => setTimeout(r, 0));
    expect(small.gate.list()).toHaveLength(0);
  });
});

describe("cấu hình môi trường (economy.config)", () => {
  it("giá trị mặc định thận trọng; giá trị sai/ngoài khoảng bị kẹp", () => {
    const d = configFromEnv({} as NodeJS.ProcessEnv);
    expect(d).toMatchObject({ negativeLimit: 3, loopHours: 6, reinvestShare: 0.5 });
    expect(d.maxPriceMicro).toBe(usdToMicro(5));
    const c = configFromEnv({ ECONOMY_MAX_PRICE_USD: "9999", ECONOMY_NEGATIVE_CYCLES: "abc", ECONOMY_LOOP_HOURS: "0", ECONOMY_REINVEST_SHARE: "7" } as unknown as NodeJS.ProcessEnv);
    expect(c.maxPriceMicro).toBe(usdToMicro(100));
    expect(c.negativeLimit).toBe(3);
    expect(c.loopHours).toBeCloseTo(1 / 60);
    expect(c.reinvestShare).toBe(1);
  });

  it("định dạng tiền", () => {
    expect(formatUsd(500_000)).toBe("$0.50");
    expect(formatUsd(12_300)).toBe("$0.0123");
    expect(formatUsd(-1_250_000)).toBe("-$1.25");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(123_000_000)).toBe("$123");
  });
});

// ---------------------------------------------------------------------------
async function serve(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

describe("cổng công khai riêng (economy.public)", () => {
  it("chỉ có /health, danh mục và /insights/:topic; mọi đường dẫn/phương thức khác bị từ chối; không lộ API chính", async () => {
    const e = setup();
    await publish(e);
    const s = await serve(createPublicApp(e.svc));
    try {
      expect(await (await fetch(`${s.url}/health`)).json()).toEqual({ ok: true });
      expect(await (await fetch(`${s.url}/api/public/insights`)).json()).toEqual({ products: [{ topic: "ai-trends", title: "ai-trends report", priceUsd: 0.5 }] });
      const r402 = await fetch(`${s.url}/api/public/insights/ai-trends`);
      expect(r402.status).toBe(402);
      expect(r402.headers.get("cache-control")).toBe("no-store");
      const ok = await fetch(`${s.url}/api/public/insights/ai-trends`, { headers: e.paid("ai-trends") });
      expect(ok.status).toBe(200);
      expect((await ok.json()).content).toContain("public aggregate");
      for (const p of ["/api/state", "/api/economy/state", "/api/ai/status", "/api/emergency-stop", "/", "/api/public/other"]) expect((await fetch(`${s.url}${p}`)).status, p).toBe(404);
      expect((await fetch(`${s.url}/api/public/insights/ai-trends`, { method: "POST" })).status).toBe(405);
      expect((await fetch(`${s.url}/api/public/insights/ai-trends`, { method: "DELETE" })).status).toBe(405);
    } finally {
      await s.close();
    }
  });

  it("giới hạn tốc độ theo IP và toàn cục (429 + Retry-After); /health không bị tính", async () => {
    const e = setup();
    await publish(e);
    let t = 1_000_000;
    const s = await serve(createPublicApp(e.svc, { perIpPerMin: 3, globalPerMin: 100, now: () => t }));
    try {
      for (let i = 0; i < 3; i++) expect((await fetch(`${s.url}/api/public/insights/ai-trends`)).status).toBe(402);
      const limited = await fetch(`${s.url}/api/public/insights/ai-trends`);
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await fetch(`${s.url}/health`)).status).toBe(200);
      t += 61_000;
      expect((await fetch(`${s.url}/api/public/insights/ai-trends`)).status).toBe(402);
    } finally {
      await s.close();
    }
  });

  it("EAL tắt → 404; dừng khẩn cấp → 503 ở cả danh mục và sản phẩm", async () => {
    const off = await serve(createPublicApp(setup({ rail: null }).svc));
    try {
      expect((await fetch(`${off.url}/api/public/insights`)).status).toBe(404);
      expect((await fetch(`${off.url}/api/public/insights/x-y`)).status).toBe(404);
    } finally {
      await off.close();
    }
    const e = setup();
    await publish(e);
    e.emergency.v = true;
    const s = await serve(createPublicApp(e.svc));
    try {
      expect((await fetch(`${s.url}/api/public/insights`)).status).toBe(503);
      expect((await fetch(`${s.url}/api/public/insights/ai-trends`, { headers: e.paid("ai-trends") })).status).toBe(503);
      expect(e.svc.state().receivedMicro).toBe(0);
    } finally {
      await s.close();
    }
  });
});

describe("REST của EAL trên API chính (economy.rest)", () => {
  it("thao tác thay đổi chỉ từ chính máy (403 loopbackOnly); đọc trạng thái/sổ cái thì được; lỗi nhập trả mã dịch được", async () => {
    const e = setup();
    const local = { v: true };
    const app = express();
    app.use(express.json());
    registerEconomyRoutes(app, { economy: e.svc, isLoopback: () => local.v });
    const s = await serve(app);
    const post = (p: string, body?: unknown) => fetch(`${s.url}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    try {
      e.write("rest-topic", "# Rest\n\nclean public text");
      e.mode.v = "approve";
      const pub = await post("/api/economy/publish", { topic: "rest-topic", priceUsd: 1 });
      expect(pub.status).toBe(202);
      expect(await pub.json()).toMatchObject({ ok: true, awaiting: "approval" });
      await new Promise((r) => setTimeout(r, 5));
      const st = await (await fetch(`${s.url}/api/economy/state`)).json();
      expect(st.products).toEqual([{ topic: "rest-topic", title: "Rest", priceMicro: 1_000_000 }]);
      expect(JSON.stringify(st)).not.toContain(PAY_TO); // địa chỉ chỉ hiện rút gọn / không có khoá
      const led = await (await fetch(`${s.url}/api/economy/ledger`)).json();
      expect(led.verify.ok).toBe(true);
      const bad = await post("/api/economy/publish", { topic: "Bad Topic", priceUsd: 1 });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toMatchObject({ code: "val.economy.topicInvalid" });
      expect((await post("/api/economy/pause")).status).toBe(200);
      expect((await (await fetch(`${s.url}/api/economy/state`)).json()).paused).toBe(true);
      expect((await post("/api/economy/resume")).status).toBe(200);
      expect((await post("/api/economy/cost", { amountUsd: 0.25, note: "domain" })).status).toBe(200);
      expect(e.svc.ledger.all().some((r) => r.kind === "cost")).toBe(true);
      local.v = false; // yêu cầu từ máy khác (kể cả qua tunnel hiển thị như loopback sẽ vẫn không có cổng này — xem publicServer)
      for (const [p, b] of [["/api/economy/publish", { topic: "rest-topic", priceUsd: 1 }], ["/api/economy/pause", {}], ["/api/economy/resume", {}], ["/api/economy/cost", { amountUsd: 1 }], ["/api/economy/scouts", { enabled: true }], ["/api/economy/cycle", {}]] as const) {
        const r = await post(p, b);
        expect(r.status, p).toBe(403);
        expect((await r.json()).code).toBe("loopbackOnly");
      }
      expect((await fetch(`${s.url}/api/economy/products/rest-topic`, { method: "DELETE" })).status).toBe(403);
      expect((await fetch(`${s.url}/api/economy/state`)).status).toBe(200);
    } finally {
      await s.close();
    }
  });
});

describe("sự kiện kinh tế trong schema chung (economy.events)", () => {
  it("economy.state / economy.event hợp lệ qua isOfficeEvent; dữ liệu rác bị loại", () => {
    const e = setup();
    const state = e.svc.state();
    expect(isOfficeEvent({ type: "economy.state", state, at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isOfficeEvent({ type: "economy.event", event: { id: "ev_1", kind: "quote", at: "2026-01-01T00:00:00Z" } })).toBe(true);
    expect(isOfficeEvent({ type: "economy.state", state: null })).toBe(false);
    expect(isOfficeEvent({ type: "economy.state", state: { enabled: true } })).toBe(false);
    expect(isOfficeEvent({ type: "economy.event", event: { kind: "quote" } })).toBe(false);
  });

  it("trạng thái không chứa khoá/bí mật; địa chỉ nhận chỉ hiện rút gọn", () => {
    const rail = createX402Rail({ payTo: PAY_TO, fetchImpl: async () => resp({}) });
    const e = setup({ rail: rail as unknown as ReturnType<typeof createMockRail> });
    const s = e.svc.state();
    expect(s.payTo).toBe("0x1234…5678");
    expect(JSON.stringify(s)).not.toContain(PAY_TO);
    expect(s).toMatchObject({ enabled: true, rail: "x402", mode: "test" });
  });
});
