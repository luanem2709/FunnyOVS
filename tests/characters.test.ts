/**
 * Nhân vật: ngoại hình theo id không trùng (F1), trang phục theo tầng + huy hiệu phòng (F2), phản ứng nhận/giao việc (F3),
 * đi họp (F4), tư thế theo trạng thái (F5) và mọi pose dùng trong mã đều có thật trong rig.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { installFakeDom } from "./helpers/fakeDom.js";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { DEPT_COLORS, GOLD_TIE, faceKey, hashId, personaFor, personaSignature, type Persona } from "../src/shared/personas.js";
import { coffeeSpots, meetingSeatSpots, presenterSpot } from "../src/shared/facilities.js";
import {
  AgentBehavior,
  IDLE_ACTIONS,
  MAX_WALK_MEETING,
  MEETING_LISTEN_ANIMS,
  MEETING_PRESENT_ANIM,
  REACT_ANIM,
  REACT_SECONDS,
  resetAwayCounter,
  setIdleLife,
} from "../src/client/assets/behavior.js";
import { CHIBI_ANIMS } from "../src/client/assets/chibi.js";
import { STATUS_ANIM } from "../src/client/assets/characterFactory.js";
import { buildOfficeNavGrid } from "../src/client/assets/navgrid.js";

const agents = new AgentRegistry().list();
const persona = (id: string): Persona => {
  const a = agents.find((x) => x.id === id)!;
  return personaFor({ id: a.id, tier: a.tier, department: a.department });
};

describe("persona: ngoại hình riêng theo id (F1)", () => {
  it("17 nhân viên đều khác nhau: chữ ký ngoại hình và bộ ba tóc/kiểu tóc/da không trùng", () => {
    const sigs = agents.map((a) => personaSignature(persona(a.id)));
    expect(new Set(sigs).size).toBe(agents.length);
    const faces = agents.map((a) => faceKey(persona(a.id)));
    expect(new Set(faces).size).toBe(agents.length);
  });

  it("ổn định theo id: không đổi giữa các lần gọi, không phụ thuộc thứ tự hay agent khác", () => {
    const first = agents.map((a) => personaSignature(persona(a.id)));
    const reversed = [...agents].reverse().map((a) => personaSignature(persona(a.id))).reverse();
    expect(reversed).toEqual(first);
  });

  it("agent mới (không có trong bảng) nhận ngoại hình sinh từ băm id: ổn định, hợp lệ, và tầng quyết định trang phục", () => {
    const a = personaFor({ id: "agent-moi-123", tier: 3, department: "sales" });
    expect(personaSignature(personaFor({ id: "agent-moi-123", tier: 3, department: "sales" }))).toBe(personaSignature(a));
    expect(personaSignature(personaFor({ id: "agent-moi-124", tier: 3, department: "sales" }))).not.toBe(personaSignature(a));
    expect(hashId("x")).toBe(hashId("x"));
    for (const c of [a.shirt, a.hair, a.skin, a.pants, a.shoes, a.badge]) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(personaFor({ id: "agent-moi-123", tier: 1, department: "executive" }).outfit).toBe("suit");
  });
});

describe("persona: trang phục theo tầng và huy hiệu phòng (F2, personas.tier)", () => {
  it("Giám đốc: vest + cà vạt vàng + cao hơn một chút", () => {
    const p = persona("giamdoc");
    expect(p.outfit).toBe("suit");
    expect(p.tie).toBe(GOLD_TIE);
    expect(p.scale).toBeGreaterThan(1.04);
    expect(p.badge).toBe(DEPT_COLORS.executive);
  });

  it("Trưởng phòng: sơ mi + cà vạt đúng màu phòng ban của mình", () => {
    for (const a of agents.filter((x) => x.tier === 2)) {
      const p = persona(a.id);
      expect(p.outfit, a.id).toBe("shirt");
      expect(p.tie, a.id).toBe(DEPT_COLORS[a.department]);
      expect(p.badge, a.id).toBe(DEPT_COLORS[a.department]);
    }
    // mười tám màu cà vạt của tám trưởng phòng đều khác nhau
    const ties = agents.filter((x) => x.tier === 2).map((a) => persona(a.id).tie);
    expect(new Set(ties).size).toBe(ties.length);
  });

  it("Nhân viên: thường phục (hoodie hoặc sơ mi), không cà vạt; huy hiệu cùng màu phòng với trưởng phòng của mình", () => {
    for (const a of agents.filter((x) => x.tier === 3)) {
      const p = persona(a.id);
      expect(["hoodie", "shirt"], a.id).toContain(p.outfit);
      expect(p.tie, a.id).toBeUndefined();
      const head = agents.find((h) => h.id === a.reportsTo)!;
      expect(p.badge, a.id).toBe(persona(head.id).badge);
      expect(p.scale).toBe(1);
    }
  });

  it("mọi phòng ban có màu huy hiệu riêng", () => {
    for (const d of DEPARTMENTS) expect(DEPT_COLORS[d.id], d.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(DEPARTMENTS.map((d) => DEPT_COLORS[d.id])).size).toBe(DEPARTMENTS.length);
  });

  describe("dựng thật vào rig chibi", () => {
    beforeAll(() => installFakeDom());

    /**
     * Rig gộp các chi tiết nhỏ cùng loại vật liệu thành một mesh dùng MÀU ĐỈNH (vertex color) → màu thật nằm ở thuộc tính
     * `color` của geometry, không ở `material.color`. Hàm này tìm màu ở cả hai nơi.
     */
    const rigHas = async (id: string): Promise<(hexColor: string) => boolean> => {
      const { createChibi } = await import("../src/client/assets/chibi.js");
      const a = agents.find((x) => x.id === id)!;
      const actor = createChibi(0, a.name, 1, persona(id));
      const root = actor.root;
      return (hexColor: string): boolean => {
        const want = new THREE.Color(hexColor);
        const near = (r: number, g: number, b: number): boolean => Math.abs(r - want.r) < 2e-3 && Math.abs(g - want.g) < 2e-3 && Math.abs(b - want.b) < 2e-3;
        let found = false;
        root.traverse((o) => {
          if (found) return;
          const mesh = o as THREE.Mesh;
          const m = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (m?.color && near(m.color.r, m.color.g, m.color.b)) found = true;
          const col = mesh.geometry?.getAttribute?.("color");
          if (!found && col) for (let i = 0; i < col.count && !found; i++) if (near(col.getX(i), col.getY(i), col.getZ(i))) found = true;
        });
        return found;
      };
    };

    it("Giám đốc có cà vạt vàng + huy hiệu; Trưởng phòng có cà vạt màu phòng + huy hiệu; Nhân viên chỉ có huy hiệu", async () => {
      const director = await rigHas("giamdoc");
      expect(director(GOLD_TIE)).toBe(true);
      expect(director(DEPT_COLORS.executive)).toBe(true);
      const head = await rigHas("long");
      expect(head(DEPT_COLORS.sales)).toBe(true); // cà vạt + huy hiệu cùng màu phòng Bán hàng
      expect(head(GOLD_TIE)).toBe(false);
      const staff = await rigHas("nam");
      expect(staff(DEPT_COLORS.sales)).toBe(true); // chỉ huy hiệu
      expect(staff(GOLD_TIE)).toBe(false);
      // áo của Nhân viên đúng màu trong persona (không bị đổi thứ tự theo chỉ số tạo)
      expect(staff(persona("nam").shirt)).toBe(true);
    }, 30_000);
  });
});

describe("mức chi tiết hình học (I2)", () => {
  beforeAll(() => installFakeDom());
  const count = (root: THREE.Object3D): { meshes: number; tris: number } => {
    let meshes = 0;
    let tris = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      meshes++;
      tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    });
    return { meshes, tris };
  };

  it("chế độ thấp giảm mạnh số tam giác của mỗi nhân vật mà không bớt bộ phận; đặt lại về cao được", async () => {
    const { createChibi } = await import("../src/client/assets/chibi.js");
    const { setChibiDetail } = await import("../src/client/assets/chibiRig.js");
    const p = persona("long");
    setChibiDetail(false);
    const high = count(createChibi(0, "Long", 1, p).root);
    setChibiDetail(true);
    const low = count(createChibi(0, "Long", 1, p).root);
    setChibiDetail(false);
    const again = count(createChibi(0, "Long", 1, p).root);
    expect(low.meshes).toBe(high.meshes); // vẫn đủ bộ phận
    expect(low.tris).toBeLessThan(high.tris * 0.55);
    expect(again.tris).toBe(high.tris);
    expect(high.tris * agents.length).toBeLessThan(1_000_000); // ngân sách tam giác của cả công ty ở mức cao
  }, 30_000);
});

describe("pose có thật trong rig (F5, rig.poses)", () => {
  const rig = fs.readFileSync(path.resolve(__dirname, "..", "src", "client", "assets", "chibiRig.js"), "utf8");
  const poseSrc = rig.slice(rig.indexOf("export function chibiPose"), rig.indexOf("// Ease the rig toward a pose"));
  const poses = new Set([...poseSrc.matchAll(/case '(\w+)'/g)].map((m) => m[1]));

  it("mọi pose mà giao diện dùng đều là một nhánh `case` thật của chibiPose (không rơi vào pose mặc định)", () => {
    expect(poses.size).toBeGreaterThan(15);
    for (const a of CHIBI_ANIMS) {
      if (a === "idle") continue; // idle là pose mặc định
      expect(poses.has(a), `rig thiếu pose "${a}"`).toBe(true);
    }
  });

  it("việc nhàn rỗi, phản ứng, họp và trạng thái đều dùng pose nằm trong danh sách CHIBI_ANIMS", () => {
    const used = new Set<string>([
      ...IDLE_ACTIONS.map((a) => a.anim),
      ...Object.values(REACT_ANIM),
      MEETING_PRESENT_ANIM,
      ...MEETING_LISTEN_ANIMS,
      ...Object.values(STATUS_ANIM),
      "walk",
      "celebrate",
    ]);
    for (const a of used) expect((CHIBI_ANIMS as readonly string[]).includes(a), a).toBe(true);
  });

  it("tư thế theo trạng thái: làm việc gõ phím, chờ duyệt giơ tay, bị chặn đổ mồ hôi, nghiên cứu đọc — đều khác nhau", () => {
    expect(STATUS_ANIM.working).toBe("type");
    expect(STATUS_ANIM.waiting).toBe("hand");
    expect(STATUS_ANIM.blocked).toBe("sweat");
    expect(STATUS_ANIM.researching).toBe("read");
    expect(new Set([STATUS_ANIM.working, STATUS_ANIM.waiting, STATUS_ANIM.blocked, STATUS_ANIM.idle]).size).toBe(4);
  });
});

describe("phản ứng nhận/giao việc (F3, behavior.react)", () => {
  function visual() {
    return { root: new THREE.Group(), chibi: { anim: "idle", sit: true, root: new THREE.Group() } } as never;
  }
  const chibiOf = (v: unknown) => (v as { chibi: { anim: string; sit: boolean } }).chibi;

  it("nhận việc giơ tay, giao việc đưa tay chỉ; xong thì về pose theo trạng thái và gọi lại onSeated", () => {
    for (const kind of ["receive", "assign"] as const) {
      const v = visual();
      let seated = 0;
      const b = new AgentBehavior(v, 0, 0.4, () => seated++);
      expect(b.react(kind)).toBe(true);
      expect(b.reacting).toBe(kind);
      b.update(0.05, "working");
      expect(chibiOf(v).anim).toBe(REACT_ANIM[kind]);
      for (let t = 0; t < REACT_SECONDS + 0.5; t += 0.05) b.update(0.05, "working");
      expect(b.reacting).toBeNull();
      expect(seated).toBe(1);
    }
    expect(REACT_ANIM).toEqual({ receive: "hand", assign: "board" });
  });

  it("không phá hành vi khác: không phản ứng khi đang đi lại, đang họp hay không có rig; không làm mất suất 'ra ngoài'", () => {
    resetAwayCounter();
    const grid = buildOfficeNavGrid(DEPARTMENTS, agents.map((a) => a.position));
    const a = agents.find((x) => x.id === "long")!;
    const v = visual();
    const b = new AgentBehavior(v, a.position.x, a.position.z, () => undefined, { nav: grid });
    expect(b.attendMeeting({ spot: meetingSeatSpots()[0], secs: 5 })).toBe(true);
    expect(b.react("receive")).toBe(false); // đang đi họp
    const noRig = new AgentBehavior({ root: new THREE.Group(), chibi: null } as never, 0, 0, () => undefined);
    expect(noRig.react("assign")).toBe(false);
    // đang phản ứng thì không bắt đầu phản ứng chồng
    const c = new AgentBehavior(visual(), 0, 0, () => undefined);
    expect(c.react("receive")).toBe(true);
    expect(c.react("assign")).toBe(false);
  });

  it("ăn mừng khi xong việc vẫn cắt được phản ứng (không bị kẹt)", () => {
    const v = visual();
    const b = new AgentBehavior(v, 0, 0, () => undefined);
    b.react("receive");
    b.celebrate();
    b.update(0.05, "idle");
    expect(chibiOf(v).anim).toBe("celebrate");
  });

  it("phản ứng không tiêu hao nhàn rỗi và vẫn tôn trọng công tắc tắt hoạt cảnh", () => {
    setIdleLife(false);
    const v = visual();
    const b = new AgentBehavior(v, 0, 0, () => undefined);
    (b as unknown as { nextActionAt: number }).nextActionAt = 0;
    for (let i = 0; i < 40; i++) b.update(0.5, "idle");
    expect(b.away).toBe(false);
    expect(b.react("receive")).toBe(true); // phản ứng vẫn chạy khi tắt hoạt cảnh nhàn rỗi
    setIdleLife(true);
  });
});

describe("đi họp (F4, behavior.meeting)", () => {
  function visual() {
    return { root: new THREE.Group(), chibi: { anim: "idle", sit: true, root: new THREE.Group() } } as never;
  }
  const grid = buildOfficeNavGrid(DEPARTMENTS, agents.map((a) => a.position));
  const chibiOf = (v: unknown) => (v as { chibi: { anim: string; sit: boolean } }).chibi;
  const rootOf = (v: unknown) => (v as { root: THREE.Group }).root;

  function make(id: string) {
    resetAwayCounter();
    const a = agents.find((x) => x.id === id)!;
    const v = visual();
    let seated = 0;
    const b = new AgentBehavior(v, a.position.x, a.position.z, () => seated++, { nav: grid });
    return { a, v, b, seated: () => seated };
  }

  it("trưởng phòng đi tới ghế họp, ngồi nghe, rồi về đúng chỗ; việc 'đang làm' không huỷ cuộc họp", () => {
    const { a, v, b, seated } = make("long");
    const seat = meetingSeatSpots()[2];
    expect(b.attendMeeting({ spot: seat, secs: 6 })).toBe(true);
    expect(b.inMeeting && b.away).toBe(true);
    expect(b.label()).toBe("idle.meeting");
    b.onStatus("working"); // việc mới tới giữa chừng
    expect(b.inMeeting).toBe(true);

    let arrived = false;
    let sat = false;
    for (let i = 0; i < 4000 && !arrived; i++) {
      b.update(0.05, "working");
      if (Math.hypot(rootOf(v).position.x - seat.x, rootOf(v).position.z - seat.z) < 0.05 && chibiOf(v).anim !== "walk") arrived = true;
    }
    expect(arrived).toBe(true);
    for (let i = 0; i < 20; i++) b.update(0.05, "working");
    sat = chibiOf(v).sit;
    expect(sat).toBe(true);
    expect([...MEETING_LISTEN_ANIMS]).toContain(chibiOf(v).anim);

    for (let i = 0; i < 12000 && seated() === 0; i++) b.update(0.05, "working");
    expect(seated()).toBe(1);
    expect(b.inMeeting).toBe(false);
    expect(rootOf(v).position.x).toBeCloseTo(a.position.x, 5);
    expect(rootOf(v).position.z).toBeCloseTo(a.position.z, 5);
  });

  it("Giám đốc thuyết trình: đứng cạnh màn hình, tư thế chỉ bảng, không ngồi", () => {
    const { v, b } = make("giamdoc");
    const spot = presenterSpot();
    expect(b.attendMeeting({ spot, present: true, secs: 6 })).toBe(true);
    for (let i = 0; i < 6000 && Math.hypot(rootOf(v).position.x - spot.x, rootOf(v).position.z - spot.z) > 0.05; i++) b.update(0.05, "working");
    for (let i = 0; i < 10; i++) b.update(0.05, "working");
    expect(chibiOf(v).anim).toBe(MEETING_PRESENT_ANIM);
    expect(chibiOf(v).sit).toBe(false);
  });

  it("từ chối khi không có lưới đường đi, đang ở ngoài chỗ, hoặc quá xa (> MAX_WALK_MEETING)", () => {
    const noNav = new AgentBehavior(visual(), 0, 0, () => undefined);
    expect(noNav.attendMeeting({ spot: meetingSeatSpots()[0], secs: 5 })).toBe(false);
    const { b } = make("minh");
    expect(b.attendMeeting({ spot: meetingSeatSpots()[0], secs: 5 })).toBe(true);
    expect(b.attendMeeting({ spot: meetingSeatSpots()[1], secs: 5 })).toBe(false); // đã đang đi họp
    const far = make("tri");
    expect(far.b.attendMeeting({ spot: { x: 400, z: 400, yaw: 0 }, secs: 5 })).toBe(false);
    expect(MAX_WALK_MEETING).toBeGreaterThan(40);
  });

  it("họp không chiếm suất 'ra ngoài' của việc nhàn rỗi (người khác vẫn đi pantry được)", async () => {
    const { awayCount } = await import("../src/client/assets/behavior.js");
    const { b } = make("long");
    b.attendMeeting({ spot: meetingSeatSpots()[0], secs: 5 });
    expect(awayCount()).toBe(0);
  });

  it("cả hội đồng họp cùng lúc: Giám đốc + 4 trưởng phòng ngồi các ghế khác nhau, cuối cùng ai về chỗ nấy", () => {
    resetAwayCounter();
    const ids = ["giamdoc", "long", "huy", "mai", "thu"];
    const seats = meetingSeatSpots();
    const members = ids.map((id, k) => {
      const a = agents.find((x) => x.id === id)!;
      const v = visual();
      let n = 0;
      const b = new AgentBehavior(v, a.position.x, a.position.z, () => n++, { nav: grid });
      const spot = id === "giamdoc" ? presenterSpot() : seats[k - 1];
      expect(b.attendMeeting({ spot, present: id === "giamdoc", secs: 8 }), id).toBe(true);
      return { a, v, b, done: () => n };
    });
    for (let i = 0; i < 20000 && members.some((m) => m.done() === 0); i++) for (const m of members) m.b.update(0.05, "working");
    for (const m of members) {
      expect(m.done(), m.a.id).toBe(1);
      expect(rootOf(m.v).position.x).toBeCloseTo(m.a.position.x, 5);
    }
  });
});
