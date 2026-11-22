/**
 * L1 — Adapter: dữ liệu FunnyOVS → `OfficeEntity` / `OfficeEvent`.
 *
 * Server vẫn phát các sự kiện cũ (agent:update, task:update...) để client cổ điển chạy y như trước;
 * `OfficeBridge` chỉ DỊCH những sự kiện đó sang kiểu chung và trả về danh sách `OfficeEvent`.
 */
import { DEPARTMENTS } from "../agents/departments.js";
import type { AgentState } from "../agents/agentRegistry.js";
import type { TaskRecord, ApprovalRequest } from "../tasks/taskRunner.js";
import type { BrowserLogEntry } from "../browser/sandboxBrowser.js";
import type { MachineSample } from "./machine.js";
import type { ActionRequest } from "../agent/gate.js";
import { OfficeEntity, type EntityStatus, type OfficeEvent, type OrgNode } from "../../shared/officeEntity.js";

export const MACHINE_ID = "machine:local";

/** Vị trí tủ server trong Phòng Đội AI (khớp `buildRoomDecor` phía client). */
function machinePosition(): { x: number; y: number; z: number } {
  const d = DEPARTMENTS.find((x) => x.id === "ai-team")!;
  const inW = d.size.w / 2 - 0.08;
  const inD = d.size.d / 2 - 0.08;
  return { x: d.center.x + inW - 0.9, y: 0, z: d.center.z - (inD - 0.7) };
}

export function agentStatusToEntity(s: AgentState["status"]): EntityStatus {
  return s === "waiting" ? "pending-approval" : s;
}

export function agentToEntity(a: AgentState): OfficeEntity {
  return OfficeEntity.parse({
    id: `agent:${a.id}`,
    name: a.name,
    kind: "agent",
    status: agentStatusToEntity(a.status),
    department: a.department,
    position: { x: a.position.x, y: 0, z: a.position.z },
    metadata: {
      agentId: a.id,
      role: a.role,
      tier: a.tier,
      reportsTo: a.reportsTo,
      task: a.task,
      taskKey: a.taskKey,
      taskVars: a.taskVars,
      currentUrl: a.currentUrl,
      currentTitle: a.currentTitle,
      color: a.color,
      skills: a.skills,
      learned: a.learned,
      tokensUsed: a.tokensUsed,
      tasksDone: a.tasksDone,
    },
    updatedAt: new Date().toISOString(),
  });
}

export function taskStatusToEntity(s: TaskRecord["status"]): EntityStatus {
  switch (s) {
    case "running":
      return "working";
    case "awaiting-approval":
      return "pending-approval";
    case "failed":
      return "error";
    case "rejected":
      return "stopped";
    default:
      return "idle";
  }
}

export function isActiveTask(t: TaskRecord): boolean {
  return t.status === "pending" || t.status === "awaiting-approval" || t.status === "running";
}

export function taskToEntity(t: TaskRecord): OfficeEntity {
  return OfficeEntity.parse({
    id: `task:${t.id}`,
    name: t.title,
    kind: "task",
    status: taskStatusToEntity(t.status),
    department: t.department,
    metadata: {
      taskId: t.id,
      agentId: t.agentId,
      agentName: t.agentName,
      model: t.model,
      tokens: t.tokens,
      costCents: t.costCents,
      estimatedTokens: t.estimation?.estimatedTokens,
      approvalReason: t.approvalReason,
      approvalReasonKey: t.estimation?.reasonKey,
      approvalReasonVars: t.estimation?.reasonVars,
      createdAt: t.createdAt,
    },
    updatedAt: t.finishedAt ?? t.startedAt ?? t.createdAt,
  });
}

export function machineToEntity(m: MachineSample): OfficeEntity {
  const status: EntityStatus = m.ramPercent >= 92 ? "error" : m.cpuPercent >= 80 ? "working" : "idle";
  return OfficeEntity.parse({
    id: MACHINE_ID,
    name: m.host,
    kind: "machine",
    status,
    department: "ai-team",
    position: machinePosition(),
    metadata: {
      platform: m.platform,
      cpuPercent: m.cpuPercent,
      ramPercent: m.ramPercent,
      ramUsedMb: m.ramUsedMb,
      ramTotalMb: m.ramTotalMb,
      uptimeSec: m.uptimeSec,
      topProcesses: m.topProcesses,
    },
    updatedAt: m.at,
  });
}

/** Cấu trúc tối thiểu của yêu cầu quyền (server phát từ PermissionManager). */
export interface PermissionRequestLike {
  id: string;
  agentId: string;
  agentName?: string;
  reason?: string;
  path?: string;
  purpose?: string;
}

const now = (): string => new Date().toISOString();

export interface BridgeSources {
  listAgents(): AgentState[];
  listTasks(): TaskRecord[];
  machine(): MachineSample | null;
  /** Yêu cầu còn chờ người dùng quyết định (để gửi lại khi một giao diện mới kết nối). */
  pendingPermissions?(): PermissionRequestLike[];
  pendingTokenApprovals?(): ApprovalRequest[];
  pendingActions?(): ActionRequest[];
}

/** Giữ trạng thái trước đó để sinh `status.changed` và `entity.created/removed`. */
export class OfficeBridge {
  private lastStatus = new Map<string, EntityStatus>();
  private knownTasks = new Set<string>();

  constructor(private readonly src: BridgeSources) {
    for (const a of src.listAgents()) this.lastStatus.set(`agent:${a.id}`, agentStatusToEntity(a.status));
    for (const t of src.listTasks()) if (isActiveTask(t)) this.knownTasks.add(t.id);
  }

  snapshot(): OfficeEvent {
    const entities: OfficeEntity[] = [
      ...this.src.listAgents().map(agentToEntity),
      ...this.src.listTasks().filter(isActiveTask).map(taskToEntity),
    ];
    const m = this.src.machine();
    if (m) entities.push(machineToEntity(m));
    return { type: "snapshot", entities, at: now() };
  }

  private actionEvent(r: ActionRequest): OfficeEvent {
    return {
      type: "approval.requested",
      id: r.id,
      entityId: `agent:${r.agentId}`,
      kind: "action",
      summary: `${r.agentName} muốn thực hiện: ${r.action}`,
      key: ["email_send", "github_issue"].includes(r.action) ? `approval.action.${r.action}.summary` : "approval.action.generic.summary",
      vars: ["email_send", "github_issue"].includes(r.action) ? r.vars : { agent: r.agentName, action: r.action },
      detail: r.detail,
      at: r.createdAt,
    };
  }

  /** Các yêu cầu duyệt đang chờ (gửi cho giao diện vừa kết nối để hộp duyệt không bị trống). */
  pendingApprovals(): OfficeEvent[] {
    const out: OfficeEvent[] = [];
    for (const p of this.src.pendingPermissions?.() ?? []) out.push(...this.translate("permission:request", p));
    for (const a of this.src.pendingTokenApprovals?.() ?? []) out.push(...this.translate("task:approval", a));
    for (const a of this.src.pendingActions?.() ?? []) out.push(this.actionEvent(a));
    return out;
  }

  /** Dịch một sự kiện cũ của FunnyOVS thành 0..n sự kiện chung. */
  translate(event: string, data: unknown): OfficeEvent[] {
    switch (event) {
      case "agent:update":
        return this.onAgent(data as AgentState);
      case "task:update":
        return this.onTask(data as TaskRecord);
      case "task:approval": {
        const r = data as ApprovalRequest;
        return [
          {
            type: "approval.requested",
            id: r.taskId,
            entityId: `agent:${r.agentId}`,
            kind: "token",
            summary: `${r.agentName} muốn chạy: ${r.title}`,
            key: "approval.token.summary",
            vars: { agent: r.agentName, title: r.title },
            detail: r.reason,
            detailKey: r.estimation?.reasonKey,
            detailVars: r.estimation?.reasonVars,
            at: now(),
          },
        ];
      }
      case "action:request":
        return [this.actionEvent(data as ActionRequest)];
      case "action:decided": {
        const r = data as ActionRequest & { outcome?: string };
        return [{ type: "approval.decided", id: r.id, decision: r.outcome === "approved" ? "approve" : "deny", at: now() }];
      }
      case "permission:request": {
        const r = data as PermissionRequestLike;
        return [
          {
            type: "approval.requested",
            id: r.id,
            entityId: `agent:${r.agentId}`,
            kind: "permission",
            summary: `${r.agentName ?? r.agentId} cần ${r.reason ?? "quyền truy cập"}`,
            key: "approval.perm.summary",
            vars: { agent: r.agentName ?? r.agentId, action: `$t:perm.action.${r.reason ?? "read"}` },
            detail: [r.path, r.purpose].filter(Boolean).join(" · "),
            at: now(),
          },
        ];
      }
      case "permission:decided": {
        const r = data as PermissionRequestLike & { status?: string };
        const denied = r.status === "denied";
        return [{ type: "approval.decided", id: r.id, decision: denied ? "deny" : "approve", at: now() }];
      }
      case "browser:log": {
        const l = data as BrowserLogEntry;
        const level = l.status === "ok" ? "info" : l.status === "error" ? "error" : "warn";
        return [
          {
            type: "log",
            entityId: `agent:${l.agentId}`,
            level,
            text: `${l.agentName}: ${l.title || l.url}${l.note ? ` — ${l.note}` : ""}`,
            key: "log.browse",
            vars: { agent: l.agentName, title: l.title || l.url },
            extra: l.note,
            at: l.ts ?? now(),
          },
        ];
      }
      case "org:node":
        return [{ type: "org.node", node: data as OrgNode }];
      case "injection":
        return [
          {
            type: "log",
            level: "error",
            text: `Phát hiện prompt injection tại ${(data as { url?: string }).url ?? "?"} — đã bỏ qua`,
            key: "log.injection",
            vars: { url: (data as { url?: string }).url ?? "?" },
            at: now(),
          },
        ];
      case "emergency": {
        const active = Boolean((data as { emergencyStop?: boolean }).emergencyStop);
        return [
          { type: "emergency", active, at: now() },
          {
            type: "log",
            level: active ? "error" : "info",
            text: active ? "DỪNG KHẨN CẤP đã bật" : "Đã gỡ dừng khẩn cấp",
            key: active ? "log.emergencyOn" : "log.emergencyOff",
            at: now(),
          },
        ];
      }
      default:
        return [];
    }
  }

  /** Sự kiện cho một mẫu máy mới. */
  onMachine(m: MachineSample): OfficeEvent[] {
    const entity = machineToEntity(m);
    const prev = this.lastStatus.get(entity.id);
    this.lastStatus.set(entity.id, entity.status);
    const out: OfficeEvent[] = [{ type: prev ? "entity.updated" : "entity.created", entity }];
    if (prev && prev !== entity.status) out.push({ type: "status.changed", id: entity.id, from: prev, to: entity.status, at: now() });
    return out;
  }

  private onAgent(a: AgentState): OfficeEvent[] {
    const entity = agentToEntity(a);
    const prev = this.lastStatus.get(entity.id);
    this.lastStatus.set(entity.id, entity.status);
    const out: OfficeEvent[] = [{ type: prev ? "entity.updated" : "entity.created", entity }];
    if (prev && prev !== entity.status) out.push({ type: "status.changed", id: entity.id, from: prev, to: entity.status, at: now() });
    return out;
  }

  private onTask(t: TaskRecord): OfficeEvent[] {
    const out: OfficeEvent[] = [];
    const id = `task:${t.id}`;
    if (isActiveTask(t)) {
      const entity = taskToEntity(t);
      const known = this.knownTasks.has(t.id);
      this.knownTasks.add(t.id);
      out.push({ type: known ? "entity.updated" : "entity.created", entity });
      const prev = this.lastStatus.get(id);
      this.lastStatus.set(id, entity.status);
      if (prev && prev !== entity.status) {
        out.push({ type: "status.changed", id, from: prev, to: entity.status, at: now() });
        if (prev === "pending-approval") {
          out.push({ type: "approval.decided", id: t.id, decision: "approve", at: now() });
        }
      }
    } else {
      // Tác vụ kết thúc: gỡ khỏi cảnh, ghi một dòng nhật ký.
      if (this.knownTasks.delete(t.id)) {
        const prev = this.lastStatus.get(id);
        this.lastStatus.delete(id);
        if (prev === "pending-approval") {
          out.push({ type: "approval.decided", id: t.id, decision: t.status === "rejected" ? "deny" : "approve", at: now() });
        }
        out.push({ type: "entity.removed", id });
      }
      const text =
        t.status === "done"
          ? `Xong: ${t.title} (${t.tokens ?? 0} token)`
          : t.status === "failed"
            ? `Lỗi: ${t.title}${t.error ? ` — ${t.error}` : ""}`
            : `Từ chối: ${t.title}`;
      const key = t.status === "done" ? "log.done" : t.status === "failed" ? "log.failed" : "log.rejected";
      out.push({
        type: "log",
        entityId: `agent:${t.agentId}`,
        level: t.status === "done" ? "info" : t.status === "failed" ? "error" : "warn",
        text,
        key,
        vars: { title: t.title, tokens: t.tokens ?? 0 },
        extra: t.status === "failed" ? t.error : undefined,
        extraKey: t.status === "failed" ? t.errorKey : undefined,
        extraVars: t.status === "failed" ? t.errorVars : undefined,
        at: now(),
      });
    }
    return out;
  }
}
