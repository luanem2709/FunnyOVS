/**
 * Test cho đa ngôn ngữ và cài đặt người dùng của giao diện hợp nhất.
 */
import { describe, it, expect } from "vitest";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";
import { detectLang, translate } from "../src/client/office-3d/i18n/index.js";
import { defaultSettings, parseSettings, DEFAULT_COMPANY } from "../src/client/office-3d/store/settings.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { ENTITY_STATUSES, ORG_STATUSES } from "../src/shared/officeEntity.js";
import { IDLE_ACTIONS } from "../src/client/assets/behavior.js";

describe("từ điển vi/en", () => {
  it("hai ngôn ngữ có đúng cùng bộ khoá, không giá trị rỗng", () => {
    const vi = Object.keys(DICTIONARIES.vi).sort();
    const en = Object.keys(DICTIONARIES.en).sort();
    expect(en).toEqual(vi);
    for (const lang of ["vi", "en"] as const) {
      for (const [k, v] of Object.entries(DICTIONARIES[lang])) expect(v.trim().length, `${lang}:${k}`).toBeGreaterThan(0);
    }
  });

  it("biến {x} trong vi và en khớp nhau ở mọi khoá", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(DICTIONARIES.vi)) {
      expect(vars((DICTIONARIES.en as Record<string, string>)[k]), k).toEqual(vars((DICTIONARIES.vi as Record<string, string>)[k]));
    }
  });

  it("đủ khoá cho mọi trạng thái, chức danh, phòng ban, vai trò và việc nhàn rỗi", () => {
    const keys = new Set(Object.keys(DICTIONARIES.vi));
    for (const s of ENTITY_STATUSES) expect(keys.has(`status.${s}`), s).toBe(true);
    for (const s of ORG_STATUSES) expect(keys.has(`org.status.${s}`), s).toBe(true);
    for (const t of [1, 2, 3]) expect(keys.has(`tier.${t}`)).toBe(true);
    for (const d of DEPARTMENTS) {
      expect(keys.has(`dept.${d.id}`), d.id).toBe(true);
      expect(keys.has(`dept.short.${d.id}`), d.id).toBe(true);
    }
    for (const a of new AgentRegistry().list()) expect(keys.has(`role.${a.id}`), a.id).toBe(true);
    for (const a of IDLE_ACTIONS) expect(keys.has(a.label), a.id).toBe(true);
    expect(keys.has("idle.walk")).toBe(true);
  });

  it("translate: thay biến, rơi về tiếng Việt rồi về chính khoá khi thiếu", () => {
    expect(translate("en", "conn.reconnecting", { sec: 3, n: 2 })).toContain("3s");
    expect(translate("vi", "header.working", { n: 5 })).toBe("5 đang làm");
    expect(translate("en", "khong.co.khoa")).toBe("khong.co.khoa");
    expect(translate("en", "header.working", { n: 0 })).toBe("0 working");
  });

  it("detectLang theo ngôn ngữ trình duyệt", () => {
    expect(detectLang({ language: "vi-VN" })).toBe("vi");
    expect(detectLang({ language: "en-US" })).toBe("en");
    expect(detectLang({ language: "fr" })).toBe("en");
    expect(detectLang(undefined)).toBe("en");
  });
});

describe("cài đặt người dùng", () => {
  it("không có dữ liệu → mặc định theo ngôn ngữ đã dò", () => {
    expect(parseSettings(null, "vi")).toEqual(defaultSettings("vi"));
    expect(parseSettings("", "en").lang).toBe("en");
  });

  it("JSON hỏng hoặc sai kiểu không làm sập; từng trường sai rơi về mặc định", () => {
    expect(parseSettings("{khong phai json", "en")).toEqual(defaultSettings("en"));
    const s = parseSettings(JSON.stringify({ lang: "xx", companyName: 123, onboarded: "yes", labels: "lạ", quality: 5, idleLife: false }), "en");
    expect(s.lang).toBe("en");
    expect(s.companyName).toBe(DEFAULT_COMPANY);
    expect(s.onboarded).toBe(false);
    expect(s.labels).toBe("auto");
    expect(s.quality).toBe("auto");
    expect(s.idleLife).toBe(false);
  });

  it("giữ giá trị hợp lệ, cắt tên công ty dài, bỏ khoảng trắng thừa", () => {
    const s = parseSettings(
      JSON.stringify({ lang: "vi", companyName: `  ${"A".repeat(80)}  `, onboarded: true, labels: "always", quality: "low", idleLife: true }),
      "en",
    );
    expect(s.lang).toBe("vi");
    expect(s.companyName).toHaveLength(40);
    expect(s.onboarded).toBe(true);
    expect(s.labels).toBe("always");
    expect(s.quality).toBe("low");
  });
});
