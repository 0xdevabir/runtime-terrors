"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, IconName } from "./Icon";
import { Logo } from "./Logo";
import { PERSONAS, Theme, usePrefs } from "./prefs";
import { Segmented, Sheet } from "./ui";

export type NavItem = { href: string; label: string; icon: IconName; desc: string };

/** The few places most people need. Everything else lives under "More". */
export const PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: "house", desc: "Start here" },
  { href: "/ask", label: "Ask", icon: "sparkles", desc: "Get a cited answer" },
  { href: "/graph", label: "Graph", icon: "graph", desc: "See how ideas connect" },
  { href: "/papers", label: "Reports", icon: "books", desc: "Browse the library" },
  { href: "/insights", label: "Agree & Disagree", icon: "split", desc: "Where studies clash" },
  { href: "/mission", label: "Mission", icon: "rocket", desc: "Risks for your mission" },
];

export const MORE: NavItem[] = [
  { href: "/gaps", label: "Evidence Gaps", icon: "grid", desc: "What's under-studied" },
  { href: "/hypotheses", label: "Hypotheses", icon: "bulb", desc: "Untested ideas" },
  { href: "/trends", label: "Trends", icon: "chart", desc: "Research over time" },
  { href: "/topics", label: "Topics", icon: "doc", desc: "Summaries by flame type" },
  { href: "/compare", label: "Compare", icon: "split", desc: "Two reports side by side" },
  { href: "/glossary", label: "Glossary", icon: "quote", desc: "Terms in plain words" },
  { href: "/eval", label: "Trust", icon: "seal", desc: "How answers are checked" },
];

const TABS: NavItem[] = PRIMARY.slice(0, 4);

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function SideLink({ it, on }: { it: NavItem; on: boolean }) {
  return (
    <Link href={it.href} aria-current={on ? "page" : undefined}
      className={`flex items-center gap-3 px-3 h-10 rounded-xl t-callout transition-all ${on ? "bg-bg-2 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-[0.5px] ring-sep" : "text-label-2 hover:text-label hover:bg-fill"}`}>
      <span className={on ? "text-tint" : ""}><Icon name={it.icon} size={19} stroke={on ? 2.1 : 1.8} /></span>
      {it.label}
    </Link>
  );
}

function Preferences() {
  const { persona, setPersona, theme, setTheme } = usePrefs();
  return (
    <div className="space-y-3">
      <div>
        <div className="t-cap font-semibold text-label-2 mb-1.5 px-1">Answers tuned for</div>
        <Segmented size="sm" value={persona} onChange={setPersona} options={PERSONAS.map((p) => ({ value: p.id, label: p.short }))} />
      </div>
      <div>
        <div className="t-cap font-semibold text-label-2 mb-1.5 px-1">Appearance</div>
        <Segmented<Theme> size="sm" value={theme} onChange={setTheme} options={[
          { value: "light", label: <span className="inline-flex items-center gap-1"><Icon name="sun" size={13} />Light</span> },
          { value: "system", label: "Auto" },
          { value: "dark", label: <span className="inline-flex items-center gap-1"><Icon name="moon" size={13} />Dark</span> },
        ]} />
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const inMore = MORE.some((m) => active(path, m.href));
  const [moreOpen, setMoreOpen] = useState(inMore);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { if (inMore) setMoreOpen(true); }, [inMore]);
  useEffect(() => setSheet(false), [path]);

  return (
    <div className="min-h-dvh lg:flex">
      {/* iPadOS-style sidebar */}
      <aside className="no-print hidden lg:flex flex-col w-[260px] shrink-0 h-dvh sticky top-0 border-r border-sep">
        <div className="px-5 pt-6 pb-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Emberfall home">
            <Logo />
            <div>
              <div className="t-headline leading-tight">Emberfall</div>
              <div className="t-cap text-label-2">Flame in Freefall</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4 space-y-0.5">
          {PRIMARY.map((it) => <SideLink key={it.href} it={it} on={active(path, it.href)} />)}
          <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
            className="w-full flex items-center gap-3 px-3 h-10 mt-3 rounded-xl t-foot font-semibold text-label-2 hover:text-label">
            More tools
            <Icon name="chevronDown" size={14} stroke={2.4} className={`ml-auto transition-transform duration-300 ${moreOpen ? "" : "-rotate-90"}`} />
          </button>
          {moreOpen && <div className="space-y-0.5 anim-fade">{MORE.map((it) => <SideLink key={it.href} it={it} on={active(path, it.href)} />)}</div>}
        </nav>
        <div className="p-4 hairline-t"><Preferences /></div>
      </aside>

      <main className="flex-1 min-w-0 pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-10">{children}</main>

      {/* iOS tab bar */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 material hairline-t pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[54px]">
          {TABS.map((t) => {
            const on = active(path, t.href);
            return (
              <Link key={t.href} href={t.href} className={`flex flex-col items-center justify-center gap-0.5 ${on ? "text-tint" : "text-label-2"}`}>
                <Icon name={t.icon} size={24} stroke={on ? 2.1 : 1.7} />
                <span className="t-cap2 font-medium">{t.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setSheet(true)}
            className={`flex flex-col items-center justify-center gap-0.5 ${!TABS.some((t) => active(path, t.href)) ? "text-tint" : "text-label-2"}`}>
            <Icon name="ellipsis" size={24} stroke={2.4} />
            <span className="t-cap2 font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="More">
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {[...PRIMARY.slice(4), ...MORE].map((it) => (
            <Link key={it.href} href={it.href}
              className={`rounded-2xl p-3.5 bg-bg-2 ring-[0.5px] ring-sep btn-press ${active(path, it.href) ? "ring-2 ring-tint" : ""}`}>
              <span className="text-tint"><Icon name={it.icon} size={22} /></span>
              <div className="t-sub font-semibold mt-2">{it.label}</div>
              <div className="t-cap text-label-2">{it.desc}</div>
            </Link>
          ))}
        </div>
        <Preferences />
      </Sheet>
    </div>
  );
}
