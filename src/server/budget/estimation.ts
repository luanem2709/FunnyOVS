/**
 * Ước lượng chi phí tác vụ + tự hạ cấp model.
 *
 * Nguyên tắc: ước lượng TRƯỚC khi gọi LLM. Nếu vượt ngưỡng thì phải hỏi người
 * dùng (hiện trong hộp thoại 3D) thay vì tự ý tiêu hạn mức của họ.
 *
 * Bảng giá lấy từ tài liệu Cursor chính thức (đơn vị: USD / 1 triệu token):
 *   Grok 4.7      : input $2, cache read $0.5, output $6
 *   Grok 4.5/4.6  : input $2, cache read $0.5, output $6
 *   Composer 2.5  : input $0.5, cache read $0.2, output $2.5
 * Kiểm chứng: 22970×$2/M + 25472×$0.5/M + 503×$6/M = $0.061694
 *   khớp chính xác `totalCents: 6.1694` mà Cursor trả về.
 */

export interface ModelPricing {
  id: string;
  label: string;
  inputPerM: number;
  cacheReadPerM: number;
  outputPerM: number;
  /** Model này có nằm trong bucket "auto" (pool gói) không. */
  inAutoBucket: boolean;
}

export const MODEL_PRICING: ModelPricing[] = [
  { id: "auto", label: "Auto", inputPerM: 2, cacheReadPerM: 0.5, outputPerM: 6, inAutoBucket: true },
  { id: "composer-2.5", label: "Composer 2.5", inputPerM: 0.5, cacheReadPerM: 0.2, outputPerM: 2.5, inAutoBucket: true },
  { id: "cursor-grok-4.5", label: "Grok 4.5", inputPerM: 2, cacheReadPerM: 0.5, outputPerM: 6, inAutoBucket: true },
  { id: "grok-4.6", label: "Grok 4.6", inputPerM: 2, cacheReadPerM: 0.5, outputPerM: 6, inAutoBucket: true },
  { id: "grok-4.7", label: "Grok 4.7", inputPerM: 2, cacheReadPerM: 0.5, outputPerM: 6, inAutoBucket: true },
];

export type TaskDifficulty = "trivial" | "normal" | "hard" | "huge";

export interface EstimationInput {
  /** Nội dung yêu cầu người dùng. */
  prompt: string;
  /** Ngữ cảnh bổ sung (đọc file, lịch sử hội thoại...). */
  context?: string;
  /** Số bước tool dự kiến. */
  toolSteps?: number;
  /** Độ khó do người dùng gợi ý (tuỳ chọn). */
  difficulty?: TaskDifficulty;
}

export interface Estimation {
  /** Token dự kiến tiêu thụ. */
  estimatedTokens: number;
  /** Token vào / ra riêng (để hiển thị chi tiết). */
  inputTokens: number;
  outputTokens: number;
  difficulty: TaskDifficulty;
  /** Model đề xuất sau khi tự hạ cấp. */
  suggestedModel: string;
  /** Ước lượng chi phí (USD). */
  estimatedCostUsd: number;
  /** Có cần hỏi người dùng trước khi chạy không. */
  needsApproval: boolean;
  /** Lý do nếu cần hỏi. */
  reason?: string;
}

/**
 * Quy tắc ngưỡng (xem docs/03 §5.4).
 *
 * Lưu ý: một lượt Cursor CLI tốn tối thiểu ~23.000 token (chi phí cố định),
 * và một lượt thực tế đo được ~44.578 token. Vì vậy trần mỗi tác vụ phải
 * lớn hơn nhiều so với ước lượng cũ, nếu không mọi tác vụ đều bị chặn.
 */
export const THRESHOLDS = {
  /** Dưới ngưỡng này → chạy luôn, không hỏi. */
  freeBelow: 60_000,
  /** Trên ngưỡng này → phải hỏi người dùng. */
  askAbove: 120_000,
  /** Trần mỗi tác vụ. */
  perTaskLimit: 200_000,
  /** Cảnh báo khi đã dùng ≥ 80% hạn mức. */
  warnRatio: 0.8,
} as const;

/**
 * Chi phí cố định của MỘT lượt Cursor CLI, đo thật ngày 2026-11-01:
 *   input 10.356 · cacheRead 33.664 · output 558  = 44.578 token
 * Cursor CLI luôn nạp system prompt + định nghĩa tool + ngữ cảnh workspace,
 * nên mỗi lượt đều tốn hàng chục nghìn token dù prompt rất ngắn.
 * Dùng hệ số này để ước lượng không bị lạc quá xa thực tế.
 */
export const BASE_OVERHEAD = {
  /** Token hệ thống + tool definitions + prompt mặc định. */
  input: 10_000,
  /** Token đọc cache (context workspace được Cursor tự nạp lại). */
  cacheRead: 12_000,
  /** Token sinh ra tối thiểu. */
  output: 800,
};

/** Ước lượng số token từ chuỗi văn bản (heuristic ~4 ký tự/token cho tiếng Việt). */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  // Tiếng Việt có dấu → nhiều byte/token hơn. Dùng 3.2 ký tự/token là thận trọng.
  return Math.ceil(text.length / 3.2);
}

export function inferDifficulty(input: EstimationInput): TaskDifficulty {
  if (input.difficulty) return input.difficulty;
  const text = `${input.prompt} ${input.context ?? ""}`.toLowerCase();
  const words = text.split(/\s+/).length;
  const steps = input.toolSteps ?? 0;

  if (words > 800 || steps > 20) return "huge";
  if (words > 250 || steps > 8) return "hard";
  if (words > 60 || steps > 2) return "normal";
  return "trivial";
}

/** Model đề xuất theo độ khó — chỉ dùng model trong bucket "auto". */
export function suggestModel(difficulty: TaskDifficulty, freeTierOnly: boolean): string {
  if (freeTierOnly) return "auto";
  switch (difficulty) {
    case "trivial":
      return "composer-2.5";
    case "normal":
      return "cursor-grok-4.5";
    case "hard":
      return "grok-4.7";
    case "huge":
      return "grok-4.7";
  }
}

/** Tính chi phí (USD) theo bảng giá Cursor. */
export function estimateCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
): number {
  return (
    (inputTokens * pricing.inputPerM) / 1_000_000 +
    (outputTokens * pricing.outputPerM) / 1_000_000 +
    (cacheReadTokens * pricing.cacheReadPerM) / 1_000_000
  );
}

export function pricingFor(modelId: string): ModelPricing {
  return MODEL_PRICING.find((m) => m.id === modelId) ?? MODEL_PRICING[0];
}

/** Ước lượng toàn bộ tác vụ. */
export function estimateTask(input: EstimationInput, opts: { freeTierOnly?: boolean } = {}): Estimation {
  const difficulty = inferDifficulty(input);
  const promptTokens = estimateTextTokens(input.prompt) + estimateTextTokens(input.context ?? "");

  // Chi phí cố định của một lượt Cursor CLI (đo thật).
  const inputTokens = BASE_OVERHEAD.input + promptTokens;
  // Output: phần sinh ra + phần đọc cache của context workspace.
  const outputTokens = BASE_OVERHEAD.output + Math.ceil(promptTokens * 0.4) + (input.toolSteps ?? 0) * 400;
  const cacheReadTokens = BASE_OVERHEAD.cacheRead + Math.ceil(promptTokens * 0.2);
  const estimatedTokens = inputTokens + outputTokens + cacheReadTokens;

  const suggestedModel = suggestModel(difficulty, opts.freeTierOnly ?? false);
  const pricing = pricingFor(suggestedModel);
  const estimatedCostUsd = estimateCost(pricing, inputTokens, outputTokens, cacheReadTokens);

  const est: Estimation = {
    estimatedTokens,
    inputTokens,
    outputTokens,
    difficulty,
    suggestedModel,
    estimatedCostUsd,
    needsApproval: false,
  };

  if (estimatedTokens > THRESHOLDS.perTaskLimit) {
    est.needsApproval = true;
    est.reason = `Ước lượng ${estimatedTokens.toLocaleString()} token vượt trần mỗi tác vụ (${THRESHOLDS.perTaskLimit.toLocaleString()}). Nên chia nhỏ tác vụ.`;
  } else if (estimatedTokens > THRESHOLDS.askAbove) {
    est.needsApproval = true;
    est.reason = `Ước lượng ${estimatedTokens.toLocaleString()} token — vượt ngưỡng ${THRESHOLDS.askAbove.toLocaleString()} nên cần bạn xác nhận trước.`;
  }

  return est;
}
