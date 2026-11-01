/**
 * Quản lý nhân vật trong văn phòng 3D + trạng thái hiển thị.
 */
export type AgentStatus = "idle" | "working" | "researching" | "learning" | "waiting" | "blocked";

export interface AgentState {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  /** Trang web hiện tại đang mở (hiển thị trong 3D). */
  currentUrl?: string;
  currentTitle?: string;
  task?: string;
  position: { x: number; z: number };
  color: string;
  skills: number;
  learned: number;
}

export class AgentRegistry {
  private agents = new Map<string, AgentState>();

  constructor() {
    const defs: Array<Omit<AgentState, "status" | "skills" | "learned">> = [
      { id: "ana", name: "Ana", role: "Nghiên cứu", position: { x: -3.2, z: -1.5 }, color: "#4f9cf9" },
      { id: "bob", name: "Bob", role: "Lập trình", position: { x: 0, z: -1.5 }, color: "#43c59e" },
      { id: "cleo", name: "Cleo", role: "Phân tích", position: { x: 3.2, z: -1.5 }, color: "#f7b32b" },
    ];
    for (const d of defs) {
      this.agents.set(d.id, { ...d, status: "idle", skills: 0, learned: 0 });
    }
  }

  list(): AgentState[] {
    return [...this.agents.values()];
  }

  get(id: string): AgentState | null {
    return this.agents.get(id) ?? null;
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
}
