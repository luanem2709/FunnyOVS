/**
 * Bảng KPI Lớp kinh tế (EAL) treo trên tường lưng Phòng Tài chính: trạng thái, đã thu / chi phí / lãi lỗ, chu kỳ gần nhất, số báo cáo đang bán
 * và các cơ hội đang chờ duyệt. Hàm vẽ thuần (chỉ cần `draw`) nên test được mà không cần WebGL; chỉ vẽ lại khi khoá nội dung đổi.
 */
import * as THREE from "three";
import { formatUsd, type EconomyState } from "../../shared/economy.js";
import { LiveScreen } from "./facilities.js";
import { softBox } from "./chibiProps.js";
import { std } from "./decor.js";
import type { DrawTarget, Translate } from "./workboard.js";

export const ECONOMY_BOARD = { w: 2.9, h: 1.6, y: 1.95, x: -0.15 } as const;

/** Treo bảng lên tường lưng của phòng Tài chính (giữa hai tủ hồ sơ và bục biểu đồ, tránh hai khung tranh). */
export function buildEconomyBoard(parent: THREE.Object3D, room: { center: { x: number; z: number }; size: { d: number } }): LiveScreen {
  const inD = room.size.d / 2 - 0.08;
  const z = room.center.z - inD;
  const frame = softBox(ECONOMY_BOARD.w + 0.12, ECONOMY_BOARD.h + 0.12, 0.05, 0.02, std(0x14181f, 0.4, 0.3), room.center.x + ECONOMY_BOARD.x, ECONOMY_BOARD.y, z + 0.045, false);
  parent.add(frame);
  const screen = new LiveScreen(ECONOMY_BOARD.w, ECONOMY_BOARD.h, 1024);
  screen.mesh.position.set(room.center.x + ECONOMY_BOARD.x, ECONOMY_BOARD.y, z + 0.078);
  parent.add(screen.mesh);
  return screen;
}

const ell = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type Tone = "ok" | "warn" | "bad" | "off";
export const TONE_COLOR: Record<Tone, string> = { ok: "#3fb950", warn: "#d29922", bad: "#f85149", off: "#6e7681" };

/** Màu/nhãn trạng thái tổng của EAL. */
export function economyStatus(s: EconomyState | null): { key: string; tone: Tone } {
  if (!s || !s.enabled) return { key: "eco.board.off", tone: "off" };
  if (s.emergency) return { key: "eco.status.emergency", tone: "bad" };
  if (s.paused) return { key: "eco.status.paused", tone: "warn" };
  return { key: "eco.status.active", tone: "ok" };
}

/** Khoá vẽ lại: đổi khi số liệu hiển thị hoặc ngôn ngữ đổi. Không phụ thuộc đồng hồ nên bảng không nhấp nháy. */
export function economyBoardKey(t: Translate, s: EconomyState | null): string {
  if (!s) return `${t("eco.board.title")}|none`;
  return [
    t("eco.board.title"),
    s.enabled,
    s.mode,
    s.paused,
    s.emergency,
    s.receivedMicro,
    s.costMicro,
    s.negativeStreak,
    s.lastCycle?.at ?? "",
    s.ledgerOk,
    s.products.length,
    ...s.pending.slice(0, 3).map((o) => `${o.id}:${o.title}`),
    s.pending.length,
    s.recent[0]?.id ?? "",
  ].join("|");
}

export function paintEconomyBoard(screen: DrawTarget, t: Translate, s: EconomyState | null): void {
  screen.draw(economyBoardKey(t, s), (c, w, h) => {
    c.fillStyle = "#0e1624";
    c.fillRect(0, 0, w, h);
    const st = economyStatus(s);
    c.fillStyle = TONE_COLOR[st.tone];
    c.fillRect(0, 0, w, h * 0.04);
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillStyle = "#e6edf3";
    c.font = `bold ${h * 0.12}px sans-serif`;
    c.fillText(t("eco.board.title"), w * 0.03, h * 0.14);

    // chip trạng thái + chế độ (góc phải)
    c.textAlign = "right";
    c.font = `bold ${h * 0.07}px sans-serif`;
    c.fillStyle = TONE_COLOR[st.tone];
    c.fillText(t(st.key), w * 0.97, h * 0.1);
    if (s?.enabled) {
      c.font = `bold ${h * 0.055}px sans-serif`;
      c.fillStyle = s.mode === "live" ? TONE_COLOR.bad : TONE_COLOR.warn;
      c.fillText(s.mode === "live" ? t("eco.mode.live") : t("eco.mode.test"), w * 0.97, h * 0.19);
    }

    if (!s || !s.enabled) {
      c.textAlign = "left";
      c.fillStyle = "#8b949e";
      c.font = `${h * 0.065}px sans-serif`;
      c.fillText(ell(t("eco.board.offHint"), 70), w * 0.03, h * 0.5);
      return;
    }

    // ba số: đã thu / chi phí / lãi lỗ
    const net = s.netMicro;
    const stats: Array<[string, string, string]> = [
      [t("eco.received"), formatUsd(s.receivedMicro), "#3fb950"],
      [t("eco.cost"), formatUsd(s.costMicro), "#d29922"],
      [t("eco.net"), formatUsd(net), net < 0 ? TONE_COLOR.bad : net > 0 ? TONE_COLOR.ok : "#8b949e"],
    ];
    stats.forEach(([label, value, color], i) => {
      const x = w * (0.03 + i * 0.32);
      c.textAlign = "left";
      c.fillStyle = "#8b949e";
      c.font = `${h * 0.05}px sans-serif`;
      c.fillText(label, x, h * 0.3);
      c.fillStyle = color;
      c.font = `bold ${h * 0.12}px sans-serif`;
      c.fillText(value, x, h * 0.4);
    });

    // chu kỳ gần nhất + bộ đếm lỗ liên tiếp
    c.textAlign = "left";
    c.font = `${h * 0.055}px sans-serif`;
    c.fillStyle = "#c9d1d9";
    const cyc = s.lastCycle ? `${t("eco.lastCycle")}: ${formatUsd(s.lastCycle.net)}  (${formatUsd(s.lastCycle.revenue)} − ${formatUsd(s.lastCycle.cost)})` : `${t("eco.lastCycle")}: —`;
    c.fillText(ell(cyc, 60), w * 0.03, h * 0.53);
    c.fillStyle = s.negativeStreak > 0 ? TONE_COLOR.warn : "#8b949e";
    c.fillText(t("eco.streak", { n: s.negativeStreak, max: s.negativeLimit }), w * 0.03, h * 0.6);
    c.textAlign = "right";
    c.fillStyle = "#c9d1d9";
    c.fillText(`${t("eco.products")}: ${s.products.length}`, w * 0.97, h * 0.6);

    // cơ hội đang chờ duyệt
    c.textAlign = "left";
    c.fillStyle = s.pending.length ? TONE_COLOR.warn : "#8b949e";
    c.font = `bold ${h * 0.058}px sans-serif`;
    c.fillText(s.pending.length ? `${t("eco.board.pending")} (${s.pending.length})` : t("eco.noPending"), w * 0.03, h * 0.7);
    c.font = `${h * 0.052}px sans-serif`;
    c.fillStyle = "#e6edf3";
    s.pending.slice(0, 3).forEach((o, i) => c.fillText(ell(`• ${o.title}  (${formatUsd(o.estRevenue - o.estCost)})`, 66), w * 0.05, h * (0.78 + i * 0.07)));

    // chân bảng: sổ cái + địa chỉ nhận
    c.font = `${h * 0.045}px sans-serif`;
    c.textAlign = "left";
    c.fillStyle = s.ledgerOk ? "#6e7681" : TONE_COLOR.bad;
    c.fillText(s.ledgerOk ? t("eco.ledgerOk", { n: s.ledgerCount }) : t("eco.ledgerBad"), w * 0.03, h * 0.97);
    if (s.payTo) {
      c.textAlign = "right";
      c.fillStyle = "#6e7681";
      c.fillText(`${s.rail ?? ""} → ${s.payTo}`, w * 0.97, h * 0.97);
    }
  });
}
