/**
 * Bộ phân công việc tự động — giữ văn phòng "sống".
 *
 * Vì sao cần:
 *  - Người dùng muốn thấy nhân viên CHẠY và thấy token TIÊU, không phải đứng yên.
 *  - Trước đây chỉ có vòng lặp tự học (30 phút/lần) và việc thủ công → văn phòng
 *    đứng yên suốt, thanh token không bao giờ nhúc nhích.
 *
 * Nguyên tắc an toàn:
 *  - KHÔNG tự ý tăng hạn mức token, KHÔNG bật "Tự chủ cao".
 *  - Mọi việc tự giao đều chạy trong ngân sách sẵn có; hết hạn mức thì dừng.
 *  - Việc rẻ (duyệt web/nghiên cứu) dùng sandbox browser — tiêu token nhỏ.
 *  - Việc đắt (Cursor CLI) chỉ chạy khi người dùng yêu cầu, trừ khi bật chế độ
 *    tự chủ cao (lúc đó vẫn bị chặn bởi trần mỗi tác vụ của Token Budget).
 */

export type AutoWorkKind = "research" | "internal";

export interface AutoWorkItem {
  /** Id của nhân viên phụ trách. */
  agentId: string;
  kind: AutoWorkKind;
  title: string;
  /** Chủ đề cho việc nghiên cứu web. */
  topic?: string;
  /** Nội dung công việc nội bộ (hiển thị trên màn hình + nhật ký). */
  note: string;
  /**
   * Ví token dùng cho việc này.
   * "learning" = tự học (tiêu ví riêng), "normal" = công việc thường.
   */
  wallet: "normal" | "learning";
  /** Số giây nghỉ trước khi giao lại việc này cho cùng một nhân viên. */
  cooldownSec: number;
  /** Số nguồn web tối đa đọc cho việc này. */
  maxSources?: number;
  /** Số ký tự đọc từ mỗi trang (nhỏ = token rẻ). */
  snippetChars?: number;
}

/**
 * Danh mục việc thường nhật của từng phòng ban. Mỗi việc là một nhiệm vụ nhỏ,
 * chạy tự động để nhân viên có việc làm và token chảy.
 */
export const AUTO_WORK_CATALOG: AutoWorkItem[] = [
  {
    agentId: "an",
    kind: "research",
    title: "Nghiên cứu xu hướng mới",
    topic: "best practices TypeScript 2026",
    note: "Duyệt web tìm best practices mới nhất",
    wallet: "normal",
    cooldownSec: 150,
    maxSources: 2,
    snippetChars: 2000,
  },
  {
    agentId: "tri",
    kind: "research",
    title: "Tự học: kiến trúc agent",
    topic: "agent architecture patterns",
    note: "Nghiên cứu kiến trúc agent và lưu vào Thư viện",
    wallet: "learning",
    cooldownSec: 180,
    maxSources: 2,
    snippetChars: 2000,
  },
  {
    agentId: "mai",
    kind: "internal",
    title: "Soạn mẫu trả lời khách hàng",
    topic: "customer support reply templates best practices",
    note: "Rà soát kịch bản CSKH và cập nhật mẫu trả lời",
    wallet: "normal",
    cooldownSec: 90,
    maxSources: 2,
    snippetChars: 1800,
  },
  {
    agentId: "long",
    kind: "internal",
    title: "Cập nhật phễu bán hàng",
    topic: "sales funnel conversion optimization 2026",
    note: "Phân tích phễu và đề xuất cải thiện tỉ lệ chuyển đổi",
    wallet: "normal",
    cooldownSec: 100,
    maxSources: 2,
    snippetChars: 1800,
  },
  {
    agentId: "huy",
    kind: "internal",
    title: "Lên lịch nội dung tháng tới",
    topic: "content calendar strategy social media 2026",
    note: "Soạn lịch đăng bài cho tháng tới",
    wallet: "normal",
    cooldownSec: 110,
    maxSources: 2,
    snippetChars: 1800,
  },
  {
    agentId: "thu",
    kind: "internal",
    title: "Đối chiếu sổ sách",
    topic: "bookkeeping reconciliation accounting best practices",
    note: "Đối chiếu chi phí quý và cập nhật báo cáo",
    wallet: "normal",
    cooldownSec: 120,
    maxSources: 2,
    snippetChars: 1800,
  },
  {
    agentId: "ban",
    kind: "internal",
    title: "Điều phối lịch trình agent",
    topic: "multi agent orchestration scheduling patterns",
    note: "Cân bằng hàng đợi và phân công lại việc",
    wallet: "normal",
    cooldownSec: 130,
    maxSources: 2,
    snippetChars: 1800,
  },
];

export interface DispatcherState {
  /** Nhân viên đang bận — không giao thêm. */
  busy: Set<string>;
  /** Thời điểm được giao lại (epoch ms) cho từng mục việc. */
  nextAllowed: Map<string, number>;
  /** Số việc đã giao từ lần khởi động. */
  dispatched: number;
}

/**
 * Chọn việc tiếp theo cho nhân viên `agentId`.
 * Trả về null nếu nhân viên đang bận, chưa tới hạn, hoặc danh mục không có việc.
 */
export function pickNextWork(
  catalog: AutoWorkItem[],
  state: DispatcherState,
  agentId: string,
  now: number,
): AutoWorkItem | null {
  if (state.busy.has(agentId)) return null;
  const candidates = catalog.filter((w) => w.agentId === agentId);
  for (const w of candidates) {
    const key = `${w.agentId}:${w.title}`;
    const next = state.nextAllowed.get(key) ?? 0;
    if (now >= next) return w;
  }
  return null;
}

/** Ghi nhận đã giao việc → nhân viên bận và mục việc vào thời gian chờ. */
export function markDispatched(
  state: DispatcherState,
  item: AutoWorkItem,
  now: number,
): void {
  state.busy.add(item.agentId);
  state.nextAllowed.set(`${item.agentId}:${item.title}`, now + item.cooldownSec * 1000);
  state.dispatched += 1;
}

/** Nhân viên xong việc → trở lại rảnh. */
export function markFree(state: DispatcherState, agentId: string): void {
  state.busy.delete(agentId);
}

/**
 * "Governor" ngân sách — quyết định có nên giao việc tự động lúc này không.
 *
 * Vì sao cần:
 *  - 7 nhân viên tự nhận việc ⇒ token bị đốt rất nhanh. Nếu không có bộ điều
 *    tiết, ví học cạn sau ~30 phút rồi mọi nhân viên đứng yên ⇒ người dùng
 *    lại thấy "không hoạt động".
 *  - Bộ điều tiết giữ tỉ lệ tiêu thụ ở mức vừa phải: càng gần hạn mức thì
 *    càng giãn nhịp giao việc ra, nhưng VẪN giao (để người dùng thấy hoạt động)
 *    cho tới khi thực sự hết hạn mức.
 */
export interface GovernorInput {
  /** Token còn lại của ngày (cả ví chính + ví học). */
  remaining: number;
  /** Chi phí ước lượng cho MỘT VÒNG (tất cả nhân viên được giao trong vòng). */
  roundCost: number;
  /** Nhịp nhanh nhất giữa hai vòng (ms). */
  baseIntervalMs: number;
  /** Nhịp chậm nhất cho phép (ms) — để người dùng vẫn thấy hoạt động. */
  maxIntervalMs: number;
  /** Số giờ "làm việc" còn lại hôm nay (dùng để trải đều ngân sách). */
  activeHoursLeft: number;
}

/**
 * Trả về khoảng cách tối thiểu (ms) giữa hai VÒNG giao việc tự động.
 *
 * Mỗi vòng = giao việc cho TẤT CẢ nhân viên đang rảnh (chạy song song) ⇒
 * người dùng thấy cả văn phòng cùng hoạt động, không phải lần lượt.
 *
 * Quy tắc: ngân sách còn lại được chia đều cho các giờ làm việc còn lại.
 *
 *   số vòng còn làm = remaining / roundCost
 *   nhịp mỗi vòng  = activeHoursLeft × 3_600_000 / số vòng
 *
 * - Còn nhiều token → nhịp nhanh (baseIntervalMs).
 * - Sắp hết      → nhịp giãn ra tự nhiên, KHÔNG vượt maxIntervalMs.
 * - Hết token    → Infinity (dừng hẳn, không tự tăng hạn mức).
 */
export function governorIntervalMs(g: GovernorInput): number {
  const cost = Math.max(1, g.roundCost);
  // Không đủ cho 1 vòng → không giao nữa.
  if (g.remaining < cost) return Number.POSITIVE_INFINITY;

  const hours = Math.max(0.25, g.activeHoursLeft);
  // Số vòng còn chiến được nếu tiêu đều trong phần ngày còn lại.
  const rounds = Math.max(1, Math.floor(g.remaining / cost));
  const evenInterval = (hours * 3_600_000) / rounds;

  return Math.min(g.maxIntervalMs, Math.max(g.baseIntervalMs, Math.round(evenInterval)));
}

/**
 * Số giờ "làm việc" còn lại trong ngày.
 *
 * Mặc định coi cả 24 giờ là "giờ làm việc" ⇒ ngân sách được trải đều theo
 * thời gian thực còn lại của ngày. Nhịp vẫn được giới hạn bởi
 * `baseIntervalMs`/`maxIntervalMs` nên người dùng luôn thấy nhân viên hoạt
 * động, nhưng không đốt sạch hạn mức.
 */
export function activeHoursLeft(now: number, dayStartMs: number, workHours = 24): number {
  const elapsedHours = (now - dayStartMs) / 3_600_000;
  return Math.max(0.25, workHours - elapsedHours);
}

/** Ước lượng token tiêu tốn cho một mục việc tự động. */
export function estimateItemCost(item: AutoWorkItem): number {
  const chars = item.snippetChars ?? 3000;
  const sources = item.maxSources ?? 3;
  // ~4 ký tự ≈ 1 token, cộng chừa cho prompt/điều hướng/trang tìm kiếm.
  return Math.ceil((chars * sources) / 4) + 600;
}

/** Ước lượng token tiêu tốn cho một vòng giao việc (tất cả nhân viên). */
export function estimateRoundCost(catalog: AutoWorkItem[], wallet?: "normal" | "learning"): number {
  let total = 0;
  for (const w of catalog) {
    if (wallet && w.wallet !== wallet) continue;
    total += estimateItemCost(w);
  }
  return total;
}
