/**
 * Việc đang chạy hiện NGAY TRONG cảnh 3D:
 *  - Bảng việc sống trên tường phòng Giao việc: các luồng việc (Giám đốc → Trưởng phòng → Nhân viên) và tiến độ từng luồng;
 *  - Huy hiệu số việc đang mở trên bàn của từng người phụ trách (xem `badgeFor`).
 *
 * Mọi thứ ở đây là hàm thuần — không three.js, không DOM thật — nên kiểm thử được trong Node:
 * `summarizeBoard` / `badgeFor` biến cây giao việc thành số liệu; `paintWorkBoard` / `paintBadge` chỉ cần một ngữ cảnh vẽ 2D.
 */
import type { OrgNode } from "../../shared/officeEntity.js";

type Vars = Record<string, string | number>;
export type Translate = (key: string, vars?: Vars) => string;

/** Phần của màn hình canvas mà hàm vẽ cần (khớp `LiveScreen.draw`). */
export interface DrawTarget {
  draw(key: string, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): void;
}

export type FlowState = "running" | "approval" | "done" | "failed";

export interface BoardFlow {
  id: string;
  title: string;
  state: FlowState;
  /** Số việc thật đã xong / tổng số việc thật (không tính bản đã bị thay bằng bản thử lại). */
  done: number;
  total: number;
  /** Tên những người đang cầm việc (tối đa 3). */
  who: string[];
}

export interface BoardInfo {
  flows: BoardFlow[];
  /** Số luồng đang chạy / chờ duyệt / vừa thất bại (tính trên mọi luồng gần đây, kể cả luồng không đủ chỗ hiện). */
  running: number;
  approval: number;
  failed: number;
}

/** Bảng chỉ rộng ~4 m: ít dòng nhưng chữ to để đọc được khi camera bay tới phòng. */
export const MAX_FLOWS = 3;
/** Luồng đã kết thúc vẫn hiện trên bảng thêm chừng này để người dùng thấy kết quả. */
export const FINISHED_KEEP_MS = 30 * 60_000;

const OPEN = new Set(["pending", "running", "awaiting-approval"]);

function stamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Nút con theo `parentId`. Không dựa riêng vào `childIds` của cha: server chỉ phát lại nút cha khi TRẠNG THÁI của nó đổi, nên lúc cha đang chạy
 * danh sách `childIds` phía client có thể còn cũ (thiếu con vừa tạo) — bảng sẽ hiện "0/0" dù việc đã được chia xuống.
 */
function childrenIndex(org: Record<string, OrgNode>): Map<string, OrgNode[]> {
  const m = new Map<string, OrgNode[]>();
  for (const n of Object.values(org)) {
    if (!n.parentId) continue;
    const list = m.get(n.parentId) ?? [];
    list.push(n);
    m.set(n.parentId, list);
  }
  for (const list of m.values()) list.sort((a, b) => stamp(a.createdAt) - stamp(b.createdAt) || a.id.localeCompare(b.id));
  return m;
}

/** Các nút còn hiệu lực của một luồng (bỏ nút đã bị thay bằng bản thử lại), duyệt an toàn kể cả khi dữ liệu có vòng. */
function liveNodes(org: Record<string, OrgNode>, index: Map<string, OrgNode[]>, root: OrgNode): OrgNode[] {
  const out: OrgNode[] = [];
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.superseded) continue;
    out.push(n);
    const kids = [...(index.get(n.id) ?? [])];
    for (const id of n.childIds) {
      const c = org[id];
      if (c && !kids.includes(c)) kids.push(c);
    }
    // Đẩy ngược để lấy ra đúng thứ tự giao việc (người được giao trước hiện trước).
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return out;
}

/** Các nút còn hiệu lực của luồng gốc `rootId`, theo thứ tự giao việc (dùng cho báo cáo). */
export function flowNodes(org: Record<string, OrgNode>, rootId: string): OrgNode[] {
  const root = org[rootId];
  return root ? liveNodes(org, childrenIndex(org), root) : [];
}

export function summarizeBoard(org: Record<string, OrgNode>, now: number = Date.now()): BoardInfo {
  const open: Array<{ at: number; flow: BoardFlow }> = [];
  const finished: Array<{ at: number; flow: BoardFlow }> = [];
  const index = childrenIndex(org);
  for (const root of Object.values(org)) {
    if (root.parentId || root.superseded) continue;
    const nodes = liveNodes(org, index, root);
    const work = nodes.filter((n) => n.kind === "work");
    const openNodes = nodes.filter((n) => OPEN.has(n.status));
    const state: FlowState = nodes.some((n) => n.status === "awaiting-approval")
      ? "approval"
      : openNodes.length > 0
        ? "running"
        : nodes.some((n) => n.status === "failed" || n.status === "rejected")
          ? "failed"
          : "done";
    const who = [...new Set(openNodes.filter((n) => n.kind === "work").map((n) => n.assigneeName))].slice(0, 3);
    const flow: BoardFlow = { id: root.id, title: root.title, state, done: work.filter((n) => n.status === "done").length, total: work.length, who };
    if (state === "running" || state === "approval") open.push({ at: stamp(root.createdAt), flow });
    else if (now - stamp(root.updatedAt) < FINISHED_KEEP_MS) finished.push({ at: stamp(root.updatedAt), flow });
  }
  open.sort((a, b) => b.at - a.at);
  finished.sort((a, b) => b.at - a.at);
  const all = [...open, ...finished].map((x) => x.flow);
  return {
    flows: all.slice(0, MAX_FLOWS),
    running: all.filter((f) => f.state === "running").length,
    approval: all.filter((f) => f.state === "approval").length,
    failed: all.filter((f) => f.state === "failed").length,
  };
}

// ---------------------------------------------------------------------------
// Vẽ bảng
// ---------------------------------------------------------------------------

export const STATE_COLOR: Record<FlowState, string> = { running: "#3fb950", approval: "#d29922", done: "#4f9cf9", failed: "#f85149" };

const ell = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Khoá vẽ lại: đổi khi số liệu HOẶC ngôn ngữ đổi (tiêu đề dịch ra khác nhau). */
export function boardKey(t: Translate, info: BoardInfo): string {
  return [t("board.title"), info.running, info.approval, info.failed, ...info.flows.map((f) => `${f.id}:${f.state}:${f.done}/${f.total}:${f.title}:${f.who.join(",")}`)].join("|");
}

export function paintWorkBoard(screen: DrawTarget, t: Translate, info: BoardInfo): void {
  screen.draw(boardKey(t, info), (c, w, h) => {
    c.fillStyle = "#0e1624";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#4f9cf9";
    c.fillRect(0, 0, w, h * 0.04);

    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillStyle = "#e6edf3";
    c.font = `bold ${h * 0.125}px sans-serif`;
    c.fillText(t("board.title"), w * 0.03, h * 0.15);

    // Ba số đếm ở góc phải, vẽ từ phải sang trái.
    c.font = `bold ${h * 0.072}px sans-serif`;
    c.textAlign = "right";
    let x = w * 0.97;
    const stats: Array<[string, number, string]> = [
      ["board.stat.failed", info.failed, info.failed > 0 ? STATE_COLOR.failed : "#6e7681"],
      ["board.stat.approval", info.approval, info.approval > 0 ? STATE_COLOR.approval : "#6e7681"],
      ["board.stat.running", info.running, info.running > 0 ? STATE_COLOR.running : "#6e7681"],
    ];
    for (const [key, n, color] of stats) {
      const text = t(key, { n });
      c.fillStyle = color;
      c.fillText(text, x, h * 0.15);
      x -= c.measureText(text).width + w * 0.03;
    }

    if (info.flows.length === 0) {
      c.textAlign = "center";
      c.fillStyle = "#8b949e";
      c.font = `bold ${h * 0.13}px sans-serif`;
      c.fillText(t("board.empty"), w / 2, h * 0.5);
      c.fillStyle = "#6e7681";
      c.font = `${h * 0.085}px sans-serif`;
      c.fillText(t("board.emptyHint"), w / 2, h * 0.68);
      return;
    }

    const top = h * 0.27;
    const rowH = (h * 0.71) / MAX_FLOWS;
    info.flows.forEach((f, i) => {
      const y0 = top + i * rowH;
      const color = STATE_COLOR[f.state];
      // chấm trạng thái
      c.fillStyle = color;
      c.beginPath();
      c.arc(w * 0.04, y0 + rowH * 0.3, h * 0.032, 0, Math.PI * 2);
      c.fill();
      // tiêu đề + nhãn trạng thái
      c.textAlign = "left";
      c.fillStyle = "#e6edf3";
      c.font = `bold ${h * 0.098}px sans-serif`;
      c.fillText(ell(f.title, 34), w * 0.08, y0 + rowH * 0.3);
      c.textAlign = "right";
      c.fillStyle = color;
      c.font = `bold ${h * 0.072}px sans-serif`;
      c.fillText(t(`board.state.${f.state}`), w * 0.97, y0 + rowH * 0.3);
      // thanh tiến độ + người đang làm + số việc xong
      const barX = w * 0.08;
      const barW = w * 0.48;
      const barY = y0 + rowH * 0.74;
      c.fillStyle = "#21262d";
      c.fillRect(barX, barY - h * 0.018, barW, h * 0.036);
      const ratio = f.total > 0 ? f.done / f.total : 0;
      c.fillStyle = color;
      c.fillRect(barX, barY - h * 0.018, Math.max(ratio > 0 ? 2 : 0, barW * ratio), h * 0.036);
      c.textAlign = "left";
      c.fillStyle = "#8b949e";
      c.font = `${h * 0.068}px sans-serif`;
      c.fillText(f.total === 0 ? t("board.planning") : ell(f.who.join(", "), 22), w * 0.6, barY);
      c.textAlign = "right";
      c.fillText(f.total === 0 ? "" : `${f.done}/${f.total}`, w * 0.97, barY);
    });
  });
}

// ---------------------------------------------------------------------------
// Huy hiệu số việc mở trên bàn
// ---------------------------------------------------------------------------

export type BadgeTone = "none" | "open" | "approval" | "error";

export interface BadgeInfo {
  /** Số việc đang mở (chờ/đang chạy/chờ duyệt) của người này. */
  open: number;
  approval: number;
  failed: number;
  tone: BadgeTone;
}

export const BADGE_COLOR: Record<Exclude<BadgeTone, "none">, string> = { open: "#2f81f7", approval: "#d29922", error: "#f85149" };
/** Lỗi cũ không bị cảnh báo mãi trên bàn: chỉ coi là "lỗi" trong khoảng này. */
export const FAILED_KEEP_MS = FINISHED_KEEP_MS;

export function badgeFor(org: Record<string, OrgNode>, agentId: string, now: number = Date.now()): BadgeInfo {
  let open = 0;
  let approval = 0;
  let failed = 0;
  for (const n of Object.values(org)) {
    if (n.assigneeId !== agentId || n.superseded) continue;
    if (OPEN.has(n.status)) {
      open++;
      if (n.status === "awaiting-approval") approval++;
    } else if ((n.status === "failed" || n.status === "rejected") && now - stamp(n.updatedAt) < FAILED_KEEP_MS) {
      failed++;
    }
  }
  const tone: BadgeTone = failed > 0 ? "error" : approval > 0 ? "approval" : open > 0 ? "open" : "none";
  return { open, approval, failed, tone };
}

/** Chữ trên huy hiệu: lỗi hiện "!", còn lại là số việc mở (từ 10 trở lên rút gọn "9+"). */
export function badgeText(info: BadgeInfo): string {
  if (info.tone === "none") return "";
  if (info.tone === "error") return "!";
  return info.open > 9 ? "9+" : String(info.open);
}

/** Vẽ huy hiệu tròn vào canvas vuông `size` px. */
export function paintBadge(c: CanvasRenderingContext2D, size: number, info: BadgeInfo): void {
  c.clearRect(0, 0, size, size);
  if (info.tone === "none") return;
  const r = size / 2;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(r, r, r * 0.96, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = BADGE_COLOR[info.tone];
  c.beginPath();
  c.arc(r, r, r * 0.8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `bold ${size * (badgeText(info).length > 1 ? 0.42 : 0.55)}px sans-serif`;
  c.fillText(badgeText(info), r, r + size * 0.03);
}

// ---------------------------------------------------------------------------
// Thông báo cho trình đọc màn hình khi một luồng việc kết thúc
// ---------------------------------------------------------------------------

export interface FlowAnnouncement {
  kind: "done" | "failed";
  title: string;
}

/**
 * So sánh các luồng gốc trước/sau và trả về những luồng VỪA kết thúc (đang mở → xong/lỗi). Luồng mới xuất hiện đã ở trạng thái kết thúc
 * (ví dụ khi tải lại trang) không được đọc, để trình đọc màn hình không "đọc lại cả lịch sử".
 */
export function finishedFlows(before: ReadonlyMap<string, OrgNode["status"]>, org: Record<string, OrgNode>): FlowAnnouncement[] {
  const out: FlowAnnouncement[] = [];
  for (const n of Object.values(org)) {
    if (n.parentId || n.superseded) continue;
    const prev = before.get(n.id);
    if (prev === undefined || prev === n.status || !OPEN.has(prev)) continue;
    if (n.status === "done") out.push({ kind: "done", title: n.title });
    else if (n.status === "failed" || n.status === "rejected") out.push({ kind: "failed", title: n.title });
  }
  return out;
}

/** Trạng thái hiện tại của các luồng gốc, để so sánh ở lần sau. */
export function rootStatuses(org: Record<string, OrgNode>): Map<string, OrgNode["status"]> {
  const m = new Map<string, OrgNode["status"]>();
  for (const n of Object.values(org)) if (!n.parentId && !n.superseded) m.set(n.id, n.status);
  return m;
}
