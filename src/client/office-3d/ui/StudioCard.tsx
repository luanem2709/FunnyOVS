/**
 * Thẻ "Studio dựng clip" ở tab Tổng quan: chọn/tạo dự án, xem thử (ảnh mỗi cảnh), dựng video (có/không giọng), theo dõi tiến độ, huỷ,
 * xem lại clip đã dựng. Gửi lời đọc ra dịch vụ giọng online luôn qua hộp duyệt trong cảnh 3D (không có nút "bỏ qua duyệt" ở đây).
 */
import { useEffect, useState } from "react";
import type { StudioJob } from "../../../shared/studio.js";
import { useT } from "../i18n/index.js";
import { errorText, studioCancel, studioCreate, studioRender } from "../lib/api.js";
import { useOfficeStore } from "../store/officeStore.js";

const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const ACTIVE = new Set(["queued", "awaiting-approval", "running"]);

function modeText(t: (k: string) => string, j: StudioJob): string {
  return [j.preview ? t("studio.mode.preview") : t("studio.mode.full"), j.voice ? t("studio.mode.voice") : ""].filter(Boolean).join(" · ");
}

export function StudioCard() {
  const t = useT();
  const s = useOfficeStore((d) => d.studio);
  const emergency = useOfficeStore((d) => d.emergency);
  const [project, setProject] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const projects = s?.projects ?? [];
  useEffect(() => {
    if (!project || !projects.includes(project)) setProject(projects[0] ?? "");
  }, [projects.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;

  const active = s.jobs.find((j) => ACTIVE.has(j.status));
  const busy = Boolean(active) || emergency;
  const run = (fn: () => Promise<unknown>) => async (): Promise<void> => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errorText(t, e));
    }
  };
  const missing = s.tools ? (["ffmpeg", "chrome", "voice"] as const).filter((k) => !s.tools?.[k]).map((k) => t(`studio.tool.${k}`)) : [];
  const done = s.jobs.find((j) => j.project === project && j.status === "done" && j.output);
  const clip = done && !done.preview ? `/api/studio/projects/${project}/clip.mp4?v=${encodeURIComponent(done.finishedAt ?? "")}` : "";
  const stills = done?.preview ? Array.from({ length: done.previewCount ?? 0 }, (_, n) => n) : [];

  return (
    <section className="studiocard" aria-label={t("studio.aria")}>
      <h3>{t("studio.title")}</h3>
      <p className="muted small">{t("studio.intro")}</p>
      {missing.length > 0 && <div className="warn small" role="status">{t("studio.toolsMissing", { list: missing.join(", ") })}</div>}

      {projects.length === 0 ? (
        <p className="muted small">{t("studio.noProjects")}</p>
      ) : (
        <label className="small">
          {t("studio.project")}{" "}
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label={t("studio.project")}>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      <div className="ecoactions">
        <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder={t("studio.newName")} aria-label={t("studio.newName")} maxLength={41} />
        <button
          disabled={!PROJECT_RE.test(name) || emergency}
          onClick={run(async () => {
            await studioCreate(name);
            setProject(name);
            setName("");
          })}
        >
          {t("studio.create")}
        </button>
      </div>

      {project && (
        <div className="ecoactions" role="group" aria-label={t("studio.title")}>
          <button disabled={busy} onClick={run(() => studioRender(project, { preview: true }))}>{t("studio.preview")}</button>
          <button disabled={busy} onClick={run(() => studioRender(project, {}))}>{t("studio.render")}</button>
          <button disabled={busy} onClick={run(() => studioRender(project, { voice: true }))}>{t("studio.renderVoice")}</button>
        </div>
      )}
      <p className="muted small">{t("studio.voiceNote")}</p>

      <h4>{t("studio.jobs")}</h4>
      {s.jobs.length === 0 ? (
        <p className="muted small">{t("studio.noJobs")}</p>
      ) : (
        <ul className="ecolist studiojobs">
          {s.jobs.slice(0, 5).map((j) => (
            <li key={j.id} data-job-status={j.status}>
              <b>{j.project}</b> <span className="muted">({modeText(t, j)})</span> — {t(`studio.job.${j.status}`)}
              {ACTIVE.has(j.status) && (
                <>
                  <div className="meter studiometer" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)}>
                    <span>{t(`studio.step.${j.step}`)}</span>
                    <div className="bar"><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
                    <b>{Math.round(j.progress * 100)}%</b>
                  </div>
                  <button onClick={run(() => studioCancel(j.id))}>{t("studio.cancel")}</button>
                </>
              )}
              {j.error && <div className="warn small" role="alert">{t(j.error.key, j.error.vars)}{j.error.detail ? ` — ${j.error.detail}` : ""}</div>}
            </li>
          ))}
        </ul>
      )}

      {clip && (
        <>
          <h4>{t("studio.output")}</h4>
          <video className="studiovideo" src={clip} controls preload="metadata" />
        </>
      )}
      {stills.length > 0 && (
        <div className="studiostills">
          {stills.map((n) => <img key={n} src={`/api/studio/projects/${project}/preview/${n}?v=${encodeURIComponent(done?.finishedAt ?? "")}`} alt={t("studio.previewAlt", { n: n + 1 })} loading="lazy" />)}
        </div>
      )}
      {err && <div className="warn" role="alert">{err}</div>}
    </section>
  );
}
