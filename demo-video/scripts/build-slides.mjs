#!/usr/bin/env node
/**
 * Emberfall Space Apps demo — 12 SVG slides → PNG (via rsvg-convert) → 240s MP4
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SLIDES = join(ROOT, "slides");
const OUT = join(ROOT, "out");
const BRAND = join(ROOT, "..", "web", "public", "brand", "emberfall-icon-1024.png");

mkdirSync(SLIDES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;
let iconHref = "";
if (existsSync(BRAND)) {
  const b64 = readFileSync(BRAND).toString("base64");
  iconHref = `data:image/png;base64,${b64}`;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function wrap(lines, max = 42) {
  const out = [];
  for (const line of lines) {
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    const words = line.split(" ");
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > max) {
        out.push(cur.trim());
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) out.push(cur.trim());
  }
  return out;
}

function shell({ title, subtitle, body = [], chips = [], mock = null, stats = null, footer = "Emberfall · NASA Space Apps 2026 · Team runtime-terror" }) {
  const titleLines = wrap([title], 36);
  const subLines = wrap([subtitle], 58);
  let y = 220;
  const titleSvg = titleLines
    .map((t, i) => {
      const el = `<text x="120" y="${y + i * 72}" fill="#F4F7FA" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="64" font-weight="700">${esc(t)}</text>`;
      return el;
    })
    .join("\n");
  y += titleLines.length * 72 + 28;
  const subSvg = subLines
    .map((t, i) => `<text x="120" y="${y + i * 40}" fill="#A8B3BF" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="28">${esc(t)}</text>`)
    .join("\n");
  y += subLines.length * 40 + 36;

  let bodySvg = "";
  for (const line of body) {
    const wrapped = wrap([line], 70);
    for (const w of wrapped) {
      bodySvg += `<text x="120" y="${y}" fill="#D6DEE8" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="26">${esc(w)}</text>\n`;
      y += 40;
    }
    y += 8;
  }

  const chipSvg = chips
    .map((c, i) => {
      const x = 120 + i * 280;
      return `
      <rect x="${x}" y="880" width="250" height="52" rx="26" fill="#1C2430" stroke="#2C3A4A"/>
      <text x="${x + 125}" y="913" text-anchor="middle" fill="#7EC8FF" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="20" font-weight="600">${esc(c)}</text>`;
    })
    .join("");

  let statsSvg = "";
  if (stats) {
    statsSvg = stats
      .map((s, i) => {
        const x = 120 + (i % 4) * 430;
        const yy = 520 + Math.floor(i / 4) * 160;
        return `
        <rect x="${x}" y="${yy}" width="400" height="130" rx="22" fill="#151C26" stroke="#2A3544"/>
        <text x="${x + 28}" y="${yy + 62}" fill="#FC5B3A" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="44" font-weight="700">${esc(s.v)}</text>
        <text x="${x + 28}" y="${yy + 100}" fill="#A8B3BF" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="22">${esc(s.l)}</text>`;
      })
      .join("");
  }

  let mockSvg = "";
  if (mock === "ask") {
    mockSvg = `
      <rect x="980" y="200" width="820" height="640" rx="28" fill="#121820" stroke="#2A3544"/>
      <rect x="1010" y="240" width="760" height="64" rx="32" fill="#1A222E" stroke="#314050"/>
      <text x="1040" y="280" fill="#6B7A8C" font-size="22" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Ask anything about fire in space…</text>
      <circle cx="1730" cy="272" r="22" fill="#FC5B3A"/>
      <rect x="1010" y="340" width="760" height="220" rx="18" fill="#18202A"/>
      <text x="1040" y="390" fill="#F4F7FA" font-size="22" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-weight="600">Cited answer</text>
      <text x="1040" y="430" fill="#A8B3BF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">In microgravity, flames form nearly spherical</text>
      <text x="1040" y="458" fill="#A8B3BF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">structures with reduced buoyancy-driven flow…</text>
      <rect x="1040" y="490" width="70" height="28" rx="8" fill="#243040"/><text x="1052" y="510" fill="#7EC8FF" font-size="14" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">[1]</text>
      <rect x="1120" y="490" width="70" height="28" rx="8" fill="#243040"/><text x="1132" y="510" fill="#7EC8FF" font-size="14" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">[2]</text>
      <rect x="1010" y="590" width="360" height="200" rx="16" fill="#151C26" stroke="#2A3544"/>
      <text x="1035" y="630" fill="#7EC8FF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Source passage</text>
      <text x="1035" y="665" fill="#8A97A8" font-size="15" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">NTRS · Saffire / BASS context</text>
      <text x="1035" y="700" fill="#8A97A8" font-size="15" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Quote-verified · confidence shown</text>
      <rect x="1390" y="590" width="380" height="200" rx="16" fill="#151C26" stroke="#2A3544"/>
      <text x="1415" y="630" fill="#FC5B3A" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Entities lit</text>
      <circle cx="1450" cy="690" r="10" fill="#4A9EFF"/><text x="1472" y="696" fill="#D6DEE8" font-size="16" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">microgravity</text>
      <circle cx="1450" cy="730" r="10" fill="#FC5B3A"/><text x="1472" y="736" fill="#D6DEE8" font-size="16" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">PMMA</text>
    `;
  } else if (mock === "graph") {
    mockSvg = `
      <rect x="980" y="200" width="820" height="640" rx="28" fill="#121820" stroke="#2A3544"/>
      <circle cx="1180" cy="420" r="38" fill="#243850" stroke="#4A9EFF" stroke-width="3"/>
      <text x="1180" y="426" text-anchor="middle" fill="#E8F2FF" font-size="14" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">fuel</text>
      <circle cx="1480" cy="340" r="44" fill="#3A2418" stroke="#FC5B3A" stroke-width="3"/>
      <text x="1480" y="346" text-anchor="middle" fill="#FFE8E0" font-size="14" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">O₂ rich</text>
      <circle cx="1580" cy="560" r="40" fill="#1E2E24" stroke="#5BD38A" stroke-width="3"/>
      <text x="1580" y="566" text-anchor="middle" fill="#E6FFF0" font-size="13" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">outcome</text>
      <circle cx="1280" cy="640" r="36" fill="#2A2438" stroke="#B794F6" stroke-width="3"/>
      <text x="1280" y="646" text-anchor="middle" fill="#F0E8FF" font-size="13" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">geometry</text>
      <line x1="1215" y1="400" x2="1440" y2="360" stroke="#4A9EFF" stroke-width="2" opacity="0.7"/>
      <line x1="1510" y1="375" x2="1560" y2="525" stroke="#FC5B3A" stroke-width="2" opacity="0.7"/>
      <line x1="1210" y1="450" x2="1260" y2="610" stroke="#B794F6" stroke-width="2" opacity="0.6"/>
      <line x1="1310" y1="620" x2="1545" y2="575" stroke="#5BD38A" stroke-width="2" opacity="0.6"/>
      <text x="1020" y="250" fill="#A8B3BF" font-size="20" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Knowledge graph · fuels · conditions · outcomes</text>
    `;
  } else if (mock === "mission") {
    mockSvg = `
      <rect x="980" y="200" width="820" height="640" rx="28" fill="#121820" stroke="#2A3544"/>
      <text x="1020" y="260" fill="#F4F7FA" font-size="26" font-weight="700" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif">Mission briefing · Artemis</text>
      <text x="1020" y="300" fill="#A8B3BF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">34% O₂ · 56.5 kPa · habitat atmosphere</text>
      ${[0, 1, 2, 3].map((i) => {
        const yy = 340 + i * 100;
        const labels = ["Material flammability", "Ignition in elevated O2", "Smoke / toxicity", "Detection and suppression"];
        const bars = [86, 72, 58, 64];
        return `
        <rect x="1020" y="${yy}" width="740" height="80" rx="14" fill="#151C26"/>
        <text x="1045" y="${yy + 34}" fill="#D6DEE8" font-size="20" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">${esc(labels[i])}</text>
        <rect x="1045" y="${yy + 50}" width="500" height="10" rx="5" fill="#243040"/>
        <rect x="1045" y="${yy + 50}" width="${bars[i] * 5}" height="10" rx="5" fill="#FC5B3A"/>
        <text x="1680" y="${yy + 34}" fill="#7EC8FF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">${bars[i]}%</text>`;
      }).join("")}
    `;
  } else if (mock === "gaps") {
    mockSvg = `
      <rect x="980" y="200" width="820" height="640" rx="28" fill="#121820" stroke="#2A3544"/>
      <text x="1020" y="260" fill="#F4F7FA" font-size="24" font-weight="700" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif">Coverage gaps</text>
      ${[0, 1, 2, 3, 4].map((r) =>
        [0, 1, 2, 3, 4]
          .map((c) => {
            const shades = ["#1A2430", "#243040", "#3A2818", "#FC5B3A", "#5BD38A"];
            const fill = shades[(r + c) % 5];
            return `<rect x="${1040 + c * 130}" y="${300 + r * 90}" width="110" height="70" rx="10" fill="${fill}" opacity="0.85"/>`;
          })
          .join("")
      ).join("")}
      <text x="1020" y="800" fill="#A8B3BF" font-size="18" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">Fuel × condition matrix · thin cells = research priority</text>
    `;
  } else if (mock === "pipeline") {
    mockSvg = `
      <rect x="900" y="280" width="900" height="420" rx="28" fill="#121820" stroke="#2A3544"/>
      ${[
        ["NTRS", "1,334 reports"],
        ["Chunk", "20k passages"],
        ["Extract", "quote-guard"],
        ["KB", "graph + gaps"],
      ]
        .map((p, i) => {
          const x = 940 + i * 210;
          return `
          <rect x="${x}" y="400" width="180" height="160" rx="18" fill="#18202A" stroke="#314050"/>
          <text x="${x + 90}" y="470" text-anchor="middle" fill="#FC5B3A" font-size="24" font-weight="700" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif">${p[0]}</text>
          <text x="${x + 90}" y="510" text-anchor="middle" fill="#A8B3BF" font-size="16" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif">${p[1]}</text>
          ${i < 3 ? `<text x="${x + 190}" y="485" fill="#4A9EFF" font-size="28">→</text>` : ""}`;
        })
        .join("")}
    `;
  }

  const icon = iconHref
    ? `<image href="${iconHref}" x="120" y="72" width="72" height="72"/>`
    : `<circle cx="156" cy="108" r="32" fill="#FC5B3A"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1016"/>
      <stop offset="55%" stop-color="#121A24"/>
      <stop offset="100%" stop-color="#1A120E"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="15%" r="45%">
      <stop offset="0%" stop-color="#FC5B3A" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#FC5B3A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="10%" cy="80%" r="40%">
      <stop offset="0%" stop-color="#4A9EFF" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#4A9EFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  ${icon}
  <text x="210" y="118" fill="#F4F7FA" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="700">Emberfall</text>
  <text x="210" y="148" fill="#7A8796" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="16">Flame in Freefall</text>
  ${titleSvg}
  ${subSvg}
  ${bodySvg}
  ${statsSvg}
  ${mockSvg}
  ${chipSvg}
  <text x="120" y="1020" fill="#5A6775" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18">${esc(footer)}</text>
  <text x="1800" y="1020" text-anchor="end" fill="#5A6775" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="18">silent · VO separate</text>
</svg>`;
}

const slides = [
  {
    file: "01-title",
    title: "Emberfall",
    subtitle: "70 years of NASA fire-safety research — one cited, mission-aware knowledge engine.",
    body: [
      "Team runtime-terror · NASA Space Apps Challenge 2026",
      "What do we know about fire in freefall — and where are the gaps that matter for crew safety?",
    ],
    chips: ["NTRS corpus", "Cited Q&A", "Mission risks"],
  },
  {
    file: "02-problem",
    title: "Fire behaves differently in space",
    subtitle: "No buoyancy. Slow blue spheres. Closed air loop. Nowhere to evacuate.",
    body: [
      "Artemis habitats plan higher oxygen at lower pressure — materials ignite more easily.",
      "NASA has studied this since the 1950s, but findings are scattered across a thousand+ reports.",
    ],
    chips: ["Microgravity", "Crew safety", "Artemis O₂"],
  },
  {
    file: "03-challenge",
    title: "The Space Apps ask",
    subtitle: "Turn microgravity combustion data into fire-safety insights people can trust.",
    body: [
      "Accessible research · AI-powered insights · spacecraft relevance · trustworthy citations.",
      "Serve scientists, engineers, safety managers, and the public — not just a chat box.",
    ],
    chips: ["Accessible", "Trusted", "Mission-ready"],
  },
  {
    file: "04-scale",
    title: "The knowledge base at a glance",
    subtitle: "One index over decades of NTRS literature — structured for answers, not just search.",
    stats: [
      { v: "1,334", l: "NASA NTRS reports" },
      { v: "20,145", l: "Indexed passages" },
      { v: "1,812", l: "Quote-verified findings" },
      { v: "58", l: "Open contradictions" },
      { v: "1955–2026", l: "Literature span" },
      { v: "100%", l: "Citation validity (eval)" },
    ],
  },
  {
    file: "05-pipeline",
    title: "How Emberfall is built",
    subtitle: "Ingest → process → quote-guard → ontology → hybrid retrieval → FastAPI + Next.js.",
    mock: "pipeline",
    body: ["Every finding must appear verbatim in source text — or it is discarded."],
  },
  {
    file: "06-ask",
    title: "Ask — cited answers, not vibes",
    subtitle: "Streamed Q&A over the corpus. Every sentence cites a passage you can open.",
    mock: "ask",
    chips: ["SSE streaming", "Personas", "Refusal when thin"],
  },
  {
    file: "07-graph",
    title: "See the literature connect",
    subtitle: "Fuels, conditions, geometries, outcomes, and countermeasures as a living graph.",
    mock: "graph",
    chips: ["Cytoscape", "Communities", "Path focus"],
  },
  {
    file: "08-gaps",
    title: "Gaps & contradictions",
    subtitle: "Where studies disagree — and which fuel x condition cells are still thin.",
    mock: "gaps",
    chips: ["Gap matrix", "Insights", "Hypotheses"],
  },
  {
    file: "09-mission",
    title: "Mission fire-risk briefing",
    subtitle: "Pick ISS, Artemis, Mars — or a custom O₂ / pressure profile — and get ranked risks.",
    mock: "mission",
    chips: ["13 NASA-style risks", "Evidence strength", "PDF export"],
  },
  {
    file: "10-trust",
    title: "Trust is a product feature",
    subtitle: "Quote guard · citation checks · refusal on off-topic or thin evidence · live /eval.",
    body: [
      "Emberfall helps prioritize research. It is not a certified hazard analysis.",
      "When the literature is silent, we say so — instead of inventing an answer.",
    ],
    chips: ["Quote guard", "Faithfulness", "Refusal accuracy"],
  },
  {
    file: "11-who",
    title: "Built for four ways in",
    subtitle: "Same knowledge base — different framing for each persona.",
    body: [
      "Combustion scientist → Ask + Graph + Hypotheses",
      "Safety manager → Gaps + Trends",
      "Habitat architect → Mission briefing",
      "Public / educator → Glossary + plain-language Ask",
    ],
    chips: ["Scientist", "Safety", "Architect", "Public"],
  },
  {
    file: "12-close",
    title: "Emberfall",
    subtitle: "Flame in Freefall — cited knowledge for spacecraft fire safety.",
    body: [
      "Live demo · open source · NASA Space Apps 2026",
      "Team runtime-terror — thank you.",
    ],
    chips: ["Ask", "Mission", "Trust"],
  },
];

for (const s of slides) {
  const svg = shell(s);
  const svgPath = join(SLIDES, `${s.file}.svg`);
  const pngPath = join(SLIDES, `${s.file}.png`);
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
  console.log("wrote", pngPath);
}

// concat demuxer: each slide 20s → 240s
const listPath = join(OUT, "concat.txt");
const lines = slides.map((s) => `file '${join(SLIDES, `${s.file}.png`)}'\nduration 20`).join("\n");
// last frame must be repeated without duration for concat demuxer
const last = join(SLIDES, `${slides[slides.length - 1].file}.png`);
writeFileSync(listPath, lines + `\nfile '${last}'\n`);

const mp4 = join(OUT, "emberfall-demo-240s.mp4");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-vf",
    "fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ],
  { stdio: "inherit" }
);

console.log("\nVIDEO:", mp4);
