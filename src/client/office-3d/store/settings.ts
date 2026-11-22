/**
 * Cài đặt người dùng (lưu localStorage): ngôn ngữ, tên công ty, hoạt cảnh nhàn rỗi, nhãn, chất lượng, chuyển động, đã xem hướng dẫn.
 * Phần đọc/ghi lưu trữ tách ra để test được và không làm hỏng ứng dụng khi localStorage không dùng được.
 */
import { create } from "zustand";
import type { Lang } from "../i18n/dictionaries.js";

export type LabelMode = "auto" | "always" | "off";
export type Quality = "auto" | "high" | "low";
/** Chuyển động: theo hệ điều hành / đầy đủ / giảm. */
export type MotionSetting = "system" | "full" | "reduced";

export interface SettingsData {
  lang: Lang;
  companyName: string;
  onboarded: boolean;
  idleLife: boolean;
  labels: LabelMode;
  quality: Quality;
  motion: MotionSetting;
}

export const STORAGE_KEY = "funnyovs.office3d.settings.v1";
export const DEFAULT_COMPANY = "FunnyOVS Corp";

export function defaultSettings(lang: Lang): SettingsData {
  return { lang, companyName: DEFAULT_COMPANY, onboarded: false, idleLife: true, labels: "auto", quality: "auto", motion: "system" };
}

const LANGS: readonly string[] = ["vi", "en"];
const LABELS: readonly string[] = ["auto", "always", "off"];
const QUALITIES: readonly string[] = ["auto", "high", "low"];
const MOTIONS: readonly string[] = ["system", "full", "reduced"];

/** Đọc chuỗi JSON đã lưu; mọi trường sai kiểu/không hợp lệ rơi về mặc định (không ném lỗi). */
export function parseSettings(raw: string | null, fallbackLang: Lang): SettingsData {
  const base = defaultSettings(fallbackLang);
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      lang: typeof o.lang === "string" && LANGS.includes(o.lang) ? (o.lang as Lang) : base.lang,
      companyName: typeof o.companyName === "string" && o.companyName.trim() ? o.companyName.trim().slice(0, 40) : base.companyName,
      onboarded: o.onboarded === true,
      idleLife: o.idleLife !== false,
      labels: typeof o.labels === "string" && LABELS.includes(o.labels) ? (o.labels as LabelMode) : base.labels,
      quality: typeof o.quality === "string" && QUALITIES.includes(o.quality) ? (o.quality as Quality) : base.quality,
      motion: typeof o.motion === "string" && MOTIONS.includes(o.motion) ? (o.motion as MotionSetting) : base.motion,
    };
  } catch {
    return base;
  }
}

function detect(): Lang {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("vi") ? "vi" : "en";
}

function load(): SettingsData {
  try {
    return parseSettings(typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY), detect());
  } catch {
    return defaultSettings(detect());
  }
}

function persist(d: SettingsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* localStorage đầy/bị chặn: bỏ qua, cài đặt chỉ có hiệu lực trong phiên này */
  }
}

export interface SettingsStore extends SettingsData {
  set: (patch: Partial<SettingsData>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { lang, companyName, onboarded, idleLife, labels, quality, motion } = get();
    persist({ lang, companyName, onboarded, idleLife, labels, quality, motion });
  },
}));
