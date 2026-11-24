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
import { buildEnvironment, resetDecor, setDecorTranslator, tickDecor } from "../../assets/decor.js";
import { buildBuilding } from "../../assets/building.js";
import { buildEconomyBoard, paintEconomyBoard } from "../../assets/economyBoard.js";
import { createDayNight, type DayNight } from "../../assets/dayNight.js";
import { Bubble, createEffects, type Effects } from "../../assets/effects.js";
import { AgentBehavior, resetAwayCounter, setIdleLife, type IdleWhere, type Spot } from "../../assets/behavior.js";
import { setChibiDetail } from "../../assets/chibiRig.js";
import { resetPropCache, setPropDetail } from "../../assets/chibiProps.js";
import { MONITOR_AT } from "../../assets/workstation.js";
import { buildOfficeNavGrid, type NavGrid } from "../../assets/navgrid.js";
import {
  AGENT_TINTS,
  applyAgentStatus,
  createAgentVisual,
  updateAgentVisual,
  type AgentVisual,
} from "../../assets/characterFactory.js";
import type { AgentStatus as RigStatus } from "../../assets/characterRig.js";
import { AgentScreen, WorkBadge, buildAgentDesk, buildRoomShell, makeNameTag, statusHex, type RoomDef } from "../../assets/officeParts.js";
import { FACILITIES, coffeeSpots, lobbyWatchSpot, meetingSeatSpots, presenterSpot } from "../../../shared/facilities.js";
import { hashId, personaFor } from "../../../shared/personas.js";
import { simplifyStatus, type OfficeEntity, type OrgNode } from "../../../shared/officeEntity.js";
import { buildFacility, buildWorkBoard, paintLobbyBoard, paintMeetingBoard, repaintLogo, type FacilityHandles, type LiveScreen, type MeetingInfo } from "../../assets/facilities.js";
import { badgeFor, paintWorkBoard, summarizeBoard } from "../../assets/workboard.js";
import { useHealth } from "../store/health.js";
import { readyNames } from "../ui/aiForm.js";
import { AutoQualityMonitor, effectiveQuality } from "../lib/autoQuality.js";
import { useReducedMotion } from "../lib/motion.js";
import { usePerf } from "../store/perf.js";
import { deptName, logLine, taskLabel, tr } from "../i18n/index.js";
import { useSettings } from "../store/settings.js";
import { useOfficeStore, type DepartmentLite } from "../store/officeStore.js";

/** Hiệu ứng rỗng: dùng khi giảm chuyển động (không pháo giấy, xung hay tờ giấy bay). */
const NO_EFFECTS: Effects = { burst: () => undefined, memo: () => undefined, pulse: () => undefined, update: () => undefined };

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
      return { text: md.task ? tr("bubble.working", { task: taskLabel(tr, md) }) : tr("bubble.workingNoTask"), color: "#3fb950" };
    case "researching": {
      let host = "";
      try {
        host = md.currentUrl ? new URL(String(md.currentUrl)).hostname : "";
      } catch {
        host = String(md.currentUrl ?? "");
      }
      return { text: host ? tr("bubble.researching", { host }) : tr("bubble.researchingNoUrl"), color: "#4f9cf9" };
    }
    case "learning":
      return { text: md.currentTitle ? tr("bubble.learning", { title: String(md.currentTitle) }) : tr("bubble.learningNoTitle"), color: "#8f7bf0" };
    case "pending-approval":
      return { text: tr("bubble.approval"), color: "#d29922" };
    case "blocked":
    case "error":
      return { text: tr("bubble.blocked"), color: "#f85149" };
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
  /** Phòng họp, pantry, sảnh lễ tân (cùng dữ liệu với lưới đường đi). */
  facilities: Map<string, FacilityHandles>;
  /** Bảng việc sống trên tường phòng Giao việc (luồng việc đang chạy). */
  workBoard: LiveScreen | null;
  /** Bảng KPI Lớp kinh tế ở Phòng Tài chính. */
  economyBoard: LiveScreen | null;
  /** Biển tên phòng (sprite) — thu nhỏ khi camera ở gần. */
  signs: THREE.Sprite[];
}

function useWorld(assets: Assets | null, departments: DepartmentLite[]): World | null {
  const { scene } = useThree();
  const lang = useSettings((s) => s.lang);
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    if (!assets || departments.length === 0) return;
    resetDecor();
    resetPropCache();
    resetAwayCounter();
    setDecorTranslator(tr);
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
    buildBuilding(root, departments);
    const dayNight: DayNight = createDayNight(scene, lights);
    const effects = createEffects(scene);

    const rooms = new Map<string, RoomDef>();
    for (const d of departments) {
      const room = { ...d, name: deptName(d.id) };
      rooms.set(d.id, room);
      buildRoomShell(root, room, assets.manifest);
    }
    const facilities = new Map<string, FacilityHandles>();
    const company = useSettings.getState().companyName;
    for (const f of FACILITIES) facilities.set(f.id, buildFacility(root, f, { t: tr, company }));
    const dispatch = rooms.get("dispatch");
    const workBoard = dispatch ? buildWorkBoard(root, dispatch) : null;
    const finance = rooms.get("finance");
    const economyBoard = finance ? buildEconomyBoard(root, finance) : null;
    const signs: THREE.Sprite[] = [];
    root.traverse((o) => {
      if (o.userData.roomSign) signs.push(o as THREE.Sprite);
    });
    setWorld({ root, effects, rooms, facilities, workBoard, economyBoard, signs });

    return () => {
      dayNight.dispose();
      for (const f of facilities.values()) f.dispose();
      workBoard?.dispose();
      economyBoard?.dispose();
      scene.remove(root, lights.ambient, lights.hemisphere, lights.sun, lights.sun.target, lights.fill);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
        }
      });
      setWorld(null);
    };
  }, [assets, departments, scene, lang]);

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
  badge: WorkBadge;
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
  const meetingRef = useRef<(MeetingInfo & { until: number }) | null>(null);
  const lastBoard = useRef(-10);
  const lastWork = useRef(-10);
  // Giảm chuyển động: không pháo giấy/xung/tờ giấy bay, không đi họp hay nghỉ giải lao, camera nhảy thẳng tới đích.
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const recs = agents.current;
    // Móc gỡ lỗi: window.__officeAgents.get("minh").behavior ...
    (window as unknown as { __officeAgents?: unknown }).__officeAgents = recs;
    (window as unknown as { __officeMotion?: unknown }).__officeMotion = () => ({ reduced: reducedRef.current });
    const fx = (): Effects => (reducedRef.current ? NO_EFFECTS : world.effects);
    // Móc kiểm tra (scripts/verify-ui.mjs): bảng việc đang hiện gì và huy hiệu nào đang bật trên bàn.
    // Móc kiểm tra: bảng KPI kinh tế đang hiện khoá nội dung nào và trạng thái đã nhận.
    (window as unknown as { __officeEconomy?: unknown }).__officeEconomy = () => ({ painted: world.economyBoard?.key ?? null, state: useOfficeStore.getState().economy });
    (window as unknown as { __officeBoard?: unknown }).__officeBoard = () => ({
      info: summarizeBoard(useOfficeStore.getState().org),
      painted: world.workBoard?.key ?? null,
      meeting: meetingRef.current && Date.now() < meetingRef.current.until ? { title: meetingRef.current.title, attendees: meetingRef.current.attendees } : null,
      badges: [...recs].map(([id, rec]) => ({ id, visible: rec.badge.sprite.visible, ...(rec.badge.info ?? { open: 0, approval: 0, failed: 0, tone: "none" }) })),
    });

    const createAgent = (e: OfficeEntity): void => {
      const dept = world.rooms.get(e.department ?? "");
      const pos = e.position ?? { x: 0, y: 0, z: 0 };
      const idx = tintIndex.current++;
      const md = e.metadata as { tier?: number; agentId?: string };
      const tier = Number(md.tier ?? 3);
      // Ngoại hình theo id (ổn định), trang phục theo tầng, huy hiệu theo màu phòng.
      const persona = personaFor({ id: String(md.agentId ?? e.id), tier, department: e.department ?? "" });
      const visual = createAgentVisual(assets.character, AGENT_TINTS[idx % AGENT_TINTS.length], toRigStatus(e.status), idx, e.name, persona);
      const tagY = visual.chibi ? 1.78 + (persona.scale - 1) * 1.4 : visual.animated ? 2.35 : 2.5;
      const tag = makeNameTag(e.name, tr(`tier.${tier}`), tier);
      tag.position.set(0, tagY + 0.08, 0);
      visual.root.add(tag);
      visual.tag = tag;
      visual.root.position.set(pos.x, 0, pos.z);
      visual.root.userData.entityId = e.id;
      if (visual.chibi) visual.chibi.sit = true;
      world.root.add(visual.root);

      // Bàn chibi: màu nhấn = màu phòng (cùng màu huy hiệu), món đồ riêng theo id nên ổn định giữa các lần mở.
      buildAgentDesk(world.root, pos, assets.manifest, { accent: parseInt(persona.badge.slice(1), 16), tier, seed: hashId(String(md.agentId ?? e.id)) });
      const screen = new AgentScreen(pos.x + MONITOR_AT.x, pos.z + MONITOR_AT.z);
      screen.tt = tr;
      world.root.add(screen.mesh);
      // Huy hiệu số việc mở: góc phải trên màn hình bàn, xa nhân vật nên không che người.
      const badge = new WorkBadge(pos.x + MONITOR_AT.x + 0.34, pos.z + MONITOR_AT.z);
      badge.set(badgeFor(useOfficeStore.getState().org, String(md.agentId ?? e.id.replace(/^agent:/, ''))));
      world.root.add(badge.sprite);

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
      // Điểm "cà phê": ngay ngoài cửa phòng, thẳng hàng với bàn của mình.
      // Cà phê ở pantry (3 chỗ trước quầy), xem bảng tin sảnh; xa quá thì hành vi tự rơi về cửa phòng / việc tại chỗ.
      const fullSpots: Partial<Record<Exclude<IdleWhere, "seat">, Spot | Spot[]>> = {
        door: { x: pos.x, z: doorZ, yaw: 0 },
        ...spots,
        pantry: coffeeSpots(),
        lobby: lobbyWatchSpot(),
      };
      const behavior = new AgentBehavior(
        visual,
        pos.x,
        pos.z,
        () => {
          const r = recs.get(e.id);
          if (r) applyAgentStatus(r.visual, toRigStatus(r.entity.status), parseInt(statusHex(r.entity.status).slice(1), 16), {});
        },
        { nav: nav.current ?? undefined, spots: fullSpots },
      );
      applyAgentStatus(visual, toRigStatus(e.status), parseInt(statusHex(e.status).slice(1), 16), {});
      recs.set(e.id, { entity: e, prev: e.status, visual, bubble, behavior, screen, badge });
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
          fx().burst(at.setY(1.7), [0xf7b32b, 0x4f9cf9, 0xef6f8e, 0x43c59e, 0x8f7bf0], 46);
          if (!reducedRef.current) rec.behavior.celebrate();
        } else if (e.status === "blocked" || e.status === "error") {
          fx().pulse(at, 0xf85149, 2.8, 1.4);
          fx().burst(at.setY(1.2), [0xf85149, 0xff9b8f], 26, 2.4, 2.6);
        } else if (e.status === "pending-approval") {
          fx().pulse(at, 0xd29922, 2.2, 1.2);
        }
      }
      // Màn hình bàn hiện nhật ký và việc đang làm ĐÃ DỊCH theo ngôn ngữ đang chọn (khoá do server gửi kèm).
      const mine = logs.filter((l) => l.entityId === e.id).slice(0, 8).map((l) => ({ text: logLine(tr, l), level: l.level }));
      rec.screen.draw(e, mine, taskLabel(tr, e.metadata as Record<string, unknown>));
    };

    // Giao việc xuống / báo cáo lên: tờ giấy bay giữa hai bàn. Chỉ bắn cho sự kiện mới (≤ 10 giây).
    const seenOrg = new Map<string, string>();
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const metRoots = new Set<string>();
    const spot = (agentId: string): THREE.Vector3 | null => {
      const e = useOfficeStore.getState().entities[`agent:${agentId}`];
      return e?.position ? new THREE.Vector3(e.position.x, 1.5, e.position.z) : null;
    };

    /** Họp khi Giám đốc chia việc cho ≥ 2 phòng: Giám đốc thuyết trình, các trưởng phòng ngồi nghe, rồi ai về chỗ nấy. */
    const startMeeting = (root: OrgNode, heads: OrgNode[]): void => {
      if (reducedRef.current) return; // giảm chuyển động: không kéo cả nhóm đi họp
      const ids = [root.assigneeId, ...new Set(heads.map((h) => h.assigneeId))].slice(0, 8);
      const seats = meetingSeatSpots();
      const names: string[] = [];
      const secs = 14 + ids.length * 2;
      let seatIdx = 0;
      for (const id of ids) {
        const rec = recs.get(`agent:${id}`);
        if (!rec) continue;
        const present = id === root.assigneeId;
        const where = present ? presenterSpot() : seats[seatIdx++ % seats.length];
        if (rec.behavior.attendMeeting({ spot: where, present, secs })) names.push(rec.entity.name);
      }
      if (names.length >= 2) meetingRef.current = { title: root.title, attendees: names, until: Date.now() + (secs + 10) * 1000 };
    };

    const syncOrg = (): void => {
      const st = useOfficeStore.getState();
      for (const n of Object.values(st.org)) {
        const prev = seenOrg.get(n.id);
        if (prev === n.status) continue;
        seenOrg.set(n.id, n.status);
        const fresh = Date.now() - Date.parse(prev === undefined ? n.createdAt : n.updatedAt) < 10_000;
        const parent = n.parentId ? st.org[n.parentId] : undefined;
        if (fresh && prev === undefined) {
          // Phản ứng tại bàn: người giao đưa tay chỉ, người nhận giơ tay khi tờ giấy tới.
          if (parent && !reducedRef.current) recs.get(`agent:${parent.assigneeId}`)?.behavior.react("assign");
          const taker = recs.get(`agent:${n.assigneeId}`);
          if (taker && !reducedRef.current) timers.push(setTimeout(() => taker.behavior.react("receive"), parent ? 1300 : 0));
        }
        if (!fresh || !parent) continue;
        const from = spot(parent.assigneeId);
        const to = spot(n.assigneeId);
        if (!from || !to) continue;
        if (prev === undefined) {
          fx().memo(from, to, n.level === 2 ? 0x1f6feb : 0xf7b32b, 1.4, () => fx().pulse(to.clone(), n.level === 2 ? 0x1f6feb : 0xf7b32b, 1.6, 0.9));
        } else if (n.status === "done") {
          fx().memo(to, from, 0x3fb950, 1.4);
        }
      }
      // Họp: nút gốc của Giám đốc đã có ≥ 2 trưởng phòng được giao việc gần đây.
      const headsOf = (root: OrgNode): OrgNode[] => root.childIds.map((id) => useOfficeStore.getState().org[id]).filter((k): k is OrgNode => Boolean(k) && k.level === 2 && !k.superseded);
      for (const root of Object.values(st.org)) {
        if (root.level !== 1 || root.parentId || metRoots.has(root.id)) continue;
        if (new Set(headsOf(root).map((h) => h.department)).size < 2) continue;
        metRoots.add(root.id);
        // Các trưởng phòng được tạo liên tiếp trong cùng một nhịp: đợi một chút để cả nhóm có mặt rồi mới chọn người đi họp
        // (nếu không, người thứ ba trở đi sẽ bị bỏ sót vì ngay lúc thấy 2 phòng đầu đã bắt đầu họp).
        timers.push(
          setTimeout(() => {
            const fresh = useOfficeStore.getState().org[root.id];
            if (!fresh) return;
            const heads = headsOf(fresh);
            const newest = Math.max(...heads.map((h) => Date.parse(h.createdAt)));
            if (heads.length > 0 && Date.now() - newest < 10_000) startMeeting(fresh, heads);
          }, 600),
        );
      }
    };

    /** Cập nhật huy hiệu số việc mở của mọi người từ cây giao việc (gọi khi dữ liệu đổi và mỗi giây để lỗi cũ tự hết hạn). */
    const updateBadges = (): void => {
      const org = useOfficeStore.getState().org;
      for (const [id, rec] of recs) rec.badge.set(badgeFor(org, id.replace(/^agent:/, "")));
    };

    const sync = (): void => {
      syncOrg();
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
        world.root.remove(rec.visual.root, rec.screen.mesh, rec.badge.sprite);
        rec.screen.dispose();
        rec.badge.dispose();
        rec.behavior.dispose();
        recs.delete(id);
      }
      updateBadges();
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
      for (const id of timers) clearTimeout(id);
      for (const rec of recs.values()) {
        world.root.remove(rec.visual.root, rec.screen.mesh, rec.badge.sprite);
        rec.screen.dispose();
        rec.badge.dispose();
        rec.behavior.dispose();
      }
      recs.clear();
      if (machine.current) world.root.remove(machine.current.holder);
      machine.current = null;
    };
  }, [world, assets, scene]);

  const idleLife = useSettings((s) => s.idleLife);
  const labelMode = useSettings((s) => s.labels);
  useEffect(() => setIdleLife(idleLife && !reduced), [idleLife, reduced]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    const t = state.clock.elapsedTime;
    const selected = useOfficeStore.getState().selectedId;
    for (const rec of agents.current.values()) {
      rec.behavior.update(dt, toRigStatus(rec.entity.status));
      const idleLabel = rec.behavior.label();
      const b = idleLabel ? { text: tr(idleLabel), color: "#8b949e" } : bubbleFor(rec.entity);
      // Giảm rối mắt: nhãn/bong bóng tự ẩn khi ở xa; việc cần chú ý và người đang chọn luôn hiện.
      const dist = camera.position.distanceTo(rec.visual.root.position);
      const attention = rec.entity.status === "pending-approval" || rec.entity.status === "blocked" || rec.entity.status === "error";
      const chosen = rec.entity.id === selected;
      rec.visual.tag.visible = labelMode === "always" || (labelMode === "auto" && (dist < 30 || chosen || attention));
      // Camera càng gần thì nhãn càng nhỏ — không che mất nhân vật khi zoom sát.
      const k = Math.min(1, Math.max(0.45, dist / 20));
      rec.visual.tag.scale.set(2.2 * k, 0.69 * k, 1);
      rec.bubble.set(b && (chosen || attention || (labelMode !== "off" && dist < 24)) ? b.text : null, b?.color);
      rec.bubble.update(dt);
      updateAgentVisual(rec.visual, 1 / 60);
      const mat = rec.visual.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = !reducedRef.current && (rec.entity.status === "pending-approval" || rec.entity.status === "blocked") ? 0.6 + Math.abs(Math.sin(t * 3)) * 0.4 : 0.85;
    }
    machine.current?.bubble.update(dt);
    // Biển phòng nhỏ lại khi zoom sát (tránh che cả màn hình).
    for (const sign of world.signs) {
      const base = sign.userData.roomSign as [number, number];
      const k = Math.min(1, Math.max(0.4, camera.position.distanceTo(sign.position) / 30));
      sign.scale.set(base[0] * k, base[1] * k, 1);
    }

    // Bảng phòng họp (chủ đề đang họp) và bảng tin sảnh (số liệu thật), vẽ lại chỉ khi nội dung đổi.
    const meetingBoard = world.facilities.get("meeting")?.meetingBoard;
    if (meetingBoard) {
      const m = meetingRef.current;
      paintMeetingBoard(meetingBoard, tr, m && Date.now() < m.until ? m : null);
    }
    if (world.workBoard && t - lastWork.current > 0.5) {
      lastWork.current = t;
      const org = useOfficeStore.getState().org;
      paintWorkBoard(world.workBoard, tr, summarizeBoard(org));
      if (world.economyBoard) paintEconomyBoard(world.economyBoard, tr, useOfficeStore.getState().economy);
      // Lỗi cũ tự hết hạn trên huy hiệu dù không có dữ liệu mới.
      for (const [id, rec] of agents.current) rec.badge.set(badgeFor(org, id.replace(/^agent:/, "")));
    }
    const lobbyBoard = world.facilities.get("lobby")?.lobbyBoard;
    if (lobbyBoard && t - lastBoard.current > 1) {
      lastBoard.current = t;
      let working = 0;
      let idle = 0;
      let errors = 0;
      for (const rec of agents.current.values()) {
        const s = rec.entity.status;
        if (s === "working" || s === "researching" || s === "learning") working++;
        else if (s === "blocked" || s === "error") errors++;
        else if (s === "idle") idle++;
      }
      const h = useHealth.getState().health;
      const now = new Date();
      paintLobbyBoard(lobbyBoard, tr, {
        working,
        idle,
        errors,
        pending: Object.keys(useOfficeStore.getState().approvals).length,
        ai: h ? (h.ai.ready ? `AI: ${readyNames(h.ai)}` : tr("health.noAi")) : "",
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      });
    }
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
  const reducedMotion = useRef(false);
  reducedMotion.current = useReducedMotion();
  const st = useRef({ yaw: 0, pitch: 0.62, dist: 24, target: new THREE.Vector3(0, 1, 0), goal: new THREE.Vector3(0, 1, 0) });

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    // Móc gỡ lỗi/chụp ảnh: window.__officeCam.yaw/pitch/dist/goal (xem scripts/shot-ui.mjs --cam).
    (window as unknown as { __officeCam?: unknown }).__officeCam = s;
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
            const room =
              useOfficeStore.getState().departments.find((d) => d.id === o!.userData.roomId) ?? FACILITIES.find((f) => f.id === o!.userData.roomId);
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
    s.target.lerp(s.goal, reducedMotion.current ? 1 : Math.min(1, dt * 4)); // giảm chuyển động: nhảy thẳng tới đích, không lượn
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
// Tự hạ chất lượng + số liệu dựng hình
// ---------------------------------------------------------------------------

/** Đo thời gian khung hình; máy yếu thì báo hạ chất lượng (chỉ khi người dùng chọn "Tự động"). Đồng thời mở số liệu dựng hình để kiểm. */
function PerfWatch({ auto }: { auto: boolean }) {
  const { gl } = useThree();
  const monitor = useRef<AutoQualityMonitor | null>(null);
  useEffect(() => {
    monitor.current = auto ? new AutoQualityMonitor() : null;
  }, [auto]);
  useEffect(() => {
    // Số liệu của khung vừa dựng (gl.info tự xoá mỗi khung): window.__officeStats() — dùng trong scripts/verify-ui.mjs.
    (window as unknown as { __officeStats?: () => unknown }).__officeStats = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
  }, [gl]);
  useFrame((_state, dt) => {
    if (monitor.current?.tick(dt * 1000, performance.now()) === "downgrade") usePerf.getState().markDowngraded();
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
  const company = useSettings((s) => s.companyName);
  const autoQuality = useSettings((s) => s.quality) === "auto";
  const downgraded = usePerf((p) => p.downgraded);
  useEffect(() => {
    const logo = world?.facilities.get("lobby")?.logo;
    if (logo) repaintLogo(logo, company);
  }, [world, company]);
  return (
    <>
      <CameraRig />
      <PerfWatch auto={autoQuality && !downgraded} />
      {world && assets && <EntitiesLayer world={world} assets={assets} />}
    </>
  );
}

export default function OfficeScene() {
  const setting = useSettings((s) => s.quality);
  const downgraded = usePerf((s) => s.downgraded);
  const quality = effectiveQuality(setting, downgraded);
  // Canvas dựng lại theo `quality` (key) nên nhân vật được dựng mới ở đúng mức chi tiết.
  setChibiDetail(quality === "low");
  setPropDetail(quality === "low");
  const departments = useOfficeStore((s) => s.departments);
  const loaded = useOfficeStore((s) => s.loaded);
  return (
    <>
      <Canvas
        key={quality}
        shadows={quality === "high"}
        dpr={quality === "high" ? [1, 1.75] : [1, 1]}
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
      {(departments.length === 0 || !loaded) && <div className="loading">{tr("scene.loadingData")}</div>}
    </>
  );
}
