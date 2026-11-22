/**
 * Báo cáo của một luồng việc dạng Markdown (xuất ra tệp `.md` để gửi/lưu): tiêu đề, trạng thái, tóm tắt của Giám đốc và kết quả (hoặc lỗi) của từng người.
 * Hàm thuần (nhận `t` và dữ liệu) nên kiểm thử được và ra đúng ngôn ngữ đang chọn.
 */
import { flowNodes } from "../../assets/workboard.js";
import type { OrgNode } from "../../../shared/officeEntity.js";
import { messageText } from "../i18n/index.js";

type Vars = Record<string, string | number>;
type TFn = (key: string, vars?: Vars) => string;

const MAX_RESULT = 20_000;
const OPEN = new Set(["pending", "running", "awaiting-approval"]);

/** Trích dẫn nhiều dòng bằng `> ` để nội dung do AI viết (có thể chứa tiêu đề `#`, danh sách…) không phá cấu trúc báo cáo. */
function quote(text: string): string {
  const clipped = text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}…` : text;
  return clipped
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

/** Tên tệp an toàn: bỏ dấu tiếng Việt, chỉ chữ-số-gạch ngang, tối đa 40 ký tự của tiêu đề. */
export function flowReportFileName(title: string, at: Date): string {
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // bỏ dấu kết hợp sau khi tách (NFD)
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "work";
  return `funnyovs-report-${slug}-${day(at)}.md`;
}

export function flowReport(t: TFn, org: Record<string, OrgNode>, rootId: string, opts: { company: string; at: Date }): string {
  const root = org[rootId];
  if (!root) return "";
  const nodes = flowNodes(org, rootId);
  const work = nodes.filter((n) => n.kind === "work");
  const done = work.filter((n) => n.status === "done").length;
  const failed = work.filter((n) => n.status === "failed" || n.status === "rejected").length;
  const open = work.filter((n) => OPEN.has(n.status)).length;

  const out: string[] = [];
  out.push(`# ${root.title.replace(/\s+/g, " ").trim()}`, "");
  out.push(`*${t("report.generated", { date: opts.at.toISOString().slice(0, 16).replace("T", " ") + " UTC", company: opts.company })}*`, "");
  out.push(`**${t("report.status")}:** ${t(`org.status.${root.status}`)} — ${t("report.counts", { done, failed, open })}`, "");
  out.push(`## ${t("report.summary")}`, "", root.summary?.trim() ? root.summary.trim() : `_${t("report.noSummary")}_`, "");
  out.push(`## ${t("report.results")}`, "");
  if (work.length === 0) out.push(`_${t("report.noResult")}_`, "");
  for (const n of work) {
    out.push(`### ${n.assigneeName} — ${t(`dept.${n.department}`)}`, "");
    out.push(`**${t("report.status")}:** ${t(`org.status.${n.status}`)}`, "");
    if (n.result?.trim()) out.push(quote(n.result.trim()), "");
    else if (n.error) out.push(quote(messageText(t, n.error)), "");
    else out.push(`_${t("report.noResult")}_`, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
