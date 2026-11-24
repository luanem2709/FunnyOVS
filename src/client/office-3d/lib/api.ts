/**
 * Gọi REST của FunnyOVS (cùng origin).
 *
 * Lỗi luôn là `ApiError` mang `status`, `code` và `vars` do server trả ({ error, code, vars }); dùng `errorText(t, e)` để hiện
 * thông báo đúng ngôn ngữ người dùng — client không bao giờ hiện thẳng chuỗi tiếng Việt cố định của server.
 */
import type { ProviderStatus, RoutingStrategy } from "../../../shared/ai.js";
import type { Contact, CrmSummary, Deal, DealStage, EmailDraft, CalendarEvent } from "../../../shared/crm.js";
import type { AuditEntry } from "../../../shared/audit.js";
import type { BackupCounts } from "../../../shared/backup.js";
import type { MailPublicConfig } from "../../../shared/mail.js";
import type { Frequency, ScheduleView } from "../../../shared/schedule.js";
import type { StudioState } from "../../../shared/studio.js";
import { useSettings } from "../store/settings.js";

export type Vars = Record<string, string | number>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly vars: Vars | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isVars(v: unknown): v is Vars {
  return typeof v === "object" && v !== null && Object.values(v).every((x) => typeof x === "string" || typeof x === "number");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "network", undefined, `${path} → network error`);
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown; vars?: unknown } | null;
    throw new ApiError(
      res.status,
      typeof b?.code === "string" ? b.code : undefined,
      isVars(b?.vars) ? b.vars : undefined,
      typeof b?.error === "string" ? b.error : `${path} → ${res.status}`,
    );
  }
  // Phản hồi 200 mà không phải JSON (vd. máy chủ bản cũ trả index.html cho đường dẫn chưa có) là lỗi rõ ràng, không phải "dữ liệu rỗng"
  // — nếu không, nơi mong đợi mảng sẽ vỡ khi gọi .map.
  const text = await res.text().catch(() => "");
  if (text.trim() === "") return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, "badResponse", undefined, `${path} → unexpected response`);
  }
}

type TFn = (key: string, vars?: Vars) => string;

/** Khoá i18n của một mã lỗi API: mã ngắn → `err.api.<mã>`; mã có dấu chấm (vd. `val.deal.stageInvalid`) là khoá đầy đủ. */
export function errorKey(code: string): string {
  return code.includes(".") ? code : `err.api.${code}`;
}

/** Thông báo lỗi theo ngôn ngữ hiện tại cho mọi thứ bị ném ra từ các hàm ở file này. */
export function errorText(t: TFn, e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code) {
      const key = errorKey(e.code);
      const s = t(key, e.vars);
      if (s !== key) return s;
    }
    if (e.status === 401) return t("err.api.authRequired");
    return e.message; // chẩn đoán kỹ thuật (hiếm khi tới đây)
  }
  return e instanceof Error ? e.message : t("err.api.badRequest");
}

const lang = (): "vi" | "en" => useSettings.getState().lang;
const enc = encodeURIComponent;
const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

// ---------------------------------------------------------------- duyệt & việc

export type PermissionMode = "once" | "read" | "readwrite" | "deny";

export const decidePermission = (requestId: string, mode: PermissionMode): Promise<unknown> =>
  call("/api/permissions/decide", { method: "POST", ...json({ requestId, mode }) });

export const decideAction = (id: string, approve: boolean): Promise<unknown> =>
  call(`/api/actions/${enc(id)}/decide`, { method: "POST", ...json({ approve }) });

export const decideTask = (taskId: string, action: "approve" | "reject"): Promise<unknown> =>
  call(`/api/tasks/${enc(taskId)}/${action}`, { method: "POST" });

export const setAutomationLevel = (automationLevel: string): Promise<unknown> =>
  call("/api/config", { method: "PUT", ...json({ automationLevel }) });

export interface CreatedTask {
  id: string;
  status: "pending" | "awaiting-approval" | "running" | "done" | "failed" | "rejected";
  error?: string;
}

export const createTask = (body: { title: string; prompt: string; agentId: string; department: string }): Promise<CreatedTask> =>
  call<CreatedTask>("/api/tasks", { method: "POST", ...json({ ...body, lang: lang() }) });

export interface AssignResult {
  root: { id: string; status: string; result?: string };
  tree: Array<{ id: string; kind: string; level: number; assigneeName: string; status: string }>;
}

/** Giao việc theo tầng: Giám đốc → Trưởng phòng → Nhân viên (hoặc giao thẳng cho một người). Kèm ngôn ngữ để kết quả/lỗi đúng tiếng. */
export const assignWork = (prompt: string, toAgentId: string): Promise<AssignResult> =>
  call<AssignResult>("/api/org/assign", { method: "POST", ...json({ prompt, toAgentId, lang: lang() }) });

export const getConfig = (): Promise<{ cursorQuotaEnabled?: boolean; automationLevel?: string }> => call("/api/config");

export const putConfig = (patch: Record<string, unknown>): Promise<unknown> => call("/api/config", { method: "PUT", ...json(patch) });

export const emergencyStop = (): Promise<unknown> => call("/api/emergency-stop", { method: "POST" });

// ---------------------------------------------------------------- Lớp kinh tế (EAL)

export const economyPause = (): Promise<unknown> => call("/api/economy/pause", { method: "POST" });
export const economyResume = (): Promise<unknown> => call("/api/economy/resume", { method: "POST" });
export const economyScouts = (enabled: boolean): Promise<unknown> => call("/api/economy/scouts", { method: "POST", body: JSON.stringify({ enabled }) });

// ---------------------------------------------------------------- Studio dựng clip

export const studioCreate = (project: string): Promise<unknown> => call("/api/studio/projects", { method: "POST", ...json({ project }) });
export const studioRender = (project: string, opts: { voice?: boolean; preview?: boolean }): Promise<unknown> => call("/api/studio/render", { method: "POST", ...json({ project, ...opts }) });
export const studioCancel = (id: string): Promise<unknown> => call("/api/studio/cancel", { method: "POST", ...json({ id }) });
export const studioState = (): Promise<StudioState> => call("/api/studio/state");

// ---------------------------------------------------------------- kết nối AI

export interface AiStatusResponse {
  providers: ProviderStatus[];
  anyReady: boolean;
  /** Cách chọn nguồn: theo ưu tiên (mặc định) hoặc xoay vòng. */
  strategy?: RoutingStrategy;
}

/** Kết quả thao tác: `key` + `vars` để dịch; `message` chỉ là bản dự phòng. */
export interface ActionResult {
  ok: boolean;
  message: string;
  key?: string;
  vars?: Vars;
  latencyMs?: number;
  model?: string;
}

export const getAiStatus = (refresh = false): Promise<AiStatusResponse> => call(`/api/ai/status${refresh ? "?refresh=1" : ""}`);
export const refreshAi = (): Promise<AiStatusResponse> => call("/api/ai/refresh", { method: "POST" });
export const testAi = (id: string): Promise<ActionResult> => call(`/api/ai/${enc(id)}/test`, { method: "POST" });
export const setAiKey = (id: string, key: string): Promise<unknown> => call(`/api/ai/${enc(id)}/key`, { method: "PUT", ...json({ key }) });
export const clearAiKey = (id: string): Promise<unknown> => call(`/api/ai/${enc(id)}/key`, { method: "DELETE" });
export const setAiEnabled = (id: string, enabled: boolean): Promise<unknown> => call(`/api/ai/${enc(id)}/enabled`, { method: "POST", ...json({ enabled }) });
export const setAiModel = (id: string, model: string): Promise<unknown> => call(`/api/ai/${enc(id)}/model`, { method: "PUT", ...json({ model }) });
export const startOmniRoute = (): Promise<ActionResult> => call("/api/ai/omniroute/start", { method: "POST" });

/** Nút "+ Thêm API": nguồn AI tuỳ chỉnh (mọi điểm cuối tương thích OpenAI). */
export interface AiCustomPayload {
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  free?: boolean;
}
export interface AiCheckResult extends ActionResult {
  models?: string[];
}
export const checkAiCustom = (body: AiCustomPayload & { id?: string }): Promise<AiCheckResult> => call("/api/ai/custom/check", { method: "POST", ...json(body) });
export const addAiCustom = (body: AiCustomPayload): Promise<ProviderStatus> => call("/api/ai/custom", { method: "POST", ...json(body) });
export const updateAiCustom = (id: string, body: AiCustomPayload): Promise<ProviderStatus> => call(`/api/ai/custom/${enc(id)}`, { method: "PATCH", ...json(body) });
export const removeAiCustom = (id: string): Promise<unknown> => call(`/api/ai/custom/${enc(id)}`, { method: "DELETE" });
export const setAiOrder = (order: string[]): Promise<unknown> => call("/api/ai/order", { method: "PUT", ...json({ order }) });
export const setAiStrategy = (strategy: RoutingStrategy): Promise<unknown> => call("/api/ai/strategy", { method: "PUT", ...json({ strategy }) });

// ---------------------------------------------------------------- CRM, email, lịch

export const getCrmSummary = (): Promise<CrmSummary> => call("/api/crm/summary");
export const listContacts = (q = ""): Promise<Contact[]> => call(`/api/crm/contacts${q.trim() ? `?q=${enc(q.trim())}` : ""}`);
export const listDeals = (): Promise<Deal[]> => call("/api/crm/deals");
export const addContact = (body: { name: string; email?: string; company?: string }): Promise<Contact> =>
  call("/api/crm/contacts", { method: "POST", ...json(body) });
export const addDeal = (body: { title: string; value?: number; contactId?: number }): Promise<Deal> =>
  call("/api/crm/deals", { method: "POST", ...json(body) });
export const moveDeal = (id: number, stage: DealStage): Promise<Deal> => call(`/api/crm/deals/${id}`, { method: "PATCH", ...json({ stage }) });
export const listDrafts = (): Promise<EmailDraft[]> => call("/api/mail/drafts");
export const listEvents = (): Promise<CalendarEvent[]> => call("/api/calendar/events");

export const getMailConfig = (): Promise<MailPublicConfig> => call("/api/mail/config");
export const putMailConfig = (body: {
  smtp?: { host: string; port: number; secure: boolean; user: string; from?: string };
  imap?: { host: string; port: number; secure: boolean; user: string };
  smtpPass?: string;
  imapPass?: string;
}): Promise<MailPublicConfig> => call("/api/mail/config", { method: "PUT", ...json(body) });

export const getGithubStatus = (): Promise<{ hasToken: boolean }> => call("/api/github/status");
export const putGithubToken = (token: string): Promise<{ hasToken: boolean }> => call("/api/github/token", { method: "PUT", ...json({ token }) });

// ---------------------------------------------------------------- sức khoẻ, mạng LAN, token

export interface Health {
  ok: boolean;
  version: string;
  uptimeSec: number;
  memoryMb: number;
  emergency: boolean;
  lan: boolean;
  db: { ok: boolean };
  /** `names` (nhãn hiển thị) song song với `providers` (id); máy chủ bản cũ không có. */
  ai: { ready: boolean; providers: string[]; names?: string[]; total: number };
  pendingActions: number;
}

export const getHealth = (): Promise<Health> => call("/api/health");

// ---------------------------------------------------------------- việc lặp lại

export const listSchedules = (): Promise<ScheduleView[]> => call("/api/schedules");
export const createSchedule = (body: { title: string; prompt: string; toAgentId?: string; frequency: Frequency; at: string; weekday?: number; lang?: string }): Promise<ScheduleView> =>
  call("/api/schedules", { method: "POST", ...json(body) });
export const setScheduleEnabled = (id: string, enabled: boolean): Promise<ScheduleView> => call(`/api/schedules/${enc(id)}`, { method: "PATCH", ...json({ enabled }) });
export const deleteSchedule = (id: string): Promise<unknown> => call(`/api/schedules/${enc(id)}`, { method: "DELETE" });
export const runScheduleNow = (id: string): Promise<ScheduleView> => call(`/api/schedules/${enc(id)}/run`, { method: "POST" });

/** Khôi phục từ nội dung tệp sao lưu (gửi dạng văn bản thô — server kiểm schema; chỉ chính máy chạy ứng dụng). */
export const restoreBackup = (text: string): Promise<{ ok: boolean; counts: BackupCounts }> =>
  call("/api/backup/restore", { method: "POST", body: text, headers: { "content-type": "text/plain" } });

/** Nhật ký bảo mật (chỉ chính máy chạy ứng dụng). */
export const getAudit = (limit = 50): Promise<AuditEntry[]> => call(`/api/audit?limit=${limit}`);

export interface AuthInfo {
  lan: boolean;
  tokenRequiredHere: boolean;
  token: string;
  urls: string[];
  restartRequired: boolean;
}

/** Chỉ trả lời cho chính máy chạy ứng dụng; máy khác nhận 403 `loopbackOnly`. */
export const getAuthInfo = (): Promise<AuthInfo> => call("/api/auth/info");
export const rotateToken = (): Promise<{ token: string }> => call("/api/auth/rotate", { method: "POST" });
export const setLan = (lan: boolean): Promise<{ lan: boolean; restartRequired: boolean }> => call("/api/network", { method: "POST", ...json({ lan }) });
