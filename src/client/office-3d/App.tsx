import { Component, lazy, Suspense, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { OfficeFallback } from "./fallback/OfficeFallback.js";
import { useT } from "./i18n/index.js";
import { forceFallback, isWebGLAvailable } from "./lib/webgl.js";
import { useReducedMotion } from "./lib/motion.js";
import { useDesktopAlerts } from "./realtime/useDesktopAlerts.js";
import { useOfficeSocket } from "./realtime/useOfficeSocket.js";
import { useOfficeStore } from "./store/officeStore.js";
import { useSettings } from "./store/settings.js";
import { usePerf } from "./store/perf.js";
import { TABS, tabAfterKey, useUi } from "./store/ui.js";
import { Header } from "./ui/Header.js";
import { Onboarding, SettingsDialog } from "./ui/Modals.js";
import { AiPanel } from "./ui/AiPanel.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";
import { CrmPanel } from "./ui/CrmPanel.js";
import { OrgPanel } from "./ui/OrgPanel.js";
import { ApprovalDock, ConnectionBanner, EntityPanel, FlowAnnouncer, LogViewer, OverviewTab, RoomNav } from "./ui/panels.js";
import { WhatIfPanel } from "./ui/WhatIfPanel.js";

// Cảnh 3D tải lười: máy không có WebGL không phải tải three.js/R3F.
const OfficeScene = lazy(() => import("./renderer/OfficeScene.js"));

/** Bắt lỗi dựng 3D (shader, hết bộ nhớ GPU...) và chuyển sang bảng dự phòng thay vì trắng màn hình. */
class SceneBoundary extends Component<{ fallback: (msg: string) => ReactNode; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

export function App() {
  const t = useT();
  const { reconnect } = useOfficeSocket();
  useDesktopAlerts();
  const webglLost = useOfficeStore((s) => s.webglLost);
  const offline = useOfficeStore((s) => s.connection !== "open");
  const onboarded = useSettings((s) => s.onboarded);
  const webgl = useMemo(() => isWebGLAvailable(), []);
  const forced = useMemo(() => forceFallback(), []);
  const tab = useUi((u) => u.tab);
  const setTab = useUi((u) => u.setTab);
  const settingsOpen = useUi((u) => u.settingsOpen);
  const openSettings = useUi((u) => u.openSettings);
  const closeSettings = useUi((u) => u.closeSettings);
  const [dockOpen, setDockOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);

  const lang = useSettings((s) => s.lang);
  // Trang phải khai báo đúng ngôn ngữ đang hiển thị (trình đọc màn hình chọn giọng đọc theo `lang`).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Giảm chuyển động: CSS tắt mọi hoạt ảnh/chuyển tiếp qua thuộc tính này; cảnh 3D đọc cùng quyết định (xem OfficeScene).
  const reduced = useReducedMotion();
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);

  /** Mẫu ARIA tablist: ←/→ chuyển tab (vòng), Home/End về đầu/cuối; chỉ tab đang chọn nằm trong thứ tự Tab. */
  const onTabKeys = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next = tabAfterKey(tab, e.key);
    if (!next) return;
    e.preventDefault();
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  const fallbackReason = forced
    ? t("fallback.forced")
    : !webgl
      ? t("fallback.noWebgl")
      : webglLost
        ? t("fallback.lost")
        : null;

  return (
    <div className={`shell${offline ? " offline" : ""}`}>
      <Header onOpenSettings={() => openSettings()} />
      <ConnectionBanner onReconnect={reconnect} />
      <PerfNotice />
      {/* Yêu cầu duyệt là việc gấp và chặn tiến độ: đứng ngay sau thanh đầu trong thứ tự Tab (vị trí hiển thị do CSS quyết định) */}
      <ApprovalDock />
      <FlowAnnouncer />

      <main className="stage" aria-label={t("scene.aria")}>
        {fallbackReason ? (
          <OfficeFallback reason={fallbackReason} />
        ) : (
          <SceneBoundary fallback={(msg) => <OfficeFallback reason={t("scene.error", { msg })} />}>
            <Suspense fallback={<div className="loading">{t("scene.loading")}</div>}>
              <OfficeScene />
            </Suspense>
          </SceneBoundary>
        )}
      </main>

      <aside className={`dock left${dockOpen ? "" : " closed"}`} aria-label={t("tab.org")}>
        <button className="dock-toggle" onClick={() => setDockOpen((v) => !v)} aria-expanded={dockOpen} aria-label={dockOpen ? t("common.close") : t("tab.org")}>
          {dockOpen ? "‹" : "›"}
        </button>
        {dockOpen && (
          <div className="card dockcard">
            <div className="tabs" role="tablist" aria-label={t("tab.list")} onKeyDown={onTabKeys}>
              {TABS.map((id) => (
                <button
                  key={id}
                  id={`tab-${id}`}
                  role="tab"
                  aria-selected={tab === id}
                  aria-controls="tabpanel"
                  tabIndex={tab === id ? 0 : -1}
                  className={tab === id ? "on" : ""}
                  onClick={() => setTab(id)}
                >
                  {t(`tab.${id}`)}
                </button>
              ))}
            </div>
            <div className="tabbody" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`}>
              <ErrorBoundary inline resetKey={tab}>
                {tab === "org" ? <OrgPanel /> : tab === "ai" ? <AiPanel /> : tab === "crm" ? <CrmPanel /> : tab === "log" ? <LogViewer /> : tab === "whatif" ? <WhatIfPanel /> : <OverviewTab />}
              </ErrorBoundary>
            </div>
          </div>
        )}
      </aside>

      <div className="dock right">
        <EntityPanel />
      </div>

      <RoomNav />
      <div className="hint">{t("scene.hint")}</div>
      <a className="legacy-link" href="/">
        {t("app.classic")}
      </a>

      {!onboarded && <Onboarding />}
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
    </div>
  );
}

/** Báo người dùng khi app tự hạ chất lượng đồ hoạ (kèm cách đổi lại trong Cài đặt). */
function PerfNotice() {
  const t = useT();
  const open = usePerf((p) => p.noticeOpen);
  const dismiss = usePerf((p) => p.dismissNotice);
  const openSettings = useUi((u) => u.openSettings);
  if (!open) return null;
  return (
    <div className="perfnotice" role="status">
      <span>{t("perf.lowered")}</span>
      <button onClick={() => openSettings()}>{t("perf.change")}</button>
      <button className="icon" aria-label={t("common.close")} onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
