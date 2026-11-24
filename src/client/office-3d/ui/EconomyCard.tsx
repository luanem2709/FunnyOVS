/**
 * Thẻ "Kinh tế tự trị" ở tab Tổng quan: trạng thái EAL, đã thu / chi phí / lãi lỗ, bộ đếm lỗ liên tiếp, báo cáo đang bán, cơ hội chờ duyệt,
 * sự kiện gần đây và điều khiển Scout (tạm dừng / tiếp tục / bật-tắt lịch). Việc duyệt cơ hội/xuất bản/tái đầu tư làm ở hộp duyệt trong cảnh 3D.
 */
import { useState } from "react";
import { formatUsd, type EconomyEvent } from "../../../shared/economy.js";
import { economyStatus, TONE_COLOR } from "../../assets/economyBoard.js";
import { useT } from "../i18n/index.js";
import { economyPause, economyResume, economyScouts, errorText } from "../lib/api.js";
import { useOfficeStore } from "../store/officeStore.js";

const eventText = (e: EconomyEvent): string => [e.amount !== undefined ? formatUsd(e.amount) : "", e.topic ?? "", e.note ?? ""].filter(Boolean).join(" · ");

export function EconomyCard() {
  const t = useT();
  const s = useOfficeStore((d) => d.economy);
  const [err, setErr] = useState("");
  if (!s) return null;
  const st = economyStatus(s);
  const run = (fn: () => Promise<unknown>) => async (): Promise<void> => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errorText(t, e));
    }
  };
  if (!s.enabled) {
    return (
      <section className="ecocard" aria-label={t("eco.title.aria")}>
        <h3>{t("eco.title")}</h3>
        <p className="muted small">{t("eco.off")}</p>
      </section>
    );
  }
  return (
    <section className="ecocard" aria-label={t("eco.title.aria")} data-eco-status={st.tone}>
      <h3>
        {t("eco.title")}{" "}
        <span className="ecochip" style={{ borderColor: TONE_COLOR[st.tone], color: TONE_COLOR[st.tone] }} role="status">
          {t(st.key)}
        </span>{" "}
        <span className="ecochip" style={{ borderColor: s.mode === "live" ? TONE_COLOR.bad : TONE_COLOR.warn, color: s.mode === "live" ? TONE_COLOR.bad : TONE_COLOR.warn }}>
          {s.mode === "live" ? t("eco.mode.live") : t("eco.mode.test")}
        </span>
      </h3>
      <div className="ecostats">
        <div><span className="muted small">{t("eco.received")}</span><b>{formatUsd(s.receivedMicro)}</b></div>
        <div><span className="muted small">{t("eco.cost")}</span><b>{formatUsd(s.costMicro)}</b></div>
        <div><span className="muted small">{t("eco.net")}</span><b style={{ color: s.netMicro < 0 ? TONE_COLOR.bad : s.netMicro > 0 ? TONE_COLOR.ok : undefined }}>{formatUsd(s.netMicro)}</b></div>
      </div>
      <div className="muted small">
        {t("eco.lastCycle")}: {s.lastCycle ? `${formatUsd(s.lastCycle.net)} (${formatUsd(s.lastCycle.revenue)} − ${formatUsd(s.lastCycle.cost)})` : "—"} · {t("eco.streak", { n: s.negativeStreak, max: s.negativeLimit })}
      </div>
      <div className="muted small">{t("eco.scouts")}: {s.scoutsActive ? t("eco.scouts.on") : t("eco.scouts.off")}{s.payTo ? ` · ${t("eco.payTo")}: ${s.payTo}` : ""}</div>
      <div className={s.ledgerOk ? "muted small" : "warn"} role={s.ledgerOk ? undefined : "alert"}>{s.ledgerOk ? t("eco.ledgerOk", { n: s.ledgerCount }) : t("eco.ledgerBad")}</div>

      <h4>{t("eco.products")}</h4>
      {s.products.length === 0 ? <p className="muted small">{t("eco.noProducts")}</p> : <ul className="ecolist">{s.products.map((p) => <li key={p.topic}>{p.title} <span className="muted">({p.topic}) · {formatUsd(p.priceMicro)}</span></li>)}</ul>}

      <h4>{t("eco.pending")}</h4>
      {s.pending.length === 0 ? <p className="muted small">{t("eco.noPending")}</p> : <ul className="ecolist">{s.pending.map((o) => <li key={o.id}>{o.title} <span className="muted">· {formatUsd(o.estRevenue - o.estCost)} · {o.risk}</span></li>)}</ul>}

      {s.recent.length > 0 && (
        <>
          <h4>{t("eco.recent")}</h4>
          <ul className="ecolist">{s.recent.map((e) => <li key={e.id}><b>{t(`eco.event.${e.kind}`)}</b> <span className="muted">{eventText(e)}</span></li>)}</ul>
        </>
      )}

      <div className="ecoactions" role="group" aria-label={t("eco.actions")}>
        {s.paused ? (
          <button onClick={run(economyResume)}>{t("eco.resume")}</button>
        ) : (
          <button onClick={run(economyPause)}>{t("eco.pause")}</button>
        )}
        <button onClick={run(() => economyScouts(!s.scoutsActive))} disabled={s.paused || s.emergency}>
          {s.scoutsActive ? t("eco.scouts.turnOff") : t("eco.scouts.turnOn")}
        </button>
      </div>
      {err && <div className="warn" role="alert">{err}</div>}
    </section>
  );
}
