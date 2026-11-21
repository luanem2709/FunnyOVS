/**
 * L4 — Renderer 3D bằng React Three Fiber.
 *
 * R3F lo canvas, vòng lặp render và resize; phần dựng cảnh dùng lại các module three.js sẵn có
 * (decor, officeParts, characterFactory, effects, behavior) — vì vậy hình ảnh giống bản cổ điển và
 * không phải viết lại hàng nghìn dòng. Dữ liệu đến từ Zustand store (không gọi API trực tiếp).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { findCharacter, loadManifest, type Manifest, type ManifestAsset } from "../../assets/manifest.js";
import { preloadAssets } from "../../assets/loader.js";
import { setupLighting } from "../../assets/lighting.js";
import { buildEnvironment, resetDecor, tickDecor } from "../../assets/decor.js";
import { createDayNight, type DayNight } from "../../assets/dayNight.js";
import { Bubble, createEffects, type Effects } from "../../assets/effects.js";
import { AgentBehavior, type Spot } from "../../assets/behavior.js";
import { buildOfficeNavGrid, type NavGrid } from "../../assets/navgrid.js";
import {
  AGENT_TINTS,
  applyAgentStatus,
  createAgentVisual,
  updateAgentVisual,
  type AgentVisual,
} from "../../assets/characterFactory.js";
import type { AgentStatus as RigStatus } from "../../assets/characterRig.js";
import { AgentScreen, buildAgentDesk, buildRoomShell, makeNameTag, statusHex, type RoomDef } from "../../assets/officeParts.js";
import { simplifyStatus, type OfficeEntity } from "../../../shared/officeEntity.js";
import { useOfficeStore, type DepartmentLite } from "../store/officeStore.js";

// ---------------------------------------------------------------------------
// Chuyển trạng thái chung → trạng thái rig nhân vật
// ---------------------------------------------------------------------------

export function toRigStatus(s: OfficeEntity["status"]): RigStatus {
  switch (s) {
    case "pending-approval":
      return "waiting";
    case "error":
      return "blocked";
    case "offline":
      return "stopped";
    default:
      return s as RigStatus;
  }
}

/** Câu trên bong bóng thoại theo thực thể (null = không hiện). */
export function bubbleFor(e: OfficeEntity): { text: string; color: string } | null {
  const md = e.metadata as Record<string, unknown>;
  switch (e.status) {
    case "working":
      return { text: md.task ? `Đang làm: ${String(md.task)}` : "Đang làm việc…", color: "#3fb950" };
    case "researching": {
      let host = "";
      try {
        host = md.currentUrl ? new URL(String(md.currentUrl)).hostname : "";
      } catch {
        host = String(md.currentUrl ?? "");
      }
      return { text: host ? `Đang đọc: ${host}` : "Đang nghiên cứu…", color: "#4f9cf9" };
    }
    case "learning":
      return { text: md.currentTitle ? `Đang học: ${String(md.currentTitle)}` : "Đang tự học…", color: "#8f7bf0" };
    case "pending-approval":
      return { text: "Cần bạn duyệt ✋", color: "#d29922" };
    case "blocked":
    case "error":
      return { text: "Bị chặn! Cần xem lại", color: "#f85149" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tải asset (Kenney nếu có)
// ---------------------------------------------------------------------------

interface Assets {
  manifest: Manifest | null;
  character: ManifestAsset | null;
}

function useAssets(): Assets | null {
  const [assets, setAssets] = useState<Assets | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const manifest = await loadManifest();
      let character: ManifestAsset | null = null;
      if (manifest && manifest.assets.length) {
        character = findCharacter(manifest);
        await preloadAssets(
          manifest.assets.map((a) => a.path),
          () => undefined,
        );
      }
      if (alive) setAssets({ manifest, character });
    })().catch(() => alive && setAssets({ manifest: null, character: null }));
    return () => {
      alive = false;
    };
  }, []);
  return assets;
}

// ---------------------------------------------------------------------------
// Thế giới: ánh sáng, môi trường, phòng
// ---------------------------------------------------------------------------

interface World {
  root: THREE.Group;
  effects: Effects;
  rooms: Map<string, RoomDef>;
}

function useWorld(assets: Assets | null, departments: DepartmentLite[]): World | null {
  const { scene } = useThree();
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    if (!assets || departments.length === 0) return;
    resetDecor();
    const root = new THREE.Group();
    root.name = "office-world";
    scene.add(root);

    const lights = setupLighting(scene);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    buildEnvironment(root, ground);
    const dayNight: DayNight = createDayNight(scene, lights);
    const effects = createEffects(scene);

    const rooms = new Map<string, RoomDef>();
    for (const d of departments) {
      rooms.set(d.id, d);
      buildRoomShell(root, d, assets.manifest);
    }
    setWorld({ root, effects, rooms });

    return () => {
      dayNight.dispose();
      scene.remove(root, lights.ambient, lights.hemisphere, lights.sun, lights.sun.target, lights.fill);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
        }
      });
      setWorld(null);
    };
  }, [assets, departments, scene]);

  return world;
}

// ---------------------------------------------------------------------------
// Lớp thực thể: agent (nhân vật + bàn + màn hình) và máy
// ---------------------------------------------------------------------------

interface AgentRec {
  entity: OfficeEntity;
  prev: OfficeEntity["status"];
  visual: AgentVisual;
  bubble: Bubble;
  behavior: AgentBehavior;
  screen: AgentScreen;
}

interface MachineRec {
  pick: THREE.Mesh;
  bubble: Bubble;
  holder: THREE.Group;
}

function EntitiesLayer({ world, assets }: { world: World; assets: Assets }) {
  const { scene, camera } = useThree();
  const agents = useRef(new Map<string, AgentRec>());
  const machine = useRef<MachineRec | null>(null);
  const tintIndex = useRef(0);
  const nav = useRef<NavGrid | null>(null);

  useEffect(() => {
    const recs = agents.current;
    // Móc gỡ lỗi: window.__officeAgents.get("minh").behavior ...
    (window as unknown as { __officeAgents?: unknown }).__officeAgents = recs;

    const createAgent = (e: OfficeEntity): void => {
      const dept = world.rooms.get(e.department ?? "");
      const pos = e.position ?? { x: 0, y: 0, z: 0 };
      const idx = tintIndex.current++;
      const visual = createAgentVisual(assets.character, AGENT_TINTS[idx % AGENT_TINTS.length], toRigStatus(e.status), idx, e.name);
      const tagY = visual.chibi ? 1.78 : visual.animated ? 2.35 : 2.5;
      const tag = makeNameTag(e.name);
      tag.position.set(0, tagY, 0);
      visual.root.add(tag);
      visual.tag = tag;
      visual.root.position.set(pos.x, 0, pos.z);
      visual.root.userData.entityId = e.id;
      if (visual.chibi) visual.chibi.sit = true;
      world.root.add(visual.root);

      buildAgentDesk(world.root, pos, assets.manifest);
      const screen = new AgentScreen(pos.x + 0.52, pos.z + 0.72);
      world.root.add(screen.mesh);

      const bubble = new Bubble(visual.root, tagY + 0.85);
      // Lưới A* dựng một lần cho cả toà nhà, từ vị trí ngồi của mọi agent.
      if (!nav.current) {
        const seats = Object.values(useOfficeStore.getState().entities)
          .filter((x) => x.kind === "agent" && x.position)
          .map((x) => ({ x: x.position!.x, z: x.position!.z }));
        nav.current = buildOfficeNavGrid([...world.rooms.values()], seats);
      }
      const north = pos.z <= 5.9;
      const spots: Record<"fountain" | "bench", Spot> = {
        fountain: north ? { x: 0, z: 4.15, yaw: 0 } : { x: 0, z: 7.7, yaw: Math.PI },
        bench: { x: pos.x >= 0 ? 2.6 : -2.6, z: 5.3, yaw: 0 },
      };
      const doorZ = (dept ? dept.center.z + dept.size.d / 2 : pos.z + 3) + 1.1;
      const behavior = new AgentBehavior(
        visual,
        pos.x,
        pos.z,
        doorZ,
        pos.x + 1.4,
        () => {
          const r = recs.get(e.id);
          if (r) applyAgentStatus(r.visual, toRigStatus(r.entity.status), parseInt(statusHex(r.entity.status).slice(1), 16), {});
        },
        { nav: nav.current ?? undefined, spots },
      );
      applyAgentStatus(visual, toRigStatus(e.status), parseInt(statusHex(e.status).slice(1), 16), {});
      recs.set(e.id, { entity: e, prev: e.status, visual, bubble, behavior, screen });
    };

    const updateAgent = (rec: AgentRec, e: OfficeEntity, logs: { entityId?: string; text: string; level: "info" | "warn" | "error" }[]): void => {
      const prev = rec.prev;
      rec.entity = e;
      if (prev !== e.status) {
        rec.prev = e.status;
        applyAgentStatus(rec.visual, toRigStatus(e.status), parseInt(statusHex(e.status).slice(1), 16), {});
        rec.behavior.onStatus(toRigStatus(e.status));
        const at = rec.visual.root.position.clone();
        const busy = prev === "working" || prev === "researching" || prev === "learning";
        if (busy && e.status === "idle") {
          world.effects.burst(at.setY(1.7), [0xf7b32b, 0x4f9cf9, 0xef6f8e, 0x43c59e, 0x8f7bf0], 46);
          rec.behavior.celebrate();
        } else if (e.status === "blocked" || e.status === "error") {
          world.effects.pulse(at, 0xf85149, 2.8, 1.4);
          world.effects.burst(at.setY(1.2), [0xf85149, 0xff9b8f], 26, 2.4, 2.6);
        } else if (e.status === "pending-approval") {
          world.effects.pulse(at, 0xd29922, 2.2, 1.2);
        }
      }
      const mine = logs.filter((l) => l.entityId === e.id).slice(0, 8);
      rec.screen.draw(e, mine);
    };

    const sync = (): void => {
      const st = useOfficeStore.getState();
      const seen = new Set<string>();
      const logs = st.logs;
      // Tạo agent theo thứ tự id để màu/tóc nhất quán giữa các lần tải.
      const list = Object.values(st.entities).sort((a, b) => a.id.localeCompare(b.id));
      for (const e of list) {
        if (e.kind === "agent") {
          seen.add(e.id);
          const rec = recs.get(e.id);
          if (rec) updateAgent(rec, e, logs);
          else createAgent(e);
        } else if (e.kind === "machine") {
          syncMachine(e);
        }
      }
      for (const [id, rec] of recs) {
        if (seen.has(id)) continue;
        world.root.remove(rec.visual.root, rec.screen.mesh);
        rec.screen.dispose();
        recs.delete(id);
      }
      if (!list.some((e) => e.kind === "machine") && machine.current) {
        world.root.remove(machine.current.holder);
        machine.current = null;
      }
    };

    const syncMachine = (e: OfficeEntity): void => {
      const md = e.metadata as { cpuPercent?: number; ramPercent?: number };
      if (!machine.current) {
        const holder = new THREE.Group();
        const p = e.position ?? { x: 0, y: 0, z: 0 };
        holder.position.set(p.x, 0, p.z);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.y = 1.05;
        pick.userData.entityId = e.id;
        holder.add(pick);
        const bubble = new Bubble(holder, 2.45);
        world.root.add(holder);
        machine.current = { pick, bubble, holder };
      }
      machine.current.bubble.set(
        `${e.name} · CPU ${md.cpuPercent ?? 0}% · RAM ${md.ramPercent ?? 0}%`,
        simplifyStatus(e.status) === "error" ? "#f85149" : simplifyStatus(e.status) === "working" ? "#d29922" : "#3fb950",
      );
    };

    sync();
    const unsub = useOfficeStore.subscribe(sync);
    return () => {
      unsub();
      for (const rec of recs.values()) {
        world.root.remove(rec.visual.root, rec.screen.mesh);
        rec.screen.dispose();
      }
      recs.clear();
      if (machine.current) world.root.remove(machine.current.holder);
      machine.current = null;
    };
  }, [world, assets, scene]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    const t = state.clock.elapsedTime;
    for (const rec of agents.current.values()) {
      rec.behavior.update(dt, toRigStatus(rec.entity.status));
      const idleLabel = rec.behavior.label();
      const b = idleLabel ? { text: idleLabel, color: "#8b949e" } : bubbleFor(rec.entity);
      rec.bubble.set(b?.text ?? null, b?.color);
      rec.bubble.update(dt);
      updateAgentVisual(rec.visual, 1 / 60);
      const mat = rec.visual.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = rec.entity.status === "pending-approval" || rec.entity.status === "blocked" ? 0.6 + Math.abs(Math.sin(t * 3)) * 0.4 : 0.85;
    }
    machine.current?.bubble.update(dt);
    tickDecor(t, camera);
    world.effects.update(dt);
  });

  return null;
}

// ---------------------------------------------------------------------------
// Camera: xoay/zoom bằng chuột, bay tới phòng, click chọn thực thể
// ---------------------------------------------------------------------------

function CameraRig() {
  const { camera, gl, scene } = useThree();
  const st = useRef({ yaw: 0, pitch: 0.62, dist: 24, target: new THREE.Vector3(0, 1, 0), goal: new THREE.Vector3(0, 1, 0) });

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let dragging = false;
    let moved = 0;
    let lx = 0;
    let ly = 0;

    const down = (e: PointerEvent): void => {
      dragging = true;
      moved = 0;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!dragging) return;
      moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
      s.yaw -= (e.clientX - lx) * 0.005;
      s.pitch = Math.max(0.18, Math.min(1.35, s.pitch + (e.clientY - ly) * 0.005));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent): void => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (moved > 5) return;
      // Click (không kéo): chọn thực thể hoặc bay tới phòng.
      const r = el.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      for (const hit of ray.intersectObjects(scene.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (o.userData.entityId) {
            useOfficeStore.getState().select(String(o.userData.entityId));
            return;
          }
          if (o.userData.roomId) {
            const room = useOfficeStore.getState().departments.find((d) => d.id === o!.userData.roomId);
            useOfficeStore.getState().select(null);
            if (room) useOfficeStore.getState().focusOn(room.center.x, room.center.z);
            return;
          }
          o = o.parent;
        }
      }
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      s.dist = Math.max(8, Math.min(48, s.dist + e.deltaY * 0.03));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });

    const unsub = useOfficeStore.subscribe((state, prev) => {
      if (state.focus && state.focus !== prev.focus) {
        s.goal.set(state.focus.x, 1, state.focus.z);
        s.dist = 14;
      }
      if (state.selectedId && state.selectedId !== prev.selectedId) {
        const e = state.entities[state.selectedId];
        if (e?.position) {
          s.goal.set(e.position.x, 1, e.position.z);
          s.dist = Math.min(s.dist, 14);
        }
      }
    });
    return () => {
      unsub();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [camera, gl, scene]);

  useFrame((_, dt) => {
    const s = st.current;
    s.target.lerp(s.goal, Math.min(1, dt * 4));
    camera.position.set(
      s.target.x + Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist,
      Math.sin(s.pitch) * s.dist,
      s.target.z + Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist,
    );
    camera.lookAt(s.target.x, 1, s.target.z);
  });
  return null;
}

// ---------------------------------------------------------------------------
// Gốc
// ---------------------------------------------------------------------------

function Content() {
  const assets = useAssets();
  const departments = useOfficeStore((s) => s.departments);
  const world = useWorld(assets, departments);
  return (
    <>
      <CameraRig />
      {world && assets && <EntitiesLayer world={world} assets={assets} />}
    </>
  );
}

export default function OfficeScene() {
  const departments = useOfficeStore((s) => s.departments);
  const loaded = useOfficeStore((s) => s.loaded);
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 52, near: 0.1, far: 220, position: [0, 12, 18] }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            useOfficeStore.getState().setWebglLost(true);
          });
        }}
      >
        <Content />
      </Canvas>
      {(departments.length === 0 || !loaded) && <div className="loading">Đang tải dữ liệu văn phòng…</div>}
    </>
  );
}
