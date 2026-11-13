#!/usr/bin/env node
import puppeteer from "puppeteer-core";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "shots", "ask.png");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--window-size=1920,1080","--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => { localStorage.setItem("sbke.theme","light"); document.documentElement.setAttribute("data-theme","light"); });
const q = encodeURIComponent("How does flame spread change in microgravity?");
await page.goto("http://127.0.0.1:3000/ask?q="+q, { waitUntil: "networkidle2", timeout: 90000 });
await page.evaluate(() => { localStorage.setItem("sbke.theme","light"); document.documentElement.setAttribute("data-theme","light"); });
await page.addStyleTag({ content: `nextjs-portal,[data-nextjs-toast]{display:none!important}` });
// wait until answer text appears
for (let i = 0; i < 40; i++) {
  const ready = await page.evaluate(() => /Answer|sources|High confidence|microgravity/i.test(document.body.innerText) && document.body.innerText.length > 800);
  if (ready) break;
  await new Promise(r => setTimeout(r, 1000));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: OUT, type: "png" });
console.log("saved", OUT, "len", (await page.evaluate(() => document.body.innerText.length)));
await browser.close();
