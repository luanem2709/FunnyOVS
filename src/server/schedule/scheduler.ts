/**
 * Bộ lập lịch giao việc lặp lại: lưu bền (`schedules.json`, ghi nguyên tử), kiểm tra mỗi 30 giây, đến hạn thì giao việc cho người nhận
 * (mặc định Giám đốc) như khi bạn tự giao. An toàn:
 *  - Dừng khẩn cấp: bỏ qua lần chạy đó và GHI NHẬN là bỏ qua (khi gỡ dừng khẩn cấp không có việc cũ nào bất ngờ nổ ra).
 *  - Mỗi lần chạy vẫn đi qua TaskRunner như mọi việc khác: ước lượng token, duyệt trước khi tốn nhiều, ngân sách.
 *  - Tối đa 50 lịch; nội dung bị giới hạn; lịch hỏng khi nạp bị bỏ qua thay vì làm sập.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FREQUENCIES, ScheduleSchema, isDue, viewOf, type Frequency, type Schedule, type ScheduleView } from "../../shared/schedule.js";
import { ValidationError } from "../crm/store.js";

export const MAX_SCHEDULES = 50;

export interface SchedulerDeps {
  file: string;
  /** Đồng hồ (thay được trong test). */
  now?: () => Date;
  /** Giao việc; trả id nút gốc. Ném lỗi → lần chạy ghi "failed". */
  run: (s: Schedule) => Promise<{ rootId?: string }>;
  /** Đang dừng khẩn cấp? */
  paused: () => boolean;
  /** Người nhận có tồn tại không? (kiểm khi tạo). */
  agentExists: (id: string) => boolean;
  /** Người nhận mặc định (Giám đốc). */
  defaultAgent: () => string;
  /** Ghi nhật ký bảo mật khi tạo/xoá/chạy. */
  onEvent?: (kind: "schedule.create" | "schedule.delete" | "schedule.run", detail: Record<string, string | number | boolean>) => void;
}

export interface ScheduleInput {
  title?: unknown;
  prompt?: unknown;
  toAgentId?: unknown;
  frequency?: unknown;
  at?: unknown;
  weekday?: unknown;
  lang?: unknown;
}

export class Scheduler {
  private items: Schedule[] = [];
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly deps: SchedulerDeps) {
    this.load();
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private load(): void {
    try {
      this.items = this.parseList(JSON.parse(fs.readFileSync(this.deps.file, "utf8")));
    } catch {
      this.items = [];
    }
  }

  /** Lọc danh sách thô: lịch sai schema bị bỏ, quá số lượng bị cắt. */
  private parseList(raw: unknown): Schedule[] {
    if (!Array.isArray(raw)) return [];
    const out: Schedule[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const p = ScheduleSchema.safeParse(item);
      if (!p.success || seen.has(p.data.id)) continue;
      seen.add(p.data.id);
      out.push(p.data);
      if (out.length >= MAX_SCHEDULES) break;
    }
    return out;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.deps.file), { recursive: true });
      const tmp = `${this.deps.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.items), "utf8");
      fs.renameSync(tmp, this.deps.file);
    } catch (e) {
      console.error("[schedule] không lưu được:", e instanceof Error ? e.message : e);
    }
  }

  list(): ScheduleView[] {
    const now = this.now();
    return this.items.map((s) => viewOf(s, now));
  }

  /** Bản thô (cho sao lưu). */
  raw(): Schedule[] {
    return this.items.map((s) => ({ ...s }));
  }

  /** Thay toàn bộ (khôi phục sao lưu). Trả số lịch đã nạp. */
  replaceAll(raw: unknown): number {
    this.items = this.parseList(raw);
    this.save();
    return this.items.length;
  }

  create(input: ScheduleInput): Schedule {
    const title = String(input.title ?? "").trim().slice(0, 120);
    if (!title) throw new ValidationError("val.schedule.titleRequired");
    const prompt = String(input.prompt ?? "").trim().slice(0, 4000);
    if (!prompt) throw new ValidationError("val.schedule.promptRequired");
    const frequency = String(input.frequency ?? "daily") as Frequency;
    if (!(FREQUENCIES as readonly string[]).includes(frequency)) throw new ValidationError("val.schedule.frequencyInvalid");
    const at = String(input.at ?? "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new ValidationError("val.schedule.timeInvalid");
    let weekday: number | undefined;
    if (frequency === "weekly") {
      weekday = input.weekday === undefined ? 1 : Number(input.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new ValidationError("val.schedule.weekdayInvalid");
    }
    const toAgentId = String(input.toAgentId ?? "").trim() || this.deps.defaultAgent();
    if (!this.deps.agentExists(toAgentId)) throw new ValidationError("val.schedule.agentUnknown", { id: toAgentId.slice(0, 40) });
    if (this.items.length >= MAX_SCHEDULES) throw new ValidationError("val.schedule.tooMany", { max: MAX_SCHEDULES });
    const s: Schedule = {
      id: `sch_${randomUUID().slice(0, 10)}`,
      title,
      prompt,
      toAgentId,
      frequency,
      at,
      ...(weekday !== undefined ? { weekday } : {}),
      enabled: true,
      lang: input.lang === "en" ? "en" : "vi",
      createdAt: this.now().toISOString(),
    };
    this.items.push(s);
    this.save();
    this.deps.onEvent?.("schedule.create", { id: s.id, title: s.title, frequency: s.frequency, at: s.at });
    return s;
  }

  setEnabled(id: string, enabled: boolean): Schedule | null {
    const s = this.items.find((x) => x.id === id);
    if (!s) return null;
    s.enabled = enabled;
    // Bật lại: tính từ bây giờ để không "chạy bù" những lần đã tắt.
    if (enabled) s.lastRunAt = this.now().toISOString();
    this.save();
    return s;
  }

  remove(id: string): boolean {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const [s] = this.items.splice(i, 1);
    this.save();
    this.deps.onEvent?.("schedule.delete", { id: s.id, title: s.title });
    return true;
  }

  /** Chạy ngay một lịch (nút "Chạy ngay"). Trả trạng thái lần chạy. Không đổi giờ của lần kế tiếp ngoài việc ghi lần chạy này. */
  async runNow(id: string): Promise<Schedule | null> {
    const s = this.items.find((x) => x.id === id);
    if (!s) return null;
    await this.execute(s);
    return s;
  }

  private async execute(s: Schedule): Promise<void> {
    s.lastRunAt = this.now().toISOString();
    s.lastError = undefined;
    if (this.deps.paused()) {
      s.lastStatus = "skipped";
      s.lastRootId = undefined;
      this.save();
      this.deps.onEvent?.("schedule.run", { id: s.id, status: "skipped" });
      return;
    }
    this.save(); // ghi lastRunAt TRƯỚC khi chạy: tick chồng nhau không giao việc hai lần
    try {
      const r = await this.deps.run(s);
      s.lastStatus = "started";
      s.lastRootId = r.rootId;
    } catch (e) {
      s.lastStatus = "failed";
      s.lastError = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
    this.save();
    this.deps.onEvent?.("schedule.run", { id: s.id, status: s.lastStatus ?? "started" });
  }

  /** Giao mọi lịch đã đến hạn. Trả số lịch đã xử lý (kể cả bị bỏ qua). */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const now = this.now();
      const due = this.items.filter((s) => isDue(s, now));
      for (const s of due) await this.execute(s);
      return due.length;
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    void this.tick(); // lịch bị bỏ lỡ lúc tắt máy: chạy bù một lần ngay khi mở
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
