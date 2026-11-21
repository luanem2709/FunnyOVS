/**
 * L5 — Các bảng giao diện: kết nối, KPI, chi tiết thực thể, nhật ký, hộp duyệt.
 * Viết bằng React thuần + CSS trong office3d.css (không phụ thuộc thư viện UI).
 */
import { useMemo, useState } from "react";
import { simplifyStatus, type OfficeEntity } from "../../../shared/officeEntity.js";
import { decidePermission, decideTask, emergencyStop } from "../lib/api.js";
import { entitiesOfKind, useOfficeStore, type ApprovalItem, type LogItem } from "../store/officeStore.js";

const STATUS_LABEL: Record<string, string> = {
  idle: "Rảnh",
  working: "Đang làm",
  researching: "Đang nghiên cứu",
  learning: "Đang học",
  "pending-approval": "Chờ duyệt",
  blocked: "Bị chặn",
  error: "Lỗi",
  offline: "Ngoại tuyến",
  stopped: "Đã dừng",
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

export function StatusDot({ status }: { status: OfficeEntity["status"] }) {
  return <span className={`dot st-${simplifyStatus(status)}`} title={statusLabel(status)} />;
}

// ---------------------------------------------------------------------------
// Kết nối
// ---------------------------------------------------------------------------

export function ConnectionBanner({ onReconnect }: { onReconnect: () => void }) {
  const connection = useOfficeStore((s) => s.connection);
  const retryInSec = useOfficeStore((s) => s.retryInSec);
  const attempt = useOfficeStore((s) => s.attempt);
  if (connection === "open") return null;
  const text =
    connection === "connecting"
      ? "Đang kết nối tới máy chủ…"
      : connection === "reconnecting"
        ? `Mất kết nối — dữ liệu có thể đã cũ. Thử lại sau ${retryInSec ?? 0}s (lần ${attempt}).`
        : "Đã ngắt kết nối.";
  return (
    <div className="banner" role="status" aria-live="polite">
      <span>{text}</span>
      <button onClick={onReconnect}>Thử lại ngay</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="meter" title={hint}>
      <span>{label}</span>
      <div className="bar">
        <i className={p >= 90 ? "hot" : p >= 70 ? "warm" : ""} style={{ width: `${p}%` }} />
      </div>
      <b>{p}%</b>
    </div>
  );
}

export function KpiBoard() {
  const entities = useOfficeStore((s) => s.entities);
  const approvals = useOfficeStore((s) => s.approvals);
  const budget = useOfficeStore((s) => s.budget);
  const loaded = useOfficeStore((s) => s.loaded);

  const stats = useMemo(() => {
    const agents = entitiesOfKind(entities, "agent");
    const count = { idle: 0, working: 0, error: 0, offline: 0, "pending-approval": 0 };
    for (const a of agents) count[simplifyStatus(a.status)]++;
    const machine = entitiesOfKind(entities, "machine")[0];
    const tasks = entitiesOfKind(entities, "task").length;
    return { total: agents.length, count, machine, tasks };
  }, [entities]);

  if (!loaded) return <div className="card kpi muted">Đang tải số liệu…</div>;

  const m = stats.machine?.metadata as { cpuPercent?: number; ramPercent?: number } | undefined;
  return (
    <section className="card kpi" aria-label="Chỉ số tổng quan">
      <h2>Tổng quan</h2>
      <div className="chips">
        <span className="chip st-working">{stats.count.working} đang làm</span>
        <span className="chip st-idle">{stats.count.idle} rảnh</span>
        <span className="chip st-pending-approval">{stats.count["pending-approval"] + Object.keys(approvals).length} chờ duyệt</span>
        <span className="chip st-error">{stats.count.error} lỗi</span>
      </div>
      <div className="muted small">
        {stats.total} nhân viên · {stats.tasks} tác vụ đang mở
      </div>
      {budget && (
        <>
          <Meter
            label="Token hôm nay"
            pct={(budget.total.used / Math.max(1, budget.total.limit)) * 100}
            hint={`${fmt(budget.total.used)} / ${fmt(budget.total.limit)}`}
          />
          <Meter label="Tuần" pct={(budget.weekly.used / Math.max(1, budget.weekly.limit)) * 100} />
          {budget.locked && <div className="warn">Đã chạm trần token — tác vụ mới bị khoá.</div>}
        </>
      )}
      {m && (
        <>
          <Meter label="CPU máy" pct={m.cpuPercent ?? 0} />
          <Meter label="RAM máy" pct={m.ramPercent ?? 0} />
        </>
      )}
      <button className="danger" onClick={() => void emergencyStop()}>
        DỪNG KHẨN CẤP
      </button>
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

export function EntityPanel() {
  const selectedId = useOfficeStore((s) => s.selectedId);
  const entity = useOfficeStore((s) => (s.selectedId ? s.entities[s.selectedId] : undefined));
  const logs = useOfficeStore((s) => s.logs);
  const select = useOfficeStore((s) => s.select);

  if (!selectedId) return null;
  if (!entity) {
    return (
      <aside className="card entity">
        <header>
          <h2>Không còn tồn tại</h2>
          <button onClick={() => select(null)} aria-label="Đóng">
            ✕
          </button>
        </header>
        <p className="muted">Thực thể này đã biến mất khỏi văn phòng.</p>
      </aside>
    );
  }
  const md = entity.metadata as Record<string, unknown>;
  const mine = logs.filter((l) => l.entityId === entity.id).slice(0, 8);
  return (
    <aside className="card entity" aria-label={`Chi tiết ${entity.name}`}>
      <header>
        <h2>
          <StatusDot status={entity.status} /> {entity.name}
        </h2>
        <button onClick={() => select(null)} aria-label="Đóng">
          ✕
        </button>
      </header>
      <MetaRow k="Loại" v={entity.kind} />
      <MetaRow k="Trạng thái" v={statusLabel(entity.status)} />
      {entity.department && <MetaRow k="Phòng" v={entity.department} />}
      {entity.kind === "agent" && (
        <>
          <MetaRow k="Vai trò" v={String(md.role ?? "")} />
          {md.task ? <MetaRow k="Đang làm" v={String(md.task)} /> : null}
          {md.currentUrl ? <MetaRow k="Đang mở" v={String(md.currentTitle ?? md.currentUrl)} /> : null}
          <MetaRow k="Token hôm nay" v={fmt(Number(md.tokensUsed ?? 0))} />
          <MetaRow k="Việc đã làm" v={String(md.tasksDone ?? 0)} />
        </>
      )}
      {entity.kind === "machine" && (
        <>
          <MetaRow k="CPU" v={`${md.cpuPercent ?? 0}%`} />
          <MetaRow k="RAM" v={`${md.ramUsedMb ?? 0} / ${md.ramTotalMb ?? 0} MB (${md.ramPercent ?? 0}%)`} />
          <MetaRow k="Bật máy" v={`${Math.round(Number(md.uptimeSec ?? 0) / 3600)} giờ`} />
          <h3>Tiến trình nặng nhất</h3>
          <ul className="procs">
            {((md.topProcesses as Array<{ name: string; pid: number; memMb: number }>) ?? []).map((p) => (
              <li key={p.pid}>
                <span>{p.name}</span>
                <b>{p.memMb} MB</b>
              </li>
            ))}
          </ul>
          <p className="muted small">Chỉ đọc — ứng dụng không bao giờ dừng tiến trình của bạn.</p>
        </>
      )}
      {entity.kind === "task" && (
        <>
          <MetaRow k="Giao cho" v={String(md.agentName ?? "")} />
          {md.estimatedTokens ? <MetaRow k="Ước lượng" v={`${fmt(Number(md.estimatedTokens))} token`} /> : null}
          {md.approvalReason ? <MetaRow k="Lý do duyệt" v={String(md.approvalReason)} /> : null}
        </>
      )}
      <MetaRow k="Cập nhật" v={new Date(entity.updatedAt).toLocaleTimeString("vi-VN")} />
      {mine.length > 0 && (
        <>
          <h3>Nhật ký gần đây</h3>
          <ul className="mini-log">
            {mine.map((l) => (
              <li key={l.id} className={`lv-${l.level}`}>
                {l.text}
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
  const logs = useOfficeStore((s) => s.logs);
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const shown = useMemo(
    () => logs.filter((l) => level === "all" || (level === "warn" ? l.level !== "info" : l.level === "error")).slice(0, 60),
    [logs, level],
  );
  return (
    <section className="card logs" aria-label="Nhật ký hoạt động">
      <header>
        <h2>Nhật ký</h2>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label="Lọc mức độ">
          <option value="all">Tất cả</option>
          <option value="warn">Cảnh báo + lỗi</option>
          <option value="error">Chỉ lỗi</option>
        </select>
      </header>
      {shown.length === 0 ? (
        <p className="muted">Chưa có hoạt động nào.</p>
      ) : (
        <ul>
          {shown.map((l: LogItem) => (
            <li key={l.id} className={`lv-${l.level}`}>
              <time>{new Date(l.at).toLocaleTimeString("vi-VN")}</time> {l.text}
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không gửi được quyết định");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="approval">
      <b>{a.kind === "permission" ? "🔐 Xin quyền truy cập" : "🧮 Cần duyệt trước khi chạy"}</b>
      <div>{a.summary}</div>
      {a.detail && <div className="path">{a.detail}</div>}
      <div className="actions">
        {a.kind === "permission" ? (
          <>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "once"))}>
              Cho phép một lần
            </button>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "read"))}>
              Chỉ đọc
            </button>
            <button disabled={busy} onClick={() => void run(() => decidePermission(a.id, "readwrite"))}>
              Đọc và ghi
            </button>
            <button className="danger" disabled={busy} onClick={() => void run(() => decidePermission(a.id, "deny"))}>
              Từ chối
            </button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => void run(() => decideTask(a.id, "approve"))}>
              Cho chạy
            </button>
            <button className="danger" disabled={busy} onClick={() => void run(() => decideTask(a.id, "reject"))}>
              Từ chối
            </button>
          </>
        )}
      </div>
      {err && <div className="warn">{err}</div>}
    </div>
  );
}

export function ApprovalDock() {
  const approvals = useOfficeStore((s) => s.approvals);
  const list = Object.values(approvals);
  if (list.length === 0) return null;
  return (
    <div className="approval-dock" role="alertdialog" aria-label="Yêu cầu cần bạn duyệt">
      {list.map((a) => (
        <ApprovalCard key={a.id} a={a} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Điều hướng nhanh tới phòng
// ---------------------------------------------------------------------------

export function RoomNav() {
  const departments = useOfficeStore((s) => s.departments);
  const focusOn = useOfficeStore((s) => s.focusOn);
  const select = useOfficeStore((s) => s.select);
  if (departments.length === 0) return null;
  return (
    <nav className="roomnav" aria-label="Chuyển tới phòng">
      {departments.map((d) => (
        <button
          key={d.id}
          onClick={() => {
            select(null);
            focusOn(d.center.x, d.center.z);
          }}
        >
          {d.short}
        </button>
      ))}
    </nav>
  );
}
