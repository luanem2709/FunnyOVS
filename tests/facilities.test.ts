/**
 * Cơ sở vật chất: bố cục (G1, G7), đường đi tới mọi điểm đến (G6), đèn ban đêm (G5), sàn riêng từng khu (G4),
 * hành vi pantry (G2) và dữ liệu không lẫn vào bộ lập kế hoạch việc.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { installFakeDom } from "./helpers/fakeDom.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { DEPARTMENT_BRIEF } from "../src/server/org/planner.js";
import {
  BUILDING,
  FACILITIES,
  coffeeSpots,
  doorSpot,
  facilityById,
  insideRoom,
  itemsOf,
  lobbyWatchSpot,
  meetingSeatSpots,
  presenterSpot,
  rectsOverlap,
  solidRects,
  worldRect,
  type Rect,
} from "../src/shared/facilities.js";
import { AgentBehavior, IDLE_ACTIONS, MAX_WALK, MAX_WALK_MEETING, resetAwayCounter } from "../src/client/assets/behavior.js";
import { buildOfficeNavGrid, PLAZA } from "../src/client/assets/navgrid.js";

const agents = new AgentRegistry().list();
const seats = agents.map((a) => a.position);

describe("bố cục cơ sở vật chất (G1, G7)", () => {
  it("có phòng họp, pantry, sảnh; id không trùng phòng ban nên bộ lập kế hoạch không giao việc cho chúng", () => {
    expect(FACILITIES.map((f) => f.id).sort()).toEqual(["lobby", "meeting", "pantry"]);
    const deptIds = new Set(DEPARTMENTS.map((d) => d.id as string));
    for (const f of FACILITIES) {
      expect(deptIds.has(f.id), f.id).toBe(false);
      expect(f.id in DEPARTMENT_BRIEF, f.id).toBe(false);
    }
  });

  it("các phòng (phòng ban + tiện ích) không chồng nhau và chừa lối đi (≥ 0.4)", () => {
    const rooms = [
      ...DEPARTMENTS.map((d) => ({ id: d.id as string, ...worldRoom(d.center, d.size) })),
      ...FACILITIES.map((f) => ({ id: f.id as string, ...worldRoom(f.center, f.size) })),
    ];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(rectsOverlap(rooms[i], rooms[j], 0.4), `${rooms[i].id} ↔ ${rooms[j].id}`).toBe(false);
      }
    }
  });

  it("mọi đồ đạc nằm trọn trong phòng; đồ chặn đường không chồng nhau", () => {
    for (const f of FACILITIES) {
      for (const it of f.items) expect(insideRoom(f, it), `${f.id}/${it.kind} @ ${it.x},${it.z}`).toBe(true);
      const solid = f.items.filter((i) => i.solid);
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
          expect(rectsOverlap(solid[i], solid[j]), `${f.id}: ${solid[i].kind} ↔ ${solid[j].kind}`).toBe(false);
        }
      }
    }
  });

  it("phòng tiện ích KHÔNG chứa chỗ ngồi làm việc của agent", () => {
    for (const f of FACILITIES) {
      const room = worldRoom(f.center, f.size);
      for (const a of agents) {
        expect(rectsOverlap(room, { x: a.position.x, z: a.position.z, w: 1.7, d: 1.7 }), `${a.id} trong ${f.id}`).toBe(false);
      }
    }
  });

  it("phòng họp (G1): bàn dài chặn đường, ≥ 8 ghế quanh bàn quay mặt vào bàn, có chỗ thuyết trình cạnh màn hình", () => {
    const meeting = facilityById("meeting")!;
    const table = itemsOf(meeting, "table")[0];
    expect(table.solid).toBe(true);
    expect(table.w).toBeGreaterThanOrEqual(4);
    const spots = meetingSeatSpots(meeting);
    expect(spots.length).toBeGreaterThanOrEqual(8);
    const tableAbs = worldRect(meeting, table);
    for (const s of spots) {
      // hướng nhìn (sin yaw, cos yaw) phải trỏ về tâm bàn
      const toTable = { x: tableAbs.x - s.x, z: tableAbs.z - s.z };
      const dot = Math.sin(s.yaw) * toTable.x + Math.cos(s.yaw) * toTable.z;
      expect(dot, `ghế ${s.x},${s.z}`).toBeGreaterThan(0.3);
      expect(rectsOverlap(tableAbs, { x: s.x, z: s.z, w: 0.1, d: 0.1 })).toBe(false); // ghế không nằm trong bàn
    }
    expect(itemsOf(meeting, "tv")).toHaveLength(1);
    const p = presenterSpot(meeting);
    expect(rectsOverlap(tableAbs, { x: p.x, z: p.z, w: 0.1, d: 0.1 })).toBe(false);
    expect(insideRoom(meeting, { x: p.x - meeting.center.x, z: p.z - meeting.center.z, w: 0.1, d: 0.1 })).toBe(true);
  });

  it("pantry (G2) có quầy, máy cà phê chỗ đứng, tủ lạnh, bàn; sảnh (G3) có quầy lễ tân, logo, ghế chờ, bảng tin", () => {
    const pantry = facilityById("pantry")!;
    for (const k of ["counter", "fridge", "vending", "roundtable"] as const) expect(itemsOf(pantry, k).length, k).toBeGreaterThan(0);
    expect(coffeeSpots(pantry).length).toBeGreaterThanOrEqual(3);
    const lobby = facilityById("lobby")!;
    for (const k of ["desk", "logo", "sofa", "tv"] as const) expect(itemsOf(lobby, k).length, k).toBeGreaterThan(0);
    expect(itemsOf(lobby, "sofa").length).toBeGreaterThanOrEqual(2);
  });

  it("mọi điểm đứng nằm trong phòng của nó và không nằm trong đồ chặn đường", () => {
    const check = (id: string, spots: Array<{ x: number; z: number }>): void => {
      const f = facilityById(id)!;
      const blocks: Rect[] = solidRects(f);
      for (const s of spots) {
        expect(insideRoom(f, { x: s.x - f.center.x, z: s.z - f.center.z, w: 0.1, d: 0.1 }), `${id} ${s.x},${s.z}`).toBe(true);
        for (const b of blocks) expect(rectsOverlap(b, { x: s.x, z: s.z, w: 0.1, d: 0.1 }), `${id} spot ${s.x},${s.z} trong đồ chặn`).toBe(false);
      }
    };
    check("meeting", [...meetingSeatSpots(), presenterSpot()]);
    check("pantry", coffeeSpots());
    check("lobby", [lobbyWatchSpot()]);
  });
});

describe("đường đi tới mọi điểm đến (G6, nav.reachability)", () => {
  const grid = buildOfficeNavGrid(DEPARTMENTS, seats);

  const walk = (from: { x: number; z: number }, to: { x: number; z: number }): { len: number; miss: number; clear: boolean } => {
    const path = grid.findPath([from.x, from.z], [to.x, to.z]);
    let prev: [number, number] = [from.x, from.z];
    let len = 0;
    let clear = true;
    for (const p of path) {
      len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      const [gx, gz] = grid.toCell(p[0], p[1]);
      if (!grid.free(gx, gz)) clear = false;
      prev = p;
    }
    const last = path[path.length - 1];
    return { len, miss: Math.hypot(last[0] - to.x, last[1] - to.z), clear };
  };

  it("từ chỗ ngồi của mọi agent tới được: pantry, sảnh, ghế họp, chỗ thuyết trình, đài phun nước, ghế đá, cửa phòng", () => {
    const targets: Array<[string, { x: number; z: number }]> = [
      ...coffeeSpots().map((s, i) => [`pantry#${i}`, s] as [string, { x: number; z: number }]),
      ["lobby", lobbyWatchSpot()],
      ...meetingSeatSpots().map((s, i) => [`họp#${i}`, s] as [string, { x: number; z: number }]),
      ["thuyết trình", presenterSpot()],
      ["đài phun nước", { x: PLAZA.fountain.x, z: PLAZA.fountain.z - 1.8 }],
      ["ghế đá", { x: PLAZA.benches[0].x, z: PLAZA.benches[0].z - 0.9 }],
    ];
    for (const a of agents) {
      for (const [name, t] of targets) {
        const r = walk(a.position, t);
        expect(r.miss, `${a.id} → ${name}: dừng cách đích ${r.miss.toFixed(2)}`).toBeLessThan(0.6);
        expect(r.clear, `${a.id} → ${name}: đi xuyên ô bị chặn`).toBe(true);
      }
    }
  });

  it("đi họp: mọi nhân viên tới phòng họp trong giới hạn đi bộ của việc họp (không phải đi vòng cả toà nhà)", () => {
    for (const a of agents) {
      for (const s of [...meetingSeatSpots(), presenterSpot()]) {
        expect(walk(a.position, s).len, `${a.id} → họp`).toBeLessThanOrEqual(MAX_WALK_MEETING);
      }
    }
  });

  it("phương án dự phòng luôn có: ai cũng ra được cửa phòng mình trong MAX_WALK (cà phê rơi về cửa khi pantry xa)", () => {
    for (const a of agents) {
      const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
      const door = { x: a.position.x, z: dept.center.z + dept.size.d / 2 + 1.1 };
      expect(walk(a.position, door).len, a.id).toBeLessThanOrEqual(MAX_WALK);
    }
  });

  it("pantry đủ gần cho nhiều người (≥ 6 agent), sảnh cho ≥ 4 agent — không chỉ một vài người", () => {
    const pantryLimit = IDLE_ACTIONS.find((a) => a.id === "coffee")!.maxWalk!;
    const lobbyLimit = IDLE_ACTIONS.find((a) => a.id === "lobby")!.maxWalk!;
    const nearPantry = agents.filter((a) => Math.min(...coffeeSpots().map((s) => walk(a.position, s).len)) <= pantryLimit);
    const nearLobby = agents.filter((a) => walk(a.position, lobbyWatchSpot()).len <= lobbyLimit);
    expect(nearPantry.length).toBeGreaterThanOrEqual(6);
    expect(nearLobby.length).toBeGreaterThanOrEqual(4);
  });

  it("vật dụng phòng tiện ích chặn đường: bàn họp, quầy pantry, quầy lễ tân là ô bị chặn", () => {
    for (const f of FACILITIES) {
      for (const r of solidRects(f)) {
        const [gx, gz] = grid.toCell(r.x, r.z);
        expect(grid.free(gx, gz), `${f.id} @ ${r.x},${r.z}`).toBe(false);
      }
    }
  });

  it("cửa phòng tiện ích thoáng (đi vào được từ mặt trước)", () => {
    for (const f of FACILITIES) {
      const d = doorSpot(f);
      const [gx, gz] = grid.toCell(d.x, d.z);
      expect(grid.free(gx, gz), f.id).toBe(true);
    }
  });
});

describe("hành vi pantry (G2, behavior.pantry)", () => {
  function visual() {
    return { root: new THREE.Group(), chibi: { anim: "idle", sit: true, root: new THREE.Group() } } as never;
  }
  const spotsFor = (a: { position: { x: number; z: number }; department: string }) => {
    const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
    return { door: { x: a.position.x, z: dept.center.z + dept.size.d / 2 + 1.1, yaw: 0 }, pantry: coffeeSpots() };
  };
  const grid = buildOfficeNavGrid(DEPARTMENTS, seats);

  /** Chạy hành vi tới khi đang nghỉ giải lao; trả về vị trí, pose khi nghỉ và đã về chỗ chưa. */
  function runBreak(id: string): { at: { x: number; z: number }; anim: string; backAtSeat: boolean } {
    resetAwayCounter();
    const a = agents.find((x) => x.id === id)!;
    const v = visual();
    let seated = 0;
    const b = new AgentBehavior(v, a.position.x, a.position.z, () => seated++, { nav: grid, rand: () => 0.99, spots: spotsFor(a) });
    (b as unknown as { nextActionAt: number }).nextActionAt = 0;
    const root = (v as { root: THREE.Group }).root;
    const chibi = (v as { chibi: { anim: string } }).chibi;
    let at = { x: 0, z: 0 };
    let anim = "";
    for (let i = 0; i < 12000 && seated === 0; i++) {
      b.update(0.05, "idle");
      if (!anim && chibi.anim === "coffee") {
        at = { x: root.position.x, z: root.position.z };
        anim = chibi.anim;
      }
    }
    return { at, anim, backAtSeat: seated === 1 && Math.hypot(root.position.x - a.position.x, root.position.z - a.position.z) < 0.01 };
  }

  it("agent gần pantry (kế toán Phúc) đi pha cà phê ở pantry rồi về đúng chỗ", () => {
    const r = runBreak("phuc");
    const near = Math.min(...coffeeSpots().map((s) => Math.hypot(s.x - r.at.x, s.z - r.at.z)));
    expect(r.anim).toBe("coffee");
    expect(near).toBeLessThan(0.4);
    expect(r.backAtSeat).toBe(true);
  });

  it("agent ở xa pantry (Thư viện) rơi về cà phê ở cửa phòng mình", () => {
    const r = runBreak("chi");
    const chi = agents.find((x) => x.id === "chi")!;
    const door = spotsFor(chi).door;
    expect(r.anim).toBe("coffee");
    expect(Math.hypot(door.x - r.at.x, door.z - r.at.z)).toBeLessThan(0.4);
    expect(Math.min(...coffeeSpots().map((s) => Math.hypot(s.x - r.at.x, s.z - r.at.z)))).toBeGreaterThan(5);
    expect(r.backAtSeat).toBe(true);
  });

  it("hai người cùng đi pantry không đứng chồng lên nhau (mỗi người một chỗ trước quầy)", () => {
    resetAwayCounter();
    const picks: Array<{ x: number; z: number }> = [];
    for (const id of ["phuc", "thu"]) {
      const a = agents.find((x) => x.id === id)!;
      const v = visual();
      const b = new AgentBehavior(v, a.position.x, a.position.z, () => undefined, { nav: grid, rand: () => 0.99, spots: spotsFor(a) });
      (b as unknown as { nextActionAt: number }).nextActionAt = 0;
      const chibi = (v as { chibi: { anim: string } }).chibi;
      const root = (v as { root: THREE.Group }).root;
      for (let i = 0; i < 4000 && chibi.anim !== "coffee"; i++) b.update(0.05, "idle");
      picks.push({ x: root.position.x, z: root.position.z });
    }
    expect(Math.hypot(picks[0].x - picks[1].x, picks[0].z - picks[1].z)).toBeGreaterThan(0.8);
  });
});

describe("đèn ban đêm và sàn riêng từng khu (G4, G5, night.lights)", () => {
  beforeAll(() => installFakeDom());

  const collect = (root: THREE.Object3D): { lights: THREE.PointLight[]; mats: THREE.MeshStandardMaterial[] } => {
    const lights: THREE.PointLight[] = [];
    const mats = new Set<THREE.MeshStandardMaterial>();
    root.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight);
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) mats.add(m);
    });
    return { lights, mats: [...mats] };
  };

  it("ban đêm đèn phòng và vật phát sáng sáng hơn ban ngày, ở cả phòng tiện ích và phòng ban", async () => {
    const { resetDecor, setNight, nightRegistrySize } = await import("../src/client/assets/decor.js");
    const { buildFacility } = await import("../src/client/assets/facilities.js");
    const { buildRoomShell } = await import("../src/client/assets/officeParts.js");
    resetDecor();
    const root = new THREE.Group();
    for (const f of FACILITIES) buildFacility(root, f, { t: (k) => k, company: "ACME" });
    const sales = DEPARTMENTS.find((d) => d.id === "sales")!;
    buildRoomShell(root, { id: sales.id, name: "Sales", center: sales.center, size: sales.size, floor: sales.floor, props: sales.props }, null);
    const reg = nightRegistrySize();
    expect(reg.lights).toBeGreaterThanOrEqual(FACILITIES.length + 1); // mỗi phòng một đèn
    expect(reg.glows).toBeGreaterThan(0);

    const { lights, mats } = collect(root);
    setNight(0);
    const dayLight = lights.map((l) => l.intensity);
    const dayGlow = mats.map((m) => m.emissiveIntensity);
    setNight(1);
    lights.forEach((l, i) => expect(l.intensity, `đèn #${i}`).toBeGreaterThan(dayLight[i]));
    // ít nhất vài vật liệu phát sáng (cửa sổ, đèn cây, màn hình máy bán hàng, LED) sáng hơn ban đêm
    const brighter = mats.filter((m, i) => m.emissiveIntensity > dayGlow[i]);
    expect(brighter.length).toBeGreaterThanOrEqual(3);
    setNight(0); // trả về trạng thái ban ngày: đèn về mức cũ
    lights.forEach((l, i) => expect(l.intensity).toBeCloseTo(dayLight[i], 5));
  });

  it("mỗi khu có loại sàn riêng bằng texture sinh sẵn: gỗ (họp, Giám đốc, Thư viện), thảm (sảnh, kinh doanh), gạch (pantry, kỹ thuật)", async () => {
    const { floorKindFor, floorMaterial } = await import("../src/client/assets/floors.js");
    expect(FACILITIES.map((f) => [f.id, f.floor])).toEqual([["meeting", "wood"], ["pantry", "tile"], ["lobby", "carpet"]]);
    const kinds = new Set(DEPARTMENTS.map((d) => floorKindFor(d.id)));
    expect([...kinds].sort()).toEqual(["carpet", "tile", "wood"]);
    for (const d of DEPARTMENTS) {
      const m = floorMaterial(floorKindFor(d.id), d.floor, d.size.w, d.size.d);
      expect(m.map, d.id).toBeTruthy();
      expect(m.map!.repeat.x).toBeGreaterThan(1);
    }
  });

  it("dựng đủ phòng tiện ích: có sàn gắn roomId để bấm bay tới, bảng họp, bảng tin sảnh và logo công ty", async () => {
    const { buildFacility } = await import("../src/client/assets/facilities.js");
    const root = new THREE.Group();
    const handles = FACILITIES.map((f) => buildFacility(root, f, { t: (k) => k, company: "ACME" }));
    for (const h of handles) expect(h.floor.userData.roomId).toBe(h.def.id);
    expect(handles.find((h) => h.def.id === "meeting")!.meetingBoard).toBeTruthy();
    const lobby = handles.find((h) => h.def.id === "lobby")!;
    expect(lobby.lobbyBoard).toBeTruthy();
    expect(lobby.logo).toBeTruthy();
    // mọi mesh nằm trong khối bao của nền toà nhà (kèm lề), không lòi ra ngoài cảnh
    const { SLAB } = await import("../src/client/assets/decor.js");
    const box = new THREE.Box3().setFromObject(root);
    expect(box.min.x).toBeGreaterThanOrEqual(SLAB.cx - SLAB.w / 2);
    expect(box.max.x).toBeLessThanOrEqual(SLAB.cx + SLAB.w / 2);
    expect(box.min.z).toBeGreaterThanOrEqual(SLAB.cz - SLAB.d / 2);
    expect(box.max.z).toBeLessThanOrEqual(SLAB.cz + SLAB.d / 2);
    handles.forEach((h) => h.dispose());
    expect(root.children).toHaveLength(0);
  });
});

function worldRoom(center: { x: number; z: number }, size: { w: number; d: number }): Rect {
  return { x: center.x, z: center.z, w: size.w, d: size.d };
}

describe("toà nhà liền: tường ngoài, cửa chính, sân trong (N6, building.shell)", () => {
  const rooms: Array<[string, Rect]> = [
    ...DEPARTMENTS.map((d) => [d.id, worldRoom(d.center, d.size)] as [string, Rect]),
    ...FACILITIES.map((f) => [f.id, worldRoom(f.center, f.size)] as [string, Rect]),
  ];
  const B = BUILDING;

  it("mọi phòng nằm trọn trong toà nhà, cách tường ngoài ≥ 2 m (đủ lối đi quanh phòng)", () => {
    for (const [id, r] of rooms) {
      expect(r.x - r.w / 2 - B.x0, `${id} trái`).toBeGreaterThanOrEqual(2);
      expect(B.x1 - (r.x + r.w / 2), `${id} phải`).toBeGreaterThanOrEqual(2);
      expect(r.z - r.d / 2 - B.z0, `${id} bắc`).toBeGreaterThanOrEqual(2);
      expect(B.z1 - (r.z + r.d / 2), `${id} nam`).toBeGreaterThanOrEqual(2);
    }
  });

  it("cửa chính ở tường nam, nằm thẳng trước mặt trước của sảnh lễ tân", () => {
    const lobby = FACILITIES.find((f) => f.id === "lobby")!;
    expect(B.door.x - B.door.w / 2).toBeGreaterThanOrEqual(lobby.center.x - lobby.size.w / 2);
    expect(B.door.x + B.door.w / 2).toBeLessThanOrEqual(lobby.center.x + lobby.size.w / 2);
    expect(B.door.w).toBeGreaterThanOrEqual(3);
  });

  it("sân trong nằm trong toà nhà và không đè lên phòng nào", () => {
    expect(B.courtyards.length).toBeGreaterThanOrEqual(2);
    for (const c of B.courtyards) {
      expect(c.x0).toBeGreaterThan(B.x0);
      expect(c.x1).toBeLessThan(B.x1);
      expect(c.z0).toBeGreaterThan(B.z0);
      expect(c.z1).toBeLessThan(B.z1);
      const rect = { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, w: c.x1 - c.x0, d: c.z1 - c.z0 };
      for (const [id, r] of rooms) expect(rectsOverlap(rect, r, 0.4), `sân trong đè ${id}`).toBe(false);
    }
  });

  it("lưới đường đi: tường ngoài chặn, cửa chính thông; từ sảnh đi ra tới sân trước cửa được, ra ngoài xuyên tường thì không", () => {
    const grid = buildOfficeNavGrid(DEPARTMENTS, seats);
    const free = (x: number, z: number): boolean => {
      const [gx, gz] = grid.toCell(x, z);
      return grid.free(gx, gz);
    };
    expect(free((B.x0 + B.x1) / 2, B.z0)).toBe(false); // tường bắc
    expect(free(B.x0, 0)).toBe(false); // tường tây
    expect(free(B.x1, 0)).toBe(false); // tường đông
    expect(free(B.x1 - 3, B.z1)).toBe(false); // tường nam, ngoài cửa
    expect(free(B.door.x, B.z1)).toBe(true); // cửa chính
    const path = grid.findPath([lobbyWatchSpot().x, lobbyWatchSpot().z], [B.door.x, B.z1 + 1.5]);
    const last = path[path.length - 1];
    expect(Math.hypot(last[0] - B.door.x, last[1] - (B.z1 + 1.5))).toBeLessThan(0.6);
    expect(path.every(([x, z]) => free(x, z))).toBe(true);
  });

  it("dựng vỏ toà nhà: ít lệnh vẽ, nằm trong nền lát (SLAB), có sàn hành lang và thảm chỉ đường cho mọi phòng", async () => {
    const { buildBuilding, wallSegments } = await import("../src/client/assets/building.js");
    const { SLAB } = await import("../src/client/assets/decor.js");
    expect(wallSegments()).toHaveLength(5); // bắc, nam×2 (chừa cửa), tây, đông
    const scene = new THREE.Group();
    buildBuilding(scene, DEPARTMENTS);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    expect(meshes.length).toBeLessThan(60); // gộp theo vật liệu
    expect(scene.getObjectByName("building-floor")).toBeTruthy();
    const box = new THREE.Box3().setFromObject(scene);
    expect(box.min.x).toBeGreaterThanOrEqual(SLAB.cx - SLAB.w / 2);
    expect(box.max.x).toBeLessThanOrEqual(SLAB.cx + SLAB.w / 2);
    expect(box.min.z).toBeGreaterThanOrEqual(SLAB.cz - SLAB.d / 2);
    expect(box.max.z).toBeLessThanOrEqual(SLAB.cz + SLAB.d / 2);
  });
});
