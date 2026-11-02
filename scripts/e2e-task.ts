/**
 * Kiểm thử chuỗi đầu-cuối (GĐ 1.4):
 *   giao việc → Cursor CLI (`cursor agent -p`) → kết quả → nhật ký token thật
 *
 * Chạy: npx tsx scripts/e2e-task.ts
 *
 * Ghi chú an toàn:
 *  - Prompt ngắn, chỉ đọc trong sandbox `.data/workspace`.
 *  - Không chạm vào Cấp 3, không đọc file ngoài dự án.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.OFFICE_URL ?? "http://127.0.0.1:8787";

async function main(): Promise<void> {
  const before = await (await fetch(`${BASE}/api/budget/ledger?limit=1`)).json();
  const beforeTotals = before.totals;

  const prompt =
    "Trong thư mục làm việc hiện tại, hãy liệt kê các tệp có mặt (tối đa 5 tên tệp) " +
    "rồi trả lời đúng một dòng bắt đầu bằng 'OK:' kèm số tệp đã thấy.";

  console.log("→ Gửi tác vụ…");
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Kiểm thử chuỗi đầu-cuối",
      prompt,
      agentId: "minh",
      department: "dispatch",
    }),
  });
  let task: any = await res.json();
  console.log("  trạng thái ban đầu:", task.status, task.id ?? "");

  if (task.status === "awaiting-approval") {
    console.log("  → cần duyệt, tự duyệt để kiểm thử.");
    const appr = await (
      await fetch(`${BASE}/api/tasks/${task.id}/approve`, { method: "POST" })
    ).json();
    task = appr;
  }

  // Chờ tối đa 6 phút (lượt CLI thật có thể 4–5 phút).
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${BASE}/api/tasks`)).json();
    const cur = list.find((t: any) => t.id === task.id) ?? task;
    task = cur;
    if (cur.status === "done" || cur.status === "failed" || cur.status === "rejected") break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n== Kết quả tác vụ ==");
  console.log("  status      :", task.status);
  console.log("  backend     :", task.backend);
  console.log("  model       :", task.model);
  console.log("  tokens      :", task.tokens);
  console.log("  costCents   :", task.costCents);
  console.log("  quotaSource :", task.quotaSource);
  console.log("  result      :", String(task.result ?? task.error ?? "").slice(0, 400));

  const after = await (await fetch(`${BASE}/api/budget/ledger?limit=3`)).json();
  console.log("\n== Nhật ký token thật ==");
  console.log("  trước:", JSON.stringify(beforeTotals));
  console.log("  sau  :", JSON.stringify(after.totals));
  console.log("  dòng mới nhất:", JSON.stringify(after.entries[0] ?? null, null, 2));

  // Ghi log cục bộ để đối chiếu.
  const logDir = path.resolve("docs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "e2e-task-last.json");
  fs.writeFileSync(
    logFile,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        task: {
          id: task.id,
          status: task.status,
          backend: task.backend,
          model: task.model,
          tokens: task.tokens,
          quotaSource: task.quotaSource,
          result: String(task.result ?? "").slice(0, 1000),
          error: task.error,
        },
        totalsBefore: beforeTotals,
        totalsAfter: after.totals,
        ledgerHead: after.entries[0] ?? null,
      },
      null,
      2,
    ),
  );
  console.log(`\n→ ghi ${path.relative(process.cwd(), logFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
