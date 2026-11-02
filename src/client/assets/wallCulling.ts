/**
 * Cắt tường (cutaway) — làm mờ các bức tường chắn tầm nhìn của camera.
 *
 * Văn phòng 9 phòng ban nằm cạnh nhau; camera toàn cảnh thường đứng *bên trong*
 * một phòng khác, nên tường của phòng đó che kín phòng đang xem. Giải pháp:
 * mỗi khung hình, so sánh bounding box của từng bức tường với đoạn thẳng
 * camera → tâm phòng đang xem; những tường nằm *trên* đoạn thẳng đó sẽ mờ dần
 * để nhìn xuyên qua.
 *
 * Dùng bounding box thay vì raycast đơn điểm: một bức tường chắn tầm nhìn
 * thường lệch sang bên, không nằm đúng trên tia tới tâm phòng.
 */
import * as THREE from "three";

export interface WallFadeEntry {
  /** Mesh tường (để đổi trạng thái hiển thị). */
  mesh: THREE.Mesh;
  /** Vật liệu riêng của tường này (để đổi opacity). */
  material: THREE.MeshStandardMaterial;
  /** Box thế giới của tường (cập nhật mỗi lần dùng). */
  box: THREE.Box3;
  /** Có nên đổ bóng không khi đục. */
  castShadow: boolean;
}

export class WallCuller {
  private walls: WallFadeEntry[] = [];

  /** Đăng ký một bức tường để có thể mờ dần. */
  add(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial): void {
    this.walls.push({
      mesh,
      material,
      box: new THREE.Box3().setFromObject(mesh),
      castShadow: mesh.castShadow,
    });
  }

  /**
   * Mờ những tường chắn giữa camera và điểm đang xem.
   * @param camera camera hiện tại
   * @param focus điểm nhìn (tâm phòng đang chọn)
   * @param samples các điểm phụ (vị trí nhân vật) để tường che khuất cũng mờ
   */
  update(camera: THREE.Camera, focus: THREE.Vector3, samples: THREE.Vector3[] = []): void {
    if (!this.walls.length) return;

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targets = [focus, ...samples];

    // Box bao quanh toàn bộ vùng cần nhìn thấy.
    const viewBox = new THREE.Box3().setFromPoints(targets);
    viewBox.expandByPoint(camPos);

    for (const w of this.walls) {
      // Tường chắn tầm nhìn nếu nó nằm giữa camera và vùng nhìn:
      // box của tường giao với "đoạn thẳng" camera → vùng nhìn, và
      // tường không nằm sau điểm nhìn.
      const between = new THREE.Box3(
        new THREE.Vector3(
          Math.min(camPos.x, viewBox.min.x),
          Math.min(camPos.y, viewBox.min.y),
          Math.min(camPos.z, viewBox.min.z),
        ),
        new THREE.Vector3(
          Math.max(camPos.x, viewBox.max.x),
          Math.max(camPos.y, viewBox.max.y),
          Math.max(camPos.z, viewBox.max.z),
        ),
      );

      const overlap = w.box.clone().intersectsBox(between);
      // Tường ở phía sau điểm nhìn (xa hơn) thì không chắn.
      const wallDist = w.box.getCenter(new THREE.Vector3()).distanceTo(camPos);
      const focusDist = focus.distanceTo(camPos);
      const behind = wallDist > focusDist + 1.5;

      const shouldFade = overlap && !behind;
      const targetOpacity = shouldFade ? 0.07 : 1;
      const mat = w.material;

      if (Math.abs(mat.opacity - targetOpacity) > 0.003) {
        mat.opacity += (targetOpacity - mat.opacity) * 0.2;
        mat.transparent = mat.opacity < 0.995;
        mat.depthWrite = mat.opacity > 0.6;
        w.mesh.castShadow = mat.opacity > 0.6 && w.castShadow;
        w.mesh.visible = mat.opacity > 0.02;
      }
    }
  }

  /** Đặt lại tất cả tường về trạng thái đục. */
  reset(): void {
    for (const w of this.walls) {
      w.material.opacity = 1;
      w.material.transparent = false;
      w.material.depthWrite = true;
      w.mesh.castShadow = w.castShadow;
      w.mesh.visible = true;
    }
  }
}
