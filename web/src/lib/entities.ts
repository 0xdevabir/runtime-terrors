"use client";
import { useApi } from "./useApi";

export type Entity = { id: string; type: string; label: string; group: string; ontology: string | null; synonyms: string[]; papers: number };

export const TYPE_META: Record<string, { label: string; color: string }> = {
  condition: { label: "Condition", color: "var(--series-8)" },
  fuel: { label: "Fuel / material", color: "var(--series-3)" },
  geometry: { label: "Flame geometry", color: "var(--series-1)" },
  outcome: { label: "Outcome", color: "var(--series-7)" },
  countermeasure: { label: "Countermeasure", color: "var(--series-6)" },
  species: { label: "Chemical species", color: "var(--series-5)" },
  platform: { label: "Platform", color: "var(--series-4)" },
};

export const pretty = (id?: string | null) =>
  id ? id.split(":").pop()!.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";

export function useEntities() {
  const { data } = useApi<Entity[]>("/entities");
  const map = new Map((data ?? []).map((e) => [e.id, e]));
  return { entities: data ?? [], label: (id?: string | null) => (id ? map.get(id)?.label ?? pretty(id) : ""), get: (id: string) => map.get(id) };
}
