/**
 * Sức khoẻ hệ thống dùng chung (chỉ báo AI trên thanh đầu). Một nơi tải duy nhất để mọi thao tác thay đổi kết nối AI
 * (dò lại, dán khoá, bật/tắt) có thể gọi `refresh()` và chỉ báo cập nhật ngay, không phải đợi vòng tải định kỳ.
 */
import { create } from "zustand";
import { getHealth, type Health } from "../lib/api.js";

interface HealthState {
  health: Health | undefined;
  refresh: () => Promise<void>;
}

export const useHealth = create<HealthState>((set) => ({
  health: undefined,
  refresh: async () => {
    try {
      set({ health: await getHealth() });
    } catch {
      /* mất kết nối thoáng qua: giữ số liệu gần nhất; dải kết nối trên thanh đầu đã báo offline */
    }
  },
}));
