/**
 * Tab "AI" — tự động kết nối AI.
 * Mỗi nguồn (OmniRoute, Ollama, LM Studio, Groq, Gemini…) hiện trạng thái dò được; người dùng có thể dán khoá miễn phí,
 * bật/tắt, chọn model, kiểm thử và khởi động OmniRoute. Mọi chuỗi từ server được dịch theo khoá (không hiện tiếng Việt cố định).
 */
import { useState } from "react";
import type { ProviderState, ProviderStatus } from "../../../shared/ai.js";
import { useT } from "../i18n/index.js";
import {
  clearAiKey,
  errorText,
  getAiStatus,
  refreshAi,
  setAiEnabled,
  setAiKey,
  setAiModel,
  startOmniRoute,
  testAi,
  type ActionResult,
} from "../lib/api.js";
import { usePoll } from "../lib/usePoll.js";
import { useHealth } from "../store/health.js";

const STATE_TONE: Record<ProviderState, "ok" | "warn" | "bad" | "off"> = {
  ready: "ok",
  "no-key": "warn",
  offline: "off",
  cooling: "warn",
  disabled: "off",
  "auth-failed": "bad",
};

/**
 * Có hiện ô dán khoá không. Đám mây: luôn. OmniRoute: chỉ khi nó đòi khoá (hoặc đã có khoá) — mặc định nó không cần khoá nên
 * không làm rối giao diện. Máy cục bộ/tuỳ chỉnh dùng biến môi trường.
 */
export function acceptsKey(p: Pick<ProviderStatus, "id" | "kind" | "state" | "hasKey">): boolean {
  if (p.kind === "cloud") return true;
  return p.id === "omniroute" && (p.hasKey || p.state === "no-key" || p.state === "auth-failed");
}

type Note = { text: string; tone: "ok" | "bad" };

function ProviderCard({ p, onChanged }: { p: ProviderStatus; onChanged: () => Promise<void> }) {
  const t = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"test" | "key" | "start" | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const run = async (kind: "test" | "key" | "start", fn: () => Promise<Note | null | void>): Promise<void> => {
    setBusy(kind);
    setNote(null);
    try {
      const n = await fn();
      if (n) setNote(n);
    } catch (e) {
      setNote({ text: errorText(t, e), tone: "bad" });
    } finally {
      setBusy(null);
      await onChanged();
    }
  };

  const result = (r: ActionResult): Note => ({
    tone: r.ok ? "ok" : "bad",
    text: r.ok && r.latencyMs !== undefined ? t("ai.test.ok", { ms: r.latencyMs, model: r.model ?? "?" }) : r.key ? t(r.key, r.vars) : r.message,
  });

  const detail = p.detailKey ? t(p.detailKey, p.detailVars) : p.detail;
  const noteKey = `ai.note.${p.id}`;
  const description = t(noteKey);
  const tone = STATE_TONE[p.state];

  return (
    <li className={`aicard tone-${tone}`} data-provider={p.id}>
      <div className="aihead">
        <b>{p.label}</b>
        <span className="orgchip">{t(`ai.kind.${p.kind}`)}</span>
        {p.free && <span className="orgchip ai-free">{t("ai.free")}</span>}
        <span className={`orgchip ai-state tone-${tone}`}>{t(`ai.state.${p.state}`)}</span>
      </div>
      {description !== noteKey && <p className="muted small">{description}</p>}
      {detail && <p className="muted small">{detail}</p>}

      <p className="small aistats">
        {p.activeModel && (
          <span>
            {t("ai.model")}: <code>{p.activeModel}</code>
          </span>
        )}
        <span className="muted">
          {t("ai.stats", { calls: p.stats.calls, failures: p.stats.failures })}
          {p.stats.lastLatencyMs !== undefined ? ` · ${p.stats.lastLatencyMs}ms` : ""}
        </span>
      </p>

      <div className="airow">
        <label className="field check compact">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => void run("key", async () => void (await setAiEnabled(p.id, e.target.checked)))}
          />
          <span>{t("ai.enable")}</span>
        </label>
        <button disabled={busy !== null || !p.enabled} onClick={() => void run("test", async () => result(await testAi(p.id)))}>
          {busy === "test" ? t("ai.testing") : t("ai.test")}
        </button>
        {p.id === "omniroute" && p.state === "offline" && (
          <button className="primary" disabled={busy !== null} onClick={() => void run("start", async () => result(await startOmniRoute()))}>
            {busy === "start" ? t("ai.omni.starting") : t("ai.omni.start")}
          </button>
        )}
      </div>
      {p.id === "omniroute" && p.state === "offline" && <p className="muted small">{t("ai.omni.install")}</p>}

      {p.models.length > 0 && p.enabled && (
        <label className="field col compact">
          <span>{t("ai.model")}</span>
          <select
            value={p.modelOverride ?? ""}
            disabled={busy !== null}
            onChange={(e) => void run("key", async () => void (await setAiModel(p.id, e.target.value)))}
          >
            <option value="">{t("ai.model.auto")}</option>
            {p.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {acceptsKey(p) && (
        <form
          className="aikey"
          onSubmit={(e) => {
            e.preventDefault();
            const value = key.trim();
            if (!value) return;
            void run("key", async () => {
              await setAiKey(p.id, value);
              setKey("");
              return { text: t("common.saved"), tone: "ok" };
            });
          }}
        >
          {p.hasKey ? (
            <p className="small">
              {p.keySource === "env" ? t("ai.key.env") : t("ai.key.stored", { mask: p.keyMask ?? "" })}
              {p.keySource === "stored" && (
                <button type="button" className="linkish" disabled={busy !== null} onClick={() => void run("key", async () => void (await clearAiKey(p.id)))}>
                  {t("ai.key.clear")}
                </button>
              )}
            </p>
          ) : null}
          {p.keySource !== "env" && (
            <div className="airow">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                maxLength={500}
                placeholder={t("ai.key.placeholder")}
                aria-label={`${p.label}: ${t("ai.key.placeholder")}`}
                onChange={(e) => setKey(e.target.value)}
              />
              <button type="submit" className="primary" disabled={busy !== null || !key.trim()}>
                {t("ai.key.save")}
              </button>
            </div>
          )}
        </form>
      )}
      {p.signupUrl && !p.hasKey && (
        <a className="small" href={p.signupUrl} target="_blank" rel="noreferrer noopener">
          {p.kind === "cloud" ? t("ai.key.getFree") : t("ai.link.site")}
        </a>
      )}
      {note && <p className={note.tone === "ok" ? "small ok-text" : "warn"} role="status">{note.text}</p>}
    </li>
  );
}

export function AiPanel() {
  const t = useT();
  const poll = usePoll(() => getAiStatus(), 15_000);
  const { data, error, loading } = poll;
  const refreshHealth = useHealth((h) => h.refresh);
  /** Tải lại danh sách và chỉ báo AI trên thanh đầu ngay sau thao tác của người dùng. */
  const reload = async (): Promise<void> => {
    await poll.reload();
    await refreshHealth();
  };
  const [scanning, setScanning] = useState(false);

  const rescan = async (): Promise<void> => {
    setScanning(true);
    try {
      await refreshAi();
    } catch {
      /* lỗi sẽ hiện qua `error` ở lần tải kế tiếp */
    } finally {
      setScanning(false);
      await reload();
    }
  };

  const providers = data?.providers ?? [];
  const ready = providers.filter((p) => p.state === "ready").length;

  return (
    <section className="aipanel" aria-label={t("ai.title")}>
      <div className="aitop">
        <h3>{t("ai.title")}</h3>
        <span className={`chip ${ready > 0 ? "st-working" : "st-error hot"}`}>{t("ai.summary", { n: ready, total: providers.length })}</span>
        <button disabled={scanning} onClick={() => void rescan()}>
          {scanning ? t("ai.refreshing") : t("ai.refresh")}
        </button>
      </div>

      {error !== undefined && <p className="warn" role="alert">{errorText(t, error)}</p>}
      {data && ready === 0 && (
        <div className="callout" role="note">
          <b>{t("ai.empty.title")}</b>
          <p className="small">{t("ai.empty.body")}</p>
        </div>
      )}
      {loading && !data && <p className="muted small">{t("common.loading")}</p>}
      {providers.length > 0 && <p className="muted small">{t("ai.order")}</p>}
      <ul className="aicards">
        {providers.map((p) => (
          <ProviderCard key={p.id} p={p} onChanged={reload} />
        ))}
      </ul>
    </section>
  );
}
