/**
 * Test cho các chốt chặn bền vững/an toàn: kiểm tra Host/Origin, lưu & nạp lại cây giao việc.
 */
import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { isAllowedHost, isAllowedOrigin, parseAllowedHosts, verifyWsClient, OFFICE3D_CSP } from "../src/server/security/httpGuard.js";
import { OrgDispatcher } from "../src/server/org/dispatcher.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import type { OrgNode } from "../src/shared/officeEntity.js";
import { ConfigStore } from "../src/server/config.js";
import os from "node:os";
import path from "node:path";

describe("kiểm tra Host (chống DNS rebinding)", () => {
  it("chấp nhận loopback, từ chối tên miền lạ và host rỗng", () => {
    for (const h of ["localhost", "localhost:8787", "127.0.0.1:52602", "[::1]:5173", "LOCALHOST:5173"]) expect(isAllowedHost(h), h).toBe(true);
    for (const h of ["evil.example.com", "evil.example.com:8787", "127.0.0.1.evil.com", "localhost.evil.com:80", "10.0.0.5:8787", "", undefined]) {
      expect(isAllowedHost(h as string | undefined), String(h)).toBe(false);
    }
  });

  it("OFFICE_ALLOW_HOSTS cho phép thêm host (có/không cổng)", () => {
    const extra = parseAllowedHosts(" office.lan , 192.168.1.5:8787 ,, ");
    expect(extra).toEqual(["office.lan", "192.168.1.5:8787"]);
    expect(isAllowedHost("office.lan:8787", extra)).toBe(true);
    expect(isAllowedHost("192.168.1.5:8787", extra)).toBe(true);
    expect(isAllowedHost("192.168.1.6:8787", extra)).toBe(false);
  });
});

describe("kiểm tra Origin của WebSocket", () => {
  const req = (host: string | undefined) => ({ headers: { host } }) as unknown as IncomingMessage;

  it("cùng nguồn hoặc không có Origin thì được; trang lạ thì bị chặn", () => {
    expect(isAllowedOrigin(undefined, "localhost:8787")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", "localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:52602", "127.0.0.1:52602")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", "localhost:8787")).toBe(false);
    expect(isAllowedOrigin("null", "localhost:8787")).toBe(false);
    expect(isAllowedOrigin("không phải url", "localhost:8787")).toBe(false);
  });

  it("verifyWsClient kết hợp Host và Origin", () => {
    expect(verifyWsClient({ origin: "http://localhost:5173", req: req("localhost:5173") })).toBe(true);
    expect(verifyWsClient({ origin: "https://evil.example.com", req: req("127.0.0.1:8787") })).toBe(false);
    expect(verifyWsClient({ origin: "http://evil.example.com", req: req("evil.example.com") })).toBe(false); // Host lạ dù Origin trùng
    expect(verifyWsClient({ origin: undefined as unknown as string, req: req("localhost:8787") })).toBe(true);
  });

  it("CSP của giao diện React không cho script nội tuyến/ngoài", () => {
    expect(OFFICE3D_CSP).toContain("script-src 'self'");
    expect(OFFICE3D_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(OFFICE3D_CSP).toContain("frame-ancestors 'none'");
  });
});

describe("lưu và nạp lại cây giao việc", () => {
  const node = (patch: Partial<OrgNode>): OrgNode => ({
    id: "org_7",
    level: 1,
    kind: "delegation",
    assigneeId: "giamdoc",
    assigneeName: "Hùng",
    department: "executive",
    title: "Việc cũ",
    status: "done",
    childIds: [],
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
    ...patch,
  });

  function dispatcher() {
    return new OrgDispatcher({
      registry: new AgentRegistry(),
      submit: async () => {
        throw new Error("không nộp trong test này");
      },
      openTasksOf: () => 0,
      emit: () => undefined,
    });
  }

  it("nút đang chạy được đánh dấu lỗi do gián đoạn; nút hợp lệ giữ nguyên; rác bị bỏ", () => {
    const d = dispatcher();
    const n = d.restore([
      node({ id: "org_7", childIds: ["org_8", "org_999"] }),
      node({ id: "org_8", parentId: "org_7", level: 3, kind: "work", status: "running", assigneeId: "ha", assigneeName: "Hà" }),
      { id: "hỏng", status: "bogus" },
      null,
      "x",
    ]);
    expect(n).toBe(2);
    expect(d.get("org_8")!.status).toBe("failed");
    expect(d.get("org_8")!.error?.key).toBe("err.org.interrupted");
    expect(d.get("org_7")!.status).toBe("done");
    expect(d.get("org_7")!.childIds).toEqual(["org_8"]); // bỏ tham chiếu tới con không còn
  });

  it("id mới không trùng id đã nạp", async () => {
    const d = dispatcher();
    d.restore([node({ id: "org_41" })]);
    const root = await d.assign({ prompt: "việc mới", toAgentId: "giamdoc" });
    expect(Number(root.id.replace("org_", ""))).toBeGreaterThan(41);
  });

  it("dữ liệu không phải mảng → không nạp gì, không ném lỗi", () => {
    const d = dispatcher();
    expect(d.restore({ a: 1 })).toBe(0);
    expect(d.restore(undefined)).toBe(0);
    expect(d.list()).toHaveLength(0);
  });
});

describe("mặc định riêng tư", () => {
  it("đọc hạn mức Cursor tắt mặc định (phải được người dùng bật)", () => {
    const store = new ConfigStore(path.join(os.tmpdir(), `funnyovs-no-such-${Date.now()}.json`), os.tmpdir(), os.tmpdir());
    expect(store.get().cursorQuotaEnabled).toBe(false);
  });
});
