/**
 * Sơ đồ tổ chức + bộ định tuyến công việc (rule-based, không tốn token).
 *
 * Mô hình: Giám đốc → Trưởng phòng → Nhân viên. Việc đi xuống theo đường báo cáo, độ sâu cố định 3 tầng,
 * không có vòng lặp giao việc ngược lên (hub-and-spoke).
 *
 * Ý tưởng tham khảo (chỉ ý tưởng, không sao chép mã): sơ đồ tổ chức là dữ liệu thuần và giới hạn độ sâu
 * (abh2050/agent-org-chart); trưởng bộ phận tách yêu cầu nhiều phòng thành từng phần
 * (kevmurr57/knownow-office-agents); cây tác vụ có nghiệm thu ở mỗi cấp (1mancompany/OneManCompany, Apache-2.0).
 * Xem NOTICE.md.
 */
import { DEPARTMENTS } from "../agents/departments.js";
import type { AgentState } from "../agents/agentRegistry.js";

/** Bỏ dấu tiếng Việt + chữ thường để so khớp từ khoá. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

/** Từ khoá (đã bỏ dấu) → phòng ban. Có thể mở rộng/đổi trong một nơi duy nhất. */
export const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  support: ["khach hang", "ho tro", "cskh", "phan hoi", "khieu nai", "tra loi khach", "email khach", "ticket", "support", "customer"],
  sales: ["ban hang", "chot don", "doanh so", "pheu", "funnel", "lead", "khach tiem nang", "bao gia", "sales", "pipeline"],
  marketing: ["marketing", "noi dung", "bai dang", "quang cao", "seo", "chien dich", "social", "facebook", "tiktok", "content", "thuong hieu", "brand"],
  finance: ["tai chinh", "doanh thu", "chi phi", "bao cao", "thue", "ngan sach", "hoa don", "ke toan", "loi nhuan", "finance", "budget"],
  "ai-team": ["agent", "mo hinh", "model", "prompt", "ai", "llm", "dieu phoi"],
  automation: ["tu dong", "duyet web", "nghien cuu web", "crawl", "scrape", "trinh duyet", "browser", "tim hieu tren mang"],
  library: ["thu vien", "tri thuc", "ghi chu", "tai lieu", "bai hoc", "kien thuc", "knowledge", "tong hop tai lieu"],
  dispatch: ["lap trinh", "code", "trien khai", "bug", "loi phan mem", "deploy", "github", "api"],
};

/** Phòng nhận việc khi không khớp từ khoá nào. */
export const DEFAULT_DEPARTMENT = "dispatch";
export const MAX_DEPARTMENTS_PER_REQUEST = 4;

function hasKeyword(text: string, kw: string): boolean {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
}

export interface PlanItem {
  department: string;
  /** Các từ khoá đã khớp (để người dùng thấy vì sao việc đi vào phòng này). */
  matched: string[];
}

/** Giám đốc tách một yêu cầu thành phần việc cho từng phòng. Ổn định: cùng đầu vào → cùng kết quả. */
export function planDepartments(prompt: string): PlanItem[] {
  const text = normalizeText(prompt);
  const scored: Array<PlanItem & { score: number; order: number }> = [];
  let order = 0;
  for (const [department, kws] of Object.entries(DEPARTMENT_KEYWORDS)) {
    const matched = kws.filter((k) => hasKeyword(text, k));
    if (matched.length) scored.push({ department, matched, score: matched.length, order });
    order++;
  }
  if (scored.length === 0) return [{ department: DEFAULT_DEPARTMENT, matched: [] }];
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, MAX_DEPARTMENTS_PER_REQUEST).map(({ department, matched }) => ({ department, matched }));
}

export function departmentName(id: string): string {
  return DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
}

export function headOf(agents: AgentState[], department: string): AgentState | undefined {
  return agents.find((a) => a.department === department && a.tier === 2);
}

export function staffOf(agents: AgentState[], department: string): AgentState[] {
  return agents.filter((a) => a.department === department && a.tier === 3);
}

export function directorOf(agents: AgentState[]): AgentState | undefined {
  return agents.find((a) => a.tier === 1);
}

/** Cấp dưới trực tiếp của một agent (để vẽ sơ đồ). */
export function reportsOf(agents: AgentState[], id: string): AgentState[] {
  return agents.filter((a) => a.reportsTo === id);
}

/**
 * Trưởng phòng chọn người làm: nhân viên ít việc nhất; nếu mọi nhân viên đều đang bận hơn
 * (≥ `STAFF_BUSY`) và trưởng phòng rảnh hơn thì trưởng phòng tự làm; không có nhân viên thì tự làm.
 */
export const STAFF_BUSY = 2;

export function pickAssignee(agents: AgentState[], department: string, load: (agentId: string) => number): AgentState {
  const head = headOf(agents, department);
  const staff = staffOf(agents, department);
  if (staff.length === 0 && head) return head;
  const sorted = [...staff].sort((a, b) => load(a.id) - load(b.id));
  const best = sorted[0];
  if (head && best && load(best.id) >= STAFF_BUSY && load(head.id) < load(best.id)) return head;
  return best ?? head ?? agents[0];
}
