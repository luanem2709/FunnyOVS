/**
 * Tab "AI" — tự động kết nối AI và GOM nhiều API về một chỗ (như 9router).
 * Mỗi nguồn (OmniRoute/9router, Ollama, LM Studio, Groq, Gemini, NVIDIA, SambaNova…) hiện trạng thái dò được; người dùng có thể dán khoá miễn phí,
 * bật/tắt, chọn model, kiểm thử, sắp xếp thứ tự ưu tiên, chọn cách dùng (ưu tiên/xoay vòng), khởi động cổng gom cục bộ và — nút "+ Thêm API" —
 * thêm bất kỳ API tương thích OpenAI nào (kể cả nhiều khoá của cùng một nhà cung cấp). Mọi chuỗi từ server được dịch theo khoá.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ProviderState, ProviderStatus, RoutingStrategy } from "../../../shared/ai.js";
import { useT } from "../i18n/index.js";
import {
  addAiCustom,
  checkAiCustom,
  clearAiKey,
  errorText,
  getAiStatus,
  refreshAi,
  removeAiCustom,
  setAiEnabled,
  setAiKey,
  setAiModel,
  setAiOrder,
  setAiStrategy,
  startOmniRoute,
  testAi,
  updateAiCustom,
  type ActionResult,
} from "../lib/api.js";
import { usePoll } from "../lib/usePoll.js";
import { useHealth } from "../store/health.js";
import { Note, type NoteState } from "./a11y.js";
import { AI_PRESETS, aiFormPayload, anotherKeyPresets, emptyAiForm, suggestsV1, validateAiForm, type AiForm } from "./aiForm.js";

const STATE_TONE: Record<ProviderState, "ok" | "warn" | "bad" | "off"> = {
  ready: "ok",
  "no-key": "warn",
  offline: "off",
  cooling: "warn",
  disabled: "off",
  "auth-failed": "bad",
};

/**
 * Có hiện ô dán khoá không. Đám mây và nguồn do người dùng thêm: luôn. OmniRoute/9router: chỉ khi nó đòi khoá (hoặc đã có khoá) — mặc định nó không cần khoá
 * nên không làm rối giao diện. Máy cục bộ dùng biến môi trường.
 */
export function acceptsKey(p: Pick<ProviderStatus, "id" | "kind" | "state" | "hasKey"> & { custom?: boolean }): boolean {
  if (p.kind === "cloud" || p.custom) return true;
  return p.id === "omniroute" && (p.hasKey || p.state === "no-key" || p.state === "auth-failed");
}

// ---------------------------------------------------------------------------
// Biểu mẫu thêm / sửa API
// ---------------------------------------------------------------------------

function AddApiForm({
  mode,
  providers,
  editing,
  onDone,
  onCancel,
}: {
  mode: "add" | "edit";
  providers: ProviderStatus[];
  /** Khi sửa: nguồn đang sửa. */
  editing?: ProviderStatus;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [f, setF] = useState<AiForm>(() => (editing ? { label: editing.label, baseUrl: editing.baseUrl, apiKey: "", model: editing.modelOverride ?? "", free: editing.free } : emptyAiForm()));
  const [presetId, setPresetId] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [note, setNote] = useState<NoteState | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const presets = useMemo(() => [...AI_PRESETS, ...anotherKeyPresets(providers)], [providers]);
  const preset = presets.find((p) => p.id === presetId);
  const first = useRef<HTMLSelectElement | HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const set = (patch: Partial<AiForm>): void => {
    setF((prev) => ({ ...prev, ...patch }));
    setNote(null);
  };

  const pick = (id: string): void => {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setF((prev) => ({ ...prev, label: id.startsWith("another:") ? `${p.label} 2` : p.label, baseUrl: p.baseUrl, model: p.model ?? "", free: p.free }));
    setModels([]);
    setNote(null);
  };

  const problem = (): string | null => {
    const e = validateAiForm(f);
    return e ? t(e.key, e.vars) : null;
  };

  const check = async (): Promise<void> => {
    const e = validateAiForm(f, { needLabel: false });
    if (e) return setNote({ text: t(e.key, e.vars), bad: true });
    setBusy("check");
    try {
      const r = await checkAiCustom({ baseUrl: f.baseUrl.trim(), ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}), ...(editing ? { id: editing.id } : {}) });
      setModels(r.models ?? []);
      setNote({ text: r.key ? t(r.key, r.vars) : r.message, bad: !r.ok });
    } catch (err) {
      setNote({ text: errorText(t, err), bad: true });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const bad = problem();
    if (bad) return setNote({ text: bad, bad: true });
    setBusy("save");
    try {
      if (editing) await updateAiCustom(editing.id, aiFormPayload(f, { edit: true }));
      else await addAiCustom(aiFormPayload(f));
      await onDone();
    } catch (err) {
      setNote({ text: errorText(t, err), bad: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="addapi" onSubmit={(e) => void submit(e)} aria-label={mode === "add" ? t("ai.add.title") : t("ai.custom.edit")} data-form={mode}>
      <b>{mode === "add" ? t("ai.add.title") : `${t("ai.custom.edit")}: ${editing?.label ?? ""}`}</b>
      {mode === "add" && <p className="muted small">{t("ai.add.hint")}</p>}
      {mode === "add" && (
        <label className="field col compact">
          <span>{t("ai.add.preset")}</span>
          <select ref={first as React.RefObject<HTMLSelectElement>} value={presetId} onChange={(e) => pick(e.target.value)}>
            <option value="">{t("ai.add.preset.none")}</option>
            <optgroup label={t("ai.add.preset.group.services")}>
              {AI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.free ? ` · ${t("ai.free")}` : ""}
                </option>
              ))}
            </optgroup>
            {providers.some((p) => p.kind === "cloud" && !p.custom) && (
              <optgroup label={t("ai.add.preset.group.another")}>
                {anotherKeyPresets(providers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {t("ai.add.preset.another", { name: p.label })}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      {preset?.noteKey && <p className="muted small">{t(preset.noteKey)}</p>}
      <label className="field col compact">
        <span>{t("ai.add.label")}</span>
        <input ref={mode === "edit" ? (first as React.RefObject<HTMLInputElement>) : undefined} value={f.label} maxLength={60} placeholder={t("ai.add.labelPh")} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="field col compact">
        <span>{t("ai.add.baseUrl")}</span>
        <input value={f.baseUrl} maxLength={300} spellCheck={false} placeholder="https://api.example.com/v1" inputMode="url" onChange={(e) => set({ baseUrl: e.target.value })} />
      </label>
      {suggestsV1(f.baseUrl) ? <p className="muted small">{t("ai.add.v1hint")}</p> : <p className="muted small">{t("ai.add.baseUrlHint")}</p>}
      {mode === "add" && (
        <label className="field col compact">
          <span>{t("ai.add.apiKey")}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={f.apiKey} maxLength={600} onChange={(e) => set({ apiKey: e.target.value })} />
        </label>
      )}
      {preset?.signupUrl && mode === "add" && (
        <a className="small" href={preset.signupUrl} target="_blank" rel="noreferrer noopener">
          {t("ai.add.getKey")}
        </a>
      )}
      <label className="field col compact">
        <span>{t("ai.add.model")}</span>
        <input list="ai-add-models" value={f.model} maxLength={120} spellCheck={false} onChange={(e) => set({ model: e.target.value })} />
        <datalist id="ai-add-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <p className="muted small">{t("ai.add.modelHint")}</p>
      <label className="field check compact">
        <input type="checkbox" checked={f.free} onChange={(e) => set({ free: e.target.checked })} />
        <span>{t("ai.add.free")}</span>
      </label>
      {mode === "add" && <p className="muted small">{t("ai.add.privacy")}</p>}
      <div className="airow">
        <button type="button" disabled={busy !== null} onClick={() => void check()}>
          {busy === "check" ? t("ai.add.checking") : t("ai.add.check")}
        </button>
        <button type="submit" className="primary" disabled={busy !== null}>
          {busy === "save" ? t("ai.add.adding") : mode === "add" ? t("ai.add.submit") : t("ai.add.save")}
        </button>
        <button type="button" disabled={busy !== null} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <Note note={note} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Thẻ nhà cung cấp
// ---------------------------------------------------------------------------

type CardNote = { text: string; tone: "ok" | "bad" };

function ProviderCard({
  p,
  index,
  count,
  providers,
  onMove,
  onChanged,
}: {
  p: ProviderStatus;
  index: number;
  count: number;
  providers: ProviderStatus[];
  onMove: (dir: -1 | 1) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"test" | "key" | "start" | "move" | "remove" | null>(null);
  const [note, setNote] = useState<CardNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (kind: "test" | "key" | "start" | "move" | "remove", fn: () => Promise<CardNote | null | void>): Promise<void> => {
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

  const result = (r: ActionResult): CardNote => ({
    tone: r.ok ? "ok" : "bad",
    text: r.ok && r.latencyMs !== undefined ? t("ai.test.ok", { ms: r.latencyMs, model: r.model ?? "?" }) : r.key ? t(r.key, r.vars) : r.message,
  });

  const detail = p.detailKey ? t(p.detailKey, p.detailVars) : p.detail;
  const noteKey = `ai.note.${p.id}`;
  const description = t(noteKey);
  const tone = STATE_TONE[p.state];
  const gateway = p.id === "omniroute";

  return (
    <li className={`aicard tone-${tone}`} data-provider={p.id}>
      <div className="aihead">
        <b>{p.label}</b>
        <span className="orgchip">{t(`ai.kind.${p.kind}`)}</span>
        {p.free && <span className="orgchip ai-free">{t("ai.free")}</span>}
        <span className={`orgchip ai-state tone-${tone}`}>{t(`ai.state.${p.state}`)}</span>
        <span className="aimove">
          <button type="button" className="icon" disabled={busy !== null || index === 0} aria-label={t("ai.move.up", { name: p.label })} title={t("ai.move.up", { name: p.label })} onClick={() => void run("move", async () => void (await onMove(-1)))}>
            ↑
          </button>
          <button type="button" className="icon" disabled={busy !== null || index === count - 1} aria-label={t("ai.move.down", { name: p.label })} title={t("ai.move.down", { name: p.label })} onClick={() => void run("move", async () => void (await onMove(1)))}>
            ↓
          </button>
        </span>
      </div>
      {p.custom && (
        <p className="small">
          <code>{p.baseUrl}</code>
        </p>
      )}
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
          <input type="checkbox" checked={p.enabled} onChange={(e) => void run("key", async () => void (await setAiEnabled(p.id, e.target.checked)))} />
          <span>{t("ai.enable")}</span>
        </label>
        <button disabled={busy !== null || !p.enabled} onClick={() => void run("test", async () => result(await testAi(p.id)))}>
          {busy === "test" ? t("ai.testing") : t("ai.test")}
        </button>
        {gateway && p.state === "offline" && (
          <button className="primary" disabled={busy !== null} onClick={() => void run("start", async () => result(await startOmniRoute()))}>
            {busy === "start" ? t("ai.omni.starting") : t("ai.omni.start")}
          </button>
        )}
        {p.custom && (
          <>
            <button type="button" disabled={busy !== null} aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
              {t("ai.custom.edit")}
            </button>
            <button type="button" className="danger" disabled={busy !== null} onClick={() => setConfirmRemove(true)}>
              {t("ai.custom.remove")}
            </button>
          </>
        )}
      </div>
      {gateway && p.state === "offline" && <p className="muted small">{t("ai.omni.install")}</p>}

      {p.custom && confirmRemove && (
        <div className="callout" role="alertdialog" aria-label={t("ai.custom.removeAsk")}>
          <p className="small">{t("ai.custom.removeAsk")}</p>
          <div className="airow">
            <button type="button" className="danger" disabled={busy !== null} onClick={() => void run("remove", async () => void (await removeAiCustom(p.id)))}>
              {t("ai.custom.removeYes")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setConfirmRemove(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {p.custom && editing && (
        <AddApiForm
          mode="edit"
          providers={providers}
          editing={p}
          onCancel={() => setEditing(false)}
          onDone={async () => {
            setEditing(false);
            await onChanged();
          }}
        />
      )}

      {p.models.length > 0 && p.enabled && (
        <label className="field col compact">
          <span>{t("ai.model")}</span>
          <select value={p.modelOverride ?? ""} disabled={busy !== null} onChange={(e) => void run("key", async () => void (await setAiModel(p.id, e.target.value)))}>
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
      {note && (
        <p className={note.tone === "ok" ? "small ok-text" : "warn"} role="status">
          {note.text}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

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
  const [adding, setAdding] = useState(false);
  const [topNote, setTopNote] = useState<NoteState | null>(null);

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
  const strategy: RoutingStrategy = data?.strategy ?? "priority";

  const move = async (index: number, dir: -1 | 1): Promise<void> => {
    const ids = providers.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await setAiOrder(ids);
  };

  const changeStrategy = async (value: RoutingStrategy): Promise<void> => {
    setTopNote(null);
    try {
      await setAiStrategy(value);
    } catch (e) {
      setTopNote({ text: errorText(t, e), bad: true });
    } finally {
      await reload();
    }
  };

  return (
    <section className="aipanel" aria-label={t("ai.title")}>
      <div className="aitop">
        <h3>{t("ai.title")}</h3>
        <span className={`chip ${ready > 0 ? "st-working" : "st-error hot"}`}>{t("ai.summary", { n: ready, total: providers.length })}</span>
        <div className="aibtns">
          <button className="primary" aria-expanded={adding} aria-controls="ai-add-form" onClick={() => setAdding((v) => !v)}>
            {adding ? t("ai.add.close") : t("ai.add.open")}
          </button>
          <button disabled={scanning} onClick={() => void rescan()}>
            {scanning ? t("ai.refreshing") : t("ai.refresh")}
          </button>
        </div>
      </div>

      {adding && (
        <div id="ai-add-form">
          <AddApiForm
            mode="add"
            providers={providers}
            onCancel={() => setAdding(false)}
            onDone={async () => {
              setAdding(false);
              await reload();
            }}
          />
        </div>
      )}

      {error !== undefined && (
        <p className="warn" role="alert">
          {errorText(t, error)}
        </p>
      )}
      {data && ready === 0 && (
        <div className="callout" role="note">
          <b>{t("ai.empty.title")}</b>
          <p className="small">{t("ai.empty.body")}</p>
        </div>
      )}
      {loading && !data && <p className="muted small">{t("common.loading")}</p>}
      {providers.length > 1 && (
        <label className="field col compact aistrategy">
          <span>{t("ai.strategy")}</span>
          <select value={strategy} onChange={(e) => void changeStrategy(e.target.value as RoutingStrategy)}>
            <option value="priority">{t("ai.strategy.priority")}</option>
            <option value="roundrobin">{t("ai.strategy.roundrobin")}</option>
          </select>
        </label>
      )}
      <Note note={topNote} />
      {providers.length > 0 && <p className="muted small">{strategy === "roundrobin" ? t("ai.order.roundrobin") : t("ai.order")}</p>}
      <ul className="aicards">
        {providers.map((p, i) => (
          <ProviderCard key={p.id} p={p} index={i} count={providers.length} providers={providers} onMove={(dir) => move(i, dir)} onChanged={reload} />
        ))}
      </ul>
    </section>
  );
}
