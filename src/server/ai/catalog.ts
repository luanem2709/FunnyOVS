/**
 * Danh mục nhà cung cấp AI mà app biết cách tự kết nối.
 *
 * - Cổng (gateway) / máy cục bộ: tự dò cổng mặc định, không cần khoá (OmniRoute gom nhiều nguồn miễn phí và tự dự phòng).
 * - Đám mây có gói miễn phí: chỉ cần dán khoá hoặc đặt biến môi trường; app nhận ra và đưa vào chuỗi dự phòng.
 * Model mặc định chỉ là gợi ý — nếu không tồn tại, router tự chọn từ danh sách `/models`.
 * Nhãn chỉ là tên thương hiệu (không dịch); mô tả/ghi chú hiển thị lấy từ từ điển i18n của client (`ai.note.<id>`).
 */
import type { ProviderDef } from "./types.js";

export const OMNIROUTE_URL = "http://127.0.0.1:20128/v1";

export const CATALOG: ProviderDef[] = [
  {
    id: "custom",
    label: "Custom (OFFICE_LLM_*)",
    kind: "custom",
    baseUrl: "",
    keyEnv: ["OFFICE_LLM_API_KEY", "OPENAI_API_KEY"],
    needsKey: false,
    free: false,
    jsonMode: false,
    priority: 5,
  },
  {
    id: "omniroute",
    label: "OmniRoute / 9router",
    kind: "gateway",
    baseUrl: OMNIROUTE_URL,
    keyEnv: ["OMNIROUTE_API_KEY"],
    needsKey: false,
    defaultModel: "auto",
    free: true,
    jsonMode: false,
    priority: 10,
    // 9router (decolua/9router) và OmniRoute cùng nghe cổng 20128 với đường dẫn /v1 nên dùng chung một mục.
    signupUrl: "https://github.com/decolua/9router",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "local",
    baseUrl: "http://127.0.0.1:11434/v1",
    keyEnv: [],
    needsKey: false,
    modelHints: [/qwen2\.5|qwen3/i, /llama3/i, /gemma/i, /mistral/i],
    free: true,
    jsonMode: false,
    priority: 20,
    signupUrl: "https://ollama.com",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    keyEnv: [],
    needsKey: false,
    modelHints: [/qwen/i, /llama/i, /gemma/i],
    free: true,
    jsonMode: false,
    priority: 25,
    signupUrl: "https://lmstudio.ai",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "cloud",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: ["GROQ_API_KEY"],
    needsKey: true,
    defaultModel: "llama-3.3-70b-versatile",
    modelHints: [/llama-3\.3-70b/i, /llama-3\.1-70b/i, /llama-3\.1-8b/i],
    free: true,
    jsonMode: true,
    priority: 30,
    signupUrl: "https://console.groq.com/keys",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    kind: "cloud",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: ["CEREBRAS_API_KEY"],
    needsKey: true,
    defaultModel: "llama-3.3-70b",
    modelHints: [/llama-3\.3-70b/i, /llama3\.1-70b/i, /llama3\.1-8b/i],
    free: true,
    jsonMode: true,
    priority: 31,
    signupUrl: "https://cloud.cerebras.ai",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "cloud",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    needsKey: true,
    defaultModel: "gemini-2.0-flash",
    modelHints: [/gemini-2\.[05]-flash/i, /gemini-1\.5-flash/i],
    free: true,
    jsonMode: true,
    priority: 32,
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "cloud",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: ["MISTRAL_API_KEY"],
    needsKey: true,
    defaultModel: "mistral-small-latest",
    modelHints: [/mistral-small/i, /open-mistral/i],
    free: true,
    jsonMode: true,
    priority: 35,
    signupUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "cloud",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: ["OPENROUTER_API_KEY"],
    needsKey: true,
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    modelHints: [/:free$/i],
    free: true,
    jsonMode: false,
    priority: 40,
    signupUrl: "https://openrouter.ai/keys",
  },
  {
    // Gói miễn phí của NVIDIA Developer Program (khoảng 40 yêu cầu/phút, dành cho thử nghiệm).
    id: "nvidia",
    label: "NVIDIA NIM",
    kind: "cloud",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: ["NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"],
    needsKey: true,
    defaultModel: "meta/llama-3.3-70b-instruct",
    modelHints: [/llama-3\.3-70b/i, /llama-3\.1-70b/i, /llama-3\.1-8b/i],
    free: true,
    jsonMode: false,
    priority: 41,
    signupUrl: "https://build.nvidia.com/settings/api-keys",
  },
  {
    // Gói miễn phí có giới hạn theo ngày, không cần thẻ.
    id: "sambanova",
    label: "SambaNova",
    kind: "cloud",
    baseUrl: "https://api.sambanova.ai/v1",
    keyEnv: ["SAMBANOVA_API_KEY"],
    needsKey: true,
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    modelHints: [/llama-3\.3-70b/i, /llama-3\.1-70b/i, /llama-3\.1-8b/i],
    free: true,
    jsonMode: false,
    priority: 42,
    signupUrl: "https://cloud.sambanova.ai/apis",
  },
  // GitHub Models (models.github.ai) đã bị GitHub ngừng hoàn toàn từ 30/7/2026 nên không còn trong danh mục.
];

export function providerDef(id: string): ProviderDef | undefined {
  return CATALOG.find((p) => p.id === id);
}

/** Chọn model từ danh sách theo gợi ý; không có gợi ý nào khớp thì lấy mục đầu tiên không phải embedding/whisper. */
export function pickModel(def: ProviderDef, models: string[]): string | undefined {
  const usable = models.filter((m) => !/embed|whisper|tts|rerank|moderation|image|dall|guard/i.test(m));
  if (def.defaultModel && usable.includes(def.defaultModel)) return def.defaultModel;
  for (const hint of def.modelHints ?? []) {
    const hit = usable.find((m) => hint.test(m));
    if (hit) return hit;
  }
  return usable[0] ?? def.defaultModel;
}
