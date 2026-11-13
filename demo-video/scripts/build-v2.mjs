#!/usr/bin/env node
/**
 * Emberfall demo v2 — light theme, real UI shots, ~150s
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SLIDES = join(ROOT, "slides-v2");
const SHOTS = join(ROOT, "shots");
const OUT = join(ROOT, "out");
const BRAND = join(ROOT, "..", "web", "public", "brand", "emberfall-icon-1024.png");

mkdirSync(SLIDES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function dataUri(path) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

const icon = existsSync(BRAND) ? dataUri(BRAND) : "";

function bg() {
  return `
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EC"/>
      <stop offset="45%" stop-color="#EEF4F8"/>
      <stop offset="100%" stop-color="#F3EBE3"/>
    </linearGradient>
    <radialGradient id="sun" cx="88%" cy="8%" r="42%">
      <stop offset="0%" stop-color="#FF8A5B" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FF8A5B" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sky" cx="12%" cy="90%" r="38%">
      <stop offset="0%" stop-color="#7EB8E8" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7EB8E8" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="18" stdDeviation="28" flood-color="#1A2430" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <!-- subtle grid -->
  <g opacity="0.07" stroke="#1A2430" stroke-width="1">
    ${Array.from({ length: 24 }, (_, i) => `<line x1="${80 + i * 80}" y1="0" x2="${80 + i * 80}" y2="${H}"/>`).join("")}
  </g>`;
}

function brandMark(x = 72, y = 48) {
  return `
  ${icon ? `<image href="${icon}" x="${x}" y="${y}" width="56" height="56"/>` : ""}
  <text x="${x + 72}" y="${y + 28}" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="700">Emberfall</text>
  <text x="${x + 72}" y="${y + 50}" fill="#6B7380" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="14">Flame in Freefall</text>`;
}

function shotFrame(src, { x = 120, y = 160, w = 1680, h = 820, label = "", kicker = "" } = {}) {
  const img = dataUri(src);
  // screen aspect ~16:9 inside rounded device
  return `
  ${kicker ? `<text x="${x}" y="${y - 28}" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="2">${esc(kicker)}</text>` : ""}
  ${label ? `<text x="${x + (kicker ? 0 : 0)}" y="${y - 28}" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="34" font-weight="700" ${kicker ? `dx="220"` : ""}>${esc(label)}</text>` : ""}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#FFFFFF" filter="url(#soft)"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="none" stroke="#D8DEE6" stroke-width="1.5"/>
  <clipPath id="clip${Math.abs(hash(src))}">
    <rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" rx="20"/>
  </clipPath>
  <image href="${img}" x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip${Math.abs(hash(src))})"/>`;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function titleSlide() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg()}
  ${brandMark(120, 120)}
  <text x="120" y="420" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="92" font-weight="700">What NASA knows</text>
  <text x="120" y="520" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="92" font-weight="700">about fire in freefall.</text>
  <text x="120" y="610" fill="#5A6470" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="30">1,334 NTRS reports · cited answers · mission risk briefings</text>
  <rect x="120" y="680" width="220" height="6" rx="3" fill="#FF6B3D"/>
  <text x="120" y="980" fill="#8A929C" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18">Team runtime-terror · NASA Space Apps 2026</text>
</svg>`;
}

function problemSlide() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg()}
  ${brandMark()}
  <text x="120" y="220" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="3">THE PROBLEM</text>
  <text x="120" y="320" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="64" font-weight="700">Flames do not rise</text>
  <text x="120" y="400" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="64" font-weight="700">in space.</text>
  <text x="120" y="500" fill="#4A5560" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">No buoyancy. Closed air. Nowhere to evacuate.</text>
  <text x="120" y="550" fill="#4A5560" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">Artemis adds higher O2 at lower pressure — easier ignition.</text>
  <text x="120" y="640" fill="#4A5560" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">Seventy years of answers are scattered across a thousand reports.</text>
  <g>
    ${["No buoyancy", "Closed loop", "Artemis O2"].map((t, i) => `
      <rect x="${120 + i * 280}" y="740" width="250" height="56" rx="28" fill="#FFFFFF" stroke="#D8DEE6"/>
      <text x="${245 + i * 280}" y="775" text-anchor="middle" fill="#121820" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="20" font-weight="600">${t}</text>`).join("")}
  </g>
</svg>`;
}

function uiSlide({ shot, kicker, title, durationNote }) {
  // title strip above full-bleed UI
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg()}
  ${brandMark(64, 28)}
  <text x="520" y="58" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="2">${esc(kicker)}</text>
  <text x="520" y="88" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="700">${esc(title)}</text>
  ${shotFrame(shot, { x: 64, y: 120, w: 1792, h: 900 })}
</svg>`;
}

function closeSlide() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg()}
  ${brandMark(120, 160)}
  <text x="120" y="420" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="80" font-weight="700">Cited knowledge.</text>
  <text x="120" y="510" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="80" font-weight="700">Mission-ready.</text>
  <text x="120" y="600" fill="#5A6470" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">Emberfall · open source · NASA Space Apps 2026</text>
  <rect x="120" y="660" width="180" height="6" rx="3" fill="#FF6B3D"/>
  <text x="120" y="980" fill="#8A929C" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="20">Team runtime-terror · thank you</text>
</svg>`;
}

const sequence = [
  { file: "01-title", dur: 10, svg: titleSlide() },
  { file: "02-problem", dur: 12, svg: problemSlide() },
  {
    file: "03-home",
    dur: 14,
    svg: uiSlide({
      shot: join(SHOTS, "home.png"),
      kicker: "SYSTEM",
      title: "Home — ask the corpus in one bar",
    }),
  },
  {
    file: "04-ask",
    dur: 16,
    svg: uiSlide({
      shot: join(SHOTS, "ask.png"),
      kicker: "ASK",
      title: "Cited answers · quote-backed · refuses when thin",
    }),
  },
  {
    file: "05-graph",
    dur: 14,
    svg: uiSlide({
      shot: join(SHOTS, "graph.png"),
      kicker: "GRAPH",
      title: "Fuels, conditions, outcomes — connected",
    }),
  },
  {
    file: "06-insights",
    dur: 13,
    svg: uiSlide({
      shot: join(SHOTS, "insights.png"),
      kicker: "INSIGHTS",
      title: "Where studies agree — and where they clash",
    }),
  },
  {
    file: "07-gaps",
    dur: 13,
    svg: uiSlide({
      shot: join(SHOTS, "gaps.png"),
      kicker: "GAPS",
      title: "Evidence matrix — thin cells = research priority",
    }),
  },
  {
    file: "08-mission",
    dur: 16,
    svg: uiSlide({
      shot: join(SHOTS, "mission.png"),
      kicker: "MISSION",
      title: "Artemis briefing — ranked fire risks + evidence",
    }),
  },
  {
    file: "09-explorer",
    dur: 14,
    svg: uiSlide({
      shot: join(SHOTS, "explorer.png"),
      kicker: "EXPLORER",
      title: "Slide cabin O2 / pressure — predict flame regime",
    }),
  },
  { file: "10-close", dur: 10, svg: closeSlide() },
];

const total = sequence.reduce((a, s) => a + s.dur, 0);
console.log(`building ${sequence.length} slides · ${total}s`);

for (const s of sequence) {
  const svgPath = join(SLIDES, `${s.file}.svg`);
  const pngPath = join(SLIDES, `${s.file}.png`);
  writeFileSync(svgPath, s.svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
  console.log("wrote", pngPath);
}

// concat with per-slide durations + light zoom via zoompan for UI slides
const listPath = join(OUT, "concat-v2.txt");
const lines = sequence.map((s) => `file '${join(SLIDES, `${s.file}.png`)}'\nduration ${s.dur}`).join("\n");
const last = join(SLIDES, `${sequence[sequence.length - 1].file}.png`);
writeFileSync(listPath, lines + `\nfile '${last}'\n`);

const raw = join(OUT, "emberfall-v2-raw.mp4");
const final = join(OUT, "emberfall-demo-v2.mp4");

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    raw,
  ],
  { stdio: "inherit" }
);

// trim to exact total (concat adds trailing frame)
execFileSync(
  "ffmpeg",
  ["-y", "-i", raw, "-t", String(total), "-c", "copy", final],
  { stdio: "inherit" }
);

// also overwrite the main demo path so the known location stays current
copyFileSync(final, join(OUT, "emberfall-demo-240s.mp4"));

console.log("\nVIDEO:", final);
console.log("DURATION:", total, "seconds");
console.log("Also copied → out/emberfall-demo-240s.mp4");
