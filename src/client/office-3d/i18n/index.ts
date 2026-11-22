/**
 * i18n tối giản: `translate(lang, key, vars)` (thuần, dễ test) + `useT()` (hook) + `tr()` (ngoài React).
 * Khoá thiếu → trả về chính khoá (không bao giờ ném lỗi giao diện).
 */
import { useSettings } from "../store/settings.js";
import { DICTIONARIES, type Key, type Lang } from "./dictionaries.js";

export type { Key, Lang };

export function translate(lang: Lang, key: Key | string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[lang] as Record<string, string>;
  const fallback = DICTIONARIES.vi as Record<string, string>;
  let s = dict[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // "$t:khoá" → dịch tiếp phần chèn (vd. hành động "đọc"/"read" trong câu xin quyền).
      const value = typeof v === "string" && v.startsWith("$t:") ? translate(lang, v.slice(3)) : String(v);
      s = s.split(`{${k}}`).join(value);
    }
  }
  return s;
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Thông điệp có khoá do server gửi: dịch theo khoá + biến; khoá lạ/thiếu → dùng văn bản dự phòng `text`
 * (thay vì hiện khoá thô cho người dùng).
 */
export function messageText(t: TFn, m: { key?: string; vars?: Record<string, string | number>; text: string }): string {
  if (!m.key) return m.text;
  const s = t(m.key, m.vars);
  return s === m.key ? m.text : s;
}

type Vars = Record<string, string | number>;

/**
 * Nhãn "việc đang làm" của một agent. Server gửi khoá + biến (vd. `task.planning`) để client dịch theo ngôn ngữ đang chọn;
 * không có khoá (việc do người dùng đặt tên) thì giữ nguyên chữ của họ.
 */
export function taskLabel(t: TFn, md: Record<string, unknown>): string {
  return messageText(t, {
    key: typeof md.taskKey === "string" ? md.taskKey : undefined,
    vars: md.taskVars && typeof md.taskVars === "object" ? (md.taskVars as Vars) : undefined,
    text: typeof md.task === "string" ? md.task : "",
  });
}

/** Lý do một việc cần duyệt (ước lượng token vượt ngưỡng...): dịch theo khoá nếu server gửi kèm. */
export function approvalReasonLabel(t: TFn, md: Record<string, unknown>): string {
  return messageText(t, {
    key: typeof md.approvalReasonKey === "string" ? md.approvalReasonKey : undefined,
    vars: md.approvalReasonVars && typeof md.approvalReasonVars === "object" ? (md.approvalReasonVars as Vars) : undefined,
    text: typeof md.approvalReason === "string" ? md.approvalReason : "",
  });
}

/** Một dòng nhật ký: có khoá i18n thì dịch (kèm phần phụ nếu có), không thì hiện nguyên văn. */
export function logLine(
  t: TFn,
  item: { key?: string; vars?: Vars; text: string; extra?: string; extraKey?: string; extraVars?: Vars },
): string {
  const extra = item.extraKey ? messageText(t, { key: item.extraKey, vars: item.extraVars, text: item.extra ?? "" }) : item.extra;
  return item.key ? messageText(t, { key: item.key, vars: item.vars, text: item.text }) + (extra ? ` — ${extra}` : "") : item.text;
}

/**
 * Chọn dạng số ít/số nhiều: dùng khoá `<base>.one` khi n = 1, còn lại `<base>.other` (tiếng Việt đặt hai dạng giống nhau).
 * `n` luôn được truyền vào biến {n}.
 */
export function plural(t: TFn, base: string, n: number, vars: Record<string, string | number> = {}): string {
  return t(`${base}.${n === 1 ? "one" : "other"}`, { ...vars, n });
}

/** Ngôn ngữ mặc định theo trình duyệt: tiếng Việt nếu có, còn lại tiếng Anh. */
export function detectLang(nav: Pick<Navigator, "language"> | undefined = typeof navigator === "undefined" ? undefined : navigator): Lang {
  return nav?.language?.toLowerCase().startsWith("vi") ? "vi" : "en";
}

/** Dùng trong component: tự render lại khi đổi ngôn ngữ. */
export function useT(): (key: Key | string, vars?: Record<string, string | number>) => string {
  const lang = useSettings((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

/** Dùng ngoài React (cảnh 3D, hành vi): đọc ngôn ngữ hiện tại. */
export function tr(key: Key | string, vars?: Record<string, string | number>): string {
  return translate(useSettings.getState().lang, key, vars);
}

export function deptName(id: string, short = false): string {
  return tr(short ? `dept.short.${id}` : `dept.${id}`);
}

export function agentRole(agentId: string, fallback = ""): string {
  const key = `role.${agentId}`;
  const s = tr(key);
  return s === key ? fallback : s;
}
