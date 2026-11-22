/**
 * Quản lý nhân vật trong văn phòng 3D + trạng thái hiển thị.
 *
 * Mỗi nhân vật thuộc một phòng ban; vị trí 3D được tính từ tâm phòng + lệch cụ thể.
 */
import { DEPARTMENTS, type DepartmentId } from "./departments.js";
import type { Tier } from "../../shared/officeEntity.js";

export type AgentStatus = "idle" | "working" | "researching" | "learning" | "waiting" | "blocked" | "stopped";

export interface AgentState {
  id: string;
  name: string;
  role: string;
  department: DepartmentId;
  /** Tầng trong công ty: 1 Giám đốc, 2 Trưởng phòng, 3 Nhân viên. */
  tier: Tier;
  /** Id cấp trên trực tiếp (Giám đốc không có). */
  reportsTo?: string;
  status: AgentStatus;
  /** Trang web hiện tại đang mở (hiển thị trong 3D). */
  currentUrl?: string;
  currentTitle?: string;
  task?: string;
  /** Khoá i18n + biến của `task` khi đó là nhãn do hệ thống sinh (vd. "Phân việc: ...") — client dịch. */
  taskKey?: string;
  taskVars?: Record<string, string | number>;
  /** Lệch vị trí so với tâm phòng. */
  offset: { x: number; z: number };
  position: { x: number; z: number };
  color: string;
  skills: number;
  learned: number;
  /** Token đã dùng hôm nay. */
  tokensUsed: number;
  /** Số tác vụ đã chạy hôm nay. */
  tasksDone: number;
}

interface AgentDef {
  id: string;
  name: string;
  role: string;
  department: DepartmentId;
  tier: Tier;
  reportsTo?: string;
  offset: { x: number; z: number };
  color: string;
}

/** Trưởng phòng ngồi bên trái, nhân viên bên phải — cùng một hàng, hai bàn không chồng nhau. */
const HEAD = { x: -1.0, z: 0.4 };
const STAFF = { x: 1.0, z: 0.4 };

/**
 * Sơ đồ tổ chức (dữ liệu thuần): Giám đốc → Trưởng phòng → Nhân viên.
 * Trưởng phòng giữ id cũ (mai, long, ...) để không phá dữ liệu/lịch sử sẵn có.
 */
const DEFS: AgentDef[] = [
  { id: "giamdoc", name: "Hùng", role: "Giám đốc điều hành", department: "executive", tier: 1, offset: { x: 0, z: 0.4 }, color: "#e5c158" },

  { id: "mai", name: "Mai", role: "Trưởng phòng Khách hàng", department: "support", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#4f9cf9" },
  { id: "long", name: "Long", role: "Trưởng phòng Bán hàng", department: "sales", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#f7b32b" },
  { id: "huy", name: "Huy", role: "Trưởng phòng Marketing", department: "marketing", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#ef6f8e" },
  { id: "thu", name: "Thu", role: "Trưởng phòng Tài chính", department: "finance", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#43c59e" },
  { id: "ban", name: "Ban", role: "Trưởng phòng Đội AI", department: "ai-team", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#8f7bf0" },
  { id: "an", name: "An", role: "Trưởng phòng Làm việc tự động", department: "automation", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#3fb6c8" },
  { id: "tri", name: "Tri", role: "Trưởng phòng Thư viện", department: "library", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#d0a35c" },
  { id: "minh", name: "Minh", role: "Trưởng phòng Giao việc & triển khai", department: "dispatch", tier: 2, reportsTo: "giamdoc", offset: HEAD, color: "#6fd67a" },

  { id: "linh", name: "Linh", role: "Chăm sóc khách hàng", department: "support", tier: 3, reportsTo: "mai", offset: STAFF, color: "#7cb6fb" },
  { id: "nam", name: "Nam", role: "Nhân viên bán hàng", department: "sales", tier: 3, reportsTo: "long", offset: STAFF, color: "#f9c85e" },
  { id: "ha", name: "Hà", role: "Nhân viên nội dung", department: "marketing", tier: 3, reportsTo: "huy", offset: STAFF, color: "#f393ac" },
  { id: "phuc", name: "Phúc", role: "Nhân viên kế toán", department: "finance", tier: 3, reportsTo: "thu", offset: STAFF, color: "#6fd6b3" },
  { id: "khoa", name: "Khoa", role: "Kỹ sư agent", department: "ai-team", tier: 3, reportsTo: "ban", offset: STAFF, color: "#b0a1f5" },
  { id: "bao", name: "Bảo", role: "Nhân viên nghiên cứu web", department: "automation", tier: 3, reportsTo: "an", offset: STAFF, color: "#6fcbd8" },
  { id: "chi", name: "Chi", role: "Nhân viên thư viện", department: "library", tier: 3, reportsTo: "tri", offset: STAFF, color: "#e0bf86" },
  { id: "duc", name: "Đức", role: "Lập trình viên", department: "dispatch", tier: 3, reportsTo: "minh", offset: STAFF, color: "#93e09b" },
];

export class AgentRegistry {
  private agents = new Map<string, AgentState>();

  constructor() {
    for (const d of DEFS) {
      const dept = DEPARTMENTS.find((x) => x.id === d.department)!;
      this.agents.set(d.id, {
        id: d.id,
        name: d.name,
        role: d.role,
        department: d.department,
        tier: d.tier,
        reportsTo: d.reportsTo,
        status: "idle",
        offset: d.offset,
        position: { x: dept.center.x + d.offset.x, z: dept.center.z + d.offset.z },
        color: d.color,
        skills: 0,
        learned: 0,
        tokensUsed: 0,
        tasksDone: 0,
      });
    }
  }

  list(): AgentState[] {
    return [...this.agents.values()];
  }

  get(id: string): AgentState | null {
    return this.agents.get(id) ?? null;
  }

  /** Nhân vật thuộc một phòng ban. */
  listByDepartment(department: string): AgentState[] {
    return this.list().filter((a) => a.department === department);
  }

  /** Nhân vật phụ trách của phòng (trừ "bạn"). */
  leadOf(department: string): AgentState | null {
    const d = DEPARTMENTS.find((x) => x.id === department);
    if (!d || !d.leadId) return null;
    return this.get(d.leadId);
  }

  update(id: string, patch: Partial<AgentState>): AgentState | null {
    const a = this.agents.get(id);
    if (!a) return null;
    Object.assign(a, patch);
    return a;
  }

  setStatus(id: string, status: AgentStatus, task?: string, i18n?: { key: string; vars?: Record<string, string | number> }): AgentState | null {
    return this.update(id, { status, task, taskKey: i18n?.key, taskVars: i18n?.vars });
  }

  setBrowsing(id: string, url: string, title?: string): AgentState | null {
    return this.update(id, { status: "researching", currentUrl: url, currentTitle: title });
  }

  /** Ghi nhận một lượt hoàn thành: cộng token và số tác vụ. */
  recordUsage(id: string, tokens: number): AgentState | null {
    const a = this.agents.get(id);
    if (!a) return null;
    a.tokensUsed += tokens;
    a.tasksDone += 1;
    return a;
  }
}
