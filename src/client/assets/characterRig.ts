/**
 * Hệ thống animation cho nhân vật.
 *
 * QUY TẮC: chỉ dùng animation có thật trong file GLB. Nếu không có clip
 * phù hợp với một trạng thái → dùng phương án dự phòng (đứng yên + hiệu
 * ứng nhấp nháy màn hình / icon trên đầu). KHÔNG bịa tên animation.
 */
import * as THREE from "three";
import type { LoadedAsset } from "./loader.js";

export type AgentStatus =
  | "idle"
  | "working"
  | "researching"
  | "learning"
  | "waiting"
  | "blocked"
  | "stopped";

/** Bảng ánh xạ trạng thái → các tên clip ưu tiên, theo thứ tự thử. */
const PREFERRED_CLIPS: Record<AgentStatus, string[]> = {
  idle: ["Idle", "idle", "Standing", "stand", "Idle_2", "Breathing"],
  working: ["Typing", "typing", "Type", "Working", "working", "Typing_Keyboard"],
  researching: ["Sitting", "sitting", "Sit", "sit", "Typing", "Idle"],
  learning: ["Sitting", "sitting", "Sit", "Reading", "Reading_Idle"],
  waiting: ["Wave", "wave", "Waving", "Hello", "Attention", "RaisingHand"],
  blocked: ["Confused", "confused", "Sad", "sit", "Sitting"],
  stopped: ["Idle", "idle", "Standing"],
};

export interface CharacterRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  /** Clip đang chạy hiện tại. */
  current: string | null;
  /** Nhân vật có animation nào dùng được không. */
  hasAny: boolean;
}

export interface RigOptions {
  /** Nhân bản từ asset đã nạp. */
  asset: LoadedAsset;
  /** Bảng chuyển đổi tên logic → clip (dùng khi tên file không khớp). */
  clipAliases?: Record<string, string>;
}

/**
 * Dựng rig cho một nhân vật: tạo mixer, map clip, chuẩn bị sẵn action.
 * Clip nào không có trong file → không tạo action, để phần fallback xử lý.
 */
export function createRig(opts: RigOptions): CharacterRig {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();

  for (const clip of opts.asset.animations) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.setEffectiveTimeScale(1);
    actions.set(clip.name, action);
  }

  return {
    root,
    mixer,
    actions,
    current: null,
    hasAny: actions.size > 0,
  };
}

/** Tìm clip phù hợp với trạng thái, dựa trên danh sách ưu tiên + alias. */
export function findClip(
  rig: CharacterRig,
  status: AgentStatus,
  aliases?: Record<string, string>,
): string | null {
  const candidates = PREFERRED_CLIPS[status] ?? [];
  for (const pref of candidates) {
    if (rig.actions.has(pref)) return pref;
    const alias = aliases?.[pref];
    if (alias && rig.actions.has(alias)) return alias;
  }
  // Không khớp chính xác → thử so khớp không phân biệt hoa/thường.
  const lower = new Map<string, string>();
  for (const name of rig.actions.keys()) lower.set(name.toLowerCase(), name);
  for (const pref of candidates) {
    const hit = lower.get(pref.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** Chuyển sang trạng thái mới (fade mượt). */
export function setStatus(
  rig: CharacterRig,
  status: AgentStatus,
  aliases?: Record<string, string>,
  fadeSeconds = 0.25,
): void {
  const target = findClip(rig, status, aliases);
  if (!target) {
    // Không có clip phù hợp → đứng yên (giữ clip hiện tại hoặc Idle nếu có).
    const idle = findClip(rig, "idle", aliases);
    if (idle && rig.current !== idle) {
      fadeTo(rig, idle, fadeSeconds);
    }
    return;
  }
  if (rig.current === target) return;
  fadeTo(rig, target, fadeSeconds);
}

function fadeTo(rig: CharacterRig, clipName: string, seconds: number): void {
  const next = rig.actions.get(clipName);
  if (!next) return;
  const prev = rig.current ? rig.actions.get(rig.current) : null;

  next.enabled = true;
  next.setEffectiveWeight(0);
  next.reset();
  next.play();

  if (prev && prev !== next) {
    prev.crossFadeTo(next, seconds, false);
    next.setEffectiveWeight(1);
    prev.setEffectiveWeight(0);
  } else {
    next.setEffectiveWeight(1);
  }
  rig.current = clipName;
}

/**
 * Trạng thái nào đang được biểu diễn bằng animation thật?
 * Nếu trả về null nghĩa là không có clip nào khớp → cần dùng hiệu ứng dự phòng.
 */
export function animatedStatus(
  rig: CharacterRig,
  status: AgentStatus,
  aliases?: Record<string, string>,
): string | null {
  return findClip(rig, status, aliases);
}

/** Tóm tắt clip có sẵn (dùng để hiển thị trong log/debug). */
export function describeClips(rig: CharacterRig): string {
  return [...rig.actions.keys()].join(", ") || "(không có)";
}
