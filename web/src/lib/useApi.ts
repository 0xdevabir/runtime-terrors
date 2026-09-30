"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

const cache = new Map<string, unknown>();

/** Tiny SWR-style hook: cached GET with loading/error state. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(path ? (cache.get(path) as T) : undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!path && !cache.has(path));
  useEffect(() => {
    if (!path) return;
    let live = true;
    if (cache.has(path)) {
      setData(cache.get(path) as T);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => { cache.set(path, d); if (live) setData(d); })
      .catch((e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [path]);
  return { data, error, loading };
}
