/**
 * L2 — State store (Zustand) cho văn phòng hợp nhất.
 *
 * `applyOfficeEvent` là hàm thuần (dễ test): nhận state + OfficeEvent, trả state mới.
 * Store chỉ là lớp mỏng bọc quanh hàm đó.
 */
import { create } from "zustand";
import type { EntityStatus, LogLevel, OfficeEntity, OfficeEvent, OrgNode } from "../../../shared/officeEntity.js";
import type { EconomyState } from "../../../shared/economy.js";
import type { StudioState } from "../../../shared/studio.js";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface LogItem {
  id: number;
  entityId?: string;
  level: LogLevel;
  text: string;
  key?: string;
  vars?: Record<string, string | number>;
  extra?: string;
  extraKey?: string;
  extraVars?: Record<string, string | number>;
  at: string;
}

export interface ApprovalItem {
  id: string;
  entityId: string;
  kind: "permission" | "token" | "action";
  summary: string;
  key?: string;
  vars?: Record<string, string | number>;
  detail?: string;
  detailKey?: string;
  detailVars?: Record<string, string | number>;
  at: string;
}

/** Thay đổi trạng thái vừa xảy ra — renderer dùng để bắn hiệu ứng một lần. */
export interface StatusChange {
  seq: number;
  id: string;
  from: EntityStatus;
  to: EntityStatus;
}

export interface DepartmentLite {
  id: string;
  name: string;
  short: string;
  leadId: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
  floor: number;
  props: string[];
}

export interface BudgetLite {
  total: { used: number; limit: number };
  weekly: { used: number; limit: number };
  learning: { used: number; limit: number };
  locked: boolean;
}

export const MAX_LOGS = 300;

export interface OfficeData {
  entities: Record<string, OfficeEntity>;
  approvals: Record<string, ApprovalItem>;
  /** Cây giao việc theo tầng (id nút → nút). */
  org: Record<string, OrgNode>;
  logs: LogItem[];
  lastChange: StatusChange | null;
  /** Đã nhận ít nhất một snapshot (phân biệt "đang tải" với "trống"). */
  loaded: boolean;
  /** DỪNG KHẨN CẤP đang bật. */
  emergency: boolean;
  /** Trạng thái Lớp kinh tế (EAL); null = chưa nhận. */
  economy: EconomyState | null;
  /** Trạng thái Studio dựng clip; null = chưa nhận. */
  studio: StudioState | null;
  logSeq: number;
  changeSeq: number;
}

export const emptyData = (): OfficeData => ({
  entities: {},
  approvals: {},
  org: {},
  logs: [],
  lastChange: null,
  loaded: false,
  emergency: false,
  economy: null,
  studio: null,
  logSeq: 0,
  changeSeq: 0,
});

/** Áp một sự kiện lên dữ liệu; luôn trả về object mới khi có thay đổi. */
export function applyOfficeEvent(d: OfficeData, ev: OfficeEvent): OfficeData {
  switch (ev.type) {
    case "snapshot": {
      const entities: Record<string, OfficeEntity> = {};
      for (const e of ev.entities) entities[e.id] = e;
      // Duyệt đang chờ mà entity không còn thì bỏ (sau khi kết nối lại).
      const approvals: Record<string, ApprovalItem> = {};
      for (const [k, a] of Object.entries(d.approvals)) if (entities[a.entityId]) approvals[k] = a;
      return { ...d, entities, approvals, loaded: true };
    }
    case "entity.created":
    case "entity.updated":
      return { ...d, entities: { ...d.entities, [ev.entity.id]: ev.entity } };
    case "entity.removed": {
      if (!(ev.id in d.entities)) return d;
      const entities = { ...d.entities };
      delete entities[ev.id];
      return { ...d, entities };
    }
    case "status.changed": {
      const changeSeq = d.changeSeq + 1;
      return { ...d, changeSeq, lastChange: { seq: changeSeq, id: ev.id, from: ev.from, to: ev.to } };
    }
    case "log": {
      const logSeq = d.logSeq + 1;
      const item: LogItem = { id: logSeq, entityId: ev.entityId, level: ev.level, text: ev.text, key: ev.key, vars: ev.vars, extra: ev.extra, extraKey: ev.extraKey, extraVars: ev.extraVars, at: ev.at };
      const logs = [item, ...d.logs];
      if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
      return { ...d, logSeq, logs };
    }
    case "approval.requested":
      return {
        ...d,
        approvals: {
          ...d.approvals,
          [ev.id]: {
            id: ev.id,
            entityId: ev.entityId,
            kind: ev.kind,
            summary: ev.summary,
            key: ev.key,
            vars: ev.vars,
            detail: ev.detail,
            detailKey: ev.detailKey,
            detailVars: ev.detailVars,
            at: ev.at,
          },
        },
      };
    case "approval.decided": {
      if (!(ev.id in d.approvals)) return d;
      const approvals = { ...d.approvals };
      delete approvals[ev.id];
      return { ...d, approvals };
    }
    case "emergency":
      return d.emergency === ev.active ? d : { ...d, emergency: ev.active };
    case "org.snapshot": {
      const org: Record<string, OrgNode> = {};
      for (const n of ev.nodes) org[n.id] = n;
      return { ...d, org };
    }
    case "org.node":
      return { ...d, org: { ...d.org, [ev.node.id]: ev.node } };
    case "economy.state":
      return { ...d, economy: ev.state };
    case "economy.event":
      return d; // mỗi sự kiện đi kèm một `economy.state` mới nên không cần xử lý riêng
    case "studio.state":
      return { ...d, studio: ev.state };
  }
}

export interface OfficeStore extends OfficeData {
  connection: ConnectionState;
  /** Giây còn lại tới lần thử kết nối kế tiếp (khi đang reconnecting). */
  retryInSec: number | null;
  attempt: number;
  departments: DepartmentLite[];
  budget: BudgetLite | null;
  /** ask | balanced | autonomous */
  automationLevel: string;
  selectedId: string | null;
  /** Điểm camera cần bay tới (id tăng dần để cùng một điểm vẫn kích hoạt lại). */
  focus: { x: number; z: number; n: number } | null;
  webglLost: boolean;
  apply: (ev: OfficeEvent) => void;
  setConnection: (c: ConnectionState, attempt?: number, retryInSec?: number | null) => void;
  setDepartments: (d: DepartmentLite[]) => void;
  setBudget: (b: BudgetLite) => void;
  setAutomationLevel: (l: string) => void;
  select: (id: string | null) => void;
  focusOn: (x: number, z: number) => void;
  setWebglLost: (v: boolean) => void;
  reset: () => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  ...emptyData(),
  connection: "connecting",
  retryInSec: null,
  attempt: 0,
  departments: [],
  budget: null,
  automationLevel: "balanced",
  selectedId: null,
  focus: null,
  webglLost: false,
  apply: (ev) => set((s) => applyOfficeEvent(s, ev)),
  setConnection: (connection, attempt = 0, retryInSec = null) => set({ connection, attempt, retryInSec }),
  setDepartments: (departments) => set({ departments }),
  setBudget: (budget) => set({ budget }),
  setAutomationLevel: (automationLevel) => set({ automationLevel }),
  select: (selectedId) => set({ selectedId }),
  focusOn: (x, z) => set((s) => ({ focus: { x, z, n: (s.focus?.n ?? 0) + 1 } })),
  setWebglLost: (webglLost) => set({ webglLost }),
  reset: () => set({ ...emptyData(), selectedId: null }),
}));

/** Danh sách thực thể theo loại (selector dùng chung). */
export function entitiesOfKind(entities: Record<string, OfficeEntity>, kind: OfficeEntity["kind"]): OfficeEntity[] {
  return Object.values(entities).filter((e) => e.kind === kind);
}
