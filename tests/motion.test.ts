/**
 * Giảm chuyển động (a11y): quyết định theo cài đặt + ưu tiên hệ điều hành, và cài đặt `motion` được đọc/ghi an toàn.
 */
import { afterEach, describe, expect, it } from "vitest";
import { isReducedMotion, systemPrefersReducedMotion } from "../src/client/office-3d/lib/motion.js";
import { defaultSettings, parseSettings } from "../src/client/office-3d/store/settings.js";

const g = globalThis as unknown as { window?: unknown };
const original = g.window;
afterEach(() => {
  if (original === undefined) delete g.window;
  else g.window = original;
});

describe("giảm chuyển động", () => {
  it("bảng quyết định: 'system' theo hệ điều hành; 'reduced'/'full' là ép tay và thắng hệ điều hành", () => {
    expect(isReducedMotion("system", true)).toBe(true);
    expect(isReducedMotion("system", false)).toBe(false);
    expect(isReducedMotion("reduced", false)).toBe(true);
    expect(isReducedMotion("full", true)).toBe(false);
    expect(isReducedMotion("full", false)).toBe(false);
  });

  it("đọc ưu tiên hệ điều hành an toàn: không có window/matchMedia → coi như không yêu cầu giảm", () => {
    delete g.window;
    expect(systemPrefersReducedMotion()).toBe(false);
    g.window = {};
    expect(systemPrefersReducedMotion()).toBe(false);
    g.window = { matchMedia: (q: string) => ({ matches: q.includes("reduce") }) };
    expect(systemPrefersReducedMotion()).toBe(true);
    g.window = { matchMedia: () => ({ matches: false }) };
    expect(systemPrefersReducedMotion()).toBe(false);
  });

  it("cài đặt: mặc định 'system'; đọc lại giá trị hợp lệ; giá trị lạ hay kiểu sai rơi về mặc định", () => {
    expect(defaultSettings("en").motion).toBe("system");
    const raw = (motion: unknown) => JSON.stringify({ lang: "en", companyName: "X", onboarded: true, motion });
    expect(parseSettings(raw("reduced"), "en").motion).toBe("reduced");
    expect(parseSettings(raw("full"), "en").motion).toBe("full");
    expect(parseSettings(raw("bay-nhay"), "en").motion).toBe("system");
    expect(parseSettings(raw(42), "en").motion).toBe("system");
    expect(parseSettings(JSON.stringify({ lang: "vi" }), "en").motion).toBe("system"); // bản lưu cũ chưa có trường này
    expect(parseSettings("không phải JSON", "vi").motion).toBe("system");
  });
});
