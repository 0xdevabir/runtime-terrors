"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Icon, IconName } from "./Icon";
import { PERSONAS, usePrefs } from "./prefs";

type NavItem = { href: string; label: string; icon: IconName; color: string };

export const NAV: { title: string; items: NavItem[] }[] = [
  { title: "", items: [
    { href: "/", label: "Home", icon: "house", color: "var(--tint)" },
    { href: "/ask", label: "Ask", icon: "sparkles", color: "var(--indigo)" },
  ] },
  { title: "Explore", items: [
    { href: "/graph", label: "Knowledge Graph", icon: "graph", color: "var(--purple)" },
    { href: "/papers", label: "Reports", icon: "books", color: "var(--orange)" },
    { href: "/gaps", label: "Evidence Gaps", icon: "grid", color: "var(--teal)" },
    { href: "/trends", label: "Trends", icon: "chart", color: "var(--green)" },
    { href: "/topics", label: "Topics", icon: "doc", color: "var(--blue)" },
    { href: "/compare", label: "Compare Reports", icon: "split", color: "var(--indigo)" },
    { href: "/glossary", label: "Glossary", icon: "quote", color: "var(--gray)" },
  ] },
  { title: "Decide", items: [
    { href: "/insights", label: "Consensus & Conflicts", icon: "split", color: "var(--red)" },
    { href: "/hypotheses", label: "Hypotheses", icon: "bulb", color: "var(--yellow)" },
    { href: "/mission", label: "Mission Briefing", icon: "rocket", color: "var(--pink)" },
    { href: "/eval", label: "Trust & Evaluation", icon: "seal", color: "var(--green)" },
  ] },
];

const TABS: NavItem[] = [
  { href: "/", label: "Home", icon: "house", color: "" },
  { href: "/ask", label: "Ask", icon: "sparkles", color: "" },
  { href: "/graph", label: "Graph", icon: "graph", color: "" },
  { href: "/insights", label: "Insights", icon: "split", color: "" },
  { href: "/mission", label: "Mission", icon: "rocket", color: "" },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { persona, setPersona, theme, setTheme } = usePrefs();
  return (
    <div className="min-h-dvh lg:flex">
      {/* iPadOS sidebar */}
      <aside className="no-print hidden lg:flex flex-col w-[280px] shrink-0 h-dvh sticky top-0 border-r border-sep bg-bg-2/60 backdrop-blur-xl">
        <div className="px-5 pt-6 pb-3">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="Emberfall home">
            <Logo />
            <div>
              <div className="t-headline leading-tight group-hover:text-tint transition-colors">Emberfall</div>
              <div className="t-foot text-label-2">Flame in Freefall</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.title || "main"} className="mt-3">
              {g.title && <div className="t-foot font-semibold text-label-2 px-3 pb-1">{g.title}</div>}
              {g.items.map((it) => {
                const on = active(path, it.href);
                return (
                  <Link key={it.href} href={it.href}
                    className={`flex items-center gap-3 px-3 h-10 rounded-[10px] t-callout transition-colors ${on ? "bg-tint text-white" : "hover:bg-fill"}`}>
                    <span className="grid place-items-center" style={{ color: on ? "white" : it.color }}>
                      <Icon name={it.icon} size={20} />
                    </span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-4 hairline-t space-y-3">
          <div className="t-foot font-semibold text-label-2">Viewing as</div>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-[9px] bg-fill">
            {PERSONAS.map((p) => (
              <button key={p.id} onClick={() => setPersona(p.id)} title={p.blurb}
                className={`t-cap font-medium h-7 rounded-[7px] transition-all ${persona === p.id ? "bg-bg-2 shadow-sm" : "text-label-2"}`}>
                {p.short}
              </button>
            ))}
          </div>
          <button onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
            className="flex items-center gap-2 t-foot text-label-2 hover:text-label">
            <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "gear"} size={16} />
            Appearance: {theme === "system" ? "Automatic" : theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-10">{children}</main>

      {/* iOS tab bar */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 material hairline-t pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[50px]">
          {TABS.map((t) => {
            const on = active(path, t.href);
            return (
              <Link key={t.href} href={t.href} className={`flex flex-col items-center justify-center gap-0.5 ${on ? "text-tint" : "text-label-2"}`}>
                <Icon name={t.icon} size={24} stroke={on ? 2.1 : 1.7} />
                <span className="t-cap2 font-medium">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Emberfall mark — spherical freefall flame + orbit (matches app/icon.svg). */
export function Logo({ size = 34 }: { size?: number }) {
  const id = `ef${size}`;
  return (
    <span className="grid place-items-center shrink-0 overflow-hidden rounded-[9px]"
      style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <radialGradient id={`${id}bg`} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#2a1610" />
            <stop offset="100%" stopColor="#0a0908" />
          </radialGradient>
          <radialGradient id={`${id}core`} cx="46%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#fff6d0" />
            <stop offset="28%" stopColor="#ffd60a" />
            <stop offset="58%" stopColor="#ff9f0a" />
            <stop offset="100%" stopColor="#ff453a" />
          </radialGradient>
          <radialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff9f0a" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#ff453a" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ff453a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="32" height="32" fill={`url(#${id}bg)`} />
        <circle cx="16" cy="16" r="13.5" fill={`url(#${id}glow)`} />
        <circle cx="16" cy="16.2" r="8.2" fill={`url(#${id}core)`} />
        <circle cx="14.8" cy="14.6" r="2.5" fill="#fff8e6" fillOpacity="0.92" />
        <ellipse cx="16" cy="16" rx="11.8" ry="4" transform="rotate(-28 16 16)"
          stroke="#ff9f0a" strokeOpacity="0.5" strokeWidth="1" fill="none" />
        <circle cx="24" cy="9.4" r="1.05" fill="#ff9f0a" />
        <circle cx="8" cy="22.2" r="0.8" fill="#ff453a" fillOpacity="0.9" />
        <circle cx="22.6" cy="21.4" r="0.65" fill="#ffd60a" fillOpacity="0.85" />
      </svg>
    </span>
  );
}


