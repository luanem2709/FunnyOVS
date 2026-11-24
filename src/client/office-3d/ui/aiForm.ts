/**
 * Biểu mẫu "+ Thêm API": mẫu dựng sẵn và kiểm tra đầu vào phía client (phản hồi tức thì, không cần gọi máy chủ).
 * Máy chủ vẫn là nơi kiểm tra cuối cùng (server/ai/custom.ts) — hai bên dùng cùng các khoá lỗi `val.ai.*`.
 */
import type { ProviderStatus } from "../../../shared/ai.js";

export interface AiForm {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  free: boolean;
}

export const emptyAiForm = (): AiForm => ({ label: "", baseUrl: "", apiKey: "", model: "", free: false });

export interface AiPreset {
  id: string;
  label: string;
  baseUrl: string;
  model?: string;
  free: boolean;
  signupUrl?: string;
  /** Khoá i18n của ghi chú một dòng (vd. phải thay mã tài khoản). */
  noteKey?: string;
}

/**
 * Các dịch vụ tương thích OpenAI phổ biến mà danh mục dựng sẵn chưa có. Địa chỉ lấy từ tài liệu chính thức của từng nhà cung cấp;
 * `free` chỉ là gợi ý (gói miễn phí/dùng thử có thể đổi) — nguồn nào cũng kiểm tra được bằng nút "Kiểm tra kết nối" trước khi lưu.
 */
export const AI_PRESETS: readonly AiPreset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", free: false, signupUrl: "https://platform.openai.com/api-keys" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", free: false, signupUrl: "https://platform.deepseek.com/api_keys" },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", free: false, signupUrl: "https://api.together.ai/settings/api-keys" },
  { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1", free: false, signupUrl: "https://fireworks.ai/account/api-keys" },
  { id: "deepinfra", label: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai", free: false, signupUrl: "https://deepinfra.com/dash/api_keys" },
  { id: "huggingface", label: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", free: false, signupUrl: "https://huggingface.co/settings/tokens", noteKey: "ai.preset.huggingface" },
  { id: "cohere", label: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1", free: true, signupUrl: "https://dashboard.cohere.com/api-keys", noteKey: "ai.preset.cohere" },
  { id: "cloudflare", label: "Cloudflare Workers AI", baseUrl: "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1", free: true, signupUrl: "https://dash.cloudflare.com/profile/api-tokens", noteKey: "ai.preset.cloudflare" },
  { id: "local", label: "Local OpenAI-compatible", baseUrl: "http://127.0.0.1:8000/v1", free: true, noteKey: "ai.preset.local" },
];

/** Mẫu "khoá khác" cho mỗi nguồn đám mây dựng sẵn — để gộp hạn mức miễn phí của nhiều tài khoản cùng một nhà cung cấp. */
export function anotherKeyPresets(providers: ReadonlyArray<Pick<ProviderStatus, "id" | "label" | "kind" | "baseUrl" | "free" | "signupUrl" | "custom">>): AiPreset[] {
  return providers
    .filter((p) => p.kind === "cloud" && !p.custom && p.baseUrl)
    .map((p) => ({ id: `another:${p.id}`, label: p.label, baseUrl: p.baseUrl, free: p.free, signupUrl: p.signupUrl }));
}

export interface FormError {
  key: string;
  vars?: Record<string, string | number>;
}

export const MAX_LABEL = 40;
export const MAX_KEY = 500;

/** Phản chiếu kiểm tra của máy chủ (server/ai/custom.ts) để báo lỗi ngay khi gõ. */
export function validateAiForm(f: AiForm, opts: { needLabel?: boolean } = {}): FormError | null {
  const label = f.label.trim();
  if ((opts.needLabel ?? true) && !label) return { key: "val.ai.labelRequired" };
  if (label.length > MAX_LABEL) return { key: "val.ai.labelTooLong", vars: { max: MAX_LABEL } };
  const url = f.baseUrl.trim();
  if (!url) return { key: "val.ai.baseUrlRequired" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { key: "val.ai.baseUrlInvalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { key: "val.ai.baseUrlProtocol" };
  if (u.username || u.password) return { key: "val.ai.baseUrlCredentials" };
  if (f.apiKey.trim().length > MAX_KEY) return { key: "val.ai.keyTooLong", vars: { max: MAX_KEY } };
  return null;
}

/** Địa chỉ ở máy chủ từ xa mà không có đường dẫn nào: nhiều nhà cung cấp cần đuôi `/v1` — gợi ý (không chặn). */
export function suggestsV1(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl.trim());
    const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(u.hostname) || u.hostname.endsWith(".local");
    return !local && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
}

/** Dữ liệu gửi lên máy chủ. Khi sửa, không gửi khoá (khoá đổi ở thẻ nguồn) nhưng luôn gửi `model` để xoá được model đã đặt. */
export function aiFormPayload(f: AiForm, opts: { edit?: boolean } = {}): { label: string; baseUrl: string; apiKey?: string; model?: string; free: boolean } {
  const base = { label: f.label.trim(), baseUrl: f.baseUrl.trim(), free: f.free };
  if (opts.edit) return { ...base, model: f.model.trim() };
  return { ...base, ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}), ...(f.model.trim() ? { model: f.model.trim() } : {}) };
}

/**
 * Tên các nguồn AI đang sẵn sàng để hiện ở thanh đầu và bảng tin sảnh. Ưu tiên nhãn (nguồn người dùng thêm có id kỹ thuật `u-tên-xxxx`
 * xấu và khó đọc); máy chủ bản cũ không gửi nhãn thì dùng id. Mỗi tên cắt gọn để không tràn thanh đầu.
 */
export function readyNames(ai: { providers: string[]; names?: string[] }, max = 2, width = 18): string {
  const list = ai.names && ai.names.length === ai.providers.length ? ai.names : ai.providers;
  return list
    .slice(0, max)
    .map((n) => (n.length > width ? `${n.slice(0, width - 1)}…` : n))
    .join(", ");
}
