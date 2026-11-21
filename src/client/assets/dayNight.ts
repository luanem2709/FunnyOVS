/**
 * Chu kỳ ngày/đêm theo giờ thật của máy (hoặc `?hour=21` trên URL để thử).
 * Đổi màu trời, sương mù, ánh sáng mặt trời/mặt trăng; ban đêm đèn đường và cửa sổ sáng lên.
 */
import * as THREE from "three";
import type { LightingSetup } from "./lighting.js";
import { getSkyUniforms, setNight } from "./decor.js";

const DAY = {
  skyTop: new THREE.Color(0x5a9be3),
  skyBottom: new THREE.Color(0xcdd9e6),
  sun: new THREE.Color(0xfff4e0),
  sunI: 2.1,
  hemiSky: new THREE.Color(0xbcd7ff),
  hemiGround: new THREE.Color(0x8a7f6d),
  hemiI: 1.05,
  ambI: 0.45,
};
const NIGHT = {
  skyTop: new THREE.Color(0x0b1233),
  skyBottom: new THREE.Color(0x1c2748),
  sun: new THREE.Color(0x9fb4ff),
  sunI: 0.55,
  hemiSky: new THREE.Color(0x4c5d96),
  hemiGround: new THREE.Color(0x2b2c3c),
  hemiI: 0.6,
  ambI: 0.32,
};
const DUSK = new THREE.Color(0xf29a68);

/** 0 = ban ngày, 1 = ban đêm (chuyển mượt 5–7h và 17–20h). */
export function nightFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  if (h < 12) return 1 - smooth(5, 7, h);
  return smooth(17, 20, h);
}

export interface DayNight {
  /** Cập nhật theo giờ (số thực 0–24). */
  apply(hour: number): void;
  hour(): number;
}

export function createDayNight(scene: THREE.Scene, lights: LightingSetup): DayNight {
  const forced = Number(new URLSearchParams(location.search).get("hour"));
  const hasForced = new URLSearchParams(location.search).has("hour") && Number.isFinite(forced);
  let current = 12;
  const tmp = new THREE.Color();

  const apply = (hour: number): void => {
    current = hour;
    const n = nightFactor(hour);
    // Hoàng hôn/bình minh: nửa chừng của quá trình chuyển → ngả cam ở chân trời.
    const dusk = 1 - Math.abs(2 * n - 1);
    const sky = getSkyUniforms();
    if (sky) {
      sky.top.value.copy(DAY.skyTop).lerp(NIGHT.skyTop, n);
      sky.bottom.value.copy(DAY.skyBottom).lerp(NIGHT.skyBottom, n).lerp(DUSK, dusk * 0.55);
    }
    const horizon = tmp.copy(DAY.skyBottom).lerp(NIGHT.skyBottom, n).lerp(DUSK, dusk * 0.55);
    (scene.background as THREE.Color).copy(horizon);
    (scene.fog as THREE.Fog).color.copy(horizon);

    lights.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n).lerp(DUSK, dusk * 0.5);
    lights.sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * n;
    lights.hemisphere.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n);
    lights.hemisphere.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, n);
    lights.hemisphere.intensity = DAY.hemiI + (NIGHT.hemiI - DAY.hemiI) * n;
    lights.ambient.intensity = DAY.ambI + (NIGHT.ambI - DAY.ambI) * n;
    lights.fill.intensity = 0.55 * (1 - n * 0.6);

    // Mặt trời mọc hướng đông, lặn hướng tây; ban đêm "mặt trăng" ở trên cao.
    const day = ((hour - 6) / 12) * Math.PI;
    const elev = n > 0.85 ? 0.7 : Math.max(0.25, Math.sin(day));
    lights.sun.position.set(Math.cos(day) * 40, elev * 42, 22);

    setNight(n);
  };

  apply(hasForced ? forced : new Date().getHours() + new Date().getMinutes() / 60);
  if (!hasForced) {
    setInterval(() => {
      const d = new Date();
      apply(d.getHours() + d.getMinutes() / 60);
    }, 60_000);
  }
  (window as unknown as { __setHour?: (h: number) => void }).__setHour = apply;

  return { apply, hour: () => current };
}
