#!/usr/bin/env node
/**
 * Emberfall explainer slides — no system screenshots, light theme, 240s
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SLIDES = join(ROOT, "slides-explain");
const OUT = join(ROOT, "out");
const BRAND = join(ROOT, "..", "web", "public", "brand", "emberfall-icon-1024.png");
const FF = "/opt/homebrew/bin/ffmpeg";
const W = 1920;
const H = 1080;
const TOTAL = 240;

mkdirSync(SLIDES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const icon = existsSync(BRAND)
  ? `data:image/png;base64,${readFileSync(BRAND).toString("base64")}`
  : "";

function shell({ kicker, title, lines = [], bullets = [], stats = null, footer = "Emberfall · NASA Space Apps 2026 · Team runtime-terror", accent = true }) {
  const titleLines = Array.isArray(title) ? title : [title];
  let y = 300;
  const titleSvg = titleLines
    .map((t, i) => {
      const el = `<text x="120" y="${y + i * 78}" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="68" font-weight="700">${esc(t)}</text>`;
      return el;
    })
    .join("\n");
  y += titleLines.length * 78 + 36;

  const lineSvg = lines
    .map((t) => {
      const el = `<text x="120" y="${y}" fill="#4A5560" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">${esc(t)}</text>`;
      y += 44;
      return el;
    })
    .join("\n");
  y += 20;

  const bulletSvg = bullets
    .map((t) => {
      const el = `
      <circle cx="136" cy="${y - 8}" r="6" fill="#FF6B3D"/>
      <text x="160" y="${y}" fill="#1A2430" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="26">${esc(t)}</text>`;
      y += 48;
      return el;
    })
    .join("\n");

  let statsSvg = "";
  if (stats) {
    const startY = Math.max(y + 20, 560);
    statsSvg = stats
      .map((s, i) => {
        const x = 120 + (i % 3) * 560;
        const yy = startY + Math.floor(i / 3) * 160;
        return `
        <rect x="${x}" y="${yy}" width="520" height="130" rx="24" fill="#FFFFFF" stroke="#E2E8F0"/>
        <text x="${x + 36}" y="${yy + 62}" fill="#FF6B3D" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="42" font-weight="700">${esc(s.v)}</text>
        <text x="${x + 36}" y="${yy + 100}" fill="#5A6470" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="22">${esc(s.l)}</text>`;
      })
      .join("");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EC"/>
      <stop offset="48%" stop-color="#EEF4F8"/>
      <stop offset="100%" stop-color="#F4EBE4"/>
    </linearGradient>
    <radialGradient id="sun" cx="90%" cy="8%" r="42%">
      <stop offset="0%" stop-color="#FF8A5B" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FF8A5B" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sky" cx="8%" cy="92%" r="36%">
      <stop offset="0%" stop-color="#7EB8E8" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#7EB8E8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g opacity="0.06" stroke="#1A2430" stroke-width="1">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${100 + i * 90}" y1="0" x2="${100 + i * 90}" y2="${H}"/>`).join("")}
  </g>
  ${icon ? `<image href="${icon}" x="120" y="72" width="56" height="56"/>` : `<circle cx="148" cy="100" r="28" fill="#FF6B3D"/>`}
  <text x="192" y="100" fill="#121820" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="700">Emberfall</text>
  <text x="192" y="124" fill="#6B7380" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="14">Flame in Freefall</text>
  ${kicker ? `<text x="120" y="230" fill="#C45C2A" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="3">${esc(kicker)}</text>` : ""}
  ${titleSvg}
  ${lineSvg}
  ${bulletSvg}
  ${statsSvg}
  ${accent ? `<rect x="120" y="980" width="160" height="5" rx="2.5" fill="#FF6B3D"/>` : ""}
  <text x="120" y="1035" fill="#8A929C" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18">${esc(footer)}</text>
</svg>`;
}

const slides = [
  {
    file: "01-title",
    dur: 18,
    ...{
      kicker: "NASA SPACE APPS 2026",
      title: ["What NASA knows", "about fire in freefall."],
      lines: ["A cited, mission-aware knowledge engine over decades of research."],
    },
  },
  {
    file: "02-problem",
    dur: 22,
    ...{
      kicker: "THE PROBLEM",
      title: ["Flames do not rise", "in space."],
      bullets: [
        "No buoyancy — slow, nearly invisible spherical flames",
        "Closed cabin air · nowhere to evacuate",
        "Artemis: higher O₂ at lower pressure → easier ignition",
        "Findings exist — but scattered across 1,000+ reports",
      ],
    },
  },
  {
    file: "03-question",
    dur: 18,
    ...{
      kicker: "ONE QUESTION",
      title: ["What do we know,", "how sure are we,", "and where are the gaps?"],
      lines: ["Emberfall answers that for spacecraft fire safety."],
    },
  },
  {
    file: "04-scale",
    dur: 22,
    ...{
      kicker: "THE CORPUS",
      title: ["Seventy years.", "One index."],
      stats: [
        { v: "1,334", l: "NASA NTRS reports" },
        { v: "20,145", l: "Indexed passages" },
        { v: "1,812", l: "Quote-verified findings" },
        { v: "58", l: "Open contradictions" },
        { v: "1955–2026", l: "Literature span" },
        { v: "100%", l: "Citation validity (eval)" },
      ],
    },
  },
  {
    file: "05-how",
    dur: 22,
    ...{
      kicker: "HOW IT WORKS",
      title: ["Ingest. Guard. Structure.", "Then answer."],
      bullets: [
        "Pull full text from NASA Technical Reports Server",
        "Chunk into searchable passages",
        "Extract findings — only if they appear verbatim (quote guard)",
        "Build ontology, graph, gaps, trends, and mission risks",
      ],
    },
  },
  {
    file: "06-ask",
    dur: 22,
    ...{
      kicker: "ASK",
      title: ["Cited answers.", "Not vibes."],
      bullets: [
        "Streamed Q&A over the whole corpus",
        "Every sentence points to a real passage",
        "Personas: scientist, manager, architect, student",
        "Refuses when evidence is thin or off-topic",
      ],
    },
  },
  {
    file: "07-graph",
    dur: 18,
    ...{
      kicker: "GRAPH",
      title: ["See how the", "literature connects."],
      bullets: [
        "Fuels · conditions · geometries · outcomes · countermeasures",
        "Links ranked by how many reports support them",
        "Explore paths — not just keyword hits",
      ],
    },
  },
  {
    file: "08-gaps",
    dur: 20,
    ...{
      kicker: "GAPS & CONFLICTS",
      title: ["Where studies clash.", "Where evidence is thin."],
      bullets: [
        "Agree & Disagree surfaces real contradictions vs setup differences",
        "Gap matrix: fuel × condition cells that still need tests",
        "Hypotheses suggest the next literature-backed question",
      ],
    },
  },
  {
    file: "09-mission",
    dur: 24,
    ...{
      kicker: "MISSION",
      title: ["Pick a habitat.", "Get a fire-risk briefing."],
      bullets: [
        "ISS · Artemis · Mars · or a custom O₂ / pressure profile",
        "13 NASA-style risks ranked by priority",
        "Evidence strength, quotes, conflicts, untested conditions",
        "Exportable as PDF for the design conversation",
      ],
    },
  },
  {
    file: "10-trust",
    dur: 20,
    ...{
      kicker: "TRUST",
      title: ["Every claim checked.", "Silence over invention."],
      bullets: [
        "Quote guard discards non-verbatim findings",
        "Live evaluation: citations, refusals, faithfulness",
        "Helps prioritize research — not a certified hazard analysis",
      ],
    },
  },
  {
    file: "11-who",
    dur: 16,
    ...{
      kicker: "WHO IT IS FOR",
      title: ["Same evidence.", "Four ways in."],
      bullets: [
        "Scientist → Ask + Graph + Hypotheses",
        "Safety manager → Gaps + Trends",
        "Habitat architect → Mission briefing",
        "Student / public → Glossary + plain language",
      ],
    },
  },
  {
    file: "12-close",
    dur: 18,
    ...{
      kicker: "",
      title: ["Cited knowledge.", "Mission-ready."],
      lines: [
        "Emberfall — Flame in Freefall",
        "Team runtime-terror · NASA Space Apps 2026",
        "Thank you.",
      ],
    },
  },
];

let sum = slides.reduce((a, s) => a + s.dur, 0);
if (sum !== TOTAL) {
  slides[slides.length - 1].dur += TOTAL - sum;
  console.log(`adjusted last slide → ${TOTAL}s`);
}

console.log(`building ${slides.length} slides · ${slides.reduce((a, s) => a + s.dur, 0)}s`);

for (const s of slides) {
  const { file, dur, ...content } = s;
  const svg = shell(content);
  const svgPath = join(SLIDES, `${file}.svg`);
  const pngPath = join(SLIDES, `${file}.png`);
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
  console.log("wrote", file, dur + "s");
}

const listPath = join(OUT, "concat-explain.txt");
const lines = slides.map((s) => `file '${join(SLIDES, `${s.file}.png`)}'\nduration ${s.dur}`).join("\n");
const last = join(SLIDES, `${slides[slides.length - 1].file}.png`);
writeFileSync(listPath, lines + `\nfile '${last}'\n`);

const raw = join(OUT, "emberfall-explain-raw.mp4");
const final = join(OUT, "emberfall-explain-240s.mp4");

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
copyFileSync(final, join(OUT, "emberfall-demo-240s.mp4"));

console.log("\nVIDEO:", final);
console.log("SLIDES:", SLIDES);
console.log("DURATION:", TOTAL, "s");
