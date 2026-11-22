/**
 * Test cho phân tầng công ty: sơ đồ tổ chức, định tuyến việc theo phòng, giao việc xuống và nghiệm thu ngược lên.
 */
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/server/agents/agentRegistry.js";
import { DEPARTMENTS } from "../src/server/agents/departments.js";
import { normalizeText, pickAssignee, planDepartments, reportsOf, staffOf } from "../src/server/org/orgChart.js";

describe("sơ đồ tổ chức", () => {
  const reg = new AgentRegistry();
  const agents = reg.list();

  it("có đúng 1 giám đốc, mỗi phòng có người ngồi đều có 1 trưởng phòng", () => {
    expect(agents.filter((a) => a.tier === 1)).toHaveLength(1);
    const used = new Set(agents.map((a) => a.department));
    for (const d of used) {
      // Phòng Giám đốc chỉ có Giám đốc; mọi phòng còn lại có đúng một trưởng phòng.
      expect(agents.filter((a) => a.department === d && a.tier === 2)).toHaveLength(d === "executive" ? 0 : 1);
    }
    expect(agents.find((a) => a.tier === 1)!.department).toBe("executive");
  });

  it("đường báo cáo hợp lệ: nhân viên → trưởng phòng cùng phòng → giám đốc; không vòng, sâu ≤ 3", () => {
    const byId = new Map(agents.map((a) => [a.id, a]));
    for (const a of agents) {
      let depth = 1;
      let cur = a;
      const seen = new Set<string>([a.id]);
      while (cur.reportsTo) {
        const up = byId.get(cur.reportsTo);
        expect(up, `${cur.id} báo cáo cho id không tồn tại`).toBeDefined();
        expect(up!.tier).toBeLessThan(cur.tier);
        expect(seen.has(up!.id)).toBe(false);
        seen.add(up!.id);
        cur = up!;
        depth++;
      }
      expect(depth).toBeLessThanOrEqual(3);
      expect(cur.tier).toBe(1);
      if (a.tier === 3) expect(byId.get(a.reportsTo!)!.department).toBe(a.department);
    }
  });

  it("không có hai agent trùng chỗ ngồi và mọi người nằm trong phòng của mình", () => {
    const seats = new Set<string>();
    for (const a of agents) {
      const dept = DEPARTMENTS.find((d) => d.id === a.department)!;
      expect(Math.abs(a.position.x - dept.center.x)).toBeLessThan(dept.size.w / 2 - 0.8);
      expect(Math.abs(a.position.z - dept.center.z)).toBeLessThan(dept.size.d / 2);
      const key = `${a.position.x.toFixed(2)},${a.position.z.toFixed(2)}`;
      expect(seats.has(key)).toBe(false);
      seats.add(key);
    }
    // Bàn (rộng 1.7) của hai người cùng hàng không được chồng nhau.
    for (const a of agents) {
      for (const b of agents) {
        if (a.id >= b.id || a.department !== b.department) continue;
        if (Math.abs(a.position.z - b.position.z) < 0.5) expect(Math.abs(a.position.x - b.position.x)).toBeGreaterThanOrEqual(1.8);
      }
    }
  });

  it("reportsOf trả đúng cấp dưới", () => {
    expect(reportsOf(agents, "giamdoc")).toHaveLength(8);
    expect(reportsOf(agents, "huy").map((a) => a.id)).toEqual(["ha"]);
  });
});

describe("định tuyến việc theo phòng", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(normalizeText("Đăng bài Marketing & Phễu bán hàng")).toBe("dang bai marketing & pheu ban hang");
  });

  it("một yêu cầu nhiều phòng được tách đúng phòng", () => {
    const plan = planDepartments("Lập kế hoạch chiến dịch marketing và báo cáo chi phí quảng cáo tháng này").map((p) => p.department);
    expect(plan).toEqual(expect.arrayContaining(["marketing", "finance"]));
  });

  it("không khớp từ khoá nào → phòng Giao việc; tối đa 4 phòng; ổn định", () => {
    expect(planDepartments("xin chào").map((p) => p.department)).toEqual(["dispatch"]);
    const many = planDepartments("khách hàng, bán hàng, marketing, tài chính, thư viện, lập trình, tự động, agent");
    expect(many.length).toBeLessThanOrEqual(4);
    expect(planDepartments("báo cáo doanh thu")).toEqual(planDepartments("báo cáo doanh thu"));
  });

  it("từ khoá ngắn 'ai' không khớp bên trong từ khác", () => {
    expect(planDepartments("hai bài viết").map((p) => p.department)).toEqual(["dispatch"]);
  });
});

describe("chọn người làm", () => {
  const agents = new AgentRegistry().list();
  it("nhân viên ít việc nhất; nhân viên quá bận mà trưởng phòng rảnh hơn thì trưởng phòng tự làm", () => {
    expect(pickAssignee(agents, "marketing", () => 0).id).toBe("ha");
    expect(pickAssignee(agents, "marketing", (id) => (id === "ha" ? 3 : 0)).id).toBe("huy");
    expect(pickAssignee(agents, "marketing", () => 3).id).toBe("ha"); // cả hai đều bận như nhau → vẫn giao cho nhân viên
    expect(staffOf(agents, "marketing")).toHaveLength(1);
  });
  it("phòng không có nhân viên → trưởng phòng làm", () => {
    expect(pickAssignee(agents.filter((a) => a.tier !== 3), "finance", () => 0).id).toBe("thu");
  });
});
