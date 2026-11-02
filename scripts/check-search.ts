/**
 * Thử nhiều engine tìm kiếm không cần API key để xem cái nào dùng được.
 *
 * Chạy: npx tsx scripts/check-search.ts
 */
import { chromium } from "playwright-core";
import { findChrome } from "../src/server/browser/sandboxBrowser.js";

const ENGINES: Array<{ name: string; url: string }> = [
  { name: "mojeek", url: "https://www.mojeek.com/search?q=TypeScript+best+practices" },
  { name: "lite-ddg", url: "https://lite.duckduckgo.com/lite/?q=TypeScript+best+practices" },
  { name: "bing", url: "https://www.bing.com/search?q=TypeScript+best+practices" },
  { name: "startpage", url: "https://www.startpage.com/sp/search?query=TypeScript+best+practices" },
  { name: "wikipedia", url: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=TypeScript&format=json" },
  { name: "stackexchange", url: "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=typescript&site=stackoverflow" },
];

const browser = await chromium.launch({ headless: true, executablePath: findChrome() });
const ctx = await browser.newContext({
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});

for (const e of ENGINES) {
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(e.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const status = resp?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    const anchors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({ cls: (a as HTMLAnchorElement).className, href: (a as HTMLAnchorElement).href }))
        .filter((a) => a.href.startsWith("http"))
        .slice(0, 4),
    );
    console.log(`\n=== ${e.name} [${status}] len=${text.length}`);
    console.log("text:", text.slice(0, 220).replace(/\n+/g, " | "));
    console.log("anchors:", JSON.stringify(anchors.slice(0, 4)));
  } catch (err) {
    console.log(`\n=== ${e.name} LỖI: ${(err as Error).message.slice(0, 120)}`);
  }
  await page.close();
}

await browser.close();
