/**
 * Kiểm tra cấu trúc HTML của DuckDuckGo (để sửa regex search).
 *
 * Chạy: npx tsx scripts/check-ddg.ts
 */
import { chromium } from "playwright-core";
import { findChrome } from "../src/server/browser/sandboxBrowser.js";

const browser = await chromium.launch({
  headless: true,
  executablePath: findChrome(),
});
const ctx = await browser.newContext({ locale: "vi-VN" });
const page = await ctx.newPage();
await page.goto("https://duckduckgo.com/html/?q=TypeScript%20best%20practices", {
  waitUntil: "domcontentloaded",
  timeout: 25_000,
});
await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
console.log("URL sau khi điều hướng:", page.url());

const body = await page.evaluate(() => document.body?.innerText ?? "");
console.log("--- innerText (600 ký tự đầu) ---");
console.log(body.slice(0, 600));

const anchors = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a"))
    .slice(0, 25)
    .map((a) => ({
      cls: (a as HTMLAnchorElement).className,
      href: (a as HTMLAnchorElement).href.slice(0, 100),
      text: (a.textContent ?? "").trim().slice(0, 50),
    })),
);
console.log("--- anchors ---");
for (const a of anchors) console.log(JSON.stringify(a));

await browser.close();
