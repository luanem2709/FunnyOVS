/**
 * L1 (board.paint) + L2 (desk.badge): bảng việc sống trong phòng Giao việc và huy hiệu số việc mở trên bàn.
 * Phần dữ liệu và phần vẽ đều thuần → kiểm bằng ngữ cảnh vẽ giả ghi lại mọi lệnh `fillText`; không cần WebGL.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";
import { translate } from "../src/client/office-3d/i18n/index.js";
import {
  BADGE_COLOR,
  FINISHED_KEEP_MS,
  MAX_FLOWS,
  STATE_COLOR,
  badgeFor,
  badgeText,
  boardKey,
  finishedFlows,
  paintBadge,
  paintWorkBoard,
  rootStatuses,
  summarizeBoard,
  type DrawTarget,
} from "../src/client/assets/workboard.js";
import type { OrgNode } from "../src/shared/officeEntity.js";

const NOW = Date.parse("2026-11-21T10:00:00.000Z");
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
let seq = 0;

function node(over: Partial<OrgNode>): OrgNode {
  const id = over.id ?? `n${++seq}`;
  return {
    id,
    level: 3,
    kind: "work",
    assigneeId: "duc",
    assigneeName: "Đức",
    department: "dispatch",
    title: "Việc",
    status: "running",
    childIds: [],
    createdAt: ago(60_000),
    updatedAt: ago(30_000),
    ...over,
  };
}

/** Dựng một luồng: gốc (Giám đốc) → n việc thật. Trả về map id → nút. */
function flow(rootId: string, statuses: OrgNode["status"][], over: Partial<OrgNode> = {}, kidOver: (i: number) => Partial<OrgNode> = () => ({})): Record<string, OrgNode> {
  const kids = statuses.map((status, i) => node({ id: `${rootId}-k${i}`, parentId: rootId, status, assigneeId: `s${i}`, assigneeName: `NV${i}`, ...kidOver(i) }));
  const rootStatus: OrgNode["status"] = statuses.some((s) => s === "pending" || s === "running" || s === "awaiting-approval") ? "running" : "done";
  const root = node({ id: rootId, level: 1, kind: "delegation", assigneeId: "giamdoc", assigneeName: "Giám đốc", title: `Luồng ${rootId}`, status: rootStatus, childIds: kids.map((k) => k.id), ...over });
  return Object.fromEntries([root, ...kids].map((n) => [n.id, n]));
}

// ---- ngữ cảnh vẽ giả: ghi lại chữ và hình
interface Rec {
  texts: Array<{ text: string; x: number; y: number; fill: string; align: string }>;
  rects: Array<{ x: number; y: number; w: number; h: number; fill: string }>;
  arcs: Array<{ fill: string }>;
}
function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { texts: [], rects: [], arcs: [] };
  const s = { fillStyle: "", font: "", textAlign: "left", textBaseline: "alphabetic" };
  let arcOpen = false;
  const ctx = {
    get fillStyle() {
      return s.fillStyle;
    },
    set fillStyle(v: string) {
      s.fillStyle = v;
    },
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: () => undefined,
    fillRect: (x: number, y: number, w: number, h: number) => rec.rects.push({ x, y, w, h, fill: s.fillStyle }),
    fillText: function (this: { textAlign: string }, text: string, x: number, y: number) {
      rec.texts.push({ text, x, y, fill: s.fillStyle, align: this.textAlign });
    },
    measureText: (t: string) => ({ width: t.length * 10 }),
    beginPath: () => {
      arcOpen = true;
    },
    arc: () => undefined,
    fill: () => {
      if (arcOpen) rec.arcs.push({ fill: s.fillStyle });
      arcOpen = false;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rec };
}

/** Màn hình giả: gọi paint ngay khi khoá đổi, đếm số lần vẽ. */
function screen(w = 1024, h = 340): { target: DrawTarget; paints: () => number; last: () => Rec } {
  let lastKey = "";
  let n = 0;
  let last: Rec = { texts: [], rects: [], arcs: [] };
  return {
    target: {
      draw(key, paint) {
        if (key === lastKey) return;
        lastKey = key;
        const r = recorder();
        paint(r.ctx, w, h);
        n++;
        last = r.rec;
      },
    },
    paints: () => n,
    last: () => last,
  };
}

const tEn = (k: string, v?: Record<string, string | number>) => translate("en", k, v);
const tVi = (k: string, v?: Record<string, string | number>) => translate("vi", k, v);
const textsOf = (r: Rec): string[] => r.texts.map((t) => t.text);

describe("tổng hợp luồng việc cho bảng (L1)", () => {
  it("trạng thái luồng: đang chạy / chờ duyệt / xong / lỗi, kèm tiến độ và người đang làm", () => {
    const cases: Array<[string, OrgNode["status"][], object]> = [
      ["a", ["done", "running", "pending"], { state: "running", done: 1, total: 3, who: ["NV1", "NV2"] }],
      ["b", ["done", "awaiting-approval"], { state: "approval", done: 1, total: 2, who: ["NV1"] }],
      ["c", ["done", "done"], { state: "done", done: 2, total: 2, who: [] }],
      ["d", ["done", "failed"], { state: "failed", done: 1, total: 2, who: [] }],
    ];
    for (const [id, statuses, expected] of cases) {
      const info = summarizeBoard(flow(id, statuses, id === "d" ? { status: "done" } : {}), NOW);
      expect(info.flows[0], id).toMatchObject({ id, ...expected });
    }
    // Các số đếm tính trên MỌI luồng, kể cả luồng không đủ chỗ hiện trên bảng.
    const all = { ...flow("a", ["running"]), ...flow("b", ["awaiting-approval"]), ...flow("c", ["done"]), ...flow("d", ["failed"], { status: "done" }) };
    const info = summarizeBoard(all, NOW);
    expect([info.running, info.approval, info.failed]).toEqual([1, 1, 1]);
    expect(info.flows.length).toBeLessThanOrEqual(MAX_FLOWS);
  });

  it("luồng đang mở xếp trước (mới nhất trước), rồi tới luồng vừa xong; luồng xong quá lâu bị ẩn; tối đa MAX_FLOWS", () => {
    const org: Record<string, OrgNode> = {};
    for (let i = 0; i < 6; i++) Object.assign(org, flow(`open${i}`, ["running"], { createdAt: ago(1000 * (10 - i)) }));
    Object.assign(org, flow("doneNew", ["done"], { updatedAt: ago(60_000) }), flow("doneOld", ["done"], { updatedAt: ago(FINISHED_KEEP_MS + 60_000) }));
    const info = summarizeBoard(org, NOW);
    expect(info.flows).toHaveLength(MAX_FLOWS);
    expect(info.flows.map((f) => f.id)).toEqual(["open5", "open4", "open3", "open2"].slice(0, MAX_FLOWS)); // mới nhất trước
    expect(info.running).toBe(6); // số đếm tính cả luồng không đủ chỗ hiện

    const few = summarizeBoard({ ...flow("o", ["running"]), ...flow("d1", ["done"], { updatedAt: ago(60_000) }), ...flow("old", ["done"], { updatedAt: ago(FINISHED_KEEP_MS + 1) }) }, NOW);
    expect(few.flows.map((f) => f.id)).toEqual(["o", "d1"]);
  });

  it("bản đã bị thay bằng bản thử lại không bị đếm; dữ liệu có vòng hay nút mồ côi không làm treo", () => {
    const org = flow("r", ["failed", "running"], {}, (i) => (i === 0 ? { superseded: true } : {}));
    expect(summarizeBoard(org, NOW).flows[0]).toMatchObject({ state: "running", total: 1, done: 0 });
    // vòng: a → b → a
    const a = node({ id: "ca", level: 1, kind: "delegation", childIds: ["cb"], status: "running" });
    const b = node({ id: "cb", parentId: "ca", childIds: ["ca", "ghost"], status: "running" });
    expect(summarizeBoard({ ca: a, cb: b }, NOW).flows).toHaveLength(1);
  });

  it("cha chưa kịp cập nhật childIds (server chỉ phát lại cha khi trạng thái đổi): vẫn tính các con theo parentId", () => {
    // Hình dạng thật khi đang chạy: cha vẫn có childIds rỗng nhưng đã có nút con tham chiếu parentId.
    const org = flow("stale", ["done", "running"], { childIds: [] });
    expect(org.stale.childIds).toEqual([]);
    expect(summarizeBoard(org, NOW).flows[0]).toMatchObject({ state: "running", done: 1, total: 2, who: ["NV1"] });
    // cháu (cấp 3) dưới một trưởng phòng (cấp 2) cũng được tính
    const head = node({ id: "h", parentId: "stale", level: 2, kind: "delegation", assigneeId: "huy", assigneeName: "Huy", status: "running" });
    const grand = node({ id: "g", parentId: "h", status: "running", assigneeId: "ha", assigneeName: "Hà" });
    const deep = summarizeBoard({ ...org, h: head, g: grand }, NOW).flows[0];
    expect(deep).toMatchObject({ total: 3, who: expect.arrayContaining(["NV1", "Hà"]) });
  });

  it("mới giao (chưa có việc thật): trạng thái đang chạy với tổng 0 → bảng ghi 'đang lập kế hoạch'", () => {
    const root = node({ id: "plan", level: 1, kind: "delegation", status: "running", childIds: [] });
    const info = summarizeBoard({ plan: root }, NOW);
    expect(info.flows[0]).toMatchObject({ state: "running", total: 0, done: 0 });
    const s = screen();
    paintWorkBoard(s.target, tEn, info);
    expect(textsOf(s.last())).toContain("Planning…");
  });

  it("không có việc nào → bảng trống kèm gợi ý", () => {
    const info = summarizeBoard({}, NOW);
    expect(info).toEqual({ flows: [], running: 0, approval: 0, failed: 0 });
    const s = screen();
    paintWorkBoard(s.target, tEn, info);
    expect(textsOf(s.last())).toEqual(expect.arrayContaining(["Work in flight", "Nothing in flight", "Assign work to the Director to get started"]));
  });
});

describe("vẽ bảng việc sống (board.paint)", () => {
  const org = { ...flow("x", ["done", "running", "running"], { title: "Chiến dịch tháng 12" }), ...flow("y", ["awaiting-approval"], { title: "Gửi báo giá" }) };

  it("tiếng Anh: tiêu đề, số đếm, từng luồng với trạng thái, tiến độ và người đang làm", () => {
    const s = screen();
    paintWorkBoard(s.target, tEn, summarizeBoard(org, NOW));
    const texts = textsOf(s.last());
    expect(texts).toEqual(expect.arrayContaining(["Work in flight", "1 running", "1 awaiting approval", "0 failed", "Chiến dịch tháng 12", "Gửi báo giá", "Running", "Awaiting approval", "1/3", "0/1", "NV1, NV2", "NV0"]));
    // màu trạng thái đúng: nhãn "Running" xanh lá, "Awaiting approval" vàng
    const colorOf = (txt: string) => s.last().texts.find((t) => t.text === txt)!.fill;
    expect(colorOf("Running")).toBe(STATE_COLOR.running);
    expect(colorOf("Awaiting approval")).toBe(STATE_COLOR.approval);
  });

  it("tiếng Việt: cùng dữ liệu nhưng chữ trên bảng là tiếng Việt (không còn chữ Anh lẫn vào nhãn)", () => {
    const s = screen();
    paintWorkBoard(s.target, tVi, summarizeBoard(org, NOW));
    const texts = textsOf(s.last());
    expect(texts).toEqual(expect.arrayContaining(["Việc đang chạy", "1 đang chạy", "1 chờ duyệt", "Đang chạy", "Chờ duyệt"]));
    expect(texts).not.toContain("Running");
    expect(texts).not.toContain("Work in flight");
  });

  it("chỉ vẽ lại khi số liệu hoặc ngôn ngữ đổi (khung hình giống nhau không tốn công)", () => {
    const s = screen();
    const info = summarizeBoard(org, NOW);
    paintWorkBoard(s.target, tEn, info);
    paintWorkBoard(s.target, tEn, summarizeBoard(org, NOW));
    expect(s.paints()).toBe(1);
    paintWorkBoard(s.target, tVi, info); // đổi ngôn ngữ → vẽ lại
    expect(s.paints()).toBe(2);
    const moved = { ...org, "x-k1": { ...org["x-k1"], status: "done" as const } };
    paintWorkBoard(s.target, tVi, summarizeBoard(moved, NOW)); // đổi tiến độ → vẽ lại
    expect(s.paints()).toBe(3);
    expect(boardKey(tEn, info)).not.toBe(boardKey(tVi, info));
  });

  it("thanh tiến độ dài đúng tỉ lệ và nằm trong bảng; tiêu đề quá dài bị cắt bằng …", () => {
    const long = "A".repeat(120);
    const s = screen(1024, 340);
    paintWorkBoard(s.target, tEn, summarizeBoard(flow("z", ["done", "done", "running", "running"], { title: long }), NOW));
    const r = s.last();
    const title = r.texts.find((t) => t.text.startsWith("AAAA"))!;
    expect(title.text.length).toBeLessThanOrEqual(34);
    expect(title.text.endsWith("…")).toBe(true);
    // thanh tiến độ: hình chữ nhật màu trạng thái, rộng = 50% của thanh nền (2/4 xong)
    const track = r.rects.find((x) => x.fill === "#21262d")!;
    const fill = r.rects.find((x) => x.fill === STATE_COLOR.running && x.h === track.h)!;
    expect(fill.w / track.w).toBeCloseTo(0.5, 2);
    for (const x of r.rects) expect(x.x + x.w).toBeLessThanOrEqual(1024 + 1e-6);
  });

  it("mọi khoá chữ của bảng đều có ở cả hai ngôn ngữ", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "src", "client", "assets", "workboard.ts"), "utf8");
    const keys = new Set<string>([...src.matchAll(/["'`](board\.[a-zA-Z.]+)["'`]/g)].map((m) => m[1]));
    for (const st of ["running", "approval", "done", "failed"]) keys.add(`board.state.${st}`);
    expect(keys.size).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      expect(k in DICTIONARIES.vi, `vi: ${k}`).toBe(true);
      expect(k in DICTIONARIES.en, `en: ${k}`).toBe(true);
    }
  });
});

describe("huy hiệu số việc mở trên bàn (L2, desk.badge)", () => {
  it("đếm việc mở của đúng người; ưu tiên lỗi > chờ duyệt > đang mở > không có", () => {
    const org = {
      ...flow("f", ["running", "pending"], {}, (i) => ({ assigneeId: "duc", assigneeName: "Đức" })),
      ...flow("g", ["awaiting-approval"], {}, () => ({ assigneeId: "duc", assigneeName: "Đức" })),
    };
    const duc = badgeFor(org, "duc", NOW);
    expect(duc).toMatchObject({ open: 3, approval: 1, failed: 0, tone: "approval" });
    expect(badgeFor(org, "giamdoc", NOW)).toMatchObject({ open: 2, tone: "open" }); // nút giao việc của Giám đốc cũng là việc mở của họ
    expect(badgeFor(org, "nguoi-la", NOW)).toEqual({ open: 0, approval: 0, failed: 0, tone: "none" });
  });

  it("lỗi gần đây hiện '!' đỏ rồi tự hết hạn; việc xong và bản bị thay thế không tính", () => {
    const failedNow = { f1: node({ id: "f1", assigneeId: "mai", status: "failed", updatedAt: ago(60_000) }) };
    expect(badgeFor(failedNow, "mai", NOW)).toMatchObject({ failed: 1, tone: "error" });
    expect(badgeText(badgeFor(failedNow, "mai", NOW))).toBe("!");
    const stale = { f1: node({ id: "f1", assigneeId: "mai", status: "failed", updatedAt: ago(FINISHED_KEEP_MS + 1000) }) };
    expect(badgeFor(stale, "mai", NOW).tone).toBe("none");
    const doneOnly = { d: node({ id: "d", assigneeId: "mai", status: "done" }), s: node({ id: "s", assigneeId: "mai", status: "running", superseded: true }) };
    expect(badgeFor(doneOnly, "mai", NOW).tone).toBe("none");
  });

  it("chữ trên huy hiệu: số việc, '9+' từ 10 trở lên, '!' khi lỗi, rỗng khi không có", () => {
    expect(badgeText({ open: 3, approval: 0, failed: 0, tone: "open" })).toBe("3");
    expect(badgeText({ open: 12, approval: 0, failed: 0, tone: "open" })).toBe("9+");
    expect(badgeText({ open: 1, approval: 0, failed: 1, tone: "error" })).toBe("!");
    expect(badgeText({ open: 0, approval: 0, failed: 0, tone: "none" })).toBe("");
  });

  it("vẽ huy hiệu: vòng trắng + nền theo màu trạng thái + chữ; không có việc thì không vẽ gì", () => {
    for (const tone of ["open", "approval", "error"] as const) {
      const { ctx, rec } = recorder();
      paintBadge(ctx, 128, { open: 2, approval: tone === "approval" ? 1 : 0, failed: tone === "error" ? 1 : 0, tone });
      expect(rec.arcs.map((a) => a.fill)).toEqual(["#ffffff", BADGE_COLOR[tone]]);
      expect(rec.texts).toHaveLength(1);
      expect(rec.texts[0].text).toBe(tone === "error" ? "!" : "2");
    }
    const none = recorder();
    paintBadge(none.ctx, 128, { open: 0, approval: 0, failed: 0, tone: "none" });
    expect(none.rec.arcs).toHaveLength(0);
    expect(none.rec.texts).toHaveLength(0);
  });
});

describe("thông báo cho trình đọc màn hình khi luồng kết thúc (J3)", () => {
  it("chỉ báo luồng VỪA chuyển từ đang mở sang xong/lỗi; luồng có sẵn hoặc mới tải không bị đọc lại", () => {
    const before = rootStatuses({ ...flow("a", ["running"]), ...flow("b", ["awaiting-approval"]), ...flow("d", ["done"]) });
    expect([...before.entries()]).toEqual([
      ["a", "running"],
      ["b", "running"],
      ["d", "done"],
    ]);
    const after = {
      ...flow("a", ["done"], { title: "Chiến dịch" }),
      ...flow("b", ["failed"], { title: "Báo giá", status: "failed" }),
      ...flow("d", ["done"]), // vốn đã xong từ trước → không đọc lại
      ...flow("c", ["done"]), // luồng mới xuất hiện đã kết thúc (vd. tải lại trang) → không đọc
    };
    expect(finishedFlows(before, after)).toEqual([
      { kind: "done", title: "Chiến dịch" },
      { kind: "failed", title: "Báo giá" },
    ]);
    expect(finishedFlows(rootStatuses(after), after)).toEqual([]); // không đổi → không báo gì
  });

  it("bỏ qua nút con và luồng đã bị thay thế", () => {
    const before = rootStatuses(flow("x", ["running"]));
    const done = flow("x", ["done"], { status: "done" }, () => ({ status: "done" }));
    expect(finishedFlows(before, done)).toHaveLength(1);
    expect(finishedFlows(before, flow("x", ["done"], { status: "done", superseded: true }))).toEqual([]);
  });
});
