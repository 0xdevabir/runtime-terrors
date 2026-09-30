"use client";

import { useId } from "react";

/** Emberfall mark — spherical freefall flame + orbit (matches app/icon.svg). */
export function Logo({ size = 34 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  return (
    <span className="grid place-items-center shrink-0 overflow-hidden rounded-[9px] shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
      style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <radialGradient id={`${uid}bg`} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#2a1610" />
            <stop offset="100%" stopColor="#0a0908" />
          </radialGradient>
          <radialGradient id={`${uid}core`} cx="46%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#fff6d0" />
            <stop offset="28%" stopColor="#ffd60a" />
            <stop offset="58%" stopColor="#ff9f0a" />
            <stop offset="100%" stopColor="#ff453a" />
          </radialGradient>
          <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff9f0a" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#ff453a" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ff453a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="32" height="32" fill={`url(#${uid}bg)`} />
        <circle cx="16" cy="16" r="13.5" fill={`url(#${uid}glow)`} />
        <circle cx="16" cy="16.2" r="8.2" fill={`url(#${uid}core)`} />
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
