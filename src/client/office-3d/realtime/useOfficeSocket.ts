/**
 * L3 — Realtime: WebSocket với reconnect + exponential backoff + dọn dẹp đúng cách.
 *
 * Nhận khung `{ event, data }` từ server FunnyOVS:
 *  - "office"  → OfficeEvent (kiểm tra bằng `isOfficeEvent` trước khi vào store)
 *  - "state"   → danh sách phòng ban
 *  - "budget"  → hạn mức token
 * Các sự kiện cũ khác bị bỏ qua (client cổ điển vẫn dùng chúng).
 */
import { useCallback, useEffect, useRef } from "react";
import { OFFICE_WS_EVENT, isOfficeEvent } from "../../../shared/officeEntity.js";
import { useOfficeStore, type BudgetLite, type DepartmentLite } from "../store/officeStore.js";

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/** Độ trễ trước lần thử thứ `attempt` (bắt đầu từ 0): 1s, 2s, 4s... tối đa 30s, cộng nhiễu ≤ 25%. */
export function backoffDelay(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 + rand() * 0.25));
}

export interface OfficeSocketApi {
  /** Thử kết nối lại ngay (bỏ qua thời gian chờ). */
  reconnect: () => void;
}

function socketUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function useOfficeSocket(url: string = socketUrl()): OfficeSocketApi {
  const attemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);
  const connectRef = useRef<() => void>(() => undefined);

  const clearTimers = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    retryTimer.current = null;
    tickTimer.current = null;
  }, []);

  useEffect(() => {
    disposed.current = false;
    const store = useOfficeStore.getState;

    const scheduleRetry = (): void => {
      if (disposed.current) return;
      const delay = backoffDelay(attemptRef.current);
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      const until = Date.now() + delay;
      store().setConnection("reconnecting", attempt, Math.ceil(delay / 1000));
      tickTimer.current = setInterval(() => {
        store().setConnection("reconnecting", attempt, Math.max(0, Math.ceil((until - Date.now()) / 1000)));
      }, 500);
      retryTimer.current = setTimeout(() => {
        clearTimers();
        connectRef.current();
      }, delay);
    };

    const connect = (): void => {
      if (disposed.current) return;
      clearTimers();
      if (!store().loaded) store().setConnection("connecting", attemptRef.current);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        store().setConnection("open", 0, null);
      };
      ws.onmessage = (msg) => {
        let frame: { event?: string; data?: unknown };
        try {
          frame = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        switch (frame.event) {
          case OFFICE_WS_EVENT:
            if (isOfficeEvent(frame.data)) store().apply(frame.data);
            break;
          case "state": {
            const d = (frame.data as { departments?: DepartmentLite[] } | undefined)?.departments;
            if (Array.isArray(d)) store().setDepartments(d);
            const b = (frame.data as { budget?: BudgetLite } | undefined)?.budget;
            if (b) store().setBudget(b);
            const lvl = (frame.data as { config?: { automationLevel?: string } } | undefined)?.config?.automationLevel;
            if (lvl) store().setAutomationLevel(lvl);
            break;
          }
          case "budget":
            if (frame.data) store().setBudget(frame.data as BudgetLite);
            break;
          case "config": {
            const lvl = (frame.data as { automationLevel?: string } | undefined)?.automationLevel;
            if (lvl) store().setAutomationLevel(lvl);
            break;
          }
        }
      };
      ws.onerror = () => {
        /* onclose sẽ chạy ngay sau và lên lịch thử lại */
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (!disposed.current) scheduleRetry();
      };
    };
    connectRef.current = connect;
    connect();

    return () => {
      disposed.current = true;
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      store().setConnection("closed");
    };
  }, [url, clearTimers]);

  const reconnect = useCallback(() => {
    clearTimers();
    attemptRef.current = 0;
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    }
    connectRef.current();
  }, [clearTimers]);

  return { reconnect };
}
