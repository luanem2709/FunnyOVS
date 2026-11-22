/**
 * Cầu nối tới vỏ Electron (nếu có). Chạy trong trình duyệt thường thì mọi hàm đều không làm gì — giao diện không được phụ thuộc vào nó.
 * Phần mở ra từ preload.cjs: thông báo Windows, số việc chờ duyệt trên khay, khởi động lại ứng dụng.
 */
export interface FunnyDesktop {
  notify?: (title: string, body: string) => void;
  setPending?: (count: number) => void;
  restart?: () => void;
}

export function desktop(): FunnyDesktop | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { funnyDesktop?: FunnyDesktop }).funnyDesktop;
}

export const canRestartApp = (): boolean => typeof desktop()?.restart === "function";
export const restartApp = (): void => desktop()?.restart?.();
