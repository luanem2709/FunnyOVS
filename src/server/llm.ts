/**
 * Lớp LLM tối giản (OpenAI-compatible). Nếu không cấu hình, hệ thống vẫn chạy được ở chế độ
 * "quy tắc" cho các tác vụ nghiên cứu/tự học (không cần LLM).
 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function loadLlmConfig(): LlmConfig | null {
  const baseUrl = process.env.OFFICE_LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "";
  const apiKey = process.env.OFFICE_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const model = process.env.OFFICE_LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, model };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.3,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    return json?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
