/** Cầu nối an toàn giữa giao diện 3D và vỏ Electron (chỉ lộ đúng các hàm dưới đây). */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("funnyDesktop", {
  /** Hiện thông báo Windows; bấm vào sẽ đưa cửa sổ app lên trước. */
  notify: (title, body) => ipcRenderer.send("desktop:notify", String(title).slice(0, 120), String(body).slice(0, 300)),
  /** Báo số việc đang chờ bạn duyệt (hiện trên tooltip khay hệ thống). */
  setPending: (count) => ipcRenderer.send("desktop:pending", Number(count) || 0),
});
