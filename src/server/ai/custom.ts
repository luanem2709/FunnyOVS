/**
 * Nhà cung cấp AI do NGƯỜI DÙNG thêm (nút "+ Thêm API"): mọi điểm cuối tương thích OpenAI — Together, DeepSeek, một máy chủ vLLM/LiteLLM trong mạng nội bộ,
 * một khoá thứ hai của cùng nhà cung cấp để gộp hạn mức miễn phí... Tất cả được gom vào cùng bộ router như các nguồn dựng sẵn.
 *
 * File này chỉ chứa phần thuần (kiểm tra đầu vào, sinh id, dựng định nghĩa) để kiểm thử độc lập; lưu trữ và dò nằm ở `hub.ts`.
 * Khoá API KHÔNG nằm trong bản ghi (lưu ở kho khoá 0600 dưới tên `ai.<id>.key`).
 */
import { ValidationError } from "../../shared/validation.js";
import { MAX_CUSTOM_PROVIDERS } from "../../shared/ai.js";
import type { ProviderDef } from "./types.js";

export { MAX_CUSTOM_PROVIDERS };

/** Bản ghi lưu trong `ai.json` (không có khoá). */
export interface CustomRecord {
  id: string;
  label: string;
  baseUrl: string;
  /** Model mặc định; bỏ trống = lấy từ `/models`. */
  model?: string;
  /** Chỉ để hiện nhãn "Miễn phí" cho người dùng biết nguồn nào không tốn tiền. */
  free: boolean;
}

export interface CustomInput {
  label: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  free: boolean;
}

const MAX_LABEL = 40;
const MAX_URL = 300;
const MAX_KEY = 500;
const MAX_MODEL = 120;

/**
 * Chuẩn hoá địa chỉ gốc: chỉ http/https, không kèm tài khoản, bỏ query/hash và dấu `/` cuối.
 * (Nhiều nhà cung cấp cần đuôi `/v1` — người dùng nhập đúng như tài liệu của họ; nút "Kiểm tra" sẽ báo nếu sai.)
 */
export function normalizeBaseUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) throw new ValidationError("val.ai.baseUrlRequired");
  if (s.length > MAX_URL) throw new ValidationError("val.ai.baseUrlInvalid");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ValidationError("val.ai.baseUrlInvalid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ValidationError("val.ai.baseUrlProtocol");
  if (u.username || u.password) throw new ValidationError("val.ai.baseUrlCredentials");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

function text(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

/** Kiểm tra đầu vào thêm/sửa. `partial` = khi sửa, trường nào không gửi thì giữ nguyên (trả về `undefined` cho trường đó). */
export function normalizeCustomInput(raw: unknown, opts: { partial?: boolean } = {}): CustomInput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = text(o.label, MAX_LABEL + 1);
  if (!opts.partial || o.label !== undefined) {
    if (!label) throw new ValidationError("val.ai.labelRequired");
    if (label.length > MAX_LABEL) throw new ValidationError("val.ai.labelTooLong", { max: MAX_LABEL });
  }
  const apiKey = text(o.apiKey, MAX_KEY + 1);
  if (apiKey.length > MAX_KEY) throw new ValidationError("val.ai.keyTooLong", { max: MAX_KEY });
  const model = text(o.model, MAX_MODEL);
  return {
    label,
    baseUrl: !opts.partial || o.baseUrl !== undefined ? normalizeBaseUrl(o.baseUrl) : "",
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    free: o.free === true,
  };
}

/** Id không trùng danh mục dựng sẵn: `u-<tên không dấu>-<4 ký tự ngẫu nhiên>`. */
export function newCustomId(label: string, taken: ReadonlySet<string>, rand: () => number = Math.random): string {
  const slug =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // bỏ dấu kết hợp sau khi tách (NFD)
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20)
      .replace(/-+$/g, "") || "api";
  for (let i = 0; i < 50; i++) {
    const id = `u-${slug}-${Math.floor(rand() * 36 ** 4)
      .toString(36)
      .padStart(4, "0")}`;
    if (!taken.has(id)) return id;
  }
  return `u-${slug}-${Date.now().toString(36)}`;
}

/** Bản ghi → định nghĩa nhà cung cấp cho router. Ưu tiên mặc định nằm sau các nguồn dựng sẵn; người dùng sắp xếp lại được. */
export function customToDef(rec: CustomRecord, index: number): ProviderDef {
  return {
    id: rec.id,
    label: rec.label,
    kind: "custom",
    baseUrl: rec.baseUrl,
    keyEnv: [],
    needsKey: false,
    defaultModel: rec.model || undefined,
    free: rec.free,
    jsonMode: false,
    priority: 100 + index,
    custom: true,
  };
}

/** Đọc lại bản ghi từ `ai.json` (bỏ mọi mục sai hình dạng, không ném lỗi). */
export function parseCustomRecords(raw: unknown): CustomRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomRecord[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^u-[a-z0-9-]{1,40}$/.test(o.id) || seen.has(o.id)) continue;
    if (typeof o.label !== "string" || !o.label.trim() || typeof o.baseUrl !== "string") continue;
    try {
      const baseUrl = normalizeBaseUrl(o.baseUrl);
      seen.add(o.id);
      out.push({ id: o.id, label: o.label.trim().slice(0, MAX_LABEL), baseUrl, model: typeof o.model === "string" && o.model.trim() ? o.model.trim().slice(0, MAX_MODEL) : undefined, free: o.free === true });
    } catch {
      /* bản ghi hỏng: bỏ qua */
    }
    if (out.length >= MAX_CUSTOM_PROVIDERS) break;
  }
  return out;
}
