/**
 * "Việc lặp lại" trong tab Tổ chức: lịch giao việc tự động (hằng ngày / hằng tuần vào giờ đặt), giao cho Giám đốc hoặc một người cụ thể.
 * Đến giờ server giao việc như khi bạn tự giao (vẫn qua ước lượng token, duyệt, ngân sách; dừng khẩn cấp thì bỏ qua).
 */
import { useMemo, useState } from "react";
import { FREQUENCIES, type Frequency, type ScheduleView } from "../../../shared/schedule.js";
import { useT } from "../i18n/index.js";
import { createSchedule, deleteSchedule, errorText, listSchedules, runScheduleNow, setScheduleEnabled } from "../lib/api.js";
import { usePoll } from "../lib/usePoll.js";
import { useOfficeStore } from "../store/officeStore.js";
import { useSettings } from "../store/settings.js";
import { formatWhen } from "./crmLogic.js";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** "Hằng ngày lúc 09:00 → Hùng" / "Thứ Hai hằng tuần lúc 08:00 → Hùng" theo ngôn ngữ hiện tại. */
export function describeSchedule(t: TFn, s: Pick<ScheduleView, "frequency" | "at" | "weekday">, who: string): string {
  return s.frequency === "weekly"
    ? t("schedule.every.weekly", { day: t(`schedule.weekday.${s.weekday ?? 1}`), at: s.at, who })
    : t("schedule.every.daily", { at: s.at, who });
}

export function SchedulePanel() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const entities = useOfficeStore((s) => s.entities);
  const list = usePoll(listSchedules, 15_000);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [to, setTo] = useState("giamdoc");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [time, setTime] = useState("08:30");
  const [weekday, setWeekday] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const agents = useMemo(
    () =>
      Object.values(entities)
        .filter((e) => e.kind === "agent")
        .map((e) => ({ id: String((e.metadata as { agentId?: string }).agentId ?? e.id), name: e.name, tier: Number((e.metadata as { tier?: number }).tier ?? 3) }))
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "vi")),
    [entities],
  );
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
      await list.reload();
    }
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await act(async () => {
      await createSchedule({ title, prompt, toAgentId: to, frequency, at: time, ...(frequency === "weekly" ? { weekday } : {}), lang });
      setTitle("");
      setPrompt("");
    });
  };

  const items = list.data ?? [];

  return (
    <div className="schedulepanel">
      <h3>{t("schedule.title")}</h3>
      {list.error !== undefined && <p className="warn" role="alert">{errorText(t, list.error)}</p>}
      <ul className="schedules">
        {items.length === 0 && !list.loading && <li className="muted small">{t("schedule.empty")}</li>}
        {items.map((s) => (
          <li key={s.id} className={s.enabled ? "" : "off"}>
            <div className="schedhead">
              <b>{s.title}</b>
              {!s.enabled && <span className="orgchip">{t("schedule.paused")}</span>}
              {s.lastStatus && <span className={`orgchip sched-${s.lastStatus}`}>{t(`schedule.last.${s.lastStatus}`)}</span>}
            </div>
            <div className="muted small">{describeSchedule(t, s, nameOf(s.toAgentId))}</div>
            {s.enabled && <div className="muted small">{t("schedule.next", { when: formatWhen(lang, s.nextRunAt) })}</div>}
            {s.lastError && <div className="warn">{s.lastError}</div>}
            <div className="airow">
              <button disabled={busy} onClick={() => void act(() => runScheduleNow(s.id))}>
                {t("schedule.runNow")}
              </button>
              <button disabled={busy} onClick={() => void act(() => setScheduleEnabled(s.id, !s.enabled))}>
                {s.enabled ? t("schedule.pause") : t("schedule.resume")}
              </button>
              <button disabled={busy} aria-label={`${t("schedule.delete")}: ${s.title}`} onClick={() => void act(() => deleteSchedule(s.id))}>
                {t("schedule.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <details className="addform">
        <summary>{t("schedule.add")}</summary>
        <form onSubmit={(e) => void submit(e)}>
          <input value={title} maxLength={120} required placeholder={t("schedule.field.title")} aria-label={t("schedule.field.title")} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={3} value={prompt} maxLength={4000} required placeholder={t("schedule.field.prompt")} aria-label={t("schedule.field.prompt")} onChange={(e) => setPrompt(e.target.value)} />
          <select value={to} aria-label={t("schedule.field.to")} onChange={(e) => setTo(e.target.value)}>
            {agents.length === 0 && <option value="giamdoc">giamdoc</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {t("org.recipientOption", { tier: t(`tier.${a.tier}`), name: a.name })}
              </option>
            ))}
          </select>
          <div className="airow">
            <select value={frequency} aria-label={t("schedule.field.frequency")} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {t(`schedule.freq.${f}`)}
                </option>
              ))}
            </select>
            {frequency === "weekly" && (
              <select value={weekday} aria-label={t("schedule.field.weekday")} onChange={(e) => setWeekday(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {t(`schedule.weekday.${d}`)}
                  </option>
                ))}
              </select>
            )}
            <input type="time" value={time} required aria-label={t("schedule.field.time")} onChange={(e) => setTime(e.target.value)} />
          </div>
          <button className="primary" type="submit" disabled={busy || !title.trim() || !prompt.trim()}>
            {t("schedule.create")}
          </button>
        </form>
      </details>
      {err && <p className="warn" role="alert">{err}</p>}
    </div>
  );
}
