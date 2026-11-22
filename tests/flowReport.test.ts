/**
 * Báo cáo của một luồng việc dạng Markdown (tải về từ tab Tổ chức): đúng ngôn ngữ, đủ mục, nội dung do AI viết không phá cấu trúc, tên tệp an toàn.
 */
import { describe, expect, it } from "vitest";
import { translate } from "../src/client/office-3d/i18n/index.js";
import { flowReport, flowReportFileName } from "../src/client/office-3d/ui/flowReport.js";
import { DICTIONARIES } from "../src/client/office-3d/i18n/dictionaries.js";
import type { OrgNode } from "../src/shared/officeEntity.js";

const tEn = (k: string, v?: Record<string, string | number>) => translate("en", k, v);
const tVi = (k: string, v?: Record<string, string | number>) => translate("vi", k, v);
const AT = new Date("2026-11-22T08:30:00.000Z");

function node(over: Partial<OrgNode> & Pick<OrgNode, "id">): OrgNode {
  return {
    level: 3,
    kind: "work",
    assigneeId: "ha",
    assigneeName: "Hà",
    department: "marketing",
    title: "Việc",
    status: "done",
    childIds: [],
    createdAt: "2026-11-22T08:00:00.000Z",
    updatedAt: "2026-11-22T08:10:00.000Z",
    ...over,
  };
}

function org(...nodes: OrgNode[]): Record<string, OrgNode> {
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

const root = node({ id: "r", level: 1, kind: "delegation", assigneeId: "giamdoc", assigneeName: "Hùng", department: "executive", title: "Chiến dịch ra mắt gói Pro", summary: "Đã xong: bản tóm tắt và giao dịch mới.", childIds: ["w1", "w2"] });
const w1 = node({ id: "w1", parentId: "r", result: "Thông điệp: tiết kiệm 10 giờ mỗi tuần\nKênh: email" });
const w2 = node({ id: "w2", parentId: "r", assigneeId: "nam", assigneeName: "Nam", department: "sales", status: "failed", error: { key: "err.org.noDepartment", text: "Không có phòng phù hợp" } });

describe("báo cáo luồng việc (Markdown)", () => {
  it("tiếng Anh: tiêu đề, trạng thái + số đếm, tóm tắt, kết quả từng người, lỗi đã dịch", () => {
    const md = flowReport(tEn, org(root, w1, w2), "r", { company: "ACME", at: AT });
    expect(md.startsWith("# Chiến dịch ra mắt gói Pro\n")).toBe(true);
    expect(md).toContain("*Exported 2026-11-22 08:30 UTC from ACME*");
    expect(md).toContain("**Status:** Done — 1 done · 1 failed · 0 open");
    expect(md).toContain("## Director's summary\n\nĐã xong: bản tóm tắt và giao dịch mới.");
    expect(md).toContain("## Results by person");
    expect(md).toContain("### Hà — Marketing");
    expect(md).toContain("> Thông điệp: tiết kiệm 10 giờ mỗi tuần\n> Kênh: email");
    expect(md).toContain("### Nam — Sales");
    expect(md).toContain("**Status:** Failed");
    expect(md).toContain(`> ${tEn("err.org.noDepartment")}`); // lỗi dịch theo ngôn ngữ, không phải bản dự phòng tiếng Việt
    expect(md).not.toContain("Không có phòng phù hợp");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("tiếng Việt: cùng dữ liệu nhưng các mục và nhãn bằng tiếng Việt", () => {
    const md = flowReport(tVi, org(root, w1, w2), "r", { company: "ACME", at: AT });
    expect(md).toContain("*Xuất lúc 2026-11-22 08:30 UTC từ ACME*");
    expect(md).toContain("**Trạng thái:**");
    expect(md).toContain("## Tóm tắt của Giám đốc");
    expect(md).toContain("## Kết quả theo từng người");
    expect(md).toContain("1 xong · 1 lỗi · 0 đang mở");
    expect(md).not.toContain("Results by person");
  });

  it("nội dung do AI viết (tiêu đề #, khối mã) được trích dẫn nên không phá cấu trúc báo cáo", () => {
    const evil = node({ id: "w1", parentId: "r", result: "# Tiêu đề giả\n```\nmã\n```\n- mục\r\ndòng cuối" });
    const md = flowReport(tEn, org(root, evil), "r", { company: "ACME", at: AT });
    for (const line of md.split("\n")) {
      if (/^(#|```|- )/.test(line)) expect(["# Chiến dịch ra mắt gói Pro", "## Director's summary", "## Results by person", "### Hà — Marketing"]).toContain(line);
    }
    expect(md).toContain("> # Tiêu đề giả\n> ```\n> mã\n> ```\n> - mục\n> dòng cuối");
  });

  it("chưa có tóm tắt/kết quả → ghi rõ; bản bị thay thế không xuất hiện; việc đang mở được đếm", () => {
    const bare = node({ id: "r2", level: 1, kind: "delegation", title: "Mới giao", status: "running", childIds: ["a", "b", "c"] });
    const a = node({ id: "a", parentId: "r2", status: "running" });
    const b = node({ id: "b", parentId: "r2", status: "failed", superseded: true, assigneeName: "Bản cũ" });
    const c = node({ id: "c", parentId: "r2", status: "pending", assigneeName: "Phúc", department: "finance" });
    const md = flowReport(tEn, org(bare, a, b, c), "r2", { company: "ACME", at: AT });
    expect(md).toContain("_No summary yet._");
    expect(md).toContain("0 done · 0 failed · 2 open");
    expect(md).toContain("_No result yet._");
    expect(md).not.toContain("Bản cũ");
    expect(flowReport(tEn, {}, "khong-co", { company: "ACME", at: AT })).toBe("");
    expect(flowReport(tEn, org(node({ id: "solo", level: 1, kind: "delegation", status: "failed", childIds: [] })), "solo", { company: "A", at: AT })).toContain("_No result yet._");
  });

  it("tên tệp: bỏ dấu tiếng Việt, chỉ a-z0-9 và gạch ngang, ≤ 40 ký tự tiêu đề, có ngày; tiêu đề rỗng/ký hiệu → 'work'", () => {
    expect(flowReportFileName("Chiến dịch ra mắt gói Pro!", AT)).toBe("funnyovs-report-chien-dich-ra-mat-goi-pro-2026-11-22.md");
    expect(flowReportFileName("Đường Đại Học / Báo cáo: Q4?", AT)).toBe("funnyovs-report-duong-dai-hoc-bao-cao-q4-2026-11-22.md");
    const long = flowReportFileName("a".repeat(200), AT);
    expect(long).toBe(`funnyovs-report-${"a".repeat(40)}-2026-11-22.md`);
    expect(flowReportFileName("???", AT)).toBe("funnyovs-report-work-2026-11-22.md");
    expect(flowReportFileName("../../etc/passwd", AT)).toBe("funnyovs-report-etc-passwd-2026-11-22.md"); // không có dấu chấm/gạch chéo
  });

  it("mọi khoá chữ của báo cáo đều có ở cả hai ngôn ngữ", () => {
    for (const k of ["org.report.download", "report.generated", "report.status", "report.counts", "report.summary", "report.noSummary", "report.results", "report.noResult"]) {
      expect(k in DICTIONARIES.vi, `vi: ${k}`).toBe(true);
      expect(k in DICTIONARIES.en, `en: ${k}`).toBe(true);
    }
  });
});
