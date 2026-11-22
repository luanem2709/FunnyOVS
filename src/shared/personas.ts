/**
 * Bảng "persona": ngoại hình riêng, ỔN ĐỊNH THEO ID của từng nhân viên (không phụ thuộc thứ tự tạo trong cảnh).
 *
 * - Mỗi người một tổ hợp tóc/da/kiểu tóc/phụ kiện/màu áo khác nhau → nhận ra từ xa, không trùng nhau.
 * - Trang phục theo tầng: Giám đốc mặc vest + cà vạt vàng; Trưởng phòng mặc sơ mi + cà vạt màu phòng; Nhân viên mặc thường phục.
 * - Huy hiệu trên ngực mang màu phòng ban.
 * Agent không có trong bảng (tạo thêm sau này) nhận ngoại hình sinh từ băm id — vẫn ổn định giữa các lần chạy.
 *
 * Dữ liệu thuần (không three.js) để test được và dùng chung với server nếu cần.
 */

export type HairStyle = "plain" | "bob" | "spiky" | "ponytail" | "bun" | "curly";
export type Outfit = "hoodie" | "shirt" | "suit";
export type Accessory = "cap" | "beanie" | "glasses" | "headphones";

export interface Persona {
  shirt: string;
  hair: string;
  skin: string;
  pants: string;
  shoes: string;
  style: HairStyle;
  outfit: Outfit;
  acc?: Accessory;
  /** Cà vạt (Giám đốc, Trưởng phòng). */
  tie?: string;
  /** Màu huy hiệu = màu phòng ban. */
  badge: string;
  /** Hệ số co giãn thân hình (người đứng đầu hơi cao hơn một chút). */
  scale: number;
}

/** Màu đặc trưng của từng phòng ban (khớp màu Trưởng phòng ở sổ đăng ký agent). */
export const DEPT_COLORS: Record<string, string> = {
  executive: "#e5c158",
  support: "#4f9cf9",
  sales: "#f7b32b",
  marketing: "#ef6f8e",
  finance: "#43c59e",
  "ai-team": "#8f7bf0",
  automation: "#3fb6c8",
  library: "#d0a35c",
  dispatch: "#6fd67a",
};
const NEUTRAL_BADGE = "#8b949e";

export const GOLD_TIE = "#C9961A";

interface Seed {
  hair: string;
  skin: string;
  style: HairStyle;
  shirt: string;
  acc?: Accessory;
  /** Chỉ dùng cho nhân viên (tầng 3): áo hoodie hay sơ mi. */
  casual?: "hoodie" | "shirt";
}

/** Phần tự do của persona theo id; phần theo tầng (vest/cà vạt/huy hiệu) suy ra từ tầng + phòng. */
const SEEDS: Record<string, Seed> = {
  giamdoc: { hair: "#2A2A2E", skin: "#E6AC82", style: "plain", shirt: "#1F2A44", acc: "glasses" },
  // Trưởng phòng: sơ mi nhạt
  mai: { hair: "#2B1D12", skin: "#F7CBAA", style: "bob", shirt: "#DCE6F7" },
  long: { hair: "#121212", skin: "#E6AC82", style: "spiky", shirt: "#F2E9D8" },
  huy: { hair: "#7A4A22", skin: "#F2BE98", style: "plain", shirt: "#F5DDE4", acc: "glasses" },
  thu: { hair: "#3A2A3A", skin: "#F9D6BE", style: "bun", shirt: "#DDEFE6" },
  ban: { hair: "#1E2A3A", skin: "#D49870", style: "curly", shirt: "#E4DEF7", acc: "headphones" },
  an: { hair: "#5A3A2A", skin: "#E6AC82", style: "plain", shirt: "#D8EEF2" },
  tri: { hair: "#8C6239", skin: "#F7CBAA", style: "bob", shirt: "#EFE3C8", acc: "glasses" },
  minh: { hair: "#4A3220", skin: "#F2BE98", style: "spiky", shirt: "#E3F0DA" },
  // Nhân viên: thường phục, màu áo đậm hơn
  linh: { hair: "#2B1D12", skin: "#F9D6BE", style: "ponytail", shirt: "#7CB6FB", casual: "hoodie" },
  nam: { hair: "#4A3220", skin: "#D49870", style: "plain", shirt: "#F9C85E", casual: "shirt", acc: "cap" },
  ha: { hair: "#7A4A22", skin: "#F7CBAA", style: "curly", shirt: "#F393AC", casual: "hoodie" },
  phuc: { hair: "#121212", skin: "#F2BE98", style: "bob", shirt: "#6FD6B3", casual: "shirt", acc: "glasses" },
  khoa: { hair: "#3A2A3A", skin: "#E6AC82", style: "spiky", shirt: "#B0A1F5", casual: "hoodie", acc: "headphones" },
  bao: { hair: "#1E2A3A", skin: "#F7CBAA", style: "plain", shirt: "#6FCBD8", casual: "hoodie", acc: "beanie" },
  chi: { hair: "#5A3A2A", skin: "#F2BE98", style: "bun", shirt: "#E0BF86", casual: "shirt" },
  duc: { hair: "#121212", skin: "#F9D6BE", style: "curly", shirt: "#93E09B", casual: "hoodie" },
};

const HAIRS = ["#2B1D12", "#4A3220", "#121212", "#7A4A22", "#3A2A3A", "#8C6239", "#1E2A3A", "#5A3A2A", "#A0522D", "#6B4423"];
const SKINS = ["#F7CBAA", "#F2BE98", "#E6AC82", "#F9D6BE", "#D49870", "#C68642"];
const STYLES: HairStyle[] = ["plain", "bob", "spiky", "ponytail", "bun", "curly"];
const ACCS: Array<Accessory | undefined> = [undefined, undefined, "glasses", "headphones", "cap", "beanie"];
const SHIRTS_CASUAL = ["#4F7FD8", "#3FA98A", "#E0A03C", "#D9648A", "#8A6FD0", "#E07A3C", "#2FAFC0", "#C05FD0"];
const SHIRTS_FORMAL = ["#DCE6F7", "#F2E9D8", "#F5DDE4", "#DDEFE6", "#E4DEF7", "#EFE3C8"];

/** Băm chuỗi → số nguyên không âm ổn định (FNV-1a). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generatedSeed(id: string, tier: number): Seed {
  const h = hashId(id);
  const pick = <T>(list: readonly T[], salt: number): T => list[(h >>> salt) % list.length];
  return {
    hair: pick(HAIRS, 0),
    skin: pick(SKINS, 3),
    style: pick(STYLES, 6),
    shirt: tier === 3 ? pick(SHIRTS_CASUAL, 9) : pick(SHIRTS_FORMAL, 9),
    acc: pick(ACCS, 12),
    casual: (h >>> 15) % 2 === 0 ? "hoodie" : "shirt",
  };
}

export interface PersonaInput {
  id: string;
  tier: number;
  department: string;
}

/** Persona của một nhân viên: ổn định theo id; trang phục và huy hiệu theo tầng/phòng. */
export function personaFor(a: PersonaInput): Persona {
  const seed = SEEDS[a.id] ?? generatedSeed(a.id, a.tier);
  const badge = DEPT_COLORS[a.department] ?? NEUTRAL_BADGE;
  const tier = a.tier === 1 || a.tier === 2 ? a.tier : 3;
  return {
    shirt: seed.shirt,
    hair: seed.hair,
    skin: seed.skin,
    pants: tier === 1 ? "#222733" : tier === 2 ? "#2F3644" : "#3A4150",
    shoes: tier === 3 ? "#2D2A2E" : "#15151A",
    style: seed.style,
    outfit: tier === 1 ? "suit" : tier === 2 ? "shirt" : (seed.casual ?? "shirt"),
    acc: seed.acc,
    tie: tier === 1 ? GOLD_TIE : tier === 2 ? badge : undefined,
    badge,
    scale: tier === 1 ? 1.06 : tier === 2 ? 1.02 : 1,
  };
}

/** Chữ ký ngoại hình để so trùng (mọi thuộc tính nhìn thấy được). */
export function personaSignature(p: Persona): string {
  return [p.shirt, p.hair, p.skin, p.style, p.acc ?? "-", p.outfit, p.tie ?? "-"].join("|");
}

/** Bộ ba "gương mặt" (tóc, kiểu tóc, da) — hai người không được giống hệt nhau ở cả ba. */
export function faceKey(p: Persona): string {
  return [p.hair, p.style, p.skin].join("|");
}
