/** Kiểu dùng chung cho lớp kết nối AI (OpenAI-compatible). */

import type { ProviderKind, ProviderState, ProviderStats, ProviderStatus } from "../../shared/ai.js";

export type { ProviderKind, ProviderState, ProviderStats, ProviderStatus };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** Yêu cầu trả JSON (dùng `response_format` nếu nhà cung cấp hỗ trợ; luôn phải kèm chỉ dẫn trong prompt). */
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Chỉ dùng nhà cung cấp này (bỏ qua ngắt mạch) — dùng cho nút "Kiểm thử". */
  only?: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
  providerId: string;
  model: string;
  latencyMs: number;
}

export type AiErrorCode = "NO_PROVIDER" | "ALL_FAILED" | "HTTP" | "TIMEOUT" | "NETWORK" | "BAD_RESPONSE" | "ABORTED";

/** Một lần thử thất bại với một nhà cung cấp (kèm mã + biến để dịch theo ngôn ngữ người dùng). */
export interface AiAttempt {
  providerId: string;
  /** Chẩn đoán kỹ thuật (tiếng Anh). */
  error: string;
  code?: AiErrorCode;
  status?: number;
  vars?: Record<string, string | number>;
}

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly attempts: AiAttempt[] = [],
    /** Biến chèn vào thông điệp i18n `ai.err.<code>` (vd. { s: 30 } cho TIMEOUT). */
    readonly vars?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Tên biến môi trường có thể chứa khoá (thử lần lượt). */
  keyEnv: string[];
  /** Có bắt buộc khoá không. Local/gateway thường không. */
  needsKey: boolean;
  /** Model mặc định; bỏ trống = lấy từ /models. */
  defaultModel?: string;
  /** Ưu tiên chọn khi chọn từ /models. */
  modelHints?: RegExp[];
  /** Có gói miễn phí/không tốn tiền khi dùng. */
  free: boolean;
  /** Có hỗ trợ `response_format: json_object`. */
  jsonMode: boolean;
  /** Số nhỏ = ưu tiên cao. */
  priority: number;
  signupUrl?: string;
}

/** Nhà cung cấp đã được phân giải sẵn sàng để gọi. */
export interface ResolvedProvider {
  def: ProviderDef;
  baseUrl: string;
  apiKey?: string;
  model: string;
  models: string[];
}
