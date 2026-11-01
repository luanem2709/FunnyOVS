/**
 * Tạo nhân vật cho cảnh 3D.
 *
 * Ưu tiên 1 — chibi rig (procedural, có xương/tóc/mắt/pose): nhân vật 3D thật,
 *   không cần tải file nào, nhẹ hơn và luôn chạy được.
 * Ưu tiên 2 — model Kenney Animated Characters (GLB có rig) nếu người dùng đã tải
 *   vào public/models/characters; dùng clip animation có thật trong file.
 * Ưu tiên 3 — capsule đơn giản (fallback cuối cùng, không nên xảy ra).
 *
 * Mỗi agent có bảng màu riêng (áo, tóc, da) để nhận dạng từ xa.
 */
import * as THREE from "three";
import { cloneAsset, peekAsset } from "./loader.js";
import { createRig, setStatus, type AgentStatus, type CharacterRig } from "./characterRig.js";
import { createChibi, setChibiAnim, updateChibi, type ChibiActor, type ChibiAnim } from "./chibi.js";
import type { ManifestAsset } from "./manifest.js";

/** 8 bảng màu phân biệt cho 8 agent (dùng cho capsule fallback). */
export const AGENT_TINTS = [
  0x4f9cf9, // xanh dương
  0x43c59e, // xanh lá
  0xf7b32b, // vàng
  0xef6f8e, // hồng
  0x8f7bf0, // tím
  0xff8c42, // cam
  0x35c4d8, // cyan
  0xe05fd8, // magenta
];

export interface AgentVisual {
  /** Group gốc (chứa rig hoặc capsule). */
  root: THREE.Group;
  /** Rig animation GLB (null nếu không dùng model file). */
  rig: CharacterRig | null;
  /** Chibi actor (null nếu dùng GLB hoặc fallback). */
  chibi: ChibiActor | null;
  /** Vòng tròn trạng thái trên sàn. */
  ring: THREE.Mesh;
  /** Nhãn tên sprite. */
  tag: THREE.Sprite;
  /** Đèn nhỏ phát sáng theo trạng thái. */
  glow: THREE.PointLight | null;
  /** Nhân vật có animation thật hay không. */
  animated: boolean;
}

/** Tô màu model GLB (clone material để không ảnh hưởng bản gốc). */
function tintCharacter(obj: THREE.Object3D, tint: number): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const src = m.material as THREE.Material | THREE.Material[];
    const apply = (x: THREE.Material): THREE.Material => {
      const c = x.clone();
      const std = c as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(new THREE.Color(tint), 0.6);
      return c;
    };
    m.material = Array.isArray(src) ? src.map(apply) : apply(src);
  });
}

/** Vòng trạng thái trên sàn. */
function makeRing(color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.6, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}

/** Chibi dùng pose nào cho trạng thái này. */
function chibiAnimFor(status: AgentStatus): ChibiAnim {
  switch (status) {
    case "working":
      return "type";
    case "researching":
      return "read";
    case "learning":
      return "read";
    case "waiting":
      return "wave";
    case "blocked":
      return "sweat";
    case "stopped":
      return "idle";
    default:
      return "idle";
  }
}

/**
 * Dựng nhân vật.
 * @param characterAsset asset nhân vật có rig (hoặc null)
 * @param tint màu riêng của agent (fallback)
 * @param index số thứ tự agent (0..7) để phân bố màu chibi
 */
export function createAgentVisual(
  characterAsset: ManifestAsset | null,
  tint: number,
  status: AgentStatus = "idle",
  index = 0,
  name = "Agent",
): AgentVisual {
  const root = new THREE.Group();
  const ring = makeRing(0x8b949e);
  root.add(ring);

  let rig: CharacterRig | null = null;
  let chibi: ChibiActor | null = null;
  let glow: THREE.PointLight | null = null;

  const loaded = characterAsset ? peekAsset(characterAsset.path) : null;

  if (loaded && loaded.hasSkeleton) {
    // Ưu tiên 2: model Kenney có rig.
    const obj = cloneAsset(characterAsset!.path);
    if (obj) {
      tintCharacter(obj, tint);
      obj.position.y = 0;
      const box = new THREE.Box3().setFromObject(obj);
      if (!box.isEmpty()) obj.position.y -= box.min.y;
      root.add(obj);

      rig = createRig({ asset: loaded });
      if (rig.hasAny) {
        root.add(rig.root);
        setStatus(rig, status);
      }
      glow = new THREE.PointLight(tint, 0.9, 5.5, 2);
      glow.position.set(0, 1.5, 0);
      root.add(glow);
    }
  } else {
    // Ưu tiên 1: chibi rig procedural — nhân vật 3D thật, không cần file.
    chibi = createChibi(index, name);
    root.add(chibi.root);
    setChibiAnim(chibi, chibiAnimFor(status));
    glow = new THREE.PointLight(tint, 0.9, 5.5, 2);
    glow.position.set(0, 1.4, 0);
    root.add(glow);
  }

  if (!rig && !chibi) {
    // Ưu tiên 3: capsule (fallback cuối cùng).
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 12), mat);
    body.position.y = 0.95;
    body.castShadow = true;
    root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat);
    head.position.y = 1.85;
    head.castShadow = true;
    root.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const dx of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
      eye.position.set(dx, 1.9, 0.26);
      root.add(eye);
    }
  }

  return {
    root,
    rig,
    chibi,
    ring,
    tag: null as unknown as THREE.Sprite, // gán sau ở main.ts (cần makeSign)
    glow,
    animated: !!rig?.hasAny || !!chibi,
  };
}

/** Đổi trạng thái → cập nhật animation + màu vòng + đèn. */
export function applyAgentStatus(
  visual: AgentVisual,
  status: AgentStatus,
  statusColor: number,
  aliases?: Record<string, string>,
): void {
  const ringMat = visual.ring.material as THREE.MeshBasicMaterial;
  ringMat.color.setHex(statusColor);
  if (visual.rig) setStatus(visual.rig, status, aliases);
  if (visual.chibi) setChibiAnim(visual.chibi, chibiAnimFor(status));
  if (visual.glow) {
    visual.glow.color.setHex(statusColor);
    visual.glow.intensity = status === "idle" || status === "stopped" ? 0.35 : 1.1;
  }
}

/** Cập nhật nhân vật mỗi khung hình. */
export function updateAgentVisual(visual: AgentVisual, dt: number): void {
  if (visual.rig) {
    visual.rig.mixer.update(dt);
  } else if (visual.chibi) {
    updateChibi(visual.chibi, dt);
  }
}
