// API client. Requests go to /api/* on the same origin (proxied to FastAPI by
// next.config rewrites) unless NEXT_PUBLIC_API_URL points straight at the API.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type Strength = { score: number; label: "strong" | "moderate" | "limited" | "none" };
export type Direction = "increase" | "decrease" | "no_change" | "mixed";

export type PaperCard = {
  id: string; title: string; year: string | number; journal?: string | null; center?: string | null; report_type?: string | null;
  url: string; doi?: string; study_type: string;
  fuels: string[]; conditions: string[]; platforms: string[]; geometries: string[]; experiments: string[];
  full_text: boolean; n_findings: number; key_finding: string; authors: string[]; n_authors: number;
  n_tests?: number | null; missions?: string[]; duplicate_of?: string | null;
};

export type Finding = {
  id: string; paper_id: string; fuel: string | null; condition: string; geometry: string | null; outcome: string;
  direction: Direction; species: string[]; countermeasure: string | null; countermeasure_effect: string | null;
  evidence_quote: string; section: string; confidence: number; method: string; year: number; study_type: string;
  magnitude?: string | null; paper_title: string; paper_url: string; labels: Record<string, string | null>;
};

export type PaperDetail = PaperCard & {
  keywords: string[]; abstract: string; duration: { value: number; unit: string; seconds: number; inferred?: boolean } | null;
  summary: { l1: string; l2: string[]; l3: string; key_finding: string; method: string };
  findings: Finding[]; sections: Record<string, number>; pdf_url?: string | null;
  related: PaperCard[]; labels: Record<string, string>; word_count: number; atmosphere?: string | null; limitations?: string[];
};

export type Passage = {
  chunk_id: string; paper_id: string; title: string; year: number; url: string; section: string; text: string;
  entities: string[]; study_type: string; score: number; coverage: number; side?: string;
};

export type GNode = {
  id: string; type: string; label: string; group: string; ontology: string | null; papers: number; flight_papers: number;
  pagerank?: number; betweenness?: number; community?: number;
};
export type GEdge = {
  id: string; source: string; target: string; relation: string; paper_count: number; majority: Direction | null;
  agreement: number; strength: Strength; directions: Record<string, number>;
};

export type Consensus = {
  id: string; condition: string; outcome: string; geometry: string | null; n_papers: number; votes: Record<string, number>;
  majority: Direction; agreement: number; status: "consensus" | "contradictory" | "emerging"; strength: Strength; label: string;
  explanations: string[]; timeline?: ({ year: number } & Partial<Record<Direction, number>>)[];
  sides?: Record<string, { paper_id: string; title: string; year: number; quote: string; fuel: string | null; study_type: string; duration_seconds: number | null }[]>;
  labels?: Record<string, string | null>;
};

export type Hypothesis = {
  id: string; a: string; c: string; score: number; text: string; a_label: string; c_label: string;
  bridges: { b: string; label: string; ab_papers: string[]; bc_papers: string[] }[];
};

export type Stats = {
  papers: number; full_text: number; chunks: number; findings: number; nodes: number; edges: number; contradictions: number;
  consensus: number; experiment_linked: number; llm_papers: number; years: [number, number]; study_types: Record<string, number>;
  quote_guard: Record<string, number>; llm: boolean; llm_provider?: "gemini" | "claude" | null; dense?: boolean; communities?: number; duplicates?: number;
  with_n_tests?: number; with_mission?: number;
  top: Record<string, { id: string; label: string; papers: number }[]>;
  contradictions_preview: Consensus[]; hypotheses_preview: Hypothesis[];
};

export type MissionProfile = {
  id?: string; name: string; destination: string; duration_days: number; microgravity_days: number; partial_gravity_days: number;
  o2_percent: number; pressure_kpa: number; comm_delay_min: number; crew: number; blurb?: string; atmosphere?: Atmosphere;
};

export type Atmosphere = { o2_percent: number; pressure_kpa: number; pressure_psia: number; ppo2_kpa: number };

export type MissionRisk = {
  id: string; name: string; severity: number; exposure: number; relevance: number; uncertainty: number; priority: number;
  tier: "high" | "medium" | "low";
  evidence: { strength: Strength; n_papers: number; n_findings: number; n_material: number; n_flight: number; by_condition: Record<string, number> };
  key_findings: Finding[]; countermeasures: { id: string; label: string; effective: number; ineffective: number; n_papers: number; papers: string[] }[];
  contradictions: { id: string; label: string }[]; gaps: string[]; readiness?: Readiness;
};

export type Mission = { profile: MissionProfile; atmosphere: Atmosphere; exposure: Record<string, number>; risks: MissionRisk[]; summary: string };

export type GapMatrix = {
  rows: { id: string; label: string; group: string }[]; cols: { id: string; label: string; group: string }[];
  cells: Record<string, { papers: string[]; flight: number; n?: number }>;
};

export const STUDY_TYPE_LABEL: Record<string, string> = {
  flight: "Orbital flight", both: "Flight + ground", short_ug: "Drop tower / parabolic", ground: "1g lab", computational: "Model / simulation", review: "Review",
};

export const DIRECTION_LABEL: Record<string, string> = { increase: "Increase", decrease: "Decrease", no_change: "No change", mixed: "Mixed" };

export type Support = { sentence: string; citations: number[]; score: number | null };
export type Confidence = { score: number; label: "high" | "medium" | "low" | "none"; reasons: string[] };
export type Filters = { study_type?: string; fuel?: string; condition?: string; geometry?: string; year_min?: number; year_max?: number };

export type Readiness = { level: number; of: number; label: string; checks: { label: string; ok: boolean; detail: string }[] };
export type Community = { id: number; label: string; size: number; members: string[]; top: string[] };
export type Central = { id: string; label: string; type: string; papers: number; pagerank: number; betweenness: number; community: number };
export type PathStep = {
  edge: string; source: string; target: string; source_label: string; target_label: string; relation: string;
  paper_count: number; majority: Direction | null; papers: PaperCard[];
};
export type EvidencePath = { nodes: { id: string; label: string; type: string }[]; steps: PathStep[]; support: number };

export type Takeaway = { kind: "consensus" | "conflict" | "gap"; consensus_id?: string; text: string };
export type Takeaways = Record<string, { label: string; n_papers: number; items: Takeaway[] }>;
export type Topic = {
  id: string; label: string; takeaways: Takeaway[]; n_papers: number; n_findings: number; consensus: Consensus[];
  by_year: [number, number][]; papers: PaperCard[];
};

export type GlossaryTerm = { term: string; definition: string };

/** Build a query string from a filter object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== 0) s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

/** Trigger a browser download of a string or Blob. */
export function download(name: string, body: string | Blob, type = "text/plain") {
  const url = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type MaterialBias = {
  groups: string[]; overall: Record<string, number>;
  rows: { id: string; label: string; n_papers: number; counts: Record<string, number>; material_share: number; flag: boolean }[];
};
export type DurationGap = {
  buckets: string[]; target_seconds: number; n_with_duration: number; overall: Record<string, number>;
  rows: { id: string; label: string; n_with_duration: number; max_seconds: number; median_seconds: number; buckets: Record<string, number> }[];
};
export type Novelty = {
  consensus_id: string; paper_id: string; title: string; year: number; direction: Direction; majority: Direction;
  n_papers: number; quote: string; study_type: string;
};
