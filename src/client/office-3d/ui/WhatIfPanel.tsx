/**
 * WhatIfPanel — Tab "What-If Studio" tích hợp ShotBuilder vào FunnyOVS.
 * Cho phép người dùng tạo kịch bản, upload file JSON cảnh (từ chatbot AI hoặc offline),
 * xem storyboard, và dựng clip hoạt hình "What If" ngay trong app — không tốn token AI khi render.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.js";

type WiStatus = "idle" | "running" | "done" | "error";

interface WiJob {
  id: string;
  project: string;
  status: WiStatus;
  progress: number; // 0..1
  step: string;
  output?: string;
  error?: string;
  startedAt: string;
}

interface WiState {
  jobs: WiJob[];
  projects: string[];
}

async function wiApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/whatif${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? `Lỗi ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function WhatIfPanel() {
  const t = useT();
  const [state, setState] = useState<WiState | null>(null);
  const [err, setErr] = useState("");
  const [project, setProject] = useState("");
  const [newName, setNewName] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scenesJson, setScenesJson] = useState("");
  const [copyDone, setCopyDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

  // Poll trạng thái mỗi 2s
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await wiApi<WiState>("/state");
        if (alive) setState(s);
      } catch {
        // im lặng khi server chưa sẵn sàng
      }
      if (alive) setTimeout(poll, 2000);
    };
    poll();
    return () => { alive = false; };
  }, []);

  const run = (fn: () => Promise<void>) => async () => {
    setErr("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const copyPrompt = () => {
    // Lấy nội dung lệnh cho AI từ LENH_CHO_AI.txt đã copy vào chatbot/what-if-chatbot
    const basePrompt = `Bạn là storyboard artist cho kênh YouTube hoạt hình "What If". Chuyển kịch bản sau thành danh sách cảnh JSON cho công cụ hoạt hình của tôi.\n\nKỊCH BẢN:\n${scriptText}`;
    navigator.clipboard.writeText(basePrompt).then(() => { setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); });
  };

  const handleJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScenesJson(String(ev.target?.result ?? ""));
    reader.readAsText(f);
  };

  const projects = state?.projects ?? [];
  const activeJob = state?.jobs.find((j) => j.status === "running");
  const latestDone = state?.jobs.find((j) => j.project === project && j.status === "done" && j.output);

  return (
    <section className="whatif-panel" aria-label={t("whatif.aria")}>
      <h3>🎬 {t("whatif.title")}</h3>
      <p className="muted small">{t("whatif.intro")}</p>

      {/* Bước 1: Kịch bản */}
      <details open>
        <summary className="wi-step"><b>{t("whatif.step1")}</b></summary>
        <div className="wi-body">
          <textarea
            className="wi-script"
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={t("whatif.scriptPlaceholder")}
            rows={6}
          />
          <div className="ecoactions">
            <button onClick={copyPrompt} disabled={!scriptText.trim()}>
              {copyDone ? t("whatif.copied") : t("whatif.copyPrompt")}
            </button>
            <span className="muted small">{t("whatif.copyHint")}</span>
          </div>
        </div>
      </details>

      {/* Bước 2: File cảnh JSON */}
      <details open>
        <summary className="wi-step"><b>{t("whatif.step2")}</b></summary>
        <div className="wi-body">
          <div className="ecoactions">
            <button onClick={() => fileRef.current?.click()}>{t("whatif.loadJson")}</button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleJsonFile} />
          </div>
          {scenesJson && (
            <div className="wi-json-preview muted small">
              ✅ {t("whatif.jsonLoaded")}: {(() => { try { return JSON.parse(scenesJson)?.shots?.length ?? "?"; } catch { return "?"; } })()} {t("whatif.shots")}
            </div>
          )}
        </div>
      </details>

      {/* Bước 3: Dự án và dựng */}
      <details open>
        <summary className="wi-step"><b>{t("whatif.step3")}</b></summary>
        <div className="wi-body">
          {projects.length === 0 ? (
            <p className="muted small">{t("whatif.noProjects")}</p>
          ) : (
            <label className="small">
              {t("whatif.project")}{" "}
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
          <div className="ecoactions">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.toLowerCase())}
              placeholder={t("whatif.newName")}
              maxLength={41}
            />
            <button
              disabled={!PROJECT_RE.test(newName)}
              onClick={run(async () => {
                await wiApi("/projects", { method: "POST", body: JSON.stringify({ project: newName, script: scriptText, scenes: scenesJson }) });
                setProject(newName); setNewName("");
                const s = await wiApi<WiState>("/state");
                setState(s);
              })}
            >
              {t("whatif.create")}
            </button>
          </div>

          {project && (
            <div className="ecoactions" style={{ marginTop: 8 }}>
              <button disabled={!!activeJob || !project} onClick={run(async () => {
                await wiApi("/render", { method: "POST", body: JSON.stringify({ project, preview: true }) });
                const s = await wiApi<WiState>("/state"); setState(s);
              })}>
                {t("whatif.preview")}
              </button>
              <button disabled={!!activeJob || !project || !scenesJson} onClick={run(async () => {
                await wiApi("/render", { method: "POST", body: JSON.stringify({ project, scenes: scenesJson, script: scriptText }) });
                const s = await wiApi<WiState>("/state"); setState(s);
              })}>
                {t("whatif.render")}
              </button>
            </div>
          )}
        </div>
      </details>

      {/* Tiến độ */}
      {activeJob && (
        <div className="wi-progress">
          <div className="meter studiometer">
            <span>{t(`whatif.step.${activeJob.step}`)}</span>
            <div className="bar">
              <i style={{ width: `${Math.round(activeJob.progress * 100)}%` }} />
            </div>
            <b>{Math.round(activeJob.progress * 100)}%</b>
          </div>
          <button onClick={run(async () => {
            await wiApi("/cancel", { method: "POST", body: JSON.stringify({ id: activeJob.id }) });
            const s = await wiApi<WiState>("/state"); setState(s);
          })}>
            {t("whatif.cancel")}
          </button>
        </div>
      )}

      {/* Clip kết quả */}
      {latestDone?.output && (
        <div className="wi-output">
          <h4>{t("whatif.output")}</h4>
          <video className="studiovideo" src={`/api/whatif/projects/${project}/clip.mp4`} controls preload="metadata" />
          <a href={`/api/whatif/projects/${project}/clip.mp4`} download={`${project}.mp4`} className="wi-download">
            ⬇️ {t("whatif.download")}
          </a>
        </div>
      )}

      {/* Danh sách job */}
      {(state?.jobs?.length ?? 0) > 0 && (
        <>
          <h4>{t("whatif.jobs")}</h4>
          <ul className="ecolist studiojobs">
            {(state?.jobs ?? []).slice(0, 5).map((j) => (
              <li key={j.id} data-job-status={j.status}>
                <b>{j.project}</b> — {t(`whatif.job.${j.status}`)}
                {j.error && <div className="warn small">{j.error}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {err && <div className="warn" role="alert">{err}</div>}

      {/* Hướng dẫn chatbot */}
      <details>
        <summary className="wi-step muted small">{t("whatif.chatbotGuide")}</summary>
        <div className="wi-body muted small">
          <ol>
            <li>{t("whatif.guide1")}</li>
            <li>{t("whatif.guide2")}</li>
            <li>{t("whatif.guide3")}</li>
            <li>{t("whatif.guide4")}</li>
          </ol>
          <p>{t("whatif.guideFree")}</p>
        </div>
      </details>
    </section>
  );
}
