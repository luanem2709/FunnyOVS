/**
 * Bọc chibi rig (chibiRig.js) cho hệ thống agent của FunnyOVS.
 *
 * Nhân vật giờ là người 3D thật: xương hông→gối→chân, thân→cổ→đầu, vai→khuỷu→tay,
 * tóc bịt, mắt nhấp nháy, miệng đổi theo trạng thái, tay với IK tới bàn phím.
 *
 * Trạng thái agent → pose:
 *   idle        đứng nghỉ, thở, nhìn quanh
 *   working     gõ bàn phím (IK tới bàn)
 *   researching đọc tài liệu
 *   learning    đọc sách
 *   waiting     vẫy tay chờ duyệt
 *   blocked     căng thẳng / mồ hôi
 *   stopped     đứng yên
 *
 * Rig được port từ repo tham khảo MIT (references/my-office, © 2026 khanh020905).
 */
import * as THREE from "three";
import {
  makeChibi,
  chibiPose,
  applyChibiPose,
  disposeChibi,
  type ChibiRig,
  type ChibiPose,
  type PoseOptions,
} from "./chibiRig.js";

export type ChibiAnim =
  | "idle"
  | "type"
  | "read"
  | "wave"
  | "think"
  | "sweat"
  | "walk";

/** Bảng màu áo cho 8 agent — màu tương phản, dễ nhận dạng từ xa. */
export const SHIRT_COLORS = [
  "#4F7FD8", // xanh dương
  "#3FA98A", // xanh lá
  "#E0A03C", // vàng
  "#D9648A", // hồng
  "#8A6FD0", // tím
  "#E07A3C", // cam
  "#2FAFC0", // cyan
  "#C05FD0", // magenta
];

export const HAIR_COLORS = [
  "#2B1D12",
  "#4A3220",
  "#121212",
  "#7A4A22",
  "#3A2A3A",
  "#8C6239",
  "#1E2A3A",
  "#5A3A2A",
];

export const SKIN_TONES = ["#F7CBAA", "#F2BE98", "#E6AC82", "#F9D6BE", "#D49870"];

export const HAIR_STYLES = ["plain", "bob", "spiky", "ponytail", "bun", "curly"] as const;

/** Kích thước nhân vật chibi (đơn vị thế giới = mét). */
export const CHIBI_SCALE = 1.0;

export interface ChibiActor {
  root: THREE.Group;
  /** Rig nội bộ (dùng cho pose). */
  P: ChibiRig;
  /** Hệ số co giãn (root.scale). */
  scale: number;
  /** Phase của animation (tăng theo thời gian). */
  phase: number;
  /** Pose hiện tại. */
  anim: ChibiAnim;
  /** Đang ngồi hay đứng. */
  sit: boolean;
  /** Nhân vật có animation thật (luôn đúng với chibi). */
  animated: true;
  /** Giải phóng GPU khi nhân vật bị thay. */
  dispose(): void;
}

/**
 * Tạo nhân vật chibi với bảng màu riêng.
 * `index` = số thứ tự agent (0..7) để phân bố màu/tóc/da khác nhau.
 */
export function createChibi(index: number, name: string, scale = CHIBI_SCALE): ChibiActor {
  const cfg = {
    name,
    shirt: SHIRT_COLORS[index % SHIRT_COLORS.length],
    hair: HAIR_COLORS[index % HAIR_COLORS.length],
    skin: SKIN_TONES[index % SKIN_TONES.length],
    style: HAIR_STYLES[index % HAIR_STYLES.length],
    outfit: index % 3 === 0 ? ("hoodie" as const) : index % 3 === 1 ? ("shirt" as const) : ("suit" as const),
    acc: index % 4 === 3 ? ("glasses" as const) : index % 4 === 2 ? ("headphones" as const) : undefined,
  };

  const { root, P } = makeChibi(cfg, scale);

  return {
    root,
    P,
    scale,
    phase: index * 0.7, // lệch pha để 8 agent không chuyển động giống nhau
    anim: "idle",
    sit: false,
    animated: true,
    dispose: () => disposeChibi(P),
  };
}

/** Đổi pose theo trạng thái agent. */
export function setChibiAnim(actor: ChibiActor, anim: ChibiAnim): void {
  actor.anim = anim;
}

/**
 * Cập nhật rig mỗi khung hình.
 * Y trả về của pose là chiều cao trong không gian rig (chưa nhân scale) —
 * nhân với `scale` để ra chiều cao thế giới thực.
 */
export function updateChibi(actor: ChibiActor, dt: number): number {
  actor.phase += dt;
  const opts: PoseOptions = {
    sit: actor.sit,
    scale: actor.scale,
  };
  const pose: ChibiPose = chibiPose(actor.P, actor.anim, actor.phase, opts);
  const y = applyChibiPose(actor.P, pose, dt) * actor.scale;
  actor.root.position.y = y;
  return y;
}
