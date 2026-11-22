/**
 * Tab "CRM" — kết quả thật của công cụ nghiệp vụ mà nhân viên dùng: pipeline, liên hệ, email nháp/đã gửi, lịch.
 * Dữ liệu nằm trong SQLite trên máy bạn; bảng này đọc qua REST và tải lại định kỳ để thấy việc nhân viên vừa làm.
 */
import { useState, type KeyboardEvent } from "react";
import { DEAL_STAGES, type DealStage } from "../../../shared/crm.js";
import { plural, useT } from "../i18n/index.js";
import {
  addContact,
  addDeal,
  errorText,
  getCrmSummary,
  getMailConfig,
  listContacts,
  listDeals,
  listDrafts,
  listEvents,
  moveDeal,
} from "../lib/api.js";
import { stepKey } from "../lib/roving.js";
import { usePoll } from "../lib/usePoll.js";
import { useSettings } from "../store/settings.js";
import { useUi } from "../store/ui.js";
import { formatMoney, formatWhen, sortDeals, sortEvents, stageRows } from "./crmLogic.js";

type Sub = "pipeline" | "contacts" | "email" | "calendar";
const SUBS: Sub[] = ["pipeline", "contacts", "email", "calendar"];

function LoadError({ error }: { error: unknown }) {
  const t = useT();
  return error === undefined ? null : <p className="warn" role="alert">{t("crm.loadFail")} {errorText(t, error)}</p>;
}

function Pipeline() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const summary = usePoll(getCrmSummary, 10_000);
  const deals = usePoll(listDeals, 10_000);
  const contacts = usePoll(() => listContacts(), 30_000);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const rows = summary.data ? stageRows(summary.data) : [];
  const list = deals.data ? sortDeals(deals.data) : [];

  const move = async (id: number, stage: DealStage): Promise<void> => {
    setErr(null);
    try {
      await moveDeal(id, stage);
    } catch (e) {
      setErr(errorText(t, e));
    }
    await Promise.all([summary.reload(), deals.reload()]);
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    try {
      await addDeal({ title, value: value.trim() ? Number(value) : undefined, contactId: contactId ? Number(contactId) : undefined });
      setTitle("");
      setValue("");
      setContactId("");
    } catch (e2) {
      setErr(errorText(t, e2));
    }
    await Promise.all([summary.reload(), deals.reload()]);
  };

  return (
    <>
      <LoadError error={summary.error ?? deals.error} />
      {summary.data && (
        <div className="crmkpis">
          <div>
            <small className="muted">{t("crm.openValue")}</small>
            <b>{formatMoney(lang, summary.data.openValue)}</b>
          </div>
          <div>
            <small className="muted">{t("crm.wonValue")}</small>
            <b className="ok-text">{formatMoney(lang, summary.data.wonValue)}</b>
          </div>
          <div>
            <small className="muted">{plural(t, "crm.contactsCount", summary.data.contacts)}</small>
          </div>
        </div>
      )}
      <ul className="stagebars">
        {rows.map((r) => (
          <li key={r.stage}>
            <span className="stagename">{t(`crm.stage.${r.stage}`)}</span>
            <span className="bar" aria-hidden="true">
              <i className={`stage-${r.stage}`} style={{ width: `${Math.round(r.share * 100)}%` }} />
            </span>
            <span className="stagecount" title={formatMoney(lang, r.value)}>
              {r.count}
            </span>
          </li>
        ))}
      </ul>

      <ul className="deals">
        {list.length === 0 && !deals.loading && <li className="muted small">{t("crm.dealsEmpty")}</li>}
        {list.map((d) => (
          <li key={d.id} className="deal">
            <div className="dealmain">
              <b>{d.title}</b>
              <span className="muted small">{d.contactName ?? ""}</span>
            </div>
            <span className="dealvalue">{formatMoney(lang, d.value, d.currency)}</span>
            <select value={d.stage} aria-label={`${d.title}: ${t("crm.moveStage")}`} onChange={(e) => void move(d.id, e.target.value as DealStage)}>
              {DEAL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`crm.stage.${s}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <details className="addform">
        <summary>{t("crm.addDeal")}</summary>
        <form onSubmit={(e) => void submit(e)}>
          <input value={title} maxLength={200} required placeholder={t("crm.field.dealTitle")} aria-label={t("crm.field.dealTitle")} onChange={(e) => setTitle(e.target.value)} />
          <input type="number" min={0} step="any" value={value} placeholder={t("crm.field.value")} aria-label={t("crm.field.value")} onChange={(e) => setValue(e.target.value)} />
          <select value={contactId} aria-label={t("crm.field.contact")} onChange={(e) => setContactId(e.target.value)}>
            <option value="">{t("crm.noContact")}</option>
            {(contacts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="primary" type="submit" disabled={!title.trim()}>
            {t("crm.add")}
          </button>
        </form>
      </details>
      {err && <p className="warn" role="alert">{err}</p>}
    </>
  );
}

function Contacts() {
  const t = useT();
  const [q, setQ] = useState("");
  const list = usePoll(() => listContacts(q), 15_000);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    try {
      await addContact({ name, email: email.trim() || undefined, company: company.trim() || undefined });
      setName("");
      setEmail("");
      setCompany("");
    } catch (e2) {
      setErr(errorText(t, e2));
    }
    await list.reload();
  };

  return (
    <>
      <input
        type="search"
        className="crmsearch"
        value={q}
        placeholder={t("crm.search")}
        aria-label={t("crm.search")}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void list.reload()}
        onBlur={() => void list.reload()}
      />
      <LoadError error={list.error} />
      <ul className="contacts">
        {(list.data ?? []).length === 0 && !list.loading && <li className="muted small">{t("crm.contactsEmpty")}</li>}
        {(list.data ?? []).map((c) => (
          <li key={c.id}>
            <b>{c.name}</b>
            <span className="muted small">{[c.company, c.email].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      <details className="addform">
        <summary>{t("crm.addContact")}</summary>
        <form onSubmit={(e) => void submit(e)}>
          <input value={name} maxLength={120} required placeholder={t("crm.field.name")} aria-label={t("crm.field.name")} onChange={(e) => setName(e.target.value)} />
          <input type="email" value={email} maxLength={254} placeholder={t("crm.field.email")} aria-label={t("crm.field.email")} onChange={(e) => setEmail(e.target.value)} />
          <input value={company} maxLength={120} placeholder={t("crm.field.company")} aria-label={t("crm.field.company")} onChange={(e) => setCompany(e.target.value)} />
          <button className="primary" type="submit" disabled={!name.trim()}>
            {t("crm.add")}
          </button>
        </form>
      </details>
      {err && <p className="warn" role="alert">{err}</p>}
    </>
  );
}

function Email() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const openSettings = useUi((s) => s.openSettings);
  const drafts = usePoll(listDrafts, 10_000);
  const cfg = usePoll(getMailConfig, 30_000);
  const configured = Boolean(cfg.data?.smtp && cfg.data.smtpPassSet);

  return (
    <>
      <LoadError error={drafts.error} />
      {cfg.data && !configured && (
        <div className="callout" role="note">
          <p className="small">{t("crm.mailSetup")}</p>
          <button onClick={() => openSettings("email")}>{t("crm.openMailSettings")}</button>
        </div>
      )}
      <ul className="drafts">
        {(drafts.data ?? []).length === 0 && !drafts.loading && <li className="muted small">{t("crm.draftsEmpty")}</li>}
        {(drafts.data ?? []).map((d) => (
          <li key={d.id}>
            <div className="dealmain">
              <b>{d.subject}</b>
              <span className="muted small">
                {t("crm.draft.to", { to: d.to })} · {formatWhen(lang, d.sentAt || d.createdAt)}
              </span>
              {d.status === "failed" && d.error && <span className="warn">{d.error}</span>}
            </div>
            <span className={`orgchip draft-${d.status}`}>{t(`crm.draft.status.${d.status}`)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Calendar() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const events = usePoll(listEvents, 20_000);
  const sorted = events.data ? sortEvents(events.data) : [];

  return (
    <>
      <LoadError error={events.error} />
      <ul className="events">
        {sorted.length === 0 && !events.loading && <li className="muted small">{t("crm.eventsEmpty")}</li>}
        {sorted.map((e) => (
          <li key={e.id}>
            <b>{e.title}</b>
            <span className="muted small">{formatWhen(lang, e.start)}</span>
          </li>
        ))}
      </ul>
      <a className="small" href="/api/calendar.ics" download="funnyovs.ics">
        {t("crm.exportIcs")}
      </a>
    </>
  );
}

export function CrmPanel() {
  const t = useT();
  const [sub, setSub] = useState<Sub>("pipeline");
  const onKeys = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next = stepKey(SUBS, sub, e.key);
    if (!next) return;
    e.preventDefault();
    setSub(next);
    requestAnimationFrame(() => document.getElementById(`crm-sub-${next}`)?.focus());
  };
  return (
    <section className="crmpanel" aria-label={t("tab.crm")}>
      <div className="segmented subnav" role="tablist" aria-label={t("crm.sub.label")} onKeyDown={onKeys}>
        {SUBS.map((s) => (
          <button
            key={s}
            id={`crm-sub-${s}`}
            role="tab"
            aria-selected={sub === s}
            aria-controls="crm-subpanel"
            tabIndex={sub === s ? 0 : -1}
            className={sub === s ? "on" : ""}
            onClick={() => setSub(s)}
          >
            {t(`crm.sub.${s}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="crm-subpanel" aria-labelledby={`crm-sub-${sub}`}>
        {sub === "pipeline" ? <Pipeline /> : sub === "contacts" ? <Contacts /> : sub === "email" ? <Email /> : <Calendar />}
      </div>
    </section>
  );
}
