/**
 * Tổ chức & luồng việc theo tầng: Giám đốc → Trưởng phòng → Nhân viên.
 * - Giao việc cho Giám đốc (mặc định) hoặc trực tiếp cho bất kỳ ai.
 * - Sơ đồ tổ chức rút từ chính các thực thể agent (metadata.tier / reportsTo).
 * - Cây giao việc: ai giao cho ai, trạng thái từng cấp, lý do phân công, bước đang chờ, nghiệm thu có cấu trúc và báo cáo của Giám đốc.
 *   Mọi câu do server sinh (lỗi, nghiệm thu) hiện theo khoá i18n nên đúng ngôn ngữ người dùng.
 */
import { useMemo, useState } from "react";
import type { OfficeEntity, OrgNode, OrgReview, OrgStatus } from "../../../shared/officeEntity.js";
import { agentRole, deptName, messageText, useT } from "../i18n/index.js";
import { badgeFor } from "../../assets/workboard.js";
import { assignWork, errorText } from "../lib/api.js";
import { Note, onCtrlEnter } from "./a11y.js";
import { flowReport, flowReportFileName } from "./flowReport.js";
import { useOfficeStore } from "../store/officeStore.js";
import { useSettings } from "../store/settings.js";
import { StatusDot } from "./panels.js";
import { SchedulePanel } from "./SchedulePanel.js";

function OrgChip({ s }: { s: OrgStatus }) {
  const t = useT();
  return <span className={`orgchip org-${s}`}>{t(`org.status.${s}`)}</span>;
}

interface TreeAgent {
  e: OfficeEntity;
  id: string;
  tier: number;
  reportsTo?: string;
  open: number;
}

function AgentRow({ a, children }: { a: TreeAgent; children?: React.ReactNode }) {
  const t = useT();
  const select = useOfficeStore((s) => s.select);
  const focusOn = useOfficeStore((s) => s.focusOn);
  const selected = useOfficeStore((s) => s.selectedId === a.e.id);
  return (
    <li>
      <button
        className={`orgrow tier-${a.tier}${selected ? " sel" : ""}`}
        onClick={() => {
          select(a.e.id);
          if (a.e.position) focusOn(a.e.position.x, a.e.position.z);
        }}
        title={agentRole(a.id, String((a.e.metadata as { role?: string }).role ?? ""))}
      >
        <StatusDot status={a.e.status} />
        <b>{a.e.name}</b>
        <span className="muted small">{t(`tier.${a.tier}`)}</span>
        {a.open > 0 && <span className="badge">{a.open}</span>}
      </button>
      {children}
    </li>
  );
}

function NodeTree({ node, nodes }: { node: OrgNode; nodes: Record<string, OrgNode> }) {
  const t = useT();
  const waiting = (node.waitingFor ?? []).map((id) => nodes[id]?.assigneeName).filter((n): n is string => Boolean(n));
  const failedText = node.error && (node.status === "failed" || node.status === "rejected") ? messageText(t, node.error) : "";
  return (
    <li className={`flow lv${node.level}${node.superseded ? " superseded" : ""}`}>
      <div className="flowrow">
        <span className="arrow" aria-hidden="true">
          {node.level === 1 ? "◆" : "↳"}
        </span>
        <span className="who">
          {node.assigneeName} <span className="muted small">· {t(`tier.${node.level}`)}</span>
          {node.level > 1 && <span className="orgchip deptchip">{deptName(node.department, true)}</span>}
        </span>
        <OrgChip s={node.status} />
      </div>
      {node.level === 1 && node.planSource && <div className="flowresult">{t(`org.planSource.${node.planSource}`)}</div>}
      {node.rationale && (
        <div className="flowresult" title={node.rationale}>
          {t("org.rationale")}: {node.rationale}
        </div>
      )}
      {waiting.length > 0 && <div className="flowresult">{t("org.waiting", { names: waiting.join(", ") })}</div>}
      {node.retryOf && <div className="flowresult">{t("org.retried")}</div>}
      {node.kind === "work" && node.result && node.status !== "pending" && (
        <div className="flowresult" title={node.result}>
          {node.result}
        </div>
      )}
      {failedText && (
        <div className="flowresult lv-error" title={failedText}>
          {failedText}
        </div>
      )}
      {node.childIds.length > 0 && (
        <ul>
          {node.childIds.map((id) => (nodes[id] ? <NodeTree key={id} node={nodes[id]} nodes={nodes} /> : null))}
        </ul>
      )}
    </li>
  );
}

/** Nghiệm thu có cấu trúc: số liệu + từng người (trạng thái, kết quả hoặc lỗi đã dịch). */
export function Review({ review }: { review: OrgReview }) {
  const t = useT();
  return (
    <div className="flowreview">
      <div className="reviewhead">
        <b>{t("org.review.title")}</b>{" "}
        <span className="muted small">{t("org.review.counts", { done: review.done, failed: review.failed, rejected: review.rejected })}</span>
      </div>
      <ul>
        {review.items.map((it, i) => (
          <li key={`${it.assigneeId}-${i}`}>
            <OrgChip s={it.status} /> <b>{it.assigneeName}</b> <span className="muted small">{deptName(it.department, true)}</span>
            {it.text && (
              <div className="flowresult" title={it.text}>
                {it.text}
              </div>
            )}
            {it.error && <div className="flowresult lv-error">{messageText(t, it.error)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tải một tệp văn bản về máy ngay trên trình duyệt (không qua máy chủ). */
function downloadText(name: string, text: string, type = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function OrgPanel() {
  const t = useT();
  const entities = useOfficeStore((s) => s.entities);
  const org = useOfficeStore((s) => s.org);
  const [to, setTo] = useState("giamdoc");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const agents = useMemo<TreeAgent[]>(() => {
    return Object.values(entities)
      .filter((e) => e.kind === "agent")
      .map((e) => {
        const md = e.metadata as { agentId?: string; tier?: number; reportsTo?: string };
        const id = String(md.agentId);
        // Cùng cách đếm với huy hiệu trên bàn trong cảnh 3D (việc đang mở của người này, gồm cả việc phân xuống cấp dưới).
        return { e, id, tier: Number(md.tier ?? 3), reportsTo: md.reportsTo, open: badgeFor(org, id).open };
      });
  }, [entities, org]);

  const byParent = useMemo(() => {
    const m = new Map<string | undefined, TreeAgent[]>();
    for (const a of agents) {
      const list = m.get(a.reportsTo) ?? [];
      list.push(a);
      m.set(a.reportsTo, list);
    }
    // Thứ tự ổn định theo tầng rồi theo tên, không phụ thuộc thứ tự đến của sự kiện.
    for (const list of m.values()) list.sort((x, y) => x.tier - y.tier || x.e.name.localeCompare(y.e.name, "vi"));
    return m;
  }, [agents]);

  const roots = useMemo(
    () => Object.values(org).filter((n) => !n.parentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [org],
  );

  const render = (a: TreeAgent): React.ReactNode => {
    const kids = byParent.get(a.id) ?? [];
    return (
      <AgentRow key={a.e.id} a={a}>
        {kids.length > 0 && <ul>{kids.map(render)}</ul>}
      </AgentRow>
    );
  };

  const submit = async (): Promise<void> => {
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await assignWork(text, to);
      const work = r.tree.filter((n) => n.kind === "work");
      setNote({ text: t("org.assigned", { n: work.length, who: work.map((n) => n.assigneeName).join(", ") }) });
      setPrompt("");
    } catch (e) {
      setNote({ text: errorText(t, e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const topAgents = byParent.get(undefined) ?? [];
  const recipients = [...agents].sort((x, y) => x.tier - y.tier || x.e.name.localeCompare(y.e.name, "vi"));

  return (
    <section className="orgpanel" aria-label={t("tab.org")}>
      <h3>{t("org.assign")}</h3>
      <label className="muted small" htmlFor="org-to">
        {t("org.assignTo")}
      </label>
      <select id="org-to" value={to} onChange={(e) => setTo(e.target.value)}>
        {recipients.map((a) => (
          <option key={a.id} value={a.id}>
            {t("org.recipientOption", { tier: t(`tier.${a.tier}`), name: a.e.name })}
          </option>
        ))}
      </select>
      <textarea
        className="assign"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("org.placeholder")}
        aria-label={t("org.requestLabel")}
        aria-keyshortcuts="Control+Enter"
        title={t("common.ctrlEnter")}
        onKeyDown={onCtrlEnter(() => {
          if (!busy && prompt.trim()) void submit();
        })}
      />
      <button className="primary" disabled={busy || !prompt.trim()} onClick={() => void submit()}>
        {busy ? t("org.assigning") : t("org.assign")}
      </button>
      <Note note={note} />

      <SchedulePanel />

      <h3>{t("org.flow")}</h3>
      {roots.length === 0 ? (
        <p className="muted small">{t("org.flowEmpty")}</p>
      ) : (
        <ul className="flows">
          {roots.map((r) => {
            const finished = r.status !== "running" && r.status !== "pending";
            return (
              <li key={r.id} className="flowroot">
                <div className="flowtitle">{r.title}</div>
                <ul>
                  <NodeTree node={r} nodes={org} />
                </ul>
                {r.summary && finished && (
                  <div className="flowsummary">
                    <b>{t("org.summary")}</b>
                    <p>{r.summary}</p>
                  </div>
                )}
                {r.review ? <Review review={r.review} /> : r.result && finished ? <pre className="flowreview">{r.result}</pre> : null}
                {finished && (
                  <button
                    className="small"
                    onClick={() => {
                      const at = new Date();
                      downloadText(flowReportFileName(r.title, at), flowReport(t, org, r.id, { company: useSettings.getState().companyName, at }));
                    }}
                  >
                    {t("org.report.download")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3>{t("org.chart")}</h3>
      {topAgents.length === 0 ? <p className="muted small">{t("common.loading")}</p> : <ul className="orgtree">{topAgents.map(render)}</ul>}
      <p className="muted small deptline">{agents.length > 0 ? [...new Set(agents.map((a) => a.e.department))].filter(Boolean).map((d) => deptName(String(d), true)).join(" · ") : ""}</p>
    </section>
  );
}
