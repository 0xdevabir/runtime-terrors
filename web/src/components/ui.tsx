"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DIRECTION_LABEL, STUDY_TYPE_LABEL, Strength } from "@/lib/api";
import { Icon, IconName } from "./Icon";
import { Logo } from "./Logo";

/* ----------------------------------------------------------------- Page chrome
   Large title that collapses into a translucent inline nav bar on scroll. */
export function Page({ title, subtitle, back, trailing, children, wide = false, toolbar, brand = false }: {
  title: string; subtitle?: React.ReactNode; back?: { href?: string; label: string }; trailing?: React.ReactNode;
  children: React.ReactNode; wide?: boolean; toolbar?: React.ReactNode; brand?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-52px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="min-h-dvh">
      <header className={`no-print sticky top-0 z-30 transition-[background,box-shadow] duration-200 ${collapsed ? "material hairline-b" : ""}`}>
        <div className={`mx-auto ${wide ? "max-w-[1400px]" : "max-w-[980px]"} h-[52px] px-4 lg:px-8 grid grid-cols-[1fr_auto_1fr] items-center`}>
          <div className="min-w-0">
            {back ? (
              <button onClick={() => (back.href ? router.push(back.href) : router.back())}
                className="flex items-center -ml-2 text-tint t-body btn-press">
                <Icon name="chevronLeft" size={26} stroke={2.2} />
                <span className="truncate">{back.label}</span>
              </button>
            ) : (
              <Link href="/" className="lg:hidden inline-flex items-center" aria-label="Emberfall home">
                <Logo size={28} />
              </Link>
            )}
          </div>
          <div className={`t-headline truncate max-w-[50vw] transition-opacity duration-200 ${collapsed ? "opacity-100" : "opacity-0"}`}>{title}</div>
          <div className="flex justify-end items-center gap-3 text-tint">{trailing}</div>
        </div>
      </header>
      <div className={`mx-auto ${wide ? "max-w-[1400px]" : "max-w-[980px]"} px-4 lg:px-8 print-full`}>
        <div className="pt-1 pb-4">
          {brand ? (
            <div className="flex items-center gap-3">
              <span className="lg:hidden"><Logo size={44} /></span>
              <div>
                <h1 className="t-large leading-tight">{title}</h1>
                <div className="t-foot text-label-2 mt-0.5 lg:hidden">Flame in Freefall</div>
              </div>
            </div>
          ) : (
            <h1 className="t-large">{title}</h1>
          )}
          {subtitle && <div className="t-sub text-label-2 mt-1 max-w-[720px]">{subtitle}</div>}
          <div ref={sentinel} />
        </div>
        {toolbar && <div className="no-print mb-4">{toolbar}</div>}
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({ value, onChange, options, className = "", size = "md" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: "sm" | "md";
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className={`relative grid p-[2px] rounded-[9px] bg-fill ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      <span className="absolute top-[2px] bottom-[2px] rounded-[7px] bg-[var(--seg)] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${idx * 100}%)`, left: 2 }} />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={`relative z-10 ${size === "sm" ? "h-7 t-foot" : "h-8 t-sub"} px-2 font-medium truncate transition-colors ${o.value === value ? "text-label" : "text-label"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Grouped list */
export function Section({ header, footer, children, className = "" }: { header?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-8 ${className}`}>
      {header && <div className="section-header">{header}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

export function Row({ href, onClick, icon, iconBg, title, subtitle, detail, chevron = true, children, external }: {
  href?: string; onClick?: () => void; icon?: IconName; iconBg?: string; title: React.ReactNode; subtitle?: React.ReactNode;
  detail?: React.ReactNode; chevron?: boolean; children?: React.ReactNode; external?: boolean;
}) {
  const inner = (
    <>
      {icon && (
        <span className="grid place-items-center w-[29px] h-[29px] rounded-[7px] text-white shrink-0" style={{ background: iconBg ?? "var(--tint)" }}>
          <Icon name={icon} size={18} stroke={2} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="t-body">{title}</div>
        {subtitle && <div className="t-foot text-label-2 mt-0.5">{subtitle}</div>}
        {children}
      </div>
      {detail != null && <div className="t-body text-label-2 shrink-0">{detail}</div>}
      {(href || onClick) && chevron && <Icon name={external ? "arrowUpRight" : "chevron"} size={external ? 16 : 14} stroke={2.4} className="text-label-3 shrink-0" />}
    </>
  );
  const cls = `row ${icon ? "indent" : ""} ${href || onClick ? "pressable" : ""}`;
  const style = icon ? ({ "--indent": "57px" } as React.CSSProperties) : undefined;
  if (href && external) return <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>{inner}</a>;
  if (href) return <Link href={href} className={cls} style={style}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={`${cls} w-full text-left`} style={style}>{inner}</button>;
  return <div className={cls} style={style}>{inner}</div>;
}

export function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-bg-2 rounded-2xl p-4 ${onClick ? "pressable cursor-pointer active:scale-[0.99]" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- Sheet
   Bottom sheet on phones, trailing inspector panel on large screens. */
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 no-print" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 anim-fade" onClick={onClose} />
      <div className={`absolute bg-bg shadow-2xl flex flex-col
        inset-x-0 bottom-0 top-[8vh] rounded-t-[14px] anim-sheet-up
        md:inset-auto md:top-4 md:bottom-4 md:right-4 md:rounded-[14px] md:anim-sheet-in ${wide ? "md:w-[640px]" : "md:w-[480px]"}`}>
        <div className="md:hidden mx-auto mt-2 w-9 h-[5px] rounded-full bg-fill-2" />
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="t-headline min-w-0 truncate">{title}</div>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center w-[30px] h-[30px] rounded-full bg-fill text-label-2 shrink-0 btn-press">
            <Icon name="xmark" size={14} stroke={2.6} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Small bits */
export function Chip({ children, onClick, active, color, href, title }: { children: React.ReactNode; onClick?: () => void; active?: boolean; color?: string; href?: string; title?: string }) {
  const cls = `inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full t-foot font-medium whitespace-nowrap transition-colors btn-press ${active ? "bg-tint text-white" : "bg-fill text-label"}`;
  const dot = color ? <span className="w-2 h-2 rounded-full" style={{ background: color }} /> : null;
  if (href) return <Link href={href} className={cls} title={title}>{dot}{children}</Link>;
  return <button onClick={onClick} className={cls} title={title}>{dot}{children}</button>;
}

export function Tag({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "blue" | "green" | "orange" | "red" | "purple" | "teal" }) {
  const c = { gray: "var(--label-2)", blue: "var(--tint)", green: "var(--green)", orange: "var(--orange)", red: "var(--red)", purple: "var(--purple)", teal: "var(--teal)" }[tone];
  return (
    <span className="inline-flex items-center h-[22px] px-2 rounded-[6px] t-cap font-semibold whitespace-nowrap"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {children}
    </span>
  );
}

export function StudyTag({ type }: { type: string }) {
  const tone = ({ flight: "blue", both: "purple", short_ug: "teal", ground: "gray", computational: "green", review: "orange" } as const)[type as "flight"] ?? "gray";
  return <Tag tone={tone}>{STUDY_TYPE_LABEL[type] ?? type}</Tag>;
}

/* Evidence strength: status color is never alone - icon + label always ride with it */
export function StrengthBadge({ s, compact = false }: { s: Strength; compact?: boolean }) {
  const map = {
    strong: { c: "var(--status-good)", icon: "checkCircle" as const, t: "Strong evidence" },
    moderate: { c: "var(--status-warning)", icon: "circle" as const, t: "Moderate evidence" },
    limited: { c: "var(--status-serious)", icon: "warn" as const, t: "Limited evidence" },
    none: { c: "var(--label-3)", icon: "minus" as const, t: "No evidence" },
  }[s.label];
  return (
    <span className="inline-flex items-center gap-1 t-foot font-medium text-label-2" title={`Evidence score ${Math.round(s.score * 100)}/100`}>
      <span style={{ color: map.c }}><Icon name={map.icon} size={15} stroke={2.2} /></span>
      {compact ? s.label[0].toUpperCase() + s.label.slice(1) : map.t}
    </span>
  );
}

export function DirectionGlyph({ d }: { d: string | null }) {
  const m: Record<string, { s: string; c: string }> = {
    increase: { s: "▲", c: "var(--series-8)" }, decrease: { s: "▼", c: "var(--series-1)" },
    no_change: { s: "●", c: "var(--label-3)" }, mixed: { s: "◆", c: "var(--series-4)" },
  };
  if (!d || !m[d]) return null;
  return (
    <span className="inline-flex items-center gap-1 t-foot font-medium text-label-2">
      <span style={{ color: m[d].c }} className="text-[10px]">{m[d].s}</span>{DIRECTION_LABEL[d]}
    </span>
  );
}

export function Stat({ value, label, icon, color }: { value: React.ReactNode; label: string; icon?: IconName; color?: string }) {
  return (
    <div className="bg-bg-2 rounded-2xl p-4 flex flex-col gap-2 min-w-0">
      {icon && <span style={{ color: color ?? "var(--tint)" }}><Icon name={icon} size={22} /></span>}
      <div className="text-[28px] leading-none font-bold tracking-tight">{value}</div>
      <div className="t-foot text-label-2">{label}</div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "Search", onSubmit, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; onSubmit?: () => void; autoFocus?: boolean;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} className="flex items-center gap-1.5 h-9 px-2 rounded-[10px] bg-fill">
      <Icon name="search" size={17} className="text-label-2" stroke={2.2} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="flex-1 bg-transparent outline-none t-body placeholder:text-label-2 min-w-0" />
      {value && (
        <button type="button" onClick={() => onChange("")} className="grid place-items-center w-4 h-4 rounded-full bg-label-3 text-bg-2" aria-label="Clear">
          <Icon name="xmark" size={10} stroke={3.4} />
        </button>
      )}
    </form>
  );
}

export function Skeleton({ h = 16, w = "100%", className = "" }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} />;
}

export function LoadingList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="group">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row"><div className="flex-1 space-y-2 py-1"><Skeleton h={14} w="70%" /><Skeleton h={11} w="40%" /></div></div>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <Card className="flex items-start gap-3">
      <span className="text-orange"><Icon name="warn" /></span>
      <div>
        <div className="t-headline">Can&apos;t reach Emberfall</div>
        <div className="t-foot text-label-2 mt-1">Start the API with <code className="font-mono">make api</code> and reload. ({String(error).slice(0, 120)})</div>
      </div>
    </Card>
  );
}

export function Empty({ icon = "search", title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-14 text-label-2">
      <Icon name={icon} size={44} stroke={1.4} />
      <div className="t-title3 text-label mt-3">{title}</div>
      {text && <div className="t-sub mt-1 max-w-[360px]">{text}</div>}
    </div>
  );
}

export function Quote({ children, section }: { children: React.ReactNode; section?: string }) {
  return (
    <blockquote className="relative pl-3 border-l-[3px] border-tint/60 t-sub text-label">
      {children}
      {section && <span className="ml-1.5 t-cap2 font-semibold uppercase text-label-2">{section}</span>}
    </blockquote>
  );
}
