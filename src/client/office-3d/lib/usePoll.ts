/**
 * Tải dữ liệu REST định kỳ cho một khung giao diện đang hiển thị.
 *
 * - Tải ngay khi gắn vào, rồi lặp mỗi `ms`; tạm dừng khi tab trình duyệt bị ẩn và tải lại ngay khi quay lại.
 * - Vừa nối lại được máy chủ sau khi mất kết nối (WebSocket) thì tải lại NGAY, không đợi vòng kế tiếp.
 * - `reload()` để tải lại sau một thao tác của người dùng; kết quả cũ không ghi đè kết quả mới (đánh số lượt).
 * - Lỗi không xoá dữ liệu cũ: giao diện vẫn hiện số liệu gần nhất kèm cảnh báo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useOfficeStore } from "../store/officeStore.js";

export interface Poll<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
}

export function usePoll<T>(fn: () => Promise<T>, ms: number): Poll<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const alive = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    const mine = ++seq.current;
    try {
      const next = await fnRef.current();
      if (!alive.current || mine !== seq.current) return;
      setData(next);
      setError(undefined);
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      setError(e);
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) void reload();
    }, ms);
    const onVisible = (): void => {
      if (!document.hidden) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = useOfficeStore.subscribe((now, before) => {
      if (before.connection === "reconnecting" && now.connection === "open") void reload();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [ms, reload]);

  return { data, error, loading, reload };
}
