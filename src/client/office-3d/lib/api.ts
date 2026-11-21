/** Gọi REST của FunnyOVS (cùng origin). Ném lỗi có thông điệp rõ ràng khi server trả mã lỗi. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json().catch(() => ({}))) as T;
}

export type PermissionMode = "once" | "read" | "readwrite" | "deny";

export const decidePermission = (requestId: string, mode: PermissionMode): Promise<unknown> =>
  call("/api/permissions/decide", { method: "POST", body: JSON.stringify({ requestId, mode }) });

export const decideTask = (taskId: string, action: "approve" | "reject"): Promise<unknown> =>
  call(`/api/tasks/${encodeURIComponent(taskId)}/${action}`, { method: "POST" });

export const emergencyStop = (): Promise<unknown> => call("/api/emergency-stop", { method: "POST" });
