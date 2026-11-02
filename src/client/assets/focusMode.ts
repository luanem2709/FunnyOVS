/**
 * Chế độ tập trung phòng (focus mode).
 *
 * Văn phòng gồm 9 phòng ban xếp lưới; camera toàn cảnh đứng ở giữa nên phòng
 * ở tâm bị phòng khác (và tường của chúng) che kín. Giải pháp: khi người dùng
 * chọn một phòng, các phòng khác mờ dần đi — đúng như cách repo tham khảo
 * tách bạch từng không gian.
 *
 * Lưu ý: nhiều phòng dùng chung vật liệu (ví dụ vật liệu đồ đạc). Nếu fade
 * trực tiếp sẽ khiến các phòng " giành" quyền đặt opacity của nhau. Vì vậy:
 *   - vật liệu dùng riêng (chỉ thuộc một phòng) → fade bằng opacity
 *   - vật liệu dùng chung → chỉ bật/tắt `visible` của mesh
 */
import * as THREE from "three";

interface RoomEntry {
  id: string;
  group: THREE.Group;
  /** Mesh của phòng (dùng để bật/tắt khi vật liệu dùng chung). */
  meshes: THREE.Mesh[];
  /** Vật liệu riêng của phòng → fade được. */
  ownMaterials: THREE.Material[];
  /** Độ đục gốc. */
  baseOpacity: number[];
}

export class FocusManager {
  private rooms = new Map<string, RoomEntry>();
  /** Đếm số phòng dùng mỗi vật liệu (để biết vật liệu nào là riêng/dùng chung). */
  private usage = new Map<THREE.Material, number>();
  private focused: string | null = null;

  /** Đăng ký phòng (group chứa toàn bộ nội dung của phòng). */
  register(id: string, group: THREE.Group): void {
    const meshes: THREE.Mesh[] = [];
    const materials: THREE.Material[] = [];
    const seen = new Set<THREE.Material>();

    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        materials.push(m);
        this.usage.set(m, (this.usage.get(m) ?? 0) + 1);
      }
    });

    this.rooms.set(id, {
      id,
      group,
      meshes,
      ownMaterials: materials,
      baseOpacity: materials.map((m) => m.opacity),
    });
  }

  /** Bật/tắt chế độ tập trung cho một phòng (null = hiện tất cả). */
  focus(id: string | null): void {
    this.focused = id;
  }

  /** Phòng đang được tập trung (null nếu không). */
  get current(): string | null {
    return this.focused;
  }

  /**
   * Cập nhật trạng thái hiển thị theo focus.
   * @param dt bước thời gian (giây) để chuyển động mượt
   */
  update(dt: number): void {
    const k = Math.min(1, dt * 7);
    const focused = this.focused;

    for (const room of this.rooms.values()) {
      const isFocused = focused === null || focused === room.id;
      const want = isFocused ? 1 : 0;

      // Vật liệu riêng của phòng → fade mượt.
      room.ownMaterials.forEach((m, i) => {
        if ((this.usage.get(m) ?? 1) > 1) return; // dùng chung → không fade
        const target = room.baseOpacity[i] * want;
        if (Math.abs(m.opacity - target) < 0.004) return;
        m.opacity += (target - m.opacity) * k;
        m.transparent = m.opacity < 0.995;
        m.depthWrite = m.opacity > 0.6;
      });

      // Trạng thái hiển thị: phòng không focus → ẩn hoàn toàn.
      const visible = isFocused
        ? room.ownMaterials.some((m) => m.opacity > 0.02) ||
          room.ownMaterials.length === 0
        : false;
      room.group.visible = visible;
      room.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Vật liệu dùng chung: bật/tắt mesh theo trạng thái focus.
        const shared = Array.isArray(mesh.material)
          ? mesh.material.some((m) => (this.usage.get(m) ?? 1) > 1)
          : (this.usage.get(mesh.material) ?? 1) > 1;
        mesh.visible = shared ? isFocused : true;
      });
    }
  }
}
