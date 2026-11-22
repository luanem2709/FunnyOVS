/**
 * Trang "bảng nhân vật" (/office-3d/sheet.html): xếp cả 17 nhân viên thành ba hàng — Giám đốc, Trưởng phòng, Nhân viên —
 * đứng thẳng nhìn camera. Dùng để kiểm bằng mắt ngoại hình theo id, trang phục theo tầng và huy hiệu màu phòng
 * (và chụp ảnh tài liệu), không cần dựng cả văn phòng.
 *
 *   ?anim=idle|type|walk|hand|board|celebrate|think   pose cho tất cả (mặc định idle)
 *   ?sit=1                                              ngồi (không có ghế — chỉ để xem tư thế)
 *   ?only=giamdoc,mai,long                              chỉ hiện các id này thành một hàng, camera sát hơn (xem chi tiết)
 *   ?yaw=0.6                                            xoay các nhân vật (rad) để xem nghiêng/sau lưng
 */
import * as THREE from "three";
import { personaFor } from "../../shared/personas.js";
import { createAgentVisual, updateAgentVisual } from "../assets/characterFactory.js";
import type { ChibiAnim } from "../assets/chibi.js";
import { makeNameTag } from "../assets/officeParts.js";

interface Row {
  id: string;
  name: string;
  tier: number;
  department: string;
  reportsTo: string | null;
}

const FALLBACK: Row[] = [
  { id: "giamdoc", name: "Hùng", tier: 1, department: "executive", reportsTo: null },
];

async function roster(): Promise<Row[]> {
  try {
    const r = await fetch("/api/org");
    const j = (await r.json()) as { agents: Row[] };
    return j.agents.length ? j.agents : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const q = new URLSearchParams(location.search);
const anim = (q.get("anim") ?? "idle") as ChibiAnim;
const sit = q.get("sit") === "1";
const only = (q.get("only") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const yaw = Number(q.get("yaw") ?? 0) || 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a303a);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x4a4036, 1.15));
const sun = new THREE.DirectionalLight(0xfff2e0, 1.9);
sun.position.set(4, 9, 8);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x4a5163, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.8, 12.2);
camera.lookAt(0, 1.0, -3);

const visuals: ReturnType<typeof createAgentVisual>[] = [];

const place = (a: Row, x: number, z: number, i: number): void => {
  const persona = personaFor(a);
  const v = createAgentVisual(null, 0x4f9cf9, "idle", i, a.name, persona);
  v.root.position.set(x, 0, z);
  v.root.remove(v.ring);
  if (v.chibi) {
    v.chibi.sit = sit;
    v.chibi.anim = anim;
  }
  const tag = makeNameTag(a.name, a.tier === 1 ? "Director" : a.tier === 2 ? "Head" : "Staff", a.tier);
  tag.position.set(0, 1.78 + (persona.scale - 1) * 1.4 + 0.22, 0);
  tag.scale.set(only.length ? 1.3 : 0.9, only.length ? 0.41 : 0.28, 1);
  v.chibi?.root.rotateY(yaw);
  v.root.add(tag);
  scene.add(v.root);
  visuals.push(v);
};

void roster().then((all) => {
  if (only.length) {
    const picked = only.map((id) => all.find((a) => a.id === id)).filter((a): a is Row => Boolean(a));
    const spread = 1.5;
    picked.forEach((a, k) => place(a, (k - (picked.length - 1) / 2) * spread, 0, k));
    const w = Math.max(2, picked.length * spread);
    camera.position.set(0, 1.55, w * 0.9 + 1.6);
    camera.lookAt(0, 1.0, 0);
    return;
  }
  const agents = all;
  const director = agents.filter((a) => a.tier === 1);
  const heads = agents.filter((a) => a.tier === 2).sort((a, b) => a.department.localeCompare(b.department));
  const staff = (head: Row): Row[] => agents.filter((a) => a.tier === 3 && a.reportsTo === head.id);
  const gap = 1.75;
  let i = 0;
  director.forEach((d) => place(d, 0, -6.2, i++));
  const x0 = (-(heads.length - 1) * gap) / 2;
  heads.forEach((h, k) => {
    place(h, x0 + k * gap, -3.1, i++);
    staff(h).forEach((s) => place(s, x0 + k * gap, 0.9, i++));
  });
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  for (const v of visuals) updateAgentVisual(v, dt);
  renderer.render(scene, camera);
});
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
