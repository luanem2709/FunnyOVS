/**
 * Test cho xác thực token (LAN), cấu hình mạng và chốt chặn Host riêng tư.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { AuthManager, isLoopbackAddress, parseCookies, TOKEN_COOKIE } from "../src/server/security/auth.js";
import { isPrivateLanHost, readNetwork, writeNetwork, lanAddresses } from "../src/server/security/network.js";
import { isAllowedHost, verifyWsClient } from "../src/server/security/httpGuard.js";

let dir: string;
let server: http.Server;
let base: string;
let clock: number;
let auth: AuthManager;

function start(env: NodeJS.ProcessEnv = {}): Promise<void> {
  clock = 1_000_000;
  auth = new AuthManager({
    dataDir: dir,
    env,
    now: () => clock,
    // Test: yêu cầu có header x-remote được coi là từ máy khác.
    isLoopback: (req) => !req.headers["x-remote"],
  });
  const app = express();
  app.use(auth.middleware());
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  app.get("/", (_req, res) => res.type("html").send("<h1>home</h1>"));
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-auth-"));
});
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const remote = (extra: Record<string, string> = {}): RequestInit => ({ headers: { "x-remote": "1", ...extra }, redirect: "manual" });

describe("token cho truy cập từ ngoài máy (D1)", () => {
  it("từ chính máy: không cần token; từ máy khác: 401 có mã authRequired", async () => {
    await start();
    expect((await fetch(`${base}/api/ping`)).status).toBe(200);
    const r = await fetch(`${base}/api/ping`, remote());
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: "authRequired" });
  });

  it("chấp nhận Bearer và X-FunnyOVS-Token; từ chối token sai/khác độ dài", async () => {
    await start();
    const t = auth.currentToken();
    expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${t}` }))).status).toBe(200);
    expect((await fetch(`${base}/api/ping`, remote({ "x-funnyovs-token": t }))).status).toBe(200);
    expect((await fetch(`${base}/api/ping`, remote({ authorization: "Bearer sai" }))).status).toBe(401);
    expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${t}x` }))).status).toBe(401);
    expect(auth.verify(undefined)).toBe(false);
    expect(auth.verify("")).toBe(false);
  });

  it("OFFICE_REQUIRE_TOKEN=1 buộc cả yêu cầu từ chính máy phải có token", async () => {
    await start({ OFFICE_REQUIRE_TOKEN: "1" });
    expect((await fetch(`${base}/api/ping`)).status).toBe(401);
    expect((await fetch(`${base}/api/ping`, { headers: { authorization: `Bearer ${auth.currentToken()}` } })).status).toBe(200);
  });

  it("nhận diện loopback đúng (IPv4, IPv6, IPv4-mapped)", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.5.5.5"]) expect(isLoopbackAddress(a), a).toBe(true);
    for (const a of ["192.168.1.9", "10.0.0.2", "::ffff:10.0.0.2", "8.8.8.8", undefined, ""]) expect(isLoopbackAddress(a), String(a)).toBe(false);
  });
});

describe("cookie, chuyển hướng và chống dò mã (D2)", () => {
  it("?token= trên điều hướng HTML → cookie HttpOnly + SameSite=Strict và chuyển hướng không còn token", async () => {
    await start();
    const t = auth.currentToken();
    const r = await fetch(`${base}/?token=${encodeURIComponent(t)}&x=1`, remote({ accept: "text/html" }));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/?x=1");
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${TOKEN_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    // dùng cookie cho yêu cầu sau
    const ok = await fetch(`${base}/api/ping`, remote({ cookie: `${TOKEN_COOKIE}=${encodeURIComponent(t)}` }));
    expect(ok.status).toBe(200);
  });

  it("HTML không token → trang nhập mã; không lộ token", async () => {
    await start();
    const r = await fetch(`${base}/`, remote({ accept: "text/html" }));
    expect(r.status).toBe(401);
    const html = await r.text();
    expect(html).toContain('name="token"');
    expect(html).not.toContain(auth.currentToken());
  });

  it("thử sai 10 lần → 429 kể cả khi sau đó dùng token đúng; hết 1 phút thì dùng lại được", async () => {
    await start();
    for (let i = 0; i < 10; i++) expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer sai-${i}` }))).status).toBe(401);
    const blocked = await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${auth.currentToken()}` }));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "authBlocked" });
    clock += 61_000;
    expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${auth.currentToken()}` }))).status).toBe(200);
  });

  it("token lưu file quyền 0600, nạp lại giống cũ; xoay token làm token cũ mất hiệu lực", async () => {
    await start();
    const t1 = auth.currentToken();
    const file = path.join(dir, "auth-token");
    expect(fs.readFileSync(file, "utf8").trim()).toBe(t1);
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(t1.length).toBeGreaterThanOrEqual(32);
    expect(new AuthManager({ dataDir: dir }).currentToken()).toBe(t1);
    const t2 = auth.rotate();
    expect(t2).not.toBe(t1);
    expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${t1}` }))).status).toBe(401);
    expect((await fetch(`${base}/api/ping`, remote({ authorization: `Bearer ${t2}` }))).status).toBe(200);
  });

  it("parseCookies xử lý nhiều cookie và giá trị mã hoá", () => {
    expect(parseCookies("a=1; funnyovs_token=abc%3D%3D; b=x=y")).toEqual({ a: "1", funnyovs_token: "abc==", b: "x=y" });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("WebSocket (D3)", () => {
  const fakeReq = (remoteAddr: string, headers: Record<string, string> = {}, url = "/ws"): IncomingMessage =>
    ({ headers, url, socket: { remoteAddress: remoteAddr } }) as unknown as IncomingMessage;

  it("máy khác cần token (cookie hoặc ?token=); loopback thì không", async () => {
    await start();
    const real = new AuthManager({ dataDir: dir, now: () => clock });
    const t = real.currentToken();
    expect(real.verifyWs(fakeReq("127.0.0.1"))).toBe(true);
    expect(real.verifyWs(fakeReq("192.168.1.20"))).toBe(false);
    expect(real.verifyWs(fakeReq("192.168.1.20", { cookie: `${TOKEN_COOKIE}=${t}` }))).toBe(true);
    expect(real.verifyWs(fakeReq("192.168.1.20", {}, `/ws?token=${t}`))).toBe(true);
    expect(real.verifyWs(fakeReq("192.168.1.20", {}, "/ws?token=sai"))).toBe(false);
  });

  it("bị khoá sau nhiều lần sai", async () => {
    await start();
    const real = new AuthManager({ dataDir: dir, now: () => clock });
    for (let i = 0; i < 10; i++) real.verifyWs(fakeReq("192.168.1.30", {}, `/ws?token=sai${i}`));
    expect(real.verifyWs(fakeReq("192.168.1.30", {}, `/ws?token=${real.currentToken()}`))).toBe(false);
  });
});

describe("cấu hình LAN (D7)", () => {
  it("mặc định tắt; ghi/đọc; file hỏng → tắt", () => {
    expect(readNetwork(dir)).toEqual({ lan: false });
    writeNetwork(dir, { lan: true });
    expect(readNetwork(dir)).toEqual({ lan: true });
    fs.writeFileSync(path.join(dir, "network.json"), "{hỏng");
    expect(readNetwork(dir)).toEqual({ lan: false });
  });

  it("chỉ coi IP riêng RFC1918 và tên .local/.lan là host LAN", () => {
    for (const h of ["192.168.1.5", "192.168.1.5:8787", "10.1.2.3", "172.16.0.1", "172.31.255.255", "my-pc.local:8787", "office.lan"]) {
      expect(isPrivateLanHost(h), h).toBe(true);
    }
    for (const h of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "evil.com", "192.168.1.5.evil.com", "300.1.1.1", "", undefined, "x.local.evil.com"]) {
      expect(isPrivateLanHost(h as string | undefined), String(h)).toBe(false);
    }
  });

  it("chốt chặn Host chỉ mở cho IP riêng khi bật LAN; vẫn chặn tên miền lạ", () => {
    expect(isAllowedHost("192.168.1.5:8787")).toBe(false);
    expect(isAllowedHost("192.168.1.5:8787", [], true)).toBe(true);
    expect(isAllowedHost("evil.com", [], true)).toBe(false);
    const req = (host: string) => ({ headers: { host } }) as unknown as IncomingMessage;
    expect(verifyWsClient({ origin: "http://192.168.1.5:8787", req: req("192.168.1.5:8787") }, [], true)).toBe(true);
    expect(verifyWsClient({ origin: "http://evil.com", req: req("192.168.1.5:8787") }, [], true)).toBe(false);
    expect(verifyWsClient({ origin: "http://192.168.1.5:8787", req: req("192.168.1.5:8787") }, [], false)).toBe(false);
  });

  it("lanAddresses chỉ trả IPv4 riêng", () => {
    for (const a of lanAddresses()) expect(isPrivateLanHost(a)).toBe(true);
  });
});
