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
        learningPercent: 10,
        topics: ["TypeScript best practices", "agent architecture patterns", "SQLite best practices"],
        intervalMinutes: 30,
      },
      dailyTokenLimit: 150_000,
      weeklyTokenLimit: 900_000,
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
      return {
        ...defaults,
        ...parsed,
        browser: { ...defaults.browser, ...(parsed.browser ?? {}) },
        learning: { ...defaults.learning, ...(parsed.learning ?? {}) },
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
