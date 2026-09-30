"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Persona = "scientist" | "manager" | "architect" | "student";
export type Theme = "system" | "light" | "dark";

export const PERSONAS: { id: Persona; label: string; short: string; icon: "flask" | "chart" | "rocket" | "books"; blurb: string }[] = [
  { id: "scientist", label: "Scientist", short: "Scientist", icon: "flask", blurb: "Mechanisms, methods and where studies disagree" },
  { id: "manager", label: "Program Manager", short: "Manager", icon: "chart", blurb: "Bottom lines, evidence strength, investment gaps" },
  { id: "architect", label: "Mission Architect", short: "Architect", icon: "rocket", blurb: "Crew-health risk and countermeasures for Moon & Mars" },
  { id: "student", label: "Student", short: "Student", icon: "books", blurb: "Plain language, key terms explained" },
];

type Prefs = { persona: Persona; setPersona: (p: Persona) => void; theme: Theme; setTheme: (t: Theme) => void };
const Ctx = createContext<Prefs>({ persona: "scientist", setPersona: () => {}, theme: "system", setTheme: () => {} });

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [persona, setP] = useState<Persona>("scientist");
  const [theme, setT] = useState<Theme>("system");
  useEffect(() => {
    setP(read("sbke.persona", "scientist"));
    setT(read("sbke.theme", "system"));
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);
  const setPersona = useCallback((p: Persona) => { setP(p); write("sbke.persona", p); }, []);
  const setTheme = useCallback((t: Theme) => { setT(t); write("sbke.theme", t); }, []);
  return <Ctx.Provider value={{ persona, setPersona, theme, setTheme }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
