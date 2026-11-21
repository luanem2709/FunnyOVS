import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import { useOfficeSocket } from "./realtime/useOfficeSocket.js";
import { useOfficeStore } from "./store/officeStore.js";
import { ApprovalDock, ConnectionBanner, EntityPanel, KpiBoard, LogViewer, RoomNav } from "./ui/panels.js";
import { OfficeFallback } from "./fallback/OfficeFallback.js";
import { forceFallback, isWebGLAvailable } from "./lib/webgl.js";

// Cảnh 3D tải lười: máy không có WebGL không phải tải three.js/R3F.
const OfficeScene = lazy(() => import("./renderer/OfficeScene.js"));

/** Bắt lỗi dựng 3D (shader, hết bộ nhớ GPU...) và chuyển sang bảng dự phòng thay vì trắng màn hình. */
class SceneBoundary extends Component<{ fallback: (msg: string) => ReactNode; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render(): ReactNode {
    return this.state.error ? this.props.fallback(`Cảnh 3D gặp lỗi: ${this.state.error}`) : this.props.children;
  }
}

export function App() {
  const { reconnect } = useOfficeSocket();
  const webglLost = useOfficeStore((s) => s.webglLost);
  const webgl = useMemo(() => isWebGLAvailable(), []);
  const forced = useMemo(() => forceFallback(), []);

  const fallbackReason = forced
    ? "Đang ở chế độ danh sách (?fallback=1)."
    : !webgl
      ? "Trình duyệt này không hỗ trợ WebGL nên không thể hiển thị cảnh 3D."
      : webglLost
        ? "Card đồ hoạ vừa mất ngữ cảnh WebGL. Tải lại trang để thử dựng lại cảnh 3D."
        : null;

  return (
    <div className="shell">
      <ConnectionBanner onReconnect={reconnect} />
      <main className="stage">
        {fallbackReason ? (
          <OfficeFallback reason={fallbackReason} />
        ) : (
          <SceneBoundary fallback={(msg) => <OfficeFallback reason={msg} />}>
            <Suspense fallback={<div className="loading">Đang dựng văn phòng 3D…</div>}>
              <OfficeScene />
            </Suspense>
          </SceneBoundary>
        )}
      </main>
      <div className="side left">
        <KpiBoard />
        <LogViewer />
      </div>
      <div className="side right">
        <EntityPanel />
      </div>
      <RoomNav />
      <ApprovalDock />
      <a className="legacy-link" href="/">
        Giao diện cổ điển
      </a>
    </div>
  );
}
