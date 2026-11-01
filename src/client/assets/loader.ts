/**
 * Hạ tầng nạp asset GLB — tương đương `useGLTF` của drei nhưng viết cho vanilla
 * three.js (dự án này không dùng React, nên không thể dùng drei trực tiếp).
 *
 * Cung cấp:
 *  - `preloadAsset(paths)` : nạp trước, có báo cáo tiến độ (tránh "pop-in")
 *  - `getAsset(path)`      : lấy từ cache
 *  - `cloneAsset(path)`    : nhân bản (dùng SkeletonUtils cho model có rig)
 *  - `makeInstanced(...)`  : gộp nhiều bản sao thành 1 InstancedMesh
 *
 * Nguyên tắc: KHÔNG tự tạo model phức tạp bằng code. File GLB phải do người
 * dùng tải tay vào `public/models/`. Nếu thiếu file → dùng hình hộp dự phòng
 * để cảnh vẫn hiển thị được, không crash.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface LoadedAsset {
  /** Scene gốc (readonly) — dùng để clone, không thêm trực tiếp vào scene. */
  scene: THREE.Group;
  /** Danh sách animation có thật trong file. */
  animations: THREE.AnimationClip[];
  /** Map tên clip → clip để tra cứu nhanh. */
  clips: Map<string, THREE.AnimationClip>;
  /** Tên các mesh con (để tìm theo tên). */
  meshNames: string[];
  /** Kích thước bao (AABB) của model, dùng để cân đặt. */
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  /** Có skeleton (nhân vật có rig) không. */
  hasSkeleton: boolean;
}

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
loader.setDRACOLoader(draco);

const cache = new Map<string, LoadedAsset>();
const pending = new Map<string, Promise<LoadedAsset>>();

/** Đường dẫn công khai trong `public/`. */
export function assetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `/${clean}`;
}

/** Nạp một asset (có cache). Nạp song song cùng path chỉ 1 lần. */
export function loadAsset(relativePath: string): Promise<LoadedAsset> {
  const key = relativePath.replace(/\\/g, "/");
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const p = new Promise<LoadedAsset>((resolve, reject) => {
    loader.load(
      assetUrl(key),
      (gltf) => {
        const scene = gltf.scene;
        const clips = new Map<string, THREE.AnimationClip>();
        for (const c of gltf.animations) clips.set(c.name, c);

        const meshNames: string[] = [];
        let hasSkeleton = false;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            meshNames.push(o.name);
            const m = o as THREE.Mesh;
            if ((m as THREE.SkinnedMesh).isSkinnedMesh) hasSkeleton = true;
            // Bóng đổ cho mọi mesh
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const asset: LoadedAsset = {
          scene,
          animations: gltf.animations,
          clips,
          meshNames,
          box,
          size,
          center,
          hasSkeleton,
        };
        cache.set(key, asset);
        pending.delete(key);
        resolve(asset);
      },
      undefined,
      (err) => {
        pending.delete(key);
        reject(err);
      },
    );
  });
  pending.set(key, p);
  return p;
}

/**
 * Nạp trước nhiều asset, báo tiến độ.
 * `onProgress(done, total, currentPath)`.
 */
export async function preloadAssets(
  paths: string[],
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<Map<string, LoadedAsset>> {
  const out = new Map<string, LoadedAsset>();
  let done = 0;
  const unique = [...new Set(paths.map((p) => p.replace(/\\/g, "/")))];
  for (const p of unique) {
    onProgress?.(done, unique.length, p);
    try {
      out.set(p, await loadAsset(p));
    } catch {
      // Thiếu file → bỏ qua, phần dựng cảnh sẽ dùng hình hộp dự phòng.
    }
    done++;
  }
  onProgress?.(done, unique.length, "");
  return out;
}

/** Asset đã nạp hay chưa (không tải). */
export function peekAsset(relativePath: string): LoadedAsset | undefined {
  return cache.get(relativePath.replace(/\\/g, "/"));
}

/**
 * Nhân bản asset. Model có rig dùng `SkeletonUtils.clone` để clone cả
 * xương + animation; model tĩnh chỉ clone thông thường.
 */
export function cloneAsset(relativePath: string): THREE.Object3D | null {
  const a = peekAsset(relativePath);
  if (!a) return null;
  return a.hasSkeleton ? skeletonClone(a.scene) : a.scene.clone();
}

/**
 * Tạo một `InstancedMesh` cho nhiều bản sao cùng model.
 * Chỉ dùng được với model tĩnh (một mesh, không có rig).
 */
export function makeInstanced(
  relativePath: string,
  transforms: Array<{ position: THREE.Vector3; rotationY?: number; scale?: number }>,
): THREE.InstancedMesh | null {
  const a = peekAsset(relativePath);
  if (!a || a.hasSkeleton) return null;

  // Gom mesh con đầu tiên (phần lớn model Kenney là 1 mesh + texture)
  let target: THREE.Mesh | null = null;
  a.scene.traverse((o) => {
    if (!target && (o as THREE.Mesh).isMesh) target = o as THREE.Mesh;
  });
  if (!target) return null;

  const src = target as THREE.Mesh;
  const mesh = new THREE.InstancedMesh(src.geometry, src.material, transforms.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();

  transforms.forEach((t, i) => {
    pos.copy(t.position);
    euler.set(0, t.rotationY ?? 0, 0);
    q.setFromEuler(euler);
    const s = t.scale ?? 1;
    scl.set(s, s, s);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Đặt model xuống sàn (đáy chạm y=0) và canh giữa theo trục X/Z.
 * Dùng cho đồ đạc đặt trên nền.
 */
export function placeOnFloor(obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  obj.position.y -= box.min.y;
}

/** Đặt model sao cho tâm X/Z trùng vị trí đã cho. */
export function centerXZ(obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
}

/** Bảng chuyển đổi model: tên logic → đường dẫn file thật (sau khi quét asset). */
export type AssetCatalog = Record<string, string>;

export const catalog: AssetCatalog = {
  // Ghi đè sau khi chạy `npx tsx scripts/scan-assets.ts` — xem docs/ASSETS.md
};

/** Lấy đường dẫn thật của một món đồ theo tên logic. */
export function pathOf(name: string): string | null {
  return catalog[name] ?? null;
}
