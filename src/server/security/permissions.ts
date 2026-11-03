/**
 * Quáº£n lÃ½ quyá»n truy cáº­p thÆ° má»¥c.
 *
 * - Quyá»n cáº¥p lÆ°u trong file cáº¥u hÃ¬nh JSON (ngÆ°á»i dÃ¹ng xem & thu há»“i báº¥t cá»© lÃºc nÃ o).
 * - Má»i thao tÃ¡c ngoÃ i /workspace Ä‘á»u bá»‹ cháº·n cho tá»›i khi Ä‘Æ°á»£c cáº¥p quyá»n.
 * - XÃ³a file / ghi Ä‘Ã¨ luÃ´n há»i láº¡i, ká»ƒ cáº£ trong thÆ° má»¥c Ä‘Ã£ cáº¥p quyá»n ghi.
 * - VÃ¹ng cháº·n cá»©ng KHÃ”NG BAO GIá»œ Ä‘Æ°á»£c cáº¥p quyá»n báº±ng giao diá»‡n (pháº£i báº­t thá»§ cÃ´ng).
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { checkPath, isHardBlocked, workspaceRoot } from "../sandbox/pathGuard.js";

export type GrantMode = "once" | "read" | "readwrite";
export type RequestReason = "read" | "write" | "delete" | "list" | "execute";

export interface Grant {
  id: string;
  /** ÄÆ°á»ng dáº«n tuyá»‡t Ä‘á»‘i Ä‘Ã£ chuáº©n hÃ³a. */
  path: string;
  mode: Exclude<GrantMode, "once">;
  /** NhÃ¢n váº­t/agent Ä‘Æ°á»£c cáº¥p quyá»n. */
  agentId: string;
  grantedAt: string;
  note?: string;
  /** ÄÆ°á»ng dáº«n cha bá»‹ cháº·n cá»©ng â†’ chá»‰ má»Ÿ khi ngÆ°á»i dÃ¹ng báº­t thá»§ cÃ´ng. */
  manualUnlock?: boolean;
}

export interface PermissionState {
  version: number;
  grants: Grant[];
  /** CÃ¡c thÆ° má»¥c cháº·n cá»©ng mÃ  ngÆ°á»i dÃ¹ng Ä‘Ã£ báº­t thá»§ cÃ´ng. */
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
          /* bá» qua dÃ²ng há»ng */
        }
      }
    } catch {
      /* chÆ°a cÃ³ log */
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
      /* log lá»—i khÃ´ng Ä‘Æ°á»£c cháº·n luá»“ng */
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
   * NgÆ°á»i dÃ¹ng báº­t thá»§ cÃ´ng má»™t Ä‘Æ°á»ng dáº«n bá»‹ cháº·n cá»©ng.
   * ÄÃ¢y lÃ  con Ä‘Æ°á»ng DUY NHáº¤T Ä‘á»ƒ má»Ÿ vÃ¹ng bá»‹ cháº·n.
   */
  manualUnlock(targetPath: string): { ok: boolean; message: string } {
    const abs = path.resolve(targetPath);
    if (!isHardBlocked(abs)) {
      return { ok: true, message: "ÄÆ°á»ng dáº«n khÃ´ng náº±m trong vÃ¹ng cháº·n cá»©ng, khÃ´ng cáº§n má»Ÿ thá»§ cÃ´ng." };
    }
    if (!this.state.manualUnlocked.includes(abs)) {
      this.state.manualUnlocked.push(abs);
      this.persist();
    }
    return { ok: true, message: "ÄÃ£ má»Ÿ thá»§ cÃ´ng (váº«n cáº§n cáº¥p quyá»n riÃªng cho agent)." };
  }

  isManuallyUnlocked(targetPath: string): boolean {
    const abs = path.resolve(targetPath);
    return this.state.manualUnlocked.some((u) => abs === u || abs.startsWith(u + path.sep));
  }

  /** TÃ¬m grant phÃ¹ há»£p cho agent + path + mode yÃªu cáº§u. */
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
   * Kiá»ƒm tra quyá»n cho má»™t thao tÃ¡c.
   * - Trong workspace â†’ cho phÃ©p (read/write/list), trá»« xÃ³a/ghi Ä‘Ã¨ cáº§n xÃ¡c nháº­n.
   * - NgoÃ i workspace â†’ cáº§n grant phÃ¹ há»£p, náº¿u khÃ´ng tráº£ vá» `needsRequest`.
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
        detail: "VÃ¹ng cháº·n cá»©ng (há»‡ thá»‘ng/bÃ­ máº­t)",
      });
      if (!this.isManuallyUnlocked(path.resolve(target))) {
        return { allowed: false, needsRequest: false, reason: check.reason ?? "Bá»‹ cháº·n cá»©ng." };
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
            detail: "XÃ³a file luÃ´n cáº§n xÃ¡c nháº­n láº¡i",
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
        detail: "XÃ³a file trong workspace váº«n cáº§n xÃ¡c nháº­n",
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
      detail: `yÃªu cáº§u ${reason}`,
    });
    this.emit("request", req);
    return req;
  }

  /**
   * Tạo yêu cầu duyệt cho một hành động KHÔNG gắn với đường dẫn
   * (chạy lệnh, điều khiển chuột/bàn phím, việc khó hoàn tác…).
   *
   * Không dùng `check()` vì hành động này không có đường dẫn để so sánh.
   */
  requestApproval(opts: {
    agentId: string;
    agentName: string;
    label: string;
    purpose: string;
  }): AccessRequest {
    return this.createRequest(opts.agentId, opts.agentName, opts.label, "execute", opts.purpose);
  }

  listPending(): AccessRequest[] {
    return [...this.pending.values()].filter((r) => r.status === "pending");
  }

  /**
   * NgÆ°á»i dÃ¹ng quyáº¿t Ä‘á»‹nh má»™t yÃªu cáº§u.
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
      detail: `quyáº¿t Ä‘á»‹nh: ${mode}`,
    });

    this.emit("decided", req);
    return req;
  }

  /** Cháº·n request "má»™t láº§n" sau khi dÃ¹ng xong (khÃ´ng lÆ°u grant). */
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
