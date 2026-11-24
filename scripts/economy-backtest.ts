/**
 * Mô phỏng 30 ngày của vòng lặp kinh tế (EAL) với DỮ LIỆU GIẢ LẬP — KHÔNG phải dự báo doanh thu thật.
 *
 * Chạy MÃ THẬT của EconomyService (xuất bản có duyệt, paywall + thanh toán giả, sổ cái băm nối, chu kỳ, tạm dừng khi lỗ, đề xuất tái đầu tư);
 * chỉ có người mua, chi phí token và hành vi người vận hành là giả lập, với hạt giống cố định nên kết quả lặp lại được.
 *
 *   npx tsx scripts/economy-backtest.ts            (in ra màn hình)
 *   npx tsx scripts/economy-backtest.ts --write    (ghi docs/economy-backtest.md)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActionGate } from "../src/server/agent/gate.js";
import { AuditLog } from "../src/server/security/audit.js";
import { createMockRail } from "../src/server/economy/payment.js";
import { EconomyService, type EconomyConfig } from "../src/server/economy/service.js";
import { formatUsd, usdToMicro } from "../src/shared/economy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- giả định (đều có thể đổi; ghi ra báo cáo)
const DAYS = 30;
const CYCLE_HOURS = 6;
const PRICE_USD = 0.5;
const ASSUME = {
  /** Số người mua trung bình mỗi báo cáo mỗi chu kỳ 6 giờ. */
  scenarios: [
    { name: "Bi quan (gần như không ai mua)", lambda: 0.02 },
    { name: "Cơ sở (một ít khách đều đặn)", lambda: 0.15 },
    { name: "Lạc quan (nội dung được tìm nhiều)", lambda: 0.6 },
  ],
  publishEveryDays: 3,
  tokensPerCycleScouts: 30_000,
  operatorCostPerDayUsd: 0.15,
  operatorResumesAfterHours: 24,
  seed: 20260101,
  /** Hai chính sách ngưỡng lỗ: mặc định theo đặc tả (3 chu kỳ = 18 giờ) và một ngưỡng thoáng hơn (12 chu kỳ = 3 ngày). */
  limits: [3, 12],
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda: number, rand: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

interface Week {
  week: number;
  revenue: number;
  cost: number;
  products: number;
  paused: boolean;
}
interface Result {
  name: string;
  lambda: number;
  limit: number;
  weeks: Week[];
  revenue: number;
  cost: number;
  net: number;
  pauses: number;
  resumes: number;
  reinvestApproved: number;
  reports: number;
  sales: number;
  ledgerOk: boolean;
  ledgerRows: number;
}

async function run(name: string, lambda: number, limit: number): Promise<Result> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "funnyovs-econ-bt-"));
  try {
    const ws = path.join(dir, "ws");
    fs.mkdirSync(path.join(ws, "public", "insights"), { recursive: true });
    const gate = new ActionGate(60_000);
    gate.on("request", (r: { id: string }) => gate.decide(r.id, true)); // người vận hành duyệt mọi thứ trong mô phỏng
    const audit = new AuditLog(path.join(dir, "audit.log"));
    const clock = { t: Date.parse("2026-01-01T00:00:00Z") };
    const rand = rng(ASSUME.seed + Math.round(lambda * 1000));
    let tokenAcc = 0;
    let scoutsOn = true;
    const config: EconomyConfig = { maxPriceMicro: usdToMicro(5), negativeLimit: limit, loopHours: CYCLE_HOURS, tokenPriceMicroPerMTok: usdToMicro(0.5), computeMicroPerDay: usdToMicro(0.1), reinvestShare: 0.5, maxPending: 10, reinvestMinMicro: usdToMicro(1), reinvestCooldownHours: 24 };
    const svc = new EconomyService({
      dataDir: dir,
      workspace: () => ws,
      rail: createMockRail(),
      gate,
      audit,
      emergency: () => false,
      desk: () => ({ id: "thu", name: "Thu" }),
      contactTerms: () => [],
      tokensSince: () => tokenAcc,
      scouts: { setActive: (on) => void (scoutsOn = on), active: () => scoutsOn },
      config,
      now: () => clock.t,
    });

    let demand = 1;
    let publishEvery = ASSUME.publishEveryDays;
    let pausedAt = 0;
    let pauses = 0;
    let resumes = 0;
    let reinvestApproved = 0;
    let reports = 0;
    let sales = 0;
    let nonce = 0;
    let lastPublishDay = -99;
    const weeks: Week[] = [];
    let weekRev = 0;
    let weekCost = 0;
    let prevReceived = 0;
    let prevCost = 0;

    const publishNew = async (day: number): Promise<void> => {
      const topic = `report-${reports + 1}`;
      fs.writeFileSync(path.join(ws, "public", "insights", `${topic}.md`), `# Report ${reports + 1}\n\nAggregate public numbers, edition ${reports + 1}.\n`);
      const r = svc.publish(topic, PRICE_USD);
      if ((await r.done) === "approved") {
        reports++;
        lastPublishDay = day;
      }
    };
    await publishNew(0); // sản phẩm đầu tiên ngay ngày 0

    const cyclesPerDay = 24 / CYCLE_HOURS;
    for (let c = 0; c < DAYS * cyclesPerDay; c++) {
      clock.t += CYCLE_HOURS * 3_600_000;
      const day = Math.floor((c * CYCLE_HOURS) / 24);
      // người mua (đi qua paywall thật: 402 → thanh toán giả → 200)
      for (const p of svc.products.list()) {
        const buyers = poisson(lambda * demand, rand);
        for (let b = 0; b < buyers; b++) {
          const r = await svc.handlePublic(p.topic, { "x-mock-payment": `mock:${p.priceMicro}:n${++nonce}` }, "https://sim.test/r");
          if (r.status === 200) sales++;
        }
      }
      // chi phí người vận hành (hosting/tunnel…) ghi mỗi ngày; token của Scout khi đang bật
      if (c % cyclesPerDay === 0) svc.recordCost(ASSUME.operatorCostPerDayUsd, "hosting");
      tokenAcc = scoutsOn ? ASSUME.tokensPerCycleScouts : 0;
      // người vận hành xuất bản thêm báo cáo định kỳ khi Scout đang chạy
      if (scoutsOn && day - lastPublishDay >= publishEvery) await publishNew(day);

      const wasPaused = svc.state().paused;
      const cyc = svc.runCycle();
      tokenAcc = 0;
      await new Promise((r) => setImmediate(r)); // cho đề xuất tái đầu tư (bất đồng bộ) được duyệt và ghi
      const st = svc.state();
      if (!wasPaused && st.paused) {
        pauses++;
        pausedAt = clock.t;
      }
      if (st.paused && clock.t - pausedAt >= ASSUME.operatorResumesAfterHours * 3_600_000) {
        svc.resume();
        resumes++;
      }
      // hiệu ứng giả định của việc tái đầu tư đã duyệt: thêm khoá API → nhu cầu +10%; thêm agent → xuất bản nhanh hơn
      const re = svc.ledger.all().filter((r) => r.kind === "reinvest");
      if (re.length > reinvestApproved) {
        for (const r of re.slice(reinvestApproved)) {
          if (r.note === "add_api_key") demand = Math.min(1.5, demand + 0.05);
          if (r.note === "add_agent") publishEvery = Math.max(1, publishEvery - 1);
          svc.recordCost((r.amount ?? 0) / 1_000_000, `reinvest ${r.note}`); // người vận hành thực hiện khoản đã duyệt
        }
        reinvestApproved = re.length;
      }
      void cyc;

      const s = svc.state();
      weekRev += s.receivedMicro - prevReceived;
      weekCost += s.costMicro - prevCost;
      prevReceived = s.receivedMicro;
      prevCost = s.costMicro;
      if ((c + 1) % (7 * cyclesPerDay) === 0 || c === DAYS * cyclesPerDay - 1) {
        weeks.push({ week: weeks.length + 1, revenue: weekRev, cost: weekCost, products: s.products.length, paused: s.paused });
        weekRev = 0;
        weekCost = 0;
      }
    }
    const fin = svc.state();
    return { name, lambda, limit, weeks, revenue: fin.receivedMicro, cost: fin.costMicro, net: fin.netMicro, pauses, resumes, reinvestApproved, reports, sales, ledgerOk: fin.ledgerOk, ledgerRows: fin.ledgerCount };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function report(results: Result[]): string {
  const L: string[] = [];
  const get = (lambda: number, limit: number): Result => results.find((r) => r.lambda === lambda && r.limit === limit)!;
  L.push("# Mô phỏng 30 ngày — Lớp kinh tế tự trị (EAL)");
  L.push("");
  L.push("> **Đây là MÔ PHỎNG với dữ liệu giả lập, không phải dự báo doanh thu.** Mã của EAL (xuất bản có duyệt, paywall, sổ cái, chu kỳ, tạm dừng khi lỗ, đề xuất tái đầu tư) là mã thật; người mua, chi phí token và hành vi người vận hành là giả định bên dưới. Chạy lại: `npm run economy:backtest` (hạt giống cố định nên kết quả không đổi).");
  L.push("");
  L.push("## Giả định");
  L.push("");
  L.push(`- ${DAYS} ngày, một chu kỳ mỗi ${CYCLE_HOURS} giờ (${(DAYS * 24) / CYCLE_HOURS} chu kỳ). Giá mỗi báo cáo ${formatUsd(usdToMicro(PRICE_USD))}.`);
  L.push(`- Người mua ~ Poisson(λ) cho MỖI báo cáo MỖI chu kỳ; λ theo kịch bản: ${ASSUME.scenarios.map((s) => `${s.lambda}`).join(" / ")}.`);
  L.push(`- Ngày 0 có 1 báo cáo; cứ ${ASSUME.publishEveryDays} ngày xuất bản thêm một báo cáo (do người vận hành duyệt) **khi Scout đang chạy** — nên Scout bị tạm dừng thì danh mục không lớn thêm.`);
  L.push(`- Chi phí suy luận quy ước: ${(ASSUME.tokensPerCycleScouts / 1000).toFixed(0)}k token mỗi chu kỳ khi Scout bật × $0,50/triệu token; hạ tầng quy ước $0,10/ngày; chi phí người vận hành ghi tay $${ASSUME.operatorCostPerDayUsd.toFixed(2)}/ngày (hosting/tunnel).`);
  L.push(`- Lỗ N chu kỳ liên tiếp → Scout tự tạm dừng; người vận hành xem xét và tiếp tục sau ${ASSUME.operatorResumesAfterHours} giờ (Scout bật lại như trước). So sánh N = ${ASSUME.limits[0]} (đặc tả: 18 giờ) và N = ${ASSUME.limits[1]} (3 ngày).`);
  L.push("- Tái đầu tư: đề xuất tối đa một lần mỗi 24 giờ và chỉ khi khoản ≥ $1; mọi đề xuất được duyệt. `add_api_key` giả định nhu cầu +5% (tối đa +50%), `add_agent` rút ngắn chu kỳ xuất bản 1 ngày; khoản chi được ghi như chi phí người vận hành.");
  L.push("");
  L.push("## Tổng hợp");
  L.push("");
  L.push("| Kịch bản | λ | N | Doanh thu | Chi phí | Lãi/lỗ | Lượt bán | Báo cáo | Lần tự tạm dừng | Tái đầu tư (duyệt) | Sổ cái |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) L.push(`| ${r.name} | ${r.lambda} | ${r.limit} | ${formatUsd(r.revenue)} | ${formatUsd(r.cost)} | **${formatUsd(r.net)}** | ${r.sales} | ${r.reports} | ${r.pauses} | ${r.reinvestApproved} | ${r.ledgerOk ? `nguyên vẹn (${r.ledgerRows} dòng)` : "HỎNG"} |`);
  for (const r of results.filter((x) => x.limit === ASSUME.limits[0])) {
    L.push("");
    L.push(`### ${r.name} — N = ${r.limit}`);
    L.push("");
    L.push("| Tuần | Doanh thu | Chi phí | Lãi/lỗ | Báo cáo đang bán | Cuối tuần |");
    L.push("|---|---|---|---|---|---|");
    for (const w of r.weeks) L.push(`| ${w.week} | ${formatUsd(w.revenue)} | ${formatUsd(w.cost)} | ${formatUsd(w.revenue - w.cost)} | ${w.products} | ${w.paused ? "Scout tạm dừng" : "đang chạy"} |`);
  }
  const worst = get(ASSUME.scenarios[0].lambda, ASSUME.limits[0]);
  const base3 = get(ASSUME.scenarios[1].lambda, ASSUME.limits[0]);
  const base12 = get(ASSUME.scenarios[1].lambda, ASSUME.limits[1]);
  L.push("");
  L.push("## Đọc kết quả thế nào");
  L.push("");
  L.push(`- **Kịch bản bi quan** (${worst.sales} lượt bán): lỗ ${formatUsd(-worst.net)} trong 30 ngày, Scout tự tạm dừng ${worst.pauses} lần. Đúng thiết kế — hệ thống không đốt thêm token khi không có người mua — nhưng cũng cho thấy **doanh thu thật ban đầu rất có thể gần 0** và người vận hành sẽ phải can thiệp thường xuyên.`);
  L.push(`- **Ngưỡng N = ${ASSUME.limits[0]} (18 giờ) gây nhiều lần tạm dừng không cần thiết lúc khởi động:** chi phí cố định luôn > 0 còn doanh thu đến thưa thớt, nên ở kịch bản cơ sở Scout bị tạm dừng ${base3.pauses} lần (mỗi lần cần người vận hành xem lại) trong khi kết quả tài chính gần như không đổi so với N = ${ASSUME.limits[1]} (lãi/lỗ ${formatUsd(base3.net)} so với ${formatUsd(base12.net)}; ${base12.pauses} lần tạm dừng). **Khuyến nghị: đặt \`ECONOMY_NEGATIVE_CYCLES\` ≥ 12 khi chạy thật** (mặc định vẫn là 3 theo đặc tả).`);
  L.push("- Kết luận nhạy với λ — chỉ cần λ đổi vài lần là dấu của lãi/lỗ đổi. **Mô phỏng không có cơ sở để nói λ thật là bao nhiêu**; chỉ chạy thật mới biết.");
  L.push("- Chi phí quy ước nhỏ (xu/ngày) vì nguồn AI miễn phí; chi phí thật chủ yếu là hosting/tunnel và THỜI GIAN của người vận hành (không được tính).");
  L.push("- Không tính: thuế, phí cổng thanh toán (Stripe ~2,9% + $0,30 — với giá $0,50 phí này **ăn gần hết doanh thu**; x402 phí rất thấp), hoàn tiền, gian lận, thay đổi điều khoản của nền tảng. Kịch bản lạc quan (λ = 0,6) là **trần tưởng tượng**, không phải mục tiêu.");
  L.push("");
  return L.join("\n");
}

const results: Result[] = [];
for (const limit of ASSUME.limits) for (const s of ASSUME.scenarios) results.push(await run(s.name, s.lambda, limit));
const md = report(results);
console.log(md);
if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, "docs", "economy-backtest.md"), `${md}\n`, "utf8");
  console.error("đã ghi docs/economy-backtest.md");
}
