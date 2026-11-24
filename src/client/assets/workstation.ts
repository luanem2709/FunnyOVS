/**
 * Bàn làm việc của một nhân viên, dựng theo phong cách CHIBI (khối bo tròn mềm, màu phấn theo phòng) để hợp với nhân vật chibi:
 * bàn có mép màu phòng, hộc kéo, thảm bàn, bàn phím, chuột, cốc, chậu cây và một món đồ riêng theo từng người (đèn, tai nghe, mèo, sách);
 * ghế xoay có màu phòng (Giám đốc: ghế lưng cao); màn hình bo tròn có huy hiệu phòng ở lưng.
 *
 * Toàn bộ được GỘP theo vật liệu (≈ 10 lệnh vẽ/bàn thay vì ~20 mesh rời) nên nhẹ hơn bản cũ dù chi tiết hơn.
 * Toạ độ tương đối so với chỗ ngồi: nhân vật ngồi ở (0,0) nhìn về +z, bàn ở z = 0.62, màn hình ở (0.52, 0.72) quay lưng về phía người xem.
 * `MONITOR_AT` và `SCREEN_Y` được dùng chung với màn hình hiển thị (AgentScreen) để không bao giờ lệch nhau.
 */
import * as THREE from "three";
import { std, mergeStatic, box, cyl, ball } from "./decor.js";
import { deepen, isLowPropDetail, pastel, softBox } from "./chibiProps.js";

export const DESK_Y = 0.78;
export const SEAT_HEIGHT = 0.49;
/** Vị trí màn hình so với chỗ ngồi (x, z). */
export const MONITOR_AT = { x: 0.52, z: 0.72 } as const;
/** Cao độ tâm màn hình hiển thị. */
export const SCREEN_Y = DESK_Y + 0.43;

export interface DeskStyle {
  /** Màu nhấn của phòng (0xRRGGBB). */
  accent: number;
  /** 1 = Giám đốc, 2 = Trưởng phòng, 3 = Nhân viên. */
  tier: number;
  /** Hạt giống ổn định (băm từ id nhân viên) để chọn món đồ riêng và màu cốc. */
  seed: number;
  /** Mức thấp: bỏ bánh xe và món đồ phụ. */
  low?: boolean;
}

/** Các món đồ riêng trên bàn — chọn theo seed của từng người. */
export const DESK_ACCESSORIES = ["lamp", "headphones", "cat", "books"] as const;
export type DeskAccessory = (typeof DESK_ACCESSORIES)[number];
export const accessoryFor = (seed: number): DeskAccessory => DESK_ACCESSORIES[Math.abs(seed) % DESK_ACCESSORIES.length];

const MUGS = [0xef6f8e, 0x4f9cf9, 0xf7b32b, 0x43c59e, 0x8f7bf0, 0xff8c42];

export function buildWorkstation(parent: THREE.Object3D, at: { x: number; z: number }, style: DeskStyle): void {
  const low = style.low ?? isLowPropDetail();
  const accent = std(style.accent, 0.7);
  const accentSoft = std(pastel(style.accent, 0.62), 0.8);
  const accentDeep = std(deepen(style.accent, 0.3), 0.7);
  const wood = std(0xf1e4cd, 0.65);
  const white = std(0xf7f5ef, 0.55);
  const dark = std(0x2b3342, 0.5, 0.2);
  const frame = std(0x1b2230, 0.45, 0.15);
  const seatMat = std(pastel(style.accent, 0.3), 0.9);
  const gold = std(0xc9961a, 0.5, 0.3);

  const g = new THREE.Group();
  g.position.set(at.x, 0, at.z);
  const add = (m: THREE.Object3D): void => void g.add(m);

  // ---- bàn
  const z0 = 0.62;
  add(softBox(1.7, 0.06, 0.86, 0.025, wood, 0, DESK_Y, z0));
  add(softBox(1.7, 0.035, 0.03, 0.012, accent, 0, DESK_Y - 0.045, z0 + 0.42)); // mép trước màu phòng
  for (const sx of [-1, 1]) add(softBox(0.05, DESK_Y - 0.03, 0.78, 0.02, white, sx * 0.8, (DESK_Y - 0.03) / 2, z0)); // hai tấm chân
  add(softBox(1.5, 0.4, 0.03, 0.012, white, 0, 0.5, z0 + 0.38)); // tấm chắn sau
  // hộc kéo bên phải (cạnh màn hình)
  add(softBox(0.42, 0.6, 0.62, 0.03, accentSoft, 0.55, 0.32, z0));
  for (const y of [0.5, 0.24]) {
    add(softBox(0.36, 0.2, 0.012, 0.006, white, 0.55, y, z0 + 0.315, false));
    add(ball(0.018, accentDeep, 0.55, y, z0 + 0.33, false, 8));
  }

  // ---- mặt bàn
  add(softBox(1.0, 0.014, 0.38, 0.006, accentSoft, -0.1, DESK_Y + 0.037, 0.5, false)); // thảm bàn
  add(softBox(0.42, 0.02, 0.13, 0.008, white, -0.1, DESK_Y + 0.054, 0.42)); // bàn phím
  add(softBox(0.07, 0.02, 0.1, 0.01, white, 0.22, DESK_Y + 0.054, 0.42)); // chuột
  const mugColor = MUGS[Math.abs(style.seed >> 3) % MUGS.length];
  add(cyl(0.045, 0.04, 0.09, std(mugColor, 0.6), -0.62, DESK_Y + 0.075, 0.5, 14));
  add(softBox(0.025, 0.05, 0.015, 0.008, std(mugColor, 0.6), -0.575, DESK_Y + 0.08, 0.5, false)); // quai cốc
  if (!low) {
    // chậu cây nhỏ
    add(cyl(0.055, 0.045, 0.07, accentDeep, -0.7, DESK_Y + 0.065, 0.82, 12));
    add(ball(0.07, std(0x4cae5a, 0.85), -0.7, DESK_Y + 0.15, 0.82, true, 8));
    // món đồ riêng
    const acc = accessoryFor(style.seed);
    if (acc === "lamp") {
      add(cyl(0.06, 0.07, 0.02, dark, -0.42, DESK_Y + 0.04, 0.9, 12, false));
      add(cyl(0.012, 0.012, 0.26, dark, -0.42, DESK_Y + 0.17, 0.9, 6, false));
      add(cyl(0.035, 0.085, 0.09, accent, -0.42, DESK_Y + 0.33, 0.9, 12, false));
    } else if (acc === "headphones") {
      for (const sx of [-1, 1]) add(softBox(0.035, 0.075, 0.06, 0.016, accent, -0.32 + sx * 0.065, DESK_Y + 0.07, 0.86));
      add(softBox(0.16, 0.014, 0.014, 0.006, dark, -0.32, DESK_Y + 0.115, 0.86, false));
    } else if (acc === "cat") {
      add(ball(0.06, white, -0.42, DESK_Y + 0.09, 0.88, true, 10));
      add(ball(0.045, white, -0.42, DESK_Y + 0.17, 0.9, true, 10));
      for (const sx of [-1, 1]) add(cyl(0.001, 0.018, 0.04, accentDeep, -0.42 + sx * 0.03, DESK_Y + 0.215, 0.9, 5, false));
    } else {
      for (let i = 0; i < 3; i++) add(softBox(0.2 - i * 0.015, 0.035, 0.15, 0.01, std([0x4f9cf9, 0xef6f8e, 0xf7b32b][i], 0.8), -0.4, DESK_Y + 0.05 + i * 0.037, 0.88));
    }
    // giấy ghi chú
    add(softBox(0.07, 0.004, 0.07, 0.002, std(0xffe27a, 0.9), 0.05, DESK_Y + 0.047, 0.78, false));
  }

  // ---- màn hình (quay lưng về phía người xem; màn hình hiển thị AgentScreen đặt ngay trước mặt khung)
  const mz = MONITOR_AT.z;
  const mx = MONITOR_AT.x;
  add(softBox(0.26, 0.025, 0.2, 0.01, dark, mx, DESK_Y + 0.0425, mz));
  add(softBox(0.05, 0.17, 0.04, 0.015, dark, mx, DESK_Y + 0.13, mz + 0.03));
  add(softBox(0.76, 0.48, 0.05, 0.02, frame, mx, SCREEN_Y, mz));
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.07, low ? 12 : 20), accent); // huy hiệu phòng ở lưng màn hình
  emblem.position.set(mx, SCREEN_Y + 0.02, mz + 0.0255);
  g.add(emblem);

  // ---- ghế xoay
  const tall = style.tier === 1;
  const cz = -0.12;
  add(cyl(0.035, 0.035, 0.34, dark, 0, 0.25, cz, 8, false));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const leg = box(0.05, 0.04, 0.3, dark, Math.sin(a) * 0.13, 0.07, cz + Math.cos(a) * 0.13, false); // hộp thường (xem roomBuilder.buildChair)
    leg.rotation.y = a;
    add(leg);
    if (!low) add(ball(0.035, dark, Math.sin(a) * 0.27, 0.04, cz + Math.cos(a) * 0.27, false, 6));
  }
  add(softBox(0.6, 0.1, 0.56, 0.04, seatMat, 0, SEAT_HEIGHT - 0.05, cz));
  const backH = tall ? 0.78 : 0.58;
  const back = softBox(0.54, backH, 0.1, 0.05, seatMat, 0, SEAT_HEIGHT + backH / 2 + 0.03, cz - 0.27);
  back.rotation.x = -0.12;
  add(back);
  if (tall) {
    const cushion = softBox(0.4, 0.14, 0.06, 0.03, gold, 0, SEAT_HEIGHT + backH + 0.0, cz - 0.31);
    cushion.rotation.x = -0.12;
    add(cushion);
  }
  for (const sx of [-1, 1]) add(softBox(0.06, 0.05, 0.3, 0.02, dark, sx * 0.32, SEAT_HEIGHT + 0.16, cz - 0.04));

  mergeStatic(g, parent, true);
}
