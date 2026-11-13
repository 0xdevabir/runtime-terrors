#!/usr/bin/env node
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.on("response", (r) => {
  if (r.url().includes("/api/")) console.log("RESP", r.status(), r.url().slice(0, 140));
});

const q = encodeURIComponent("How does flame spread change in microgravity?");
await page.goto("http://127.0.0.1:3000/ask?q=" + q, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem("sbke.theme", "light");
  document.documentElement.setAttribute("data-theme", "light");
  [...document.querySelectorAll('[role="tab"],button')].find((e) => e.textContent?.trim() === "Light")?.click();
});

for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      len: t.length,
      hasAnswer: /Answer\s*·|High confidence|Extractive|citations verified/i.test(t),
      hasRetrieving: /retriev|stream|thinking/i.test(t),
      snippet: t.replace(/\n+/g, " | ").slice(200, 500),
    };
  });
  console.log(i, info);
  if (info.hasAnswer) break;
}

await page.screenshot({
  path: "/Users/mdabirhossain/Documents/WebDevelopment/runtime-terror/demo-video/shots/ask.png",
  fullPage: false,
});
console.log("shot saved");
await browser.close();
