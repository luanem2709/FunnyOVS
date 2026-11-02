/**
 * Kiểm tra chính sách trình duyệt sau khi GĐ 2 — không chặn nhầm site thật.
 * Chạy: npx tsx scripts/check-browser-policy.ts
 */
import { evaluateUrl, DEFAULT_POLICY } from "../src/server/browser/policy.js";

const MUST_ALLOW = [
  "https://example.com/",
  "https://lite.duckduckgo.com/lite/?q=test",
  "https://vi.wikipedia.org/wiki/Vi%E1%BB%87t_Nam",
  "https://newsroom.vn/",
  "https://techcrunch.com/",
];

const MUST_BLOCK = [
  "http://localhost:8787/api/state",
  "http://127.0.0.1/",
  "http://169.254.169.254/latest/meta-data/",
  "http://metadata.google.internal/",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://172.16.0.1/",
  "http://2130706433/",
  "http://0x7f000001/",
  "http://127.1/",
  "http://[::1]/",
  "file:///C:/Windows/System32/config/SAM",
  "javascript:alert(1)",
  "data:text/html,<script>x</script>",
  "https://accounts.google.com/signin",
  "https://checkout.stripe.com/pay",
  "http://printer.local/",
  "http://db.internal/",
];

let bad = 0;
for (const u of MUST_ALLOW) {
  const r = evaluateUrl(u, DEFAULT_POLICY);
  if (!r.allowed) {
    bad++;
    console.log(`SAI (chặn nhầm) ${u} → ${r.reason}`);
  }
}
for (const u of MUST_BLOCK) {
  const r = evaluateUrl(u, DEFAULT_POLICY);
  if (r.allowed) {
    bad++;
    console.log(`SAI (lọt) ${u}`);
  }
}
console.log(bad === 0 ? "OK — chính sách đúng như mong đợi." : `CÓ ${bad} sai.`);
process.exit(bad === 0 ? 0 : 1);
