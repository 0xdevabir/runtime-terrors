#!/usr/bin/env node
import puppeteer from "puppeteer-core";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--window-size=1920,1080", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const prep = async () => {
  await page.evaluate(() => {
    localStorage.setItem("sbke.theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.addStyleTag({
    content: `nextjs-portal,[data-nextjs-toast]{display:none!important}`,
  }).catch(() => {});
};

// GRAPH — wait until Drawing gone AND canvas has drawn (non-tiny)
console.log("→ graph");
await page.goto(BASE + "/graph", { waitUntil: "networkidle2", timeout: 90000 });
await prep();
await page.evaluate(() => {
  [...document.querySelectorAll('[role="tab"],button')].find((e) => e.textContent?.trim() === "Web")?.click();
});
for (let i = 0; i < 90; i++) {
  const st = await page.evaluate(() => {
    const drawing = /Drawing the map/i.test(document.body.innerText || "");
    const canvas = document.querySelector("canvas");
    const pixels = canvas ? canvas.width * canvas.height : 0;
    return { drawing, pixels, w: canvas?.width || 0, h: canvas?.height || 0 };
  });
  console.log(i, st);
  if (!st.drawing && st.pixels > 100000) break;
  await sleep(500);
}
await sleep(2000);
await page.screenshot({ path: join(OUT, "graph.png") });

// MISSION via direct API path in UI — click Artemis and wait for risk cards
console.log("→ mission");
await page.goto(BASE + "/mission", { waitUntil: "networkidle2", timeout: 90000 });
await prep();
await sleep(1000);
// try clicking Artemis; also prefetch
await page.evaluate(async () => {
  try {
    await fetch("/api/mission/artemis").then((r) => r.json());
  } catch {}
  [...document.querySelectorAll('[role="tab"],button')]
    .find((e) => e.textContent?.trim() === "Artemis")
    ?.click();
});
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return {
      hasRisk: /Fire suppression|Flame spread|High priority|Strong evidence|Priority/i.test(t),
      snip: t.replace(/\n+/g, " | ").slice(200, 400),
    };
  });
  console.log(i, st.hasRisk, st.snip.slice(0, 120));
  if (st.hasRisk) break;
  await sleep(500);
}
await sleep(1500);
await page.screenshot({ path: join(OUT, "mission.png") });

// ASK — navigate without q, then set location with q after mount settle
console.log("→ ask");
await page.goto(BASE + "/ask", { waitUntil: "networkidle2", timeout: 90000 });
await prep();
await sleep(1500);
await page.evaluate(() => {
  // use Next router if available
  const q = encodeURIComponent("How does flame spread change in microgravity?");
  window.history.pushState({}, "", "/ask?q=" + q);
  window.dispatchEvent(new PopStateEvent("popstate"));
});
// Next app router may ignore popstate — hard navigate as fallback after short wait
await sleep(2000);
const has = await page.evaluate(() => /High confidence|Answer\s*·/i.test(document.body.innerText || ""));
if (!has) {
  await page.goto(BASE + "/ask?q=" + encodeURIComponent("How does flame spread change in microgravity?"), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await prep();
  for (let i = 0; i < 80; i++) {
    const ok = await page.evaluate(() => /High confidence|citations verified|Answer\s*·\s*\d+/i.test(document.body.innerText || ""));
    console.log("ask", i, ok);
    if (ok) break;
    await sleep(500);
  }
}
await sleep(2000);
await page.screenshot({ path: join(OUT, "ask.png") });

await browser.close();
console.log("done");
