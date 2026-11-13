#!/usr/bin/env node
/**
 * Emberfall demo v3 — clean UI shots, light theme, exactly 240s
 * UI frames composited with ffmpeg (no SVG image embedding — avoids broken tiles).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SLIDES = join(ROOT, "slides-v3");
const SHOTS = join(ROOT, "shots");
const OUT = join(ROOT, "out");
const BRAND = join(ROOT, "..", "web", "public", "brand", "emberfall-icon-1024.png");
const FF = "/opt/homebrew/bin/ffmpeg";

mkdirSync(SLIDES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;
const TOTAL = 240;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function dataUri(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
const icon = existsSync(BRAND) ? dataUri(BRAND) : "";

function textSvg({ kicker, titleLines, body = [], footer = "Team runtime-terror · NASA Space Apps 2026" }) {
  const titles = titleLines
    .map(
      (t, i) =>
        `<text x="120" y="${360 + i * 88}" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="78" font-weight="700">${esc(t)}</text>`
    )
    .join("\n");
  const bodies = body
    .map(
      (t, i) =>
        `<text x="120" y="${360 + titleLines.length * 88 + 40 + i * 42}" fill="#5A6470" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">${esc(t)}</text>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EC"/>
      <stop offset="50%" stop-color="#EEF4F8"/>
      <stop offset="100%" stop-color="#F3EBE3"/>
    </linearGradient>
    <radialGradient id="sun" cx="88%" cy="10%" r="40%">
      <stop offset="0%" stop-color="#FF8A5B" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#FF8A5B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  ${icon ? `<image href="${icon}" x="120" y="100" width="56" height="56"/>` : ""}
  <text x="192" y="128" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="700">Emberfall</text>
  <text x="192" y="152" fill="#6B7380" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="14">Flame in Freefall</text>
  ${kicker ? `<text x="120" y="280" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="3">${esc(kicker)}</text>` : ""}
  ${titles}
  ${bodies}
  <rect x="120" y="${360 + titleLines.length * 88 + body.length * 42 + 60}" width="180" height="6" rx="3" fill="#FF6B3D"/>
  <text x="120" y="1020" fill="#8A929C" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18">${esc(footer)}</text>
</svg>`;
}

function captionBarSvg(kicker, title) {
  // transparent except top bar area — we'll overlay on the UI frame
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="96" viewBox="0 0 ${W} 96">
  <rect width="${W}" height="96" fill="#F7F3EC"/>
  ${icon ? `<image href="${icon}" x="36" y="20" width="56" height="56"/>` : ""}
  <text x="108" y="44" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="700">Emberfall</text>
  <text x="108" y="68" fill="#6B7380" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="13">Flame in Freefall</text>
  <text x="420" y="40" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="14" font-weight="600" letter-spacing="2">${esc(kicker)}</text>
  <text x="420" y="70" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="24" font-weight="700">${esc(title)}</text>
</svg>`;
}

function writeSvgPng(name, svg) {
  const svgPath = join(SLIDES, `${name}.svg`);
  const pngPath = join(SLIDES, `${name}.png`);
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
  return pngPath;
}

function composeUiFrame({ name, shot, kicker, title }) {
  const shotPath = join(SHOTS, shot);
  if (!existsSync(shotPath)) throw new Error(`missing shot ${shotPath}`);

  const barSvg = join(SLIDES, `${name}-bar.svg`);
  const barPng = join(SLIDES, `${name}-bar.png`);
  writeFileSync(barSvg, captionBarSvg(kicker, title));
  execFileSync("rsvg-convert", ["-w", String(W), "-h", "96", "-o", barPng, barSvg]);

  const out = join(SLIDES, `${name}.png`);
  // light paper bg + caption + screenshot fitted with meet (letterbox, no crop/distort)
  // layout: bar 96px, then remaining 984px for UI with padding
  execFileSync(
    FF,
    [
      "-y",
      "-f", "lavfi", "-i", `color=c=0xF7F3EC:s=${W}x${H}:d=1`,
      "-i", barPng,
      "-i", shotPath,
      "-filter_complex",
      [
        // scale shot to fit inside 1840x920 box (meet), pad to center in content area
        `[2:v]scale=1840:920:force_original_aspect_ratio=decrease,pad=1840:920:(ow-iw)/2:(oh-ih)/2:color=0xF7F3EC,setsar=1[ui]`,
        `[0:v][1:v]overlay=0:0[withbar]`,
        `[withbar][ui]overlay=40:120`,
      ].join(";"),
      "-frames:v", "1",
      out,
    ],
    { stdio: "inherit" }
  );
  return out;
}

// ---- build frames ----
const sequence = [
  {
    file: "01-title",
    dur: 18,
    kind: "text",
    svg: textSvg({
      kicker: "NASA SPACE APPS 2026",
      titleLines: ["What NASA knows", "about fire in freefall."],
      body: ["1,334 NTRS reports · cited answers · mission risk briefings"],
    }),
  },
  {
    file: "02-problem",
    dur: 20,
    kind: "text",
    svg: textSvg({
      kicker: "THE PROBLEM",
      titleLines: ["Flames do not rise", "in space."],
      body: [
        "No buoyancy. Closed air. Nowhere to evacuate.",
        "Artemis: higher O2 at lower pressure — easier ignition.",
        "Seventy years of answers, scattered across a thousand reports.",
      ],
    }),
  },
  {
    file: "03-home",
    dur: 22,
    kind: "ui",
    shot: "home.png",
    kicker: "HOME",
    title: "One ask bar over the whole corpus",
  },
  {
    file: "04-ask",
    dur: 26,
    kind: "ui",
    shot: "ask.png",
    kicker: "ASK",
    title: "Cited answers — refuses when evidence is thin",
  },
  {
    file: "05-graph",
    dur: 22,
    kind: "ui",
    shot: "graph.png",
    kicker: "GRAPH",
    title: "Fuels, conditions, outcomes — connected",
  },
  {
    file: "06-insights",
    dur: 20,
    kind: "ui",
    shot: "insights.png",
    kicker: "INSIGHTS",
    title: "Where studies agree — and where they clash",
  },
  {
    file: "07-gaps",
    dur: 20,
    kind: "ui",
    shot: "gaps.png",
    kicker: "GAPS",
    title: "Thin cells = research priorities",
  },
  {
    file: "08-mission",
    dur: 26,
    kind: "ui",
    shot: "mission.png",
    kicker: "MISSION",
    title: "Artemis briefing — ranked risks + evidence",
  },
  {
    file: "09-explorer",
    dur: 22,
    kind: "ui",
    shot: "explorer.png",
    kicker: "EXPLORER",
    title: "Slide cabin O2 / pressure — predict flame regime",
  },
  {
    file: "10-trust",
    dur: 18,
    kind: "text",
    svg: textSvg({
      kicker: "TRUST",
      titleLines: ["Every sentence cited.", "No invented answers."],
      body: [
        "Quote guard · citation checks · live evaluation.",
        "Helps prioritize research — not a certified hazard analysis.",
      ],
    }),
  },
  {
    file: "11-who",
    dur: 14,
    kind: "text",
    svg: textSvg({
      kicker: "WHO IT IS FOR",
      titleLines: ["Same evidence.", "Four ways in."],
      body: [
        "Scientist · Manager · Architect · Student",
        "Ask · Graph · Gaps · Mission — framed for each job.",
      ],
    }),
  },
  {
    file: "12-close",
    dur: 12,
    kind: "text",
    svg: textSvg({
      kicker: "",
      titleLines: ["Cited knowledge.", "Mission-ready."],
      body: ["Emberfall · open source · NASA Space Apps 2026", "Team runtime-terror — thank you."],
    }),
  },
];

const sum = sequence.reduce((a, s) => a + s.dur, 0);
if (sum !== TOTAL) {
  // pad last slide
  const diff = TOTAL - sum;
  sequence[sequence.length - 1].dur += diff;
  console.log(`adjusted last slide by ${diff}s → ${TOTAL}s`);
}

console.log(`building ${sequence.length} slides · ${sequence.reduce((a, s) => a + s.dur, 0)}s`);

for (const s of sequence) {
  if (s.kind === "text") writeSvgPng(s.file, s.svg);
  else composeUiFrame({ name: s.file, shot: s.shot, kicker: s.kicker, title: s.title });
  console.log("frame", s.file, s.dur + "s");
}

const listPath = join(OUT, "concat-v3.txt");
const lines = sequence.map((s) => `file '${join(SLIDES, `${s.file}.png`)}'\nduration ${s.dur}`).join("\n");
const last = join(SLIDES, `${sequence[sequence.length - 1].file}.png`);
writeFileSync(listPath, lines + `\nfile '${last}'\n`);

const raw = join(OUT, "emberfall-v3-raw.mp4");
const final = join(OUT, "emberfall-demo-v3.mp4");

execFileSync(
  FF,
  [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    raw,
  ],
  { stdio: "inherit" }
);

execFileSync(FF, ["-y", "-i", raw, "-t", String(TOTAL), "-c", "copy", final], { stdio: "inherit" });
copyFileSync(final, join(OUT, "emberfall-demo-v2.mp4"));
copyFileSync(final, join(OUT, "emberfall-demo-240s.mp4"));

console.log("\nVIDEO:", final);
console.log("DURATION:", TOTAL, "seconds");
