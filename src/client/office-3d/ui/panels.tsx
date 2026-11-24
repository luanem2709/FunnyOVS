/**
 * L5 — Các bảng giao diện: kết nối, tổng quan, chi tiết thực thể, nhật ký, hộp duyệt, điều hướng phòng.
 * React thuần + CSS trong office3d.css (không phụ thuộc thư viện UI). Mọi chữ qua i18n (`useT`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FACILITIES } from "../../../shared/facilities.js";
import { simplifyStatus, type OfficeEntity } from "../../../shared/officeEntity.js";
import { agentRole, approvalReasonLabel, deptName, logLine, messageText, taskLabel, useT } from "../i18n/index.js";
import { assignWork, decideAction, decidePermission, decideTask, errorText } from "../lib/api.js";
import { finishedFlows, rootStatuses } from "../../assets/workboard.js";
import { EconomyCard } from "./EconomyCard.js";
import { StudioCard } from "./StudioCard.js";
import { Note, onCtrlEnter } from "./a11y.js";
import { entitiesOfKind, useOfficeStore, type ApprovalItem, type LogItem } from "../store/officeStore.js";

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

export function StatusDot({ status }: { status: OfficeEntity["status"] }) {
  const t = useT();
  return <span className={`dot st-${simplifyStatus(status)}`} title={t(`status.${status}`)} />;
}

/** Số liệu tổng hợp dùng cho thanh đầu và tab Tổng quan. */
export function useCounts() {
  const entities = useOfficeStore((s) => s.entities);
  const approvals = useOfficeStore((s) => s.approvals);
  return useMemo(() => {
    const agents = entitiesOfKind(entities, "agent");
    const count = { idle: 0, working: 0, error: 0, offline: 0, "pending-approval": 0 };
    for (const a of agents) count[simplifyStatus(a.status)]++;
    return {
      staff: agents.length,
      tasks: entitiesOfKind(entities, "task").length,
      working: count.working,
      idle: count.idle,
      pending: count["pending-approval"] + Object.keys(approvals).length,
      error: count.error,
      machine: entitiesOfKind(entities, "machine")[0],
    };
  }, [entities, approvals]);
}

// ---------------------------------------------------------------------------
// Kết nối
// ---------------------------------------------------------------------------

export function ConnectionBanner({ onReconnect }: { onReconnect: () => void }) {
  const t = useT();
  const connection = useOfficeStore((s) => s.connection);
  const retryInSec = useOfficeStore((s) => s.retryInSec);
  const attempt = useOfficeStore((s) => s.attempt);
  if (connection === "open") return null;
  const text =
    connection === "connecting"
      ? t("conn.connecting")
      : connection === "reconnecting"
        ? t("conn.reconnecting", { sec: retryInSec ?? 0, n: attempt })
        : t("conn.closed");
  return (
    <div className="banner" role="status" aria-live="polite">
      <span>{text}</span>
      <button onClick={onReconnect}>{t("common.retry")}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tổng quan
// ---------------------------------------------------------------------------

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="meter" title={hint}>
      <span>{label}</span>
      <div className="bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i className={p >= 90 ? "hot" : p >= 70 ? "warm" : ""} style={{ width: `${p}%` }} />
      </div>
      <b>{p}%</b>
    </div>
  );
}

export function OverviewTab() {
  const t = useT();
  const budget = useOfficeStore((s) => s.budget);
  const loaded = useOfficeStore((s) => s.loaded);
  const c = useCounts();
  if (!loaded) return <p className="muted">{t("overview.loading")}</p>;
  const m = c.machine?.metadata as { cpuPercent?: number; ramPercent?: number } | undefined;
  return (
    <section aria-label={t("overview.title")}>
      <div className="muted small">{t("overview.staff", { n: c.staff, t: c.tasks })}</div>
      {budget && (
        <>
          <Meter
            label={t("overview.tokensToday")}
            pct={(budget.total.used / Math.max(1, budget.total.limit)) * 100}
            hint={`${fmt(budget.total.used)} / ${fmt(budget.total.limit)}`}
          />
          <Meter label={t("overview.tokensWeek")} pct={(budget.weekly.used / Math.max(1, budget.weekly.limit)) * 100} />
          {budget.locked && <div className="warn" role="status">{t("overview.locked")}</div>}
        </>
      )}
      <EconomyCard />
      <StudioCard />
      {m && (
        <>
          <Meter label={t("overview.cpu")} pct={m.cpuPercent ?? 0} />
          <Meter label={t("overview.ram")} pct={m.ramPercent ?? 0} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chi tiết thực thể
// ---------------------------------------------------------------------------

function MetaRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row">
      <span className="muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function AgentTasks({ agent, tasks }: { agent: OfficeEntity; tasks: OfficeEntity[] }) {
  const t = useT();
  const agentId = String((agent.metadata as { agentId?: string }).agentId ?? "");
  const mine = tasks.filter((x) => (x.metadata as { agentId?: string }).agentId === agentId);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const submit = async (): Promise<void> => {
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setNote(null);
    try {
      // Giao theo tầng: Giám đốc/Trưởng phòng sẽ phân tiếp xuống cấp dưới; nhân viên tự làm.
      const r = await assignWork(text, agentId);
      const work = r.tree.filter((n) => n.kind === "work");
      setNote({
        text:
          work.length > 1 || work[0]?.assigneeName !== agent.name
            ? t("entity.assignedTo", { who: work.map((n) => n.assigneeName).join(", ") })
            : t("entity.assignedOne"),
      });
      setPrompt("");
    } catch (e) {
      setNote({ text: errorText(t, e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3>{t("entity.openTasks", { n: mine.length })}</h3>
      {mine.length > 0 && (
        <ul className="mini-log">
          {mine.map((x) => (
            <li key={x.id}>
              <StatusDot status={x.status} /> {x.name}
            </li>
          ))}
        </ul>
      )}
      <h3>{t("org.assign")}</h3>
      <textarea
        className="assign"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("entity.assignTo", { name: agent.name })}
        aria-label={t("entity.assignFor", { name: agent.name })}
        aria-keyshortcuts="Control+Enter"
        title={t("common.ctrlEnter")}
        onKeyDown={onCtrlEnter(() => {
          if (!busy && prompt.trim()) void submit();
        })}
      />
      <button className="primary" disabled={busy || !prompt.trim()} onClick={() => void submit()}>
        {busy ? t("org.assigning") : t("common.send")}
      </button>
      <Note note={note} />
    </>
  );
}

/** Nhật ký có khoá i18n thì dịch theo ngôn ngữ hiện tại; không thì hiện nguyên văn do server gửi. */
function LogText({ item }: { item: LogItem }) {
  const t = useT();
  return <>{logLine(t, item)}</>;
}

export function EntityPanel() {
  const t = useT();
  const selectedId = useOfficeStore((s) => s.selectedId);
  const entity = useOfficeStore((s) => (s.selectedId ? s.entities[s.selectedId] : undefined));
  const logs = useOfficeStore((s) => s.logs);
  const select = useOfficeStore((s) => s.select);
  const entities = useOfficeStore((s) => s.entities);

  if (!selectedId) return null;
  if (!entity) {
    return (
      <aside className="card entity">
        <header>
          <h2>{t("entity.gone")}</h2>
          <button onClick={() => select(null)} aria-label={t("common.close")}>
            ✕
          </button>
        </header>
        <p className="muted">{t("entity.goneText")}</p>
      </aside>
    );
  }
  const md = entity.metadata as Record<string, unknown>;
  const mine = logs.filter((l) => l.entityId === entity.id).slice(0, 8);
  return (
    <aside className="card entity" aria-label={entity.name}>
      <header>
        <h2>
          <StatusDot status={entity.status} /> {entity.name}
        </h2>
        <button onClick={() => select(null)} aria-label={t("common.close")}>
          ✕
        </button>
      </header>
      <MetaRow k={t("entity.kind")} v={t(`kind.${entity.kind}`)} />
      <MetaRow k={t("entity.status")} v={t(`status.${entity.status}`)} />
      {entity.department && <MetaRow k={t("entity.room")} v={deptName(entity.department)} />}
      {entity.kind === "agent" && (
        <>
          <MetaRow k={t("entity.role")} v={agentRole(String(md.agentId ?? ""), String(md.role ?? ""))} />
          {md.task ? <MetaRow k={t("entity.doing")} v={taskLabel(t, md)} /> : null}
          {md.currentUrl ? <MetaRow k={t("entity.opening")} v={String(md.currentTitle ?? md.currentUrl)} /> : null}
          <MetaRow k={t("entity.tokens")} v={fmt(Number(md.tokensUsed ?? 0))} />
          <MetaRow k={t("entity.done")} v={String(md.tasksDone ?? 0)} />
        </>
      )}
      {entity.kind === "machine" && (
        <>
          <MetaRow k={t("machine.cpu")} v={`${md.cpuPercent ?? 0}%`} />
          <MetaRow k={t("machine.ram")} v={`${md.ramUsedMb ?? 0} / ${md.ramTotalMb ?? 0} MB (${md.ramPercent ?? 0}%)`} />
          <MetaRow k={t("machine.uptime")} v={t("machine.hours", { n: Math.round(Number(md.uptimeSec ?? 0) / 3600) })} />
          <h3>{t("machine.top")}</h3>
          <ul className="procs">
            {((md.topProcesses as Array<{ name: string; pid: number; memMb: number }>) ?? []).map((p) => (
              <li key={p.pid}>
                <span>{p.name}</span>
                <b>{p.memMb} MB</b>
              </li>
            ))}
          </ul>
          <p className="muted small">{t("machine.readonly")}</p>
        </>
      )}
      {entity.kind === "task" && (
        <>
          <MetaRow k={t("task.assignee")} v={String(md.agentName ?? "")} />
          {md.estimatedTokens ? <MetaRow k={t("task.estimate")} v={`${fmt(Number(md.estimatedTokens))} token`} /> : null}
          {md.approvalReason ? <MetaRow k={t("task.reason")} v={approvalReasonLabel(t, md)} /> : null}
        </>
      )}
      <MetaRow k={t("entity.updated")} v={new Date(entity.updatedAt).toLocaleTimeString()} />
      {entity.kind === "agent" && <AgentTasks agent={entity} tasks={entitiesOfKind(entities, "task")} />}
      {mine.length > 0 && (
        <>
          <h3>{t("entity.recentLog")}</h3>
          <ul className="mini-log">
            {mine.map((l) => (
              <li key={l.id} className={`lv-${l.level}`}>
                <LogText item={l} />
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Nhật ký
// ---------------------------------------------------------------------------

export function LogViewer() {
  const t = useT();
  const logs = useOfficeStore((s) => s.logs);
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const shown = useMemo(
    () => logs.filter((l) => level === "all" || (level === "warn" ? l.level !== "info" : l.level === "error")).slice(0, 60),
    [logs, level],
  );
  return (
    <section aria-label={t("log.title")} className="logs">
      <header>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label={t("log.filter")}>
          <option value="all">{t("log.all")}</option>
          <option value="warn">{t("log.warn")}</option>
          <option value="error">{t("log.error")}</option>
        </select>
      </header>
      {shown.length === 0 ? (
        <p className="muted">{t("log.empty")}</p>
      ) : (
        <ul>
          {shown.map((l) => (
            <li key={l.id} className={`lv-${l.level}`}>
              <time>{new Date(l.at).toLocaleTimeString()}</time> <LogText item={l} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hộp duyệt (quyền thư mục + token)
// ---------------------------------------------------------------------------

function ApprovalCard({ a }: { a: ApprovalItem }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="approval">
      <b>{a.kind === "permission" ? t("approval.permission") : a.kind === "token" ? t("approval.token") : t("approval.action")}</b>
      <div>{messageText(t, { key: a.key, vars: a.vars, text: a.summary })}</div>
      {(a.detailKey || a.detail) && (
        <div className="path">{a.detailKey ? messageText(t, { key: a.detailKey, vars: a.detailVars, text: a.detail ?? "" }) : a.detail}</div>
      )}
      <div className="actions">
        {a.kind === "permission" ? (
          <>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "once"))}>
              {t("approval.once")}
            </button>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "read"))}>
              {t("approval.read")}
            </button>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "readwrite"))}>
              {t("approval.readwrite")}
            </button>
            <button className="danger" disabled={busy} onClick={() => void run(() => decidePermission(a.id, "deny"))}>
              {t("approval.deny")}
            </button>
          </>
        ) : a.kind === "action" ? (
          <>
            <button className="primary" disabled={busy} onClick={() => void run(() => decideAction(a.id, true))}>
              {t("approval.allowAction")}
            </button>
            <button className="danger" disabled={busy} onClick={() => void run(() => decideAction(a.id, false))}>
              {t("approval.deny")}
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => void run(() => decideTask(a.id, "approve"))}>
              {t("approval.run")}
            </button>
            <button className="danger" disabled={busy} onClick={() => void run(() => decideTask(a.id, "reject"))}>
              {t("approval.deny")}
            </button>
          </>
        )}
      </div>
      {err && <div className="warn" role="alert">{err}</div>}
    </div>
  );
}

/**
 * Vùng thông báo cho trình đọc màn hình: LUÔN có mặt trong DOM (vùng aria-live chỉ được đọc đáng tin cậy khi nó tồn tại trước khi nội dung đổi).
 * Khi có yêu cầu duyệt MỚI, nội dung đổi thành "Cần bạn duyệt: …" và được đọc ngay (assertive).
 */
function ApprovalAnnouncer({ list }: { list: ApprovalItem[] }) {
  const t = useT();
  const seen = useRef<Set<string> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const ids = new Set(list.map((a) => a.id));
    if (seen.current === null) {
      seen.current = ids; // yêu cầu đã có lúc mở: không đọc lại ồ ạt, chỉ đọc yêu cầu mới tới sau đó
      return;
    }
    const fresh = list.filter((a) => !seen.current!.has(a.id));
    seen.current = ids;
    if (fresh.length > 0) {
      const a = fresh[fresh.length - 1];
      setMessage(`${t("alert.approval.title")}: ${messageText(t, { key: a.key, vars: a.vars, text: a.summary })}`);
    }
  }, [list, t]);
  return (
    <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true" data-announcer="approvals">
      {message}
    </div>
  );
}

/**
 * Đọc cho trình đọc màn hình khi một luồng việc KẾT THÚC (xong hoặc lỗi) — người dùng không nhìn thấy cảnh 3D nên cần được báo.
 * Lịch sự (polite) để không cắt ngang việc đang đọc; luôn có mặt trong DOM để vùng live hoạt động đáng tin cậy.
 */
export function FlowAnnouncer() {
  const t = useT();
  const org = useOfficeStore((s) => s.org);
  const before = useRef<ReturnType<typeof rootStatuses> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const prev = before.current;
    before.current = rootStatuses(org);
    if (prev === null) return; // lần đầu: không đọc lại những luồng đã có sẵn
    const fin = finishedFlows(prev, org);
    if (fin.length === 0) return;
    const last = fin[fin.length - 1];
    setMessage(t(last.kind === "done" ? "announce.flowDone" : "announce.flowFailed", { title: last.title }));
  }, [org, t]);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-announcer="flows">
      {message}
    </div>
  );
}

export function ApprovalDock() {
  const t = useT();
  const approvals = useOfficeStore((s) => s.approvals);
  const list = Object.values(approvals);
  return (
    <>
      <ApprovalAnnouncer list={list} />
      {list.length > 0 && (
        <div className="approval-dock" role="region" aria-label={t("approval.region")}>
          {list.map((a) => (
            <ApprovalCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Điều hướng nhanh tới phòng
// ---------------------------------------------------------------------------

export function RoomNav() {
  const t = useT();
  const departments = useOfficeStore((s) => s.departments);
  const focusOn = useOfficeStore((s) => s.focusOn);
  const select = useOfficeStore((s) => s.select);
  if (departments.length === 0) return null;
  return (
    <nav className="roomnav" aria-label={t("entity.room")}>
      {departments.map((d) => (
        <button
          key={d.id}
          onClick={() => {
            select(null);
            focusOn(d.center.x, d.center.z);
          }}
        >
          {deptName(d.id, true)}
        </button>
      ))}
      {FACILITIES.map((f) => (
        <button
          key={f.id}
          className="facility"
          onClick={() => {
            select(null);
            focusOn(f.center.x, f.center.z);
          }}
        >
          {t(`facility.short.${f.id}`)}
        </button>
      ))}
    </nav>
  );
}
