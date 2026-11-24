/**
 * Bảng KPI Lớp kinh tế ở Phòng Tài chính (economy.board): hàm vẽ thuần, chỉ vẽ lại khi khoá nội dung đổi, hiện đủ số liệu và danh sách cơ hội chờ duyệt,
 * và các trạng thái (tắt / đang chạy / Scout tạm dừng / dừng khẩn cấp / sổ cái bị sửa) có màu và chữ riêng. Không cần WebGL: dùng ngữ cảnh 2D giả ghi lại lệnh vẽ.
 */
import { describe, expect, it } from "vitest";
import { economyBoardKey, economyStatus, paintEconomyBoard } from "../src/client/assets/economyBoard.js";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";
import { usdToMicro, type EconomyState } from "../src/shared/economy.js";

const t = (key: string, vars?: Record<string, string | number>): string => {
  let s = (DICTIONARIES.en as Record<string, string>)[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.split(`{${k}}`).join(String(v));
  return s;
};

class FakeScreen {
  texts: string[] = [];
  paints = 0;
  private last = "";
  draw(key: string, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.last) return;
    this.last = key;
    this.paints++;
    this.texts = [];
    const texts = this.texts;
    const ctx = new Proxy({}, { get: (_t, p) => (p === "fillText" ? (s: string) => texts.push(s) : () => undefined), set: () => true });
    paint(ctx as unknown as CanvasRenderingContext2D, 1024, 565);
  }
}

const base = (over: Partial<EconomyState> = {}): EconomyState => ({
  enabled: true, rail: "x402", mode: "test", paused: false, emergency: false, payTo: "0x1234…5678",
  receivedMicro: usdToMicro(12.5), costMicro: usdToMicro(3.25), netMicro: usdToMicro(9.25), negativeStreak: 1, negativeLimit: 3,
  lastCycle: { at: "2026-03-01T06:00:00Z", revenue: usdToMicro(2), cost: usdToMicro(0.5), net: usdToMicro(1.5) },
  scoutsActive: true, products: [{ topic: "ai-trends", title: "AI trends", priceMicro: 500_000 }],
  pending: [
    { id: "o1", title: "Sell a GPU price report", rationale: "r", estRevenue: usdToMicro(20), estCost: usdToMicro(2), risk: "low", by: "An", status: "pending", createdAt: "x" },
    { id: "o2", title: "Fix a GitHub bounty", rationale: "r", estRevenue: usdToMicro(40), estCost: usdToMicro(10), risk: "medium", by: "Bao", status: "pending", createdAt: "x" },
  ],
  approvedCount: 2, recent: [], ledgerOk: true, ledgerCount: 42, at: "2026-03-01T06:00:00Z", ...over,
});

describe("bảng KPI kinh tế (economy.board)", () => {
  it("hiện đủ: trạng thái, chế độ, đã thu / chi phí / lãi lỗ, chu kỳ gần nhất, số báo cáo, cơ hội chờ duyệt và sổ cái", () => {
    const s = new FakeScreen();
    paintEconomyBoard(s, t, base());
    const all = s.texts.join(" | ");
    expect(all).toContain("ECONOMY");
    expect(all).toContain("Running");
    expect(all).toContain("Test");
    expect(all).toContain("$12.50");
    expect(all).toContain("$3.25");
    expect(all).toContain("$9.25");
    expect(all).toMatch(/Last cycle: \$1\.5/);
    expect(all).toContain("Losing cycles in a row: 1/3");
    expect(all).toContain("Reports for sale: 1");
    expect(all).toContain("Awaiting approval (2)");
    expect(all).toContain("Sell a GPU price report");
    expect(all).toContain("Fix a GitHub bounty");
    expect(all).toContain("Ledger intact (42 rows)");
    expect(all).toContain("x402 → 0x1234…5678");
  });

  it("chỉ vẽ lại khi nội dung đổi (không nhấp nháy), nhưng đổi số liệu/ngôn ngữ thì vẽ lại ngay", () => {
    const s = new FakeScreen();
    paintEconomyBoard(s, t, base());
    paintEconomyBoard(s, t, base({ at: "2030-01-01T00:00:00Z" })); // chỉ đổi giờ → cùng khoá
    expect(s.paints).toBe(1);
    paintEconomyBoard(s, t, base({ receivedMicro: usdToMicro(13) }));
    expect(s.paints).toBe(2);
    paintEconomyBoard(s, t, base({ pending: [] }));
    expect(s.paints).toBe(3);
    expect(s.texts.join("|")).toContain("No proposals waiting.");
    const vi = (key: string, vars?: Record<string, string | number>) => (DICTIONARIES.vi as Record<string, string>)[key] ?? t(key, vars);
    paintEconomyBoard(s, vi, base({ pending: [] }));
    expect(s.paints).toBe(4); // đổi ngôn ngữ → khoá khác
    expect(s.texts.join("|")).toContain("KINH TẾ");
  });

  it("các trạng thái có chữ và màu riêng: tắt, đang chạy, Scout tạm dừng, dừng khẩn cấp; chế độ thật nổi bật", () => {
    expect(economyStatus(null)).toEqual({ key: "eco.board.off", tone: "off" });
    expect(economyStatus(base({ enabled: false }))).toMatchObject({ tone: "off" });
    expect(economyStatus(base())).toEqual({ key: "eco.status.active", tone: "ok" });
    expect(economyStatus(base({ paused: true, pausedReason: "negative" }))).toEqual({ key: "eco.status.paused", tone: "warn" });
    expect(economyStatus(base({ paused: true, emergency: true }))).toEqual({ key: "eco.status.emergency", tone: "bad" });
    const s = new FakeScreen();
    paintEconomyBoard(s, t, base({ mode: "live" }));
    expect(s.texts.join("|")).toContain("REAL MONEY");
    paintEconomyBoard(s, t, base({ ledgerOk: false }));
    expect(s.texts.join("|")).toContain("LEDGER WAS TAMPERED WITH");
    paintEconomyBoard(s, t, base({ enabled: false }));
    expect(s.texts.join("|")).toContain("Not enabled");
    paintEconomyBoard(s, t, null);
    expect(s.texts.join("|")).toContain("OFF");
  });

  it("khoá vẽ lại không phụ thuộc đồng hồ và mỗi cơ hội chờ duyệt làm đổi khoá", () => {
    const a = economyBoardKey(t, base());
    expect(economyBoardKey(t, base())).toBe(a);
    expect(economyBoardKey(t, base({ pending: base().pending.slice(0, 1) }))).not.toBe(a);
    expect(economyBoardKey(t, null)).toContain("none");
  });

  it("tên cơ hội rất dài được cắt gọn để không tràn bảng", () => {
    const long = "x".repeat(200);
    const s = new FakeScreen();
    paintEconomyBoard(s, t, base({ pending: [{ ...base().pending[0], title: long }] }));
    const line = s.texts.find((x) => x.startsWith("•"))!;
    expect(line.length).toBeLessThanOrEqual(66);
    expect(line.endsWith("…")).toBe(true);
  });
});
