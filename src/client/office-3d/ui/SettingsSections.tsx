/**
 * Các mục "thật" trong Cài đặt: truy cập từ máy khác (LAN + mã truy cập), email SMTP/IMAP, token GitHub.
 * Cả ba chỉ thao tác được từ chính máy chạy ứng dụng (server từ chối máy khác bằng mã `loopbackOnly`) — khi bị từ chối,
 * mục hiện ghi chú thay vì lỗi khó hiểu. Khoá/mật khẩu chỉ đi một chiều lên server, không bao giờ được tải lại.
 */
import { useEffect, useRef, useState } from "react";
import type { MailPublicConfig } from "../../../shared/mail.js";
import { useT } from "../i18n/index.js";
import {
  ApiError,
  type AuthInfo,
  errorText,
  getAudit,
  getAuthInfo,
  getGithubStatus,
  getMailConfig,
  putGithubToken,
  putMailConfig,
  restoreBackup,
  rotateToken,
  setLan,
} from "../lib/api.js";
import { canRestartApp, restartApp } from "../lib/desktop.js";
import { usePoll } from "../lib/usePoll.js";
import { useSettings } from "../store/settings.js";
import { useUi, type SettingsSection } from "../store/ui.js";
import { previewBackupText, type BackupPreview } from "./backupLogic.js";
import { formatAuditDetail, formatWhen } from "./crmLogic.js";

const isLoopbackOnly = (e: unknown): boolean => e instanceof ApiError && e.code === "loopbackOnly";

/**
 * Trạng thái LAN người dùng ĐÃ CHỌN: `lan` là trạng thái đang chạy, `restartRequired` nghĩa là lựa chọn đã lưu khác trạng thái đang chạy
 * (đúng một trong hai → lựa chọn là điều ngược lại với trạng thái đang chạy).
 */
export function lanWanted(info: Pick<AuthInfo, "lan" | "restartRequired">): boolean {
  return info.lan !== info.restartRequired;
}

function Section({ id, title, children }: { id: SettingsSection; title: string; children: React.ReactNode }) {
  const target = useUi((s) => s.settingsSection);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (target === id) ref.current?.scrollIntoView({ block: "start" });
  }, [target, id]);
  return (
    <section ref={ref} className="setsection" data-section={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function NetworkSection() {
  const t = useT();
  const info = usePoll(getAuthInfo, 10_000);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Giá trị công tắc LAN hiện ngay khi bấm (không đợi máy chủ trả lời); bỏ đi khi dữ liệu thật về hoặc khi lỗi. */
  const [pendingLan, setPendingLan] = useState<boolean | null>(null);
  const bump = useUi((u) => u.bumpAudit);

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      bump();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      await info.reload();
      setPendingLan(null);
      setBusy(false);
    }
  };

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard bị chặn: người dùng vẫn chép tay được vì mã đang hiện */
    }
  };

  return (
    <Section id="network" title={t("settings.network")}>
      {isLoopbackOnly(info.error) ? (
        <p className="muted small">{t("settings.lan.localOnly")}</p>
      ) : (
        <>
          <label className="field check">
            <input
              type="checkbox"
              disabled={!info.data || busy}
              checked={pendingLan ?? (info.data ? lanWanted(info.data) : false)}
              onChange={(e) => {
                setPendingLan(e.target.checked);
                void act(() => setLan(e.target.checked));
              }}
            />
            <span>{t("settings.lan.enable")}</span>
          </label>
          <p className="muted small">{t("settings.lan.hint")}</p>

          {info.data?.restartRequired && (
            <p className="warn" role="status">
              {t("settings.lan.restart")}{" "}
              {canRestartApp() && (
                <button className="primary" onClick={restartApp}>
                  {t("settings.lan.restartNow")}
                </button>
              )}
            </p>
          )}

          {info.data?.lan && (
            <>
              <div className="field col">
                <span>{t("settings.lan.urls")}</span>
                {info.data.urls.length === 0 ? (
                  <small className="muted">{t("settings.lan.noUrls")}</small>
                ) : (
                  <ul className="plainlist">
                    {info.data.urls.map((u) => (
                      <li key={u}>
                        <code>{u}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="field col">
                <span>{t("settings.lan.token")}</span>
                <div className="airow">
                  <input readOnly value={reveal ? info.data.token : "•".repeat(16)} aria-label={t("settings.lan.token")} onFocus={(e) => e.target.select()} />
                  <button onClick={() => setReveal((v) => !v)}>{reveal ? t("common.hide") : t("common.show")}</button>
                  <button onClick={() => void copy(info.data!.token)}>{copied ? t("common.copied") : t("common.copy")}</button>
                </div>
                <div className="airow">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await rotateToken();
                        setReveal(true);
                      })
                    }
                  >
                    {t("settings.lan.rotate")}
                  </button>
                  <small className="muted">{t("settings.lan.rotateHint")}</small>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {err && <p className="warn" role="alert">{err}</p>}
    </Section>
  );
}

interface MailForm {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  smtpPass: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
}

export function mailFormFrom(cfg: MailPublicConfig | undefined): MailForm {
  return {
    smtpHost: cfg?.smtp?.host ?? "",
    smtpPort: String(cfg?.smtp?.port ?? 465),
    smtpSecure: cfg?.smtp?.secure ?? true,
    smtpUser: cfg?.smtp?.user ?? "",
    smtpFrom: cfg?.smtp?.from && cfg.smtp.from !== cfg.smtp.user ? cfg.smtp.from : "",
    smtpPass: "",
    imapHost: cfg?.imap?.host ?? "",
    imapPort: String(cfg?.imap?.port ?? 993),
    imapSecure: cfg?.imap?.secure ?? true,
    imapUser: cfg?.imap?.user ?? "",
    imapPass: "",
  };
}

/** Chuyển form → body PUT. Máy chủ để trống = không cấu hình phần đó; mật khẩu để trống = giữ nguyên mật khẩu đã lưu. */
export function mailBody(f: MailForm): Parameters<typeof putMailConfig>[0] {
  const body: Parameters<typeof putMailConfig>[0] = {};
  if (f.smtpHost.trim()) {
    body.smtp = {
      host: f.smtpHost.trim(),
      port: Number(f.smtpPort) || 465,
      secure: f.smtpSecure,
      user: f.smtpUser.trim(),
      ...(f.smtpFrom.trim() ? { from: f.smtpFrom.trim() } : {}),
    };
  }
  if (f.imapHost.trim()) {
    body.imap = { host: f.imapHost.trim(), port: Number(f.imapPort) || 993, secure: f.imapSecure, user: f.imapUser.trim() };
  }
  if (f.smtpPass) body.smtpPass = f.smtpPass;
  if (f.imapPass) body.imapPass = f.imapPass;
  return body;
}

export function EmailSection() {
  const t = useT();
  const bump = useUi((u) => u.bumpAudit);
  const cfg = usePoll(getMailConfig, 60_000);
  const [form, setForm] = useState<MailForm>(() => mailFormFrom(undefined));
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Điền form một lần từ cấu hình đã lưu; các lần tải định kỳ sau đó không ghi đè điều người dùng đang gõ.
  useEffect(() => {
    if (cfg.data && !loadedOnce) {
      setForm(mailFormFrom(cfg.data));
      setLoadedOnce(true);
    }
  }, [cfg.data, loadedOnce]);

  const set = <K extends keyof MailForm>(k: K, v: MailForm[K]): void => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const saved = await putMailConfig(mailBody(form));
      bump();
      setForm((f) => ({ ...mailFormFrom(saved), smtpPass: "", imapPass: "" }));
      setState({ tone: "ok", text: t("common.saved") });
      await cfg.reload();
    } catch (err) {
      setState({ tone: "bad", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  if (isLoopbackOnly(cfg.error)) {
    return (
      <Section id="email" title={t("settings.email")}>
        <p className="muted small">{t("settings.lan.localOnly")}</p>
      </Section>
    );
  }

  const smtpPassSet = cfg.data?.smtpPassSet ?? false;
  const imapPassSet = cfg.data?.imapPassSet ?? false;

  return (
    <Section id="email" title={t("settings.email")}>
      <p className="muted small">{t("settings.email.hint")}</p>
      <form className="mailform" onSubmit={(e) => void save(e)}>
        <h4>{t("settings.email.smtp")}</h4>
        <div className="grid2">
          <label className="field col">
            <span>{t("settings.email.host")}</span>
            <input value={form.smtpHost} placeholder="smtp.gmail.com" onChange={(e) => set("smtpHost", e.target.value)} />
          </label>
          <label className="field col">
            <span>{t("settings.email.port")}</span>
            <input value={form.smtpPort} inputMode="numeric" onChange={(e) => set("smtpPort", e.target.value)} />
          </label>
          <label className="field col">
            <span>{t("settings.email.user")}</span>
            <input value={form.smtpUser} autoComplete="off" onChange={(e) => set("smtpUser", e.target.value)} />
          </label>
          <label className="field col">
            <span>{t("settings.email.from")}</span>
            <input value={form.smtpFrom} autoComplete="off" onChange={(e) => set("smtpFrom", e.target.value)} />
          </label>
        </div>
        <label className="field check compact">
          <input type="checkbox" checked={form.smtpSecure} onChange={(e) => set("smtpSecure", e.target.checked)} />
          <span>{t("settings.email.secure")}</span>
        </label>
        <label className="field col">
          <span>{t("settings.email.pass")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.smtpPass}
            placeholder={smtpPassSet ? t("settings.email.passSet") : ""}
            onChange={(e) => set("smtpPass", e.target.value)}
          />
        </label>

        <h4>{t("settings.email.imap")}</h4>
        <div className="grid2">
          <label className="field col">
            <span>{t("settings.email.host")}</span>
            <input value={form.imapHost} placeholder="imap.gmail.com" onChange={(e) => set("imapHost", e.target.value)} />
          </label>
          <label className="field col">
            <span>{t("settings.email.port")}</span>
            <input value={form.imapPort} inputMode="numeric" onChange={(e) => set("imapPort", e.target.value)} />
          </label>
          <label className="field col">
            <span>{t("settings.email.user")}</span>
            <input value={form.imapUser} autoComplete="off" onChange={(e) => set("imapUser", e.target.value)} />
          </label>
          <label className="field check compact">
            <input type="checkbox" checked={form.imapSecure} onChange={(e) => set("imapSecure", e.target.checked)} />
            <span>{t("settings.email.secure")}</span>
          </label>
        </div>
        <label className="field col">
          <span>{t("settings.email.pass")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.imapPass}
            placeholder={imapPassSet ? t("settings.email.passSet") : ""}
            onChange={(e) => set("imapPass", e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="primary" type="submit" disabled={busy}>
            {t("settings.email.save")}
          </button>
        </div>
      </form>
      {state && (
        <p className={state.tone === "ok" ? "small ok-text" : "warn"} role="status">
          {state.text}
        </p>
      )}
    </Section>
  );
}

export function BackupSection() {
  const t = useT();
  const bump = useUi((u) => u.bumpAudit);
  const probe = usePoll(getGithubStatus, 120_000); // chỉ để biết có phải chính máy chạy ứng dụng không (cùng điều kiện loopback)
  const [picked, setPicked] = useState<{ name: string; text: string; preview: BackupPreview } | null>(null);
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoopbackOnly(probe.error)) return null;

  const choose = async (file: File | undefined): Promise<void> => {
    setState(null);
    setPicked(null);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setState({ tone: "bad", text: t("settings.backup.badFile") });
    const text = await file.text();
    const preview = previewBackupText(text);
    if (!preview.ok) return setState({ tone: "bad", text: t("settings.backup.badFile") });
    setPicked({ name: file.name, text, preview });
  };

  const confirm = async (): Promise<void> => {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await restoreBackup(picked.text);
      bump();
      setState({ tone: "ok", text: t("settings.backup.done", { ...r.counts }) });
      setPicked(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setState({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="backup" title={t("settings.backup")}>
      <p className="muted small">{t("settings.backup.hint")}</p>
      <div className="airow">
        <a className="btnlink" href="/api/backup" download onClick={() => setTimeout(bump, 800)}>
          {t("settings.backup.download")}
        </a>
        <button onClick={() => fileRef.current?.click()}>{t("settings.backup.restore")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label={t("settings.backup.restore")} onChange={(e) => void choose(e.target.files?.[0])} />
      </div>
      {picked?.preview.ok && (
        <div className="callout" role="alertdialog" aria-label={t("settings.backup.restore")}>
          <p className="small">{t("settings.backup.confirm", { name: picked.name, contacts: picked.preview.counts.contacts, deals: picked.preview.counts.deals, events: picked.preview.counts.events })}</p>
          <div className="airow">
            <button className="danger" disabled={busy} onClick={() => void confirm()}>
              {t("settings.backup.confirmYes")}
            </button>
            <button disabled={busy} onClick={() => setPicked(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {state && (
        <p className={state.tone === "ok" ? "small ok-text" : "warn"} role="status">
          {state.text}
        </p>
      )}
    </Section>
  );
}

export function AuditSection() {
  const t = useT();
  const lang = useSettings((x) => x.lang);
  const log = usePoll(() => getAudit(40), 15_000);
  const tick = useUi((u) => u.auditTick);
  useEffect(() => {
    if (tick > 0) void log.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  if (isLoopbackOnly(log.error)) return null;
  return (
    <Section id="audit" title={t("settings.audit")}>
      <p className="muted small">{t("settings.audit.hint")}</p>
      {log.error !== undefined && <p className="warn" role="alert">{errorText(t, log.error)}</p>}
      <ul className="auditlist">
        {(log.data ?? []).length === 0 && !log.loading && <li className="muted small">{t("settings.audit.empty")}</li>}
        {(log.data ?? []).map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="muted small">{formatWhen(lang, e.at)}</span>
            <b>{t(`audit.kind.${e.kind}`)}</b>
            <span className="orgchip">{t(`audit.actor.${e.actor}`)}</span>
            {Object.keys(e.detail).length > 0 && <code className="small">{formatAuditDetail(e.detail)}</code>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function GithubSection() {
  const t = useT();
  const bump = useUi((u) => u.bumpAudit);
  const status = usePoll(getGithubStatus, 60_000);
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const save = async (value: string): Promise<void> => {
    setState(null);
    try {
      await putGithubToken(value);
      bump();
      setToken("");
      setState({ tone: "ok", text: t("common.saved") });
    } catch (e) {
      setState({ tone: "bad", text: errorText(t, e) });
    }
    await status.reload();
  };

  if (isLoopbackOnly(status.error)) return null;

  return (
    <Section id="github" title={t("settings.github")}>
      <p className="muted small">{t("settings.github.hint")}</p>
      {status.data?.hasToken && <p className="small ok-text">{t("settings.github.set")}</p>}
      <form
        className="airow"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) void save(token.trim());
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          maxLength={500}
          placeholder={t("settings.github.placeholder")}
          aria-label={t("settings.github.placeholder")}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!token.trim()}>
          {t("settings.github.save")}
        </button>
        {status.data?.hasToken && (
          <button type="button" onClick={() => void save("")}>
            {t("settings.github.clear")}
          </button>
        )}
      </form>
      {state && (
        <p className={state.tone === "ok" ? "small ok-text" : "warn"} role="status">
          {state.text}
        </p>
      )}
    </Section>
  );
}
