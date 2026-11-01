/**
 * Lá»›p truy cáº­p file cÃ³ kiá»ƒm soÃ¡t â€” má»i agent Ä‘á»u pháº£i Ä‘i qua Ä‘Ã¢y.
 * KhÃ´ng cÃ³ Ä‘Æ°á»ng nÃ o Ä‘á»ƒ agent Ä‘á»c/ghi file trÃªn mÃ¡y ngÆ°á»i dÃ¹ng mÃ  bá» qua PermissionManager.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionManager } from "./permissions.js";
import { checkPath, workspaceRoot } from "../sandbox/pathGuard.js";

export interface FileOpResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

export class GuardedFs {
  constructor(private perms: PermissionManager) {}

  /** Kiá»ƒm tra trÆ°á»›c, tráº£ vá» {ok:false, requestId} náº¿u cáº§n xin quyá»n. */
  private precheck(
    agentId: string,
    agentName: string,
    target: string,
    reason: "read" | "write" | "delete" | "list",
    purpose: string,
  ): { ok: true } | { ok: false; error?: string; requestId?: string } {
    const res = this.perms.check({ agentId, agentName, target, reason, purpose });
    if (res.allowed) return { ok: true };
    if (res.needsRequest) return { ok: false, requestId: res.request.id };
    return { ok: false, error: res.reason };
  }

  async readFile(agentId: string, agentName: string, target: string, purpose = ""): Promise<FileOpResult<string>> {
    const pre = this.precheck(agentId, agentName, target, "read", purpose);
    if (!pre.ok) return { ok: false, error: pre.error, requestId: pre.requestId };
    const check = checkPath(target, workspaceRoot());
    const abs = check.resolved ?? path.resolve(workspaceRoot(), target);
    try {
      const data = await fs.readFile(abs, "utf8");
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async writeFile(
    agentId: string,
    agentName: string,
    target: string,
    content: string,
    purpose = "",
  ): Promise<FileOpResult<void>> {
    const pre = this.precheck(agentId, agentName, target, "write", purpose);
    if (!pre.ok) return { ok: false, error: pre.error, requestId: pre.requestId };
    const check = checkPath(target, workspaceRoot());
    const abs = check.resolved ?? path.resolve(workspaceRoot(), target);
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async deletePath(
    agentId: string,
    agentName: string,
    target: string,
    purpose = "",
  ): Promise<FileOpResult<void>> {
    const pre = this.precheck(agentId, agentName, target, "delete", purpose);
    if (!pre.ok) return { ok: false, error: pre.error, requestId: pre.requestId };
    const check = checkPath(target, workspaceRoot());
    const abs = check.resolved ?? path.resolve(workspaceRoot(), target);
    try {
      await fs.rm(abs, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async listDir(agentId: string, agentName: string, target: string, purpose = ""): Promise<FileOpResult<string[]>> {
    const pre = this.precheck(agentId, agentName, target, "list", purpose);
    if (!pre.ok) return { ok: false, error: pre.error, requestId: pre.requestId };
    const check = checkPath(target, workspaceRoot());
    const abs = check.resolved ?? path.resolve(workspaceRoot(), target);
    try {
      const entries = await fs.readdir(abs);
      return { ok: true, data: entries };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
