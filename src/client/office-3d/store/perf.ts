/**
 * Trạng thái hiệu năng theo phiên (không lưu): đã tự hạ chất lượng chưa, và có đang hiện thông báo không.
 * Mở lại ứng dụng thì đo lại từ đầu (máy khác/độ phân giải khác có thể khác).
 */
import { create } from "zustand";

interface PerfState {
  downgraded: boolean;
  noticeOpen: boolean;
  markDowngraded: () => void;
  dismissNotice: () => void;
}

export const usePerf = create<PerfState>((set) => ({
  downgraded: false,
  noticeOpen: false,
  markDowngraded: () => set({ downgraded: true, noticeOpen: true }),
  dismissNotice: () => set({ noticeOpen: false }),
}));
