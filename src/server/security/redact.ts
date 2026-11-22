/**
 * Che khoá/token trước khi ghi nhật ký, đưa vào sự kiện hoặc trả về client.
 * Hai lớp: (1) các giá trị bí mật đã biết (kho khoá), (2) mẫu chuỗi thường gặp của khoá API.
 */
const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / OpenRouter
  /\bgsk_[A-Za-z0-9]{16,}/g, // Groq
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abp]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi,
];

export const REDACTED = "[đã che]";

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join(REDACTED);
  }
  for (const re of PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/** Bản che của một khoá để hiển thị cho người dùng: giữ 4 ký tự đầu và 4 cuối. */
export function maskKey(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
