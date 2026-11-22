/**
 * Dịch lỗi gọi AI theo ngôn ngữ người dùng.
 *
 * `AiError.message` chỉ là chẩn đoán kỹ thuật (tiếng Anh, cho nhật ký). Mọi thứ hiển thị cho người dùng đi qua đây:
 * mã lỗi (`HTTP`, `TIMEOUT`...) + biến → khoá `ai.err.<mã>`. Nhờ vậy câu "Mọi nhà cung cấp AI đều lỗi: ..."
 * không còn lẫn tiếng Việt khi giao diện đang là tiếng Anh (và ngược lại).
 */
import { msg, type Lang } from "./messages.js";

export interface AiErrorLike {
  code: string;
  message: string;
  status?: number;
  vars?: Record<string, string | number>;
}

export type MessageVars = Record<string, string | number>;

/** Khoá + biến để client/ server dịch một lỗi AI. */
export function aiErrorI18n(e: AiErrorLike): { key: string; vars: MessageVars } {
  return {
    key: `ai.err.${e.code}`,
    // `detail` mặc định rỗng để placeholder không lộ ra khi mã lỗi không dùng nó.
    vars: { detail: "", ...(e.status !== undefined ? { status: e.status } : {}), ...(e.vars ?? {}) },
  };
}

export function aiErrorText(lang: Lang, e: AiErrorLike): string {
  const { key, vars } = aiErrorI18n(e);
  const text = msg(lang, key, vars);
  return text === key ? e.message : text;
}

export interface AttemptLike {
  providerId: string;
  /** Chẩn đoán kỹ thuật (tiếng Anh) — dùng khi không có mã lỗi để dịch. */
  error: string;
  code?: string;
  status?: number;
  vars?: MessageVars;
}

/** "groq: Quá thời gian chờ (30s). | cerebras: HTTP 429" — mọi nguồn đã thử, theo ngôn ngữ yêu cầu. */
export function aiAttemptsText(lang: Lang, attempts: AttemptLike[]): string {
  return attempts
    .map((a) => `${a.providerId}: ${a.code ? aiErrorText(lang, { code: a.code, message: a.error, status: a.status, vars: a.vars }) : a.error}`)
    .join(" | ");
}
