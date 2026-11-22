/**
 * Quản lý quyền truy cập thư mục.
 *
 * - Quyền cấp lưu trong file cấu hình JSON (người dùng xem & thu hồi bất cứ lúc nào).
 * - Mọi thao tác ngoài /workspace đều bị chặn cho tới khi được cấp quyền.
 * - Xóa file / ghi đè luôn hỏi lại, kể cả trong thư mục đã cấp quyền ghi.
 * - Vùng chặn cứng KHÔNG BAO GIỜ được cấp quyền bằng giao diện (phải bật thủ công).
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { checkPath, isHardBlocked, workspaceRoot } from "../sandbox/pathGuard.js";

export type GrantMode = "once" | "read" | "readwrite";
export type RequestReason = "read" | "write" | "delete" | "list" | "execute";

export interface Grant {
  id: string;
  /** Đường dẫn tuyệt đối đã chuẩn hóa. */
  path: string;
  mode: Exclude<GrantMode, "once">;
  /** Nhân vật/agent được cấp quyền. */
  agentId: string;
  grantedAt: string;
  note?: string;
  /** Đường dẫn cha bị chặn cứng → chỉ mở khi người dùng bật thủ công. */
  manualUnlock?: boolean;
}

export interface PermissionState {
  version: number;
  grants: Grant[];
  /** Các thư mục chặn cứng mà người dùng đã bật thủ công. */
  manualUnlocked: string[];
}

export interface AccessRequest {
  id: string;
  agentId: string;
  agentName: string;
  path: string;
  reason: RequestReason;
  purpose: string;
  createdAt: string;
  status: "pending" | "approved" | "denied";
  mode?: GrantMode;
  decidedAt?: string;
  /** Quyết định "một lần" đã được dùng. */
  consumed?: boolean;
}

export interface AccessLogEntry {
  id: number;
  ts: string;
  agentId: string;
  agentName: string;
  action: "read" | "write" | "delete" | "list" | "execute" | "deny" | "request";
  path: string;
  allowed: boolean;
  detail?: string;
}

const DEFAULT_STATE: PermissionState = { version: 1, grants: [], manualUnlocked: [] };

export class PermissionManager extends EventEmitter {
  private state: PermissionState;
  private logs: AccessLogEntry[] = [];
  private logSeq = 0;
  private pending = new Map<string, AccessRequest>();
  private pendingSeq = 0;
  private readonly statePath: string;
  private readonly logPath: string;

  constructor(private baseDir: string) {
    super();
    this.statePath = path.join(baseDir, "permissions.json");
    this.logPath = path.join(baseDir, "access-log.jsonl");
    this.state = this.load();
    this.loadLogs();
  }

  private load(): PermissionState {
    try {
      const raw = fs.readFileSync(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as PermissionState;
      return {
        version: parsed.version ?? 1,
        grants: Array.isArray(parsed.grants) ? parsed.grants : [],
        manualUnlocked: Array.isArray(parsed.manualUnlocked) ? parsed.manualUnlocked : [],
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  private persist(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
    this.emit("state", this.getState());
  }

  private loadLogs(): void {
    try {
      const raw = fs.readFileSync(this.logPath, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as AccessLogEntry;
          this.logs.push(e);
          this.logSeq = Math.max(this.logSeq, e.id);
        } catch {
          /* bỏ qua dòng hỏng */
        }
      }
    } catch {
      /* chưa có log */
    }
  }

  private appendLog(entry: Omit<AccessLogEntry, "id">): void {
    const e: AccessLogEntry = { id: ++this.logSeq, ...entry };
    this.logs.push(e);
    if (this.logs.length > 5000) this.logs.shift();
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      fs.appendFileSync(this.logPath, JSON.stringify(e) + "\n", "utf8");
    } catch {
      /* log lỗi không được chặn luồng */
    }
    this.emit("log", e);
  }

  getState(): PermissionState {
    return structuredClone(this.state);
  }

  getLogs(limit = 200): AccessLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  /**
   * Người dùng bật thủ công một đường dẫn bị chặn cứng.
   * Đây là con đường DUY NHẤT để mở vùng bị chặn.
   */
  manualUnlock(targetPath: string): { ok: boolean; message: string } {
    const abs = path.resolve(targetPath);
    if (!isHardBlocked(abs)) {
      return { ok: true, message: "Đường dẫn không nằm trong vùng chặn cứng, không cần mở thủ công." };
    }
    if (!this.state.manualUnlocked.includes(abs)) {
      this.state.manualUnlocked.push(abs);
      this.persist();
    }
    return { ok: true, message: "Đã mở thủ công (vẫn cần cấp quyền riêng cho agent)." };
  }

  isManuallyUnlocked(targetPath: string): boolean {
    const abs = path.resolve(targetPath);
    return this.state.manualUnlocked.some((u) => abs === u || abs.startsWith(u + path.sep));
  }

  /** Tìm grant phù hợp cho agent + path + mode yêu cầu. */
  findGrant(agentId: string, target: string, need: "read" | "write"): Grant | null {
    const abs = path.resolve(target);
    const candidates = this.state.grants
      .filter((g) => g.agentId === agentId)
      .filter((g) => {
        const gp = path.resolve(g.path);
        if (abs !== gp && !abs.startsWith(gp + path.sep)) return false;
        if (need === "read") return g.mode === "read" || g.mode === "readwrite";
        return g.mode === "readwrite";
      })
      .sort((a, b) => path.resolve(b.path).length - path.resolve(a.path).length);
    return candidates[0] ?? null;
  }

  /**
   * Kiểm tra quyền cho một thao tác.
   * - Trong workspace → cho phép (read/write/list), trừ xóa/ghi đè cần xác nhận.
   * - Ngoài workspace → cần grant phù hợp, nếu không trả về `needsRequest`.
   */
  check(opts: {
    agentId: string;
    agentName: string;
    target: string;
    reason: RequestReason;
    purpose?: string;
  }):
    | { allowed: true; needsConfirmation?: boolean }
    | { allowed: false; needsRequest: true; request: AccessRequest }
    | { allowed: false; needsRequest: false; reason: string } {
    const { agentId, agentName, target, reason, purpose } = opts;

    const check = checkPath(target, workspaceRoot());
    if (!check.ok && check.code === "hard_blocked") {
      this.appendLog({
        ts: new Date().toISOString(),
        agentId,
        agentName,
        action: "deny",
        path: target,
        allowed: false,
        detail: "Vùng chặn cứng (hệ thống/bí mật)",
      });
      if (!this.isManuallyUnlocked(path.resolve(target))) {
        return { allowed: false, needsRequest: false, reason: check.reason ?? "Bị chặn cứng." };
      }
    }

    const resolved = check.resolved ?? path.resolve(workspaceRoot(), target);
    const insideWorkspace = check.ok;

    if (!insideWorkspace) {
      const grant = this.findGrant(agentId, resolved, reason === "read" || reason === "list" ? "read" : "write");
      if (grant) {
        if (reason === "delete") {
          this.appendLog({
            ts: new Date().toISOString(),
            agentId,
            agentName,
            action: "request",
            path: resolved,
            allowed: false,
            detail: "Xóa file luôn cần xác nhận lại",
          });
          const req = this.createRequest(agentId, agentName, resolved, reason, purpose ?? "");
          return { allowed: false, needsRequest: true, request: req };
        }
        this.appendLog({
          ts: new Date().toISOString(),
          agentId,
          agentName,
          action: reason === "list" ? "list" : reason === "read" ? "read" : "write",
          path: resolved,
          allowed: true,
          detail: `grant:${grant.mode}`,
        });
        return { allowed: true };
      }
      // Quyết định "cho phép MỘT LẦN": dùng đúng một lần cho cùng agent + đường dẫn + loại thao tác.
      const once = [...this.pending.values()].find(
        (r) => r.status === "approved" && r.mode === "once" && !r.consumed && r.agentId === agentId && r.path === resolved && r.reason === reason,
      );
      if (once) {
        once.consumed = true;
        this.appendLog({
          ts: new Date().toISOString(),
          agentId,
          agentName,
          action: reason === "list" ? "list" : reason === "read" ? "read" : "write",
          path: resolved,
          allowed: true,
          detail: "once",
        });
        return { allowed: true };
      }
      const req = this.createRequest(agentId, agentName, resolved, reason, purpose ?? "");
      return { allowed: false, needsRequest: true, request: req };
    }

    // Trong workspace
    if (reason === "delete") {
      this.appendLog({
        ts: new Date().toISOString(),
        agentId,
        agentName,
        action: "request",
        path: resolved,
        allowed: false,
        detail: "Xóa file trong workspace vẫn cần xác nhận",
      });
      const req = this.createRequest(agentId, agentName, resolved, reason, purpose ?? "");
      return { allowed: false, needsRequest: true, request: req };
    }

    this.appendLog({
      ts: new Date().toISOString(),
      agentId,
      agentName,
      action: reason === "list" ? "list" : reason === "read" ? "read" : "write",
      path: resolved,
      allowed: true,
      detail: "workspace",
    });
    return { allowed: true };
  }

  private createRequest(
    agentId: string,
    agentName: string,
    target: string,
    reason: RequestReason,
    purpose: string,
  ): AccessRequest {
    const req: AccessRequest = {
      id: `req_${++this.pendingSeq}_${Date.now().toString(36)}`,
      agentId,
      agentName,
      path: target,
      reason,
      purpose,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.pending.set(req.id, req);
    this.appendLog({
      ts: req.createdAt,
      agentId,
      agentName,
      action: "request",
      path: target,
      allowed: false,
      detail: `yêu cầu ${reason}`,
    });
    this.emit("request", req);
    return req;
  }

  listPending(): AccessRequest[] {
    return [...this.pending.values()].filter((r) => r.status === "pending");
  }

  /**
   * Người dùng quyết định một yêu cầu.
   * @param mode "once" | "read" | "readwrite" | "deny"
   */
  decide(reqId: string, mode: GrantMode | "deny"): AccessRequest | null {
    const req = this.pending.get(reqId);
    if (!req || req.status !== "pending") return null;

    req.status = mode === "deny" ? "denied" : "approved";
    req.mode = mode === "deny" ? undefined : mode;
    req.decidedAt = new Date().toISOString();

    if (mode !== "deny" && mode !== "once") {
      this.state.grants.push({
        id: `grant_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
        path: req.path,
        mode,
        agentId: req.agentId,
        grantedAt: req.decidedAt,
        note: req.purpose,
        manualUnlock: this.isManuallyUnlocked(req.path),
      });
      this.persist();
    }

    this.appendLog({
      ts: req.decidedAt,
      agentId: req.agentId,
      agentName: req.agentName,
      action: mode === "deny" ? "deny" : "request",
      path: req.path,
      allowed: mode !== "deny",
      detail: `quyết định: ${mode}`,
    });

    this.emit("decided", req);
    return req;
  }

  /** Chặn request "một lần" sau khi dùng xong (không lưu grant). */
  consumeOnce(reqId: string): void {
    const req = this.pending.get(reqId);
    if (req && req.mode === "once") req.status = "denied";
  }

  revokeGrant(grantId: string): boolean {
    const before = this.state.grants.length;
    this.state.grants = this.state.grants.filter((g) => g.id !== grantId);
    if (this.state.grants.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  revokeAll(): void {
    this.state.grants = [];
    this.persist();
  }

  removeManualUnlock(targetPath: string): void {
    const abs = path.resolve(targetPath);
    this.state.manualUnlocked = this.state.manualUnlocked.filter((u) => u !== abs);
    this.persist();
  }
}
