/**
 * Schema hành động có kiểu (GĐ 4).
 *
 * Nguyên tắc: **LLM chỉ ĐỀ XUẤT**, không bao giờ tự chạy. Mọi hành động phải
 * đi qua schema này để biến JSON tự do (do model sinh) thành hành động có
 * kiểu, có kiểm tra. Executor mới là nơi quyết định chạy hay chặn.
 *
 * Mọi trường đều bị ràng buộc:
 *  - `command` / `path` bị giới hạn độ dài và ký tự.
 *  - `text` bị giới hạn độ dài (tránh đẩy dữ liệu vô hạn ra ngoài).
 *  - Không có hành động "raw shell" — chỉ có hành động đã định nghĩa.
 */
import { z } from "zod";

/** Cấp quyền đang hiện hành khi Executor kiểm tra. */
export type PermissionLevel = "sandbox" | "granted" | "full";

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  sandbox: "Sandbox (mặc định)",
  granted: "Được cấp",
  full: "Toàn quyền",
};

/** Mô tả 1 hành động (dùng cho nhật ký + UI xem lại). */
export interface ActionSchemaDoc {
  type: ActionType;
  description: string;
  /** Hành động này có nguy hiểm không (cần hỏi lại ở Cấp 2/3). */
  dangerous: boolean;
  /** Cần hỏi duyệt người dùng kể cả ở Cấp 3 (việc khó hoàn tác). */
  alwaysAsk?: boolean;
  /** Hành động làm nhiễm phiên (đọc nội dung không tin cậy). */
  tainting?: boolean;
  params: Record<string, string>;
}

export type ActionType =
  | "run_command"
  | "read_file"
  | "write_file"
  | "list_dir"
  | "delete_file"
  | "move_to_trash"
  | "open_app"
  | "click"
  | "type_text"
  | "key_press"
  | "screenshot"
  | "search_files"
  | "http_request"
  | "wait";

/** Schema tham số cho từng loại hành động. */
const actionSchemas = {
  // Chạy lệnh (PowerShell trên Windows). `cwd` tương đối so với workspace.
  run_command: z.object({
    command: z.string().min(1).max(2000),
    cwd: z.string().max(512).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
  }),

  read_file: z.object({
    path: z.string().min(1).max(1024),
  }),

  write_file: z.object({
    path: z.string().min(1).max(1024),
    content: z.string().max(2_000_000),
    /** Ghi đè hay nối thêm. */
    mode: z.enum(["overwrite", "append"]).optional(),
  }),

  list_dir: z.object({
    path: z.string().min(1).max(1024),
  }),

  delete_file: z.object({
    path: z.string().min(1).max(1024),
    /** Bỏ qua hẳn vào Thùng rác (mặc định ở Cấp 2/3). */
    toTrash: z.boolean().optional(),
  }),

  move_to_trash: z.object({
    path: z.string().min(1).max(1024),
  }),

  open_app: z.object({
    app: z.string().min(1).max(256),
    args: z.array(z.string().max(512)).max(32).optional(),
  }),

  click: z.object({
    x: z.number().int().min(0).max(20_000),
    y: z.number().int().min(0).max(20_000),
    button: z.enum(["left", "right", "middle"]).optional(),
    clicks: z.number().int().min(1).max(3).optional(),
  }),

  type_text: z.object({
    text: z.string().max(4_000),
  }),

  key_press: z.object({
    /** Tên phím: a, enter, ctrl+c… */
    key: z.string().min(1).max(64),
    modifiers: z.array(z.enum(["ctrl", "alt", "shift", "win"])).max(4).optional(),
  }),

  screenshot: z.object({
    /** Vùng chụp (tọa độ màn hình). */
    region: z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() }).optional(),
  }),

  search_files: z.object({
    root: z.string().max(1024).optional(),
    pattern: z.string().min(1).max(512),
    maxResults: z.number().int().min(1).max(500).optional(),
  }),

  http_request: z.object({
    url: z.string().min(1).max(2048),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "HEAD"]).optional(),
    body: z.string().max(200_000).optional(),
  }),

  wait: z.object({
    ms: z.number().int().min(0).max(60_000),
  }),
} as const;

export type ActionParams = {
  run_command: z.infer<typeof actionSchemas.run_command>;
  read_file: z.infer<typeof actionSchemas.read_file>;
  write_file: z.infer<typeof actionSchemas.write_file>;
  list_dir: z.infer<typeof actionSchemas.list_dir>;
  delete_file: z.infer<typeof actionSchemas.delete_file>;
  move_to_trash: z.infer<typeof actionSchemas.move_to_trash>;
  open_app: z.infer<typeof actionSchemas.open_app>;
  click: z.infer<typeof actionSchemas.click>;
  type_text: z.infer<typeof actionSchemas.type_text>;
  key_press: z.infer<typeof actionSchemas.key_press>;
  screenshot: z.infer<typeof actionSchemas.screenshot>;
  search_files: z.infer<typeof actionSchemas.search_files>;
  http_request: z.infer<typeof actionSchemas.http_request>;
  wait: z.infer<typeof actionSchemas.wait>;
};

/** Hành động đã được kiểm tra kiểu. */
export interface Action {
  type: ActionType;
  params: ActionParams[ActionType];
  /** Mô tả ngắn để người dùng đọc khi duyệt. */
  description: string;
}

/** Kết quả parse. */
export type ParseResult =
  | { ok: true; action: Action }
  | { ok: false; error: string };

/**
 * Parse JSON do LLM sinh thành hành động có kiểu.
 *
 * Chấp nhận cả 2 dạng:
 *   - `{"type": "read_file", "params": {...}}`
 *   - `{"type": "read_file", "path": "..."}` (params nằm ngang cấp)
 */
export function parseAction(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Hành động phải là một object JSON." };
  }
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== "string" || !(type in actionSchemas)) {
    return {
      ok: false,
      error: `Loại hành động không hợp lệ: ${String(type)}. Cho phép: ${Object.keys(actionSchemas).join(", ")}.`,
    };
  }
  const schema = actionSchemas[type as ActionType];
  const params = { ...(raw.params as Record<string, unknown> | undefined) };
  // Gộp tham số nằm ngang cấp vào `params` (trừ `type`).
  for (const [k, v] of Object.entries(raw)) {
    if (k === "type" || k === "params" || k === "description" || k === "reason") continue;
    if (!(k in params)) params[k] = v;
  }

  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Tham số không hợp lệ cho "${type}": ${issue.path.join(".") || "(gốc)"} — ${issue.message}`,
    };
  }

  return {
    ok: true,
    action: {
      type: type as ActionType,
      params: parsed.data as ActionParams[ActionType],
      description: typeof raw.description === "string" ? raw.description : describe(type as ActionType, parsed.data),
    },
  };
}

/** Mô tả ngắn bằng tiếng Việt để hiển thị khi xin duyệt. */
export function describe(type: ActionType, params: unknown): string {
  const p = params as Record<string, unknown>;
  switch (type) {
    case "run_command":
      return `Chạy lệnh: ${String(p.command).slice(0, 120)}`;
    case "read_file":
      return `Đọc file: ${String(p.path)}`;
    case "write_file":
      return `Ghi file: ${String(p.path)}`;
    case "list_dir":
      return `Liệt kê thư mục: ${String(p.path)}`;
    case "delete_file":
      return `Xóa: ${String(p.path)}`;
    case "move_to_trash":
      return `Chuyển vào Thùng rác: ${String(p.path)}`;
    case "open_app":
      return `Mở ứng dụng: ${String(p.app)}`;
    case "click":
      return `Bấm chuột tại (${p.x}, ${p.y})`;
    case "type_text":
      return `Gõ văn bản (${String(p.text).length} ký tự)`;
    case "key_press":
      return `Nhấn phím: ${String(p.key)}`;
    case "screenshot":
      return "Chụp màn hình";
    case "search_files":
      return `Tìm file: ${String(p.pattern)}`;
    case "http_request":
      return `Gọi HTTP ${String(p.method ?? "GET")} ${String(p.url).slice(0, 100)}`;
    case "wait":
      return `Chờ ${String(p.ms)} ms`;
    default:
      return type;
  }
}

/** Tài liệu schema (để đưa cho LLM + hiển thị trong UI). */
export const ACTION_DOCS: ActionSchemaDoc[] = [
  { type: "run_command", description: "Chạy một lệnh PowerShell", dangerous: true, params: { command: "string", cwd: "string?", timeoutMs: "number?" } },
  { type: "read_file", description: "Đọc nội dung file", dangerous: false, tainting: true, params: { path: "string" } },
  { type: "write_file", description: "Ghi file", dangerous: true, params: { path: "string", content: "string", mode: "overwrite|append?" } },
  { type: "list_dir", description: "Liệt kê thư mục", dangerous: false, params: { path: "string" } },
  { type: "delete_file", description: "Xóa file/thư mục", dangerous: true, params: { path: "string", toTrash: "boolean?" } },
  { type: "move_to_trash", description: "Chuyển file/thư mục vào Thùng rác", dangerous: true, params: { path: "string" } },
  { type: "open_app", description: "Mở ứng dụng trên máy", dangerous: true, params: { app: "string", args: "string[]?" } },
  { type: "click", description: "Di chuyển chuột và bấm", dangerous: true, params: { x: "number", y: "number", button: "left|right|middle?", clicks: "number?" } },
  { type: "type_text", description: "Gõ văn bản qua bàn phím", dangerous: true, params: { text: "string" } },
  { type: "key_press", description: "Nhấn phím/tổ hợp phím", dangerous: true, params: { key: "string", modifiers: "string[]?" } },
  { type: "screenshot", description: "Chụp màn hình", dangerous: false, params: { region: "{x,y,w,h}?" } },
  { type: "search_files", description: "Tìm file theo mẫu tên", dangerous: false, params: { root: "string?", pattern: "string", maxResults: "number?" } },
  { type: "http_request", description: "Gọi HTTP (đã qua bộ lọc SSRF)", dangerous: true, tainting: true, params: { url: "string", method: "string?", body: "string?" } },
  { type: "wait", description: "Chờ", dangerous: false, params: { ms: "number" } },
];

/** Lấy tài liệu của một loại hành động. */
export function actionDoc(type: ActionType): ActionSchemaDoc | undefined {
  return ACTION_DOCS.find((d) => d.type === type);
}
