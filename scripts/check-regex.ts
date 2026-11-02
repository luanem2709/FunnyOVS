/**
 * Kiểm tra regex bóc link kết quả tìm kiếm (đọc HTML thật của DDG lite).
 *
 * Chạy: npx tsx scripts/check-regex.ts
 */
import { chromium } from "playwright-core";
import { findChrome, decodeDdgHref } from "../src/server/browser/sandboxBrowser.js";

const browser = await chromium.launch({ headless: true, executablePath: findChrome() });
const ctx = await browser.newContext({
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
await page.goto("https://lite.duckduckgo.com/lite/?q=TypeScript%20best%20practices", {
  waitUntil: "domcontentloaded",
  timeout: 25_000,
});
await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
const html = await page.content();

const re = /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
let m: RegExpExecArray | null;
let n = 0;
while ((m = re.exec(html)) !== null && n < 5) {
  n++;
  console.log("href:", m[1].slice(0, 90));
  console.log("  -> decoded:", decodeDdgHref(m[1]));
  console.log("  title:", m[2].replace(/<[^>]+>/g, "").trim().slice(0, 70));
}
console.log("Tổng khớp:", n);

// Cũng thử: tìm mọi thẻ a có class chứa "result"
const samples = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a"))
    .filter((a) => (a as HTMLAnchorElement).className.includes("result"))
    .slice(0, 3)
    .map((a) => a.outerHTML.slice(0, 300)),
);
console.log("--- outerHTML mẫu ---");
for (const s of samples) console.log(s);

await browser.close();
