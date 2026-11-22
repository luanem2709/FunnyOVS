import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./office3d.css";
import { useOfficeStore } from "./store/officeStore.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";

// Móc gỡ lỗi/kiểm thử thủ công: window.__office.getState().apply({...}) để giả lập sự kiện.
(window as unknown as { __office: typeof useOfficeStore }).__office = useOfficeStore;

// Không dùng StrictMode: cảnh 3D dựng bằng các module mệnh lệnh (three.js) và không được dựng hai lần.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
