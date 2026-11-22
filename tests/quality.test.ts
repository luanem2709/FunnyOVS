/**
 * Tự hạ chất lượng đồ hoạ (I1, quality.auto): chỉ hạ khi chậm KÉO DÀI, không hạ oan vì khởi động/đứng hình thoáng qua, hạ đúng một lần.
 */
import { describe, expect, it } from "vitest";
import { AutoQualityMonitor, effectiveQuality } from "../src/client/office-3d/lib/autoQuality.js";
import { parseSettings, defaultSettings } from "../src/client/office-3d/store/settings.js";

/** Chạy monitor với dt cố định (ms) trong `seconds` giây mô phỏng; trả thời điểm (ms) hạ hoặc null. */
function run(m: AutoQualityMonitor, dtMs: number, seconds: number, startAt = 0): number | null {
  let now = startAt;
  while (now - startAt < seconds * 1000) {
    now += dtMs;
    if (m.tick(dtMs, now) === "downgrade") return now - startAt;
  }
  return null;
}

describe("AutoQualityMonitor", () => {
  it("máy khoẻ (60 FPS) không bao giờ bị hạ", () => {
    expect(run(new AutoQualityMonitor(), 16.7, 120)).toBeNull();
  });

  it("máy yếu kéo dài (15 FPS) bị hạ sau giai đoạn khởi động + 2 cửa sổ đo, và chỉ hạ MỘT lần", () => {
    const m = new AutoQualityMonitor();
    const at = run(m, 66, 60);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(4000); // sau khởi động
    expect(at!).toBeLessThan(4000 + 2 * 90 * 66 + 500); // đúng 2 cửa sổ chậm
    expect(run(m, 66, 30, 100_000)).toBeNull(); // đã hạ: không báo lần hai
  });

  it("chậm trong giai đoạn khởi động (nạp asset, biên dịch shader) KHÔNG tính", () => {
    const m = new AutoQualityMonitor();
    // 3,9 giây đầu rất chậm (200 ms/khung) rồi chạy mượt
    expect(run(m, 200, 3.9)).toBeNull();
    expect(run(m, 16.7, 60, 3900)).toBeNull();
  });

  it("đứng hình thoáng qua (một khung rất dài, tab bị ẩn) bị cắt trần nên không gây hạ oan", () => {
    const m = new AutoQualityMonitor({ warmupMs: 0, windowFrames: 90 });
    let now = 0;
    let verdict: string | null = null;
    for (let i = 0; i < 90 * 6; i++) {
      const dt = i % 90 === 10 ? 30_000 : 16.7; // mỗi cửa sổ có một khung 30 giây
      now += 16.7;
      verdict = m.tick(dt, now) ?? verdict;
    }
    expect(verdict).toBeNull();
  });

  it("chậm xen kẽ (không liên tiếp 2 cửa sổ) không bị hạ; có cửa sổ mượt xen vào thì đếm lại từ đầu", () => {
    const m = new AutoQualityMonitor({ warmupMs: 0, windowFrames: 10, slowMs: 40, strikes: 2 });
    let now = 0;
    const feed = (dt: number, frames: number): string | null => {
      let v: string | null = null;
      for (let i = 0; i < frames; i++) v = m.tick(dt, (now += dt)) ?? v;
      return v;
    };
    expect(feed(80, 10)).toBeNull(); // chậm
    expect(feed(16, 10)).toBeNull(); // mượt → reset
    expect(feed(80, 10)).toBeNull(); // chậm
    expect(feed(80, 10)).toBe("downgrade"); // chậm liên tiếp
    expect(m.lastMean).toBeGreaterThan(40);
  });

  it("tuỳ chọn ngưỡng được tôn trọng", () => {
    const strict = new AutoQualityMonitor({ warmupMs: 0, windowFrames: 5, slowMs: 20, strikes: 1 });
    expect(run(strict, 25, 10)).not.toBeNull();
  });
});

describe("chất lượng đồ hoạ trong cài đặt", () => {
  it("mặc định là Tự động; giá trị cũ high/low vẫn hợp lệ; giá trị lạ rơi về Tự động", () => {
    expect(defaultSettings("vi").quality).toBe("auto");
    expect(parseSettings(JSON.stringify({ quality: "high" }), "vi").quality).toBe("high");
    expect(parseSettings(JSON.stringify({ quality: "low" }), "vi").quality).toBe("low");
    expect(parseSettings(JSON.stringify({ quality: "ultra" }), "vi").quality).toBe("auto");
    expect(parseSettings(JSON.stringify({ quality: 3 }), "en").quality).toBe("auto");
  });

  it("mức dựng thực tế: Tự động bắt đầu Cao, sau khi bị hạ là Thấp; chọn tay thì giữ nguyên bất kể bị hạ", () => {
    expect(effectiveQuality("auto", false)).toBe("high");
    expect(effectiveQuality("auto", true)).toBe("low");
    expect(effectiveQuality("high", true)).toBe("high");
    expect(effectiveQuality("low", false)).toBe("low");
  });
});
