/**
 * Cấu hình ứng dụng (có thể chỉnh trong file / UI cho người dùng).
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_POLICY, type BrowserPolicy } from "./browser/policy.js";
import { AUTOMATION_LEVELS, type AutomationLevel } from "./automation/automationPolicy.js";

export interface AppConfig {
  workspace: string;
  dataDir: string;
  automationLevel: AutomationLevel;
  browser: BrowserPolicy;
  learning: {
    enabled: boolean;
    learningPercent: number;
    /** Chủ đề tự học. */
    topics: string[];
    /** Chu kỳ tự học (phút). */
    intervalMinutes: number;
  };
  dailyTokenLimit: number;
  /** Trần token/tuần. */
  weeklyTokenLimit: number;
  /** Trần token mỗi tác vụ. */
  perTaskTokenLimit: number;
  /** Ngưỡng cảnh báo (0..1). */
  warnRatio: number;
  /** Backend LLM: "cursor-agent" (dùng pool gói Cursor) hoặc "rule". */
  llmBackend: "cursor-agent" | "rule";
  /** Model mặc định gửi cho Cursor CLI. Gói Free chỉ cho phép "auto". */
  cursorModel: string;
  /** Chỉ dùng model thuộc bucket "auto" của gói (true với gói Free). */
  freeTierOnly: boolean;
  /** Đọc hạn mức Cursor từ API nội bộ (có thể bị đổi bất cứ lúc nào). */
  cursorQuotaEnabled: boolean;
  /** Chu kỳ poll hạn mức (ms). */
  cursorQuotaPollMs: number;
}

export class ConfigStore {
  private config: AppConfig;

  constructor(private readonly configPath: string, private readonly dataDir: string, private readonly rootDir: string) {
    this.config = this.load();
  }

  private load(): AppConfig {
    const defaults: AppConfig = {
      workspace: path.join(this.rootDir, "workspace"),
      dataDir: this.dataDir,
      automationLevel: "balanced",
      browser: { ...DEFAULT_POLICY },
      learning: {
        enabled: true,
        // Ví học phải đủ lớn để chứa ít nhất vài lượt Cursor CLI tối thiểu
        // (~23k token mỗi lượt). Với trần ngày 500k thì 30% = 150k → đủ nhiều
        // lượt tự học mà không đụng ví chính.
        learningPercent: 30,
        topics: ["TypeScript best practices", "agent architecture patterns", "SQLite best practices"],
        intervalMinutes: 30,
      },
      // Trần ngày: đủ lớn để cả văn phòng (8 nhân viên) làm việc cả ngày mà
      // không bị "đứng yên" vì hết token. Governor tự điều tiết nhịp giao việc
      // theo ngân sách còn lại nên trần này chỉ là mốc chặn cuối.
      dailyTokenLimit: 500_000,
      weeklyTokenLimit: 2_500_000,
      perTaskTokenLimit: 200_000,
      warnRatio: 0.8,
      llmBackend: "cursor-agent",
      cursorModel: "auto",
      freeTierOnly: true,
      cursorQuotaEnabled: true,
      cursorQuotaPollMs: 60_000,
    };
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const parsed = JSON.parse(raw);
      const learning = { ...defaults.learning, ...(parsed.learning ?? {}) };
      // Migration config cũ:
      // 1) learningPercent = 10 → ví học chỉ 15.000 token, nhỏ hơn chi phí
      //    1 lượt Cursor CLI (~22.800) ⇒ KHÔNG task tự học nào chạy được.
      // 2) dailyTokenLimit = 150_000 quá chặt cho 8 nhân viên chạy liên tục
      //    ⇒ văn phòng đứng yên giữa ngày.
      // Người dùng tự đặt giá trị khác vẫn được giữ nguyên.
      if (learning.learningPercent === 10) learning.learningPercent = defaults.learning.learningPercent;
      const dailyLimit =
        parsed.dailyTokenLimit === 150_000 ? defaults.dailyTokenLimit : parsed.dailyTokenLimit;
      const weeklyLimit =
        parsed.weeklyTokenLimit === 900_000 ? defaults.weeklyTokenLimit : parsed.weeklyTokenLimit;
      return {
        ...defaults,
        ...parsed,
        dailyTokenLimit: dailyLimit ?? defaults.dailyTokenLimit,
        weeklyTokenLimit: weeklyLimit ?? defaults.weeklyTokenLimit,
        browser: { ...defaults.browser, ...(parsed.browser ?? {}) },
        learning,
      };
    } catch {
      return defaults;
    }
  }

  persist(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
  }

  get(): AppConfig {
    return structuredClone(this.config);
  }

  update(patch: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...patch, browser: { ...this.config.browser, ...(patch.browser ?? {}) } };
    if (!AUTOMATION_LEVELS.includes(this.config.automationLevel)) this.config.automationLevel = "balanced";
    this.persist();
    return this.get();
  }
}
