"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    { href: "/papers", label: "Publications", icon: "books", color: "var(--orange)" },
    { href: "/gaps", label: "Evidence Gaps", icon: "grid", color: "var(--teal)" },
    { href: "/trends", label: "Trends", icon: "chart", color: "var(--green)" },
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
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <div className="t-headline leading-tight">Space Biology</div>
              <div className="t-foot text-label-2">Knowledge Engine</div>
            </div>
          </div>
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
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-[9px] bg-fill">
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

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-[9px] text-white shrink-0"
      style={{ width: size, height: size, background: "linear-gradient(145deg,#5e5ce6,#007aff 55%,#30b0c7)" }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)" />
        <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="8.4" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
