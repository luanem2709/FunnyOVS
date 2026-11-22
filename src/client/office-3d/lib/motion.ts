/**
 * Giảm chuyển động (a11y): cảnh 3D luôn có người đi lại, pháo giấy, tờ giấy bay, camera lượn — dễ gây khó chịu/chóng mặt với một số người.
 * Mặc định theo hệ điều hành (`prefers-reduced-motion`), người dùng có thể ép Đầy đủ/Giảm trong Cài đặt.
 */
import { useEffect, useState } from "react";
import { useSettings, type MotionSetting } from "../store/settings.js";

const QUERY = "(prefers-reduced-motion: reduce)";

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** Cài đặt + ưu tiên của hệ điều hành → có giảm chuyển động không. */
export function isReducedMotion(setting: MotionSetting, systemPrefers: boolean): boolean {
  return setting === "reduced" || (setting === "system" && systemPrefers);
}

/** Dùng trong component: tự cập nhật khi đổi cài đặt hoặc khi người dùng đổi tuỳ chọn trong hệ điều hành. */
export function useReducedMotion(): boolean {
  const setting = useSettings((s) => s.motion);
  const [system, setSystem] = useState(systemPrefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = (): void => setSystem(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return isReducedMotion(setting, system);
}
