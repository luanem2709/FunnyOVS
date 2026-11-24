/**
 * Thanh đầu: tên công ty, trạng thái kết nối, số liệu nhanh, mức tự động, dừng khẩn cấp, cài đặt.
 */
import { useEffect } from "react";
import { useT } from "../i18n/index.js";
import { emergencyStop, setAutomationLevel } from "../lib/api.js";
import { useSettings } from "../store/settings.js";
import { useHealth } from "../store/health.js";
import { useOfficeStore } from "../store/officeStore.js";
import { useUi } from "../store/ui.js";
import { readyNames } from "./aiForm.js";
import { useCounts } from "./panels.js";

const HEALTH_POLL_MS = 20_000;

/** Chỉ báo sức khoẻ: AI nào đang sẵn sàng (hoặc cảnh báo chưa có AI — bấm để mở tab kết nối) và lỗi dữ liệu. */
function HealthPill() {
  const t = useT();
  const setTab = useUi((u) => u.setTab);
  const data = useHealth((h) => h.health);
  const refresh = useHealth((h) => h.refresh);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  if (!data) return null;
  if (!data.db.ok) {
    return (
      <span className="pill bad" role="status" title={t("health.dbBad")}>
        <i /> <span className="pill-text">{t("health.dbBad")}</span>
      </span>
    );
  }
  const detail = t("health.detail", { v: data.version, min: Math.round(data.uptimeSec / 60), mb: data.memoryMb });
  return (
    <button
      className={`pill healthpill ${data.ai.ready ? "ok" : "warnpill"}`}
      onClick={() => setTab("ai")}
      title={data.ai.ready ? detail : t("health.noAi.hint")}
    >
      <i /> <span className="pill-text">{data.ai.ready ? t("health.ai", { names: readyNames(data.ai) }) : t("health.noAi")}</span>
    </button>
  );
}

const LEVELS = ["ask", "balanced", "autonomous"] as const;

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  const company = useSettings((s) => s.companyName);
  const lang = useSettings((s) => s.lang);
  const setSettings = useSettings((s) => s.set);
  const connection = useOfficeStore((s) => s.connection);
  const level = useOfficeStore((s) => s.automationLevel);
  const emergency = useOfficeStore((s) => s.emergency);
  const c = useCounts();
  const online = connection === "open";

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#4a46d8" />
          <path d="M16 6 6 11v10l10 5 10-5V11L16 6Z" fill="#fff" opacity="0.92" />
          <path d="M16 6v20M6 11l10 5 10-5" stroke="#4a46d8" strokeWidth="1.6" fill="none" />
        </svg>
        <div>
          <div className="company">{company}</div>
          <div className="sub">{t("app.title")}</div>
        </div>
      </div>

      <div className="stats" aria-live="polite">
        <span className={`pill ${online ? "ok" : "bad"}`} title={online ? t("conn.ok") : t("conn.offline")}>
          <i /> <span className="pill-text">{online ? t("conn.ok") : t("conn.offline")}</span>
        </span>
        {online && <HealthPill />}
        <span className="chip st-working">{t("header.working", { n: c.working })}</span>
        <span className="chip st-idle">{t("header.idle", { n: c.idle })}</span>
        <span className={`chip st-pending-approval${c.pending ? " hot" : ""}`}>{t("header.pending", { n: c.pending })}</span>
        <span className={`chip st-error${c.error ? " hot" : ""}`}>{t("header.error", { n: c.error })}</span>
      </div>

      <div className="controls">
        <div className="segmented" role="group" aria-label={t("header.level")}>
          {LEVELS.map((id) => (
            <button
              key={id}
              className={level === id ? "on" : ""}
              aria-pressed={level === id}
              title={t(`level.${id}.hint`)}
              onClick={() => void setAutomationLevel(id)}
            >
              {t(`level.${id}`)}
            </button>
          ))}
        </div>
        <select className="level-select" value={level} onChange={(e) => void setAutomationLevel(e.target.value)} aria-label={t("header.level")}>
          {LEVELS.map((id) => (
            <option key={id} value={id}>
              {t(`level.${id}`)}
            </option>
          ))}
        </select>
        <button className={emergency ? "danger armed" : "danger"} onClick={() => void emergencyStop()} aria-pressed={emergency} title={t("emergency.stop")}>
          <span className="long">{emergency ? t("emergency.armed") : t("emergency.stop")}</span>
          <span className="short">{emergency ? "■" : t("emergency.short")}</span>
        </button>
        <button
          className="icon"
          onClick={() => setSettings({ lang: lang === "vi" ? "en" : "vi" })}
          aria-label={t("settings.language")}
          title={t("settings.language")}
        >
          {lang === "vi" ? "VI" : "EN"}
        </button>
        <button className="icon" onClick={onOpenSettings} aria-label={t("settings.open")} title={t("settings.open")}>
          ⚙
        </button>
      </div>
    </header>
  );
}
