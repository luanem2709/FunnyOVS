/**
 * Hộp thoại: hướng dẫn lần đầu (onboarding) và Cài đặt.
 * Cả hai là dialog có focus bẫy cơ bản (Esc để đóng, nút đầu tiên được focus) để dùng được bằng bàn phím.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.js";
import type { Lang } from "../i18n/dictionaries.js";
import { errorText, getConfig, putConfig } from "../lib/api.js";
import { useSettings, type LabelMode, type MotionSetting, type Quality } from "../store/settings.js";
import { AuditSection, BackupSection, EmailSection, GithubSection, NetworkSection } from "./SettingsSections.js";

declare const __APP_VERSION__: string;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Dialog({ title, onClose, children, closable = true }: { title: string; onClose?: () => void; children: React.ReactNode; closable?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && closable) onClose?.();
      if (e.key !== "Tab" || !ref.current) return;
      // Bẫy focus: Tab/Shift+Tab xoay vòng trong hộp thoại, không rơi ra trang phía sau.
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !ref.current.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [closable, onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => closable && e.target === e.currentTarget && onClose?.()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          {closable && (
            <button className="icon" onClick={onClose} aria-label={t("common.close")}>
              ✕
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function LangSwitch() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  return (
    <div className="field">
      <span>{t("settings.language")}</span>
      <div className="segmented" role="group" aria-label={t("settings.language")}>
        {(["vi", "en"] as Lang[]).map((l) => (
          <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => set({ lang: l })}>
            {l === "vi" ? "Tiếng Việt" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Onboarding() {
  const t = useT();
  const company = useSettings((s) => s.companyName);
  const set = useSettings((s) => s.set);
  const [name, setName] = useState(company);
  const finish = (): void => set({ companyName: name.trim().slice(0, 40) || company, onboarded: true });
  return (
    <Dialog title={t("onb.title")} closable={false}>
      <LangSwitch />
      <label className="field col">
        <span>{t("onb.company")}</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finish()} />
        <small className="muted">{t("onb.companyHint")}</small>
      </label>
      <ol className="steps">
        <li>{t("onb.step1")}</li>
        <li>{t("onb.step2")}</li>
        <li>{t("onb.step3")}</li>
      </ol>
      <p className="muted small">🔒 {t("onb.safety")}</p>
      <div className="modal-actions">
        <button className="primary" onClick={finish}>
          {t("onb.start")}
        </button>
      </div>
    </Dialog>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useSettings();
  const [name, setName] = useState(s.companyName);
  const [cursorQuota, setCursorQuota] = useState<boolean | null>(null);
  const [cfgError, setCfgError] = useState<unknown>(undefined);

  useEffect(() => {
    getConfig()
      .then((c) => setCursorQuota(Boolean(c.cursorQuotaEnabled)))
      .catch((e: unknown) => setCfgError(e));
  }, []);

  const toggleQuota = (v: boolean): void => {
    setCursorQuota(v);
    putConfig({ cursorQuotaEnabled: v }).catch((e: unknown) => {
      setCursorQuota(!v);
      setCfgError(e);
    });
  };

  return (
    <Dialog title={t("settings.title")} onClose={onClose}>
      <LangSwitch />
      <label className="field col">
        <span>{t("settings.company")}</span>
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => s.set({ companyName: name.trim().slice(0, 40) || s.companyName })}
        />
      </label>
      <label className="field check">
        <input type="checkbox" checked={s.idleLife} onChange={(e) => s.set({ idleLife: e.target.checked })} />
        <span>{t("settings.idleLife")}</span>
      </label>
      <label className="field col">
        <span>{t("settings.labels")}</span>
        <select value={s.labels} onChange={(e) => s.set({ labels: e.target.value as LabelMode })}>
          <option value="auto">{t("settings.labels.auto")}</option>
          <option value="always">{t("settings.labels.always")}</option>
          <option value="off">{t("settings.labels.off")}</option>
        </select>
      </label>
      <label className="field col">
        <span>{t("settings.motion")}</span>
        <select value={s.motion} onChange={(e) => s.set({ motion: e.target.value as MotionSetting })}>
          <option value="system">{t("settings.motion.system")}</option>
          <option value="full">{t("settings.motion.full")}</option>
          <option value="reduced">{t("settings.motion.reduced")}</option>
        </select>
      </label>
      <label className="field col">
        <span>{t("settings.quality")}</span>
        <select value={s.quality} onChange={(e) => s.set({ quality: e.target.value as Quality })}>
          <option value="auto">{t("settings.quality.auto")}</option>
          <option value="high">{t("settings.quality.high")}</option>
          <option value="low">{t("settings.quality.low")}</option>
        </select>
      </label>

      <h3>{t("settings.privacy")}</h3>
      <label className="field check">
        <input type="checkbox" disabled={cursorQuota === null} checked={cursorQuota ?? false} onChange={(e) => toggleQuota(e.target.checked)} />
        <span>{t("settings.cursorQuota")}</span>
      </label>
      <p className="muted small">{t("settings.cursorQuotaHint")}</p>
      {cfgError !== undefined && <p className="warn" role="alert">{errorText(t, cfgError)}</p>}

      <NetworkSection />
      <EmailSection />
      <GithubSection />
      <BackupSection />
      <AuditSection />

      <div className="modal-actions split">
        <button onClick={() => s.set({ onboarded: false })}>{t("settings.reset")}</button>
        <span className="muted small">{t("settings.version", { v: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev" })}</span>
      </div>
    </Dialog>
  );
}
