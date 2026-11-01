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

/** Tạo bộ ánh sáng cho cảnh ngoài trời/trong nhà sáng. */
export function setupLighting(scene: THREE.Scene): LightingSetup {
  // Nền trời sáng → không còn nền đen "cyberpunk" cũ.
  scene.background = new THREE.Color(0xcdd9e6);
  scene.fog = new THREE.Fog(0xcdd9e6, 55, 130);

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  // Ánh sáng môi trường: bầu trời xanh / mặt đất be → tự nhiên, nhẹ nhàng.
  const hemisphere = new THREE.HemisphereLight(0xbcd7ff, 0x8a7f6d, 1.05);
  scene.add(hemisphere);

  // Mặt trời — đổ bóng mềm.
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
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
  const fill = new THREE.DirectionalLight(0xdce8ff, 0.55);
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
