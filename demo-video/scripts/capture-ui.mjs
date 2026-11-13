#!/usr/bin/env node
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "shots");
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prep(page) {
  await page.evaluate(() => {
    localStorage.setItem("sbke.theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.addStyleTag({
    content: `nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay]{display:none!important}`,
  }).catch(() => {});
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log("  saved", file);
}

async function waitBody(page, re, ms = 45000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const ok = await page.evaluate((p) => new RegExp(p, "i").test(document.body.innerText || ""), re.source);
      if (ok) return true;
    } catch {
      await sleep(500);
      continue;
    }
    await sleep(400);
  }
  console.log("  timeout", re);
  return false;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--window-size=1920,1080", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

const pages = [
  {
    name: "home",
    url: "/",
    ready: /1,?334|NASA reports|Explore/,
    wait: 1000,
  },
  {
    name: "ask",
    url: "/ask?q=" + encodeURIComponent("How does flame spread change in microgravity?"),
    ready: /High confidence|citations verified|Answer\s*·\s*\d+\s*sources|Extractive/,
    wait: 2500,
    timeout: 90000,
    // if answer never lands, still save whatever is on screen (Intro is ok fallback)
    optional: true,
  },
  {
    name: "graph",
    url: "/graph",
    before: async () => {
      await page.evaluate(() => {
        [...document.querySelectorAll('[role="tab"],button')]
          .find((e) => e.textContent?.trim() === "Web")
          ?.click();
      });
    },
    ready: /raises|lowers|Hover a dot/,
    afterReady: async () => {
      for (let i = 0; i < 50; i++) {
        const drawing = await page.evaluate(() => /Drawing the map/i.test(document.body.innerText || ""));
        if (!drawing) break;
        await sleep(400);
      }
      await sleep(2000);
    },
    wait: 500,
    timeout: 70000,
  },
  {
    name: "insights",
    url: "/insights",
    ready: /Conflicts|Consensus|papers/,
    wait: 1000,
  },
  {
    name: "gaps",
    url: "/gaps",
    ready: /Evidence Gaps|untested|thin|Fuels/,
    wait: 1000,
  },
  {
    name: "mission",
    url: "/mission",
    before: async () => {
      await sleep(600);
      await page.evaluate(() => {
        [...document.querySelectorAll('[role="tab"],button')]
          .find((e) => e.textContent?.trim() === "Artemis")
          ?.click();
      });
    },
    ready: /Fire suppression|Flame spread over cabin|Strong evidence|High priority/,
    wait: 1200,
    timeout: 70000,
  },
  {
    name: "explorer",
    url: "/explorer",
    before: async () => {
      await sleep(800);
      await page.evaluate(() => {
        [...document.querySelectorAll("button")]
          .find((e) => /Artemis/i.test(e.textContent || ""))
          ?.click();
      });
    },
    ready: /34\s*%|56\.5|Nearest published|predicts/,
    wait: 1200,
    timeout: 50000,
  },
];

for (const p of pages) {
  console.log("→", p.name);
  await page.goto(BASE + p.url, { waitUntil: "networkidle2", timeout: 90000 }).catch(() =>
    page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 60000 })
  );
  await prep(page);
  if (p.before) await p.before();
  const ok = await waitBody(page, p.ready, p.timeout ?? 45000);
  console.log("  ready:", ok);
  if (p.afterReady) await p.afterReady();
  await sleep(p.wait ?? 800);
  await shot(page, p.name);
}

await browser.close();
console.log("done");
