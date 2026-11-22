/**
 * Trạng thái giao diện không cần lưu: tab đang mở ở bảng bên trái, hộp Cài đặt (và mục cần cuộn tới).
 * Tách riêng để Header (chỉ báo AI) có thể mở thẳng tab "AI" mà không phải truyền prop qua nhiều tầng.
 */
import { create } from "zustand";
import { stepKey } from "../lib/roving.js";

export const TABS = ["org", "ai", "crm", "log", "overview"] as const;
export type Tab = (typeof TABS)[number];

/**
 * Mẫu ARIA tablist: ←/→ chuyển tab (xoay vòng), Home/End về đầu/cuối. Trả về tab cần chuyển tới, hoặc null nếu phím không liên quan.
 */
export function tabAfterKey(current: Tab, key: string): Tab | null {
  return stepKey(TABS, current, key);
}

export type SettingsSection = "network" | "email" | "github" | "backup" | "audit";

interface UiState {
  tab: Tab;
  settingsOpen: boolean;
  settingsSection: SettingsSection | null;
  /** Tăng mỗi khi có thao tác nhạy cảm vừa thành công — mục Nhật ký bảo mật tải lại ngay thay vì đợi vòng định kỳ. */
  auditTick: number;
  bumpAudit: () => void;
  setTab: (tab: Tab) => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
}

export const useUi = create<UiState>((set) => ({
  tab: "org",
  settingsOpen: false,
  settingsSection: null,
  auditTick: 0,
  bumpAudit: () => set((st) => ({ auditTick: st.auditTick + 1 })),
  setTab: (tab) => set({ tab }),
  openSettings: (section) => set({ settingsOpen: true, settingsSection: section ?? null }),
  closeSettings: () => set({ settingsOpen: false, settingsSection: null }),
}));
