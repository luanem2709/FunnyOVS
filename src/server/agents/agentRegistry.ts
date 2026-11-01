/**
 * Quản lý nhân vật trong văn phòng 3D + trạng thái hiển thị.
 *
 * Mỗi nhân vật thuộc một phòng ban; vị trí 3D được tính từ tâm phòng + lệch cụ thể.
 */
import { DEPARTMENTS, type DepartmentId } from "./departments.js";

export type AgentStatus = "idle" | "working" | "researching" | "learning" | "waiting" | "blocked" | "stopped";

export interface AgentState {
  id: string;
  name: string;
  role: string;
  department: DepartmentId;
  status: AgentStatus;
  /** Trang web hiện tại đang mở (hiển thị trong 3D). */
  currentUrl?: string;
  currentTitle?: string;
  task?: string;
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
  offset: { x: number; z: number };
  color: string;
}

const DEFS: AgentDef[] = [
  { id: "mai", name: "Mai", role: "Chăm sóc khách hàng", department: "support", offset: { x: 0, z: 1.2 }, color: "#4f9cf9" },
  { id: "long", name: "Long", role: "Phễu bán hàng", department: "sales", offset: { x: 0, z: 1.2 }, color: "#f7b32b" },
  { id: "huy", name: "Huy", role: "Nội dung & xu hướng", department: "marketing", offset: { x: 0, z: 1.2 }, color: "#ef6f8e" },
  { id: "thu", name: "Thu", role: "Sổ sách & báo cáo", department: "finance", offset: { x: 0, z: 1.2 }, color: "#43c59e" },
  { id: "ban", name: "Ban", role: "Điều phối AI", department: "ai-team", offset: { x: 0, z: 1.4 }, color: "#8f7bf0" },
  { id: "an", name: "An", role: "Nghiên cứu web", department: "automation", offset: { x: 0, z: 1.2 }, color: "#3fb6c8" },
  { id: "tri", name: "Tri", role: "Tri thức & bài học", department: "library", offset: { x: 0, z: 1.2 }, color: "#d0a35c" },
  { id: "minh", name: "Minh", role: "Lập trình & triển khai", department: "dispatch", offset: { x: -2.4, z: 1.6 }, color: "#6fd67a" },
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

  setStatus(id: string, status: AgentStatus, task?: string): AgentState | null {
    return this.update(id, { status, task });
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
