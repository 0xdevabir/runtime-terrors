"use client";
import { useCallback, useEffect, useState } from "react";

// Saved papers live in this browser only (localStorage), synced across tabs and components.
const KEY = "sbke.saved";
const EVT = "sbke:saved";

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function useBookmarks() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSaved(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const toggle = useCallback((id: string) => {
    const cur = read();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    setSaved(next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { saved, has: (id: string) => saved.includes(id), toggle };
}
