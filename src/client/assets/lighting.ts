/**
 * Hệ thống ánh sáng cho cảnh 3D.
 *
 * Nền sáng hơn, ánh sáng môi trường (hemisphere), bóng mềm, và ánh sáng phát
 * từ màn hình máy tính.
 */
import * as THREE from "three";

export interface LightingSetup {
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  /** Ánh sáng toàn cảnh nhẹ. */
  ambient: THREE.AmbientLight;
}

/** Chế độ thời gian trong ngày. */
export type TimeOfDay = "day" | "night";

/** Thông số ánh sáng theo từng chế độ. */
const LIGHT_PROFILES: Record<
  TimeOfDay,
  {
    ambient: { color: number; intensity: number };
    hemisphere: { sky: number; ground: number; intensity: number };
    sun: { color: number; intensity: number; pos: [number, number, number] };
    fill: { color: number; intensity: number };
    /** Màu nền dự phòng (lúc sky dome chưa vẽ xong). */
    background: number;
  }
> = {
  day: {
    ambient: { color: 0xffffff, intensity: 0.12 },
    hemisphere: { sky: 0xbcd7ff, ground: 0x8a7f6d, intensity: 1.25 },
    sun: { color: 0xfff4e0, intensity: 2.4, pos: [28, 42, 22] },
    fill: { color: 0xdce8ff, intensity: 0.35 },
    background: 0xa9cdec,
  },
  night: {
    ambient: { color: 0x8ea6d8, intensity: 0.16 },
    hemisphere: { sky: 0x2a3a63, ground: 0x14161f, intensity: 0.5 },
    sun: { color: 0x9fb6e0, intensity: 0.35, pos: [-24, 30, -18] },
    fill: { color: 0x4a5f8f, intensity: 0.22 },
    background: 0x11182b,
  },
};

/**
 * Bật/tắt chế độ ngày/đêm.
 *
 * Ban đêm: mặt trời nhạt, tăng đèn trần phòng + đèn màn hình để văn phòng
 * vẫn sáng và nhân viên vẫn nhìn rõ.
 */
export function applyTimeOfDay(
  lights: LightingSetup,
  mode: TimeOfDay,
  roomLamps: Iterable<THREE.PointLight> = [],
  scene?: THREE.Scene,
): void {
  const p = LIGHT_PROFILES[mode];
  // Nền dự phòng (lúc sky dome chưa vẽ xong) cũng đổi theo chế độ.
  if (scene?.background instanceof THREE.Color) {
    scene.background.setHex(p.background);
  }
  lights.ambient.color.setHex(p.ambient.color);
  lights.ambient.intensity = p.ambient.intensity;
  lights.hemisphere.color.setHex(p.hemisphere.sky);
  lights.hemisphere.groundColor.setHex(p.hemisphere.ground);
  lights.hemisphere.intensity = p.hemisphere.intensity;
  lights.sun.color.setHex(p.sun.color);
  lights.sun.intensity = p.sun.intensity;
  lights.sun.position.set(...p.sun.pos);
  lights.fill.color.setHex(p.fill.color);
  lights.fill.intensity = p.fill.intensity;
  lights.fill.position.set(-p.sun.pos[0], p.sun.pos[1] * 0.5, -p.sun.pos[2]);
  // Đèn trần phòng sáng mạnh hơn về đêm.
  for (const lamp of roomLamps) {
    lamp.intensity = mode === "night" ? 1.15 : 0.5;
    lamp.distance = mode === "night" ? 16 : Math.max(6, lamp.distance);
  }
}

/** Tạo bộ ánh sáng cho cảnh ngoài trời/trong nhà sáng. */
export function setupLighting(scene: THREE.Scene): LightingSetup {
  // Nền trời: vòm gradient (skyDome) phủ toàn cảnh. Màu nền dự phòng để
  // khoảnh khắc đầu tiên không bị đen trước khi dome vẽ xong.
  scene.background = new THREE.Color(0xa9cdec);
  // Không dùng fog: vòng skyline đã đóng vai trò "xa" của cảnh. Fog chỉ hòa
  // mọi vật vào màu trời và làm cảnh trắng xóa, mất hết chiều sâu.
  scene.fog = null;

  // Ambient rất nhẹ: ánh sáng chính đến từ hemisphere + mặt trời.
  // Ambient mạnh sẽ xóa bóng đổ và làm cảnh trông nhạt (như repo tham khảo).
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  // Ánh sáng môi trường: bầu trời xanh / mặt đất be → tự nhiên, nhẹ nhàng.
  const hemisphere = new THREE.HemisphereLight(0xbcd7ff, 0x8a7f6d, 1.25);
  scene.add(hemisphere);

  // Mặt trời — đổ bóng mềm.
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(28, 42, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  scene.add(sun);
  scene.add(sun.target);

  // Ánh sáng phụ từ hướng ngược lại → giảm vùng tối.
  const fill = new THREE.DirectionalLight(0xdce8ff, 0.35);
  fill.position.set(-24, 18, -20);
  scene.add(fill);

  return { ambient, hemisphere, sun, fill };
}

/**
 * Ánh sáng nhỏ từ màn hình máy tính.
 * Màu theo trạng thái agent → phân biệt được ai đang hoạt động.
 */
const SCREEN_GLOW: Record<string, number> = {
  idle: 0x9aa6b2,
  working: 0x4ade80,
  researching: 0x60a5fa,
  learning: 0xa78bfa,
  waiting: 0xfbbf24,
  blocked: 0xf87171,
  stopped: 0x6b7280,
};

export function screenGlowColor(status: string): number {
  return SCREEN_GLOW[status] ?? SCREEN_GLOW.idle;
}

/** Tạo PointLight gắn vào màn hình. */
export function createScreenLight(status: string): THREE.PointLight {
  const light = new THREE.PointLight(screenGlowColor(status), 0, 6.5, 2);
  light.position.set(0, 1.75, -0.9);
  return light;
}

/** Đèn trần trong phòng (dùng cho Lamp của Kenney hoặc đèn dự phòng). */
export function createRoomLight(intensity = 0.55, color = 0xffe9c4): THREE.PointLight {
  return new THREE.PointLight(color, intensity, 11, 2);
}
