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
  id: string; title: string; year: string | number; journal?: string; url: string; doi?: string; study_type: string;
  organisms: string[]; stressors: string[]; platforms: string[]; tissues: string[]; osdr_ids: string[];
  full_text: boolean; n_findings: number; key_finding: string; authors: string[]; n_authors: number;
};

export type Finding = {
  id: string; paper_id: string; organism: string | null; stressor: string; tissue: string | null; outcome: string;
  direction: Direction; genes: string[]; countermeasure: string | null; countermeasure_effect: string | null;
  evidence_quote: string; section: string; confidence: number; method: string; year: number; study_type: string;
  magnitude?: string | null; paper_title: string; paper_url: string; labels: Record<string, string | null>;
};

export type PaperDetail = PaperCard & {
  keywords: string[]; abstract: string; duration: { value: number; unit: string; days: number } | null;
  summary: { l1: string; l2: string[]; l3: string; key_finding: string; method: string };
  findings: Finding[]; sections: Record<string, number>; osdr: { id: string; url: string }[];
  related: PaperCard[]; labels: Record<string, string>; word_count: number;
};

export type Passage = {
  chunk_id: string; paper_id: string; title: string; year: number; url: string; section: string; text: string;
  entities: string[]; study_type: string; score: number; coverage: number;
};

export type GNode = { id: string; type: string; label: string; group: string; ontology: string | null; papers: number; flight_papers: number };
export type GEdge = {
  id: string; source: string; target: string; relation: string; paper_count: number; majority: Direction | null;
  agreement: number; strength: Strength; directions: Record<string, number>;
};

export type Consensus = {
  id: string; stressor: string; outcome: string; tissue: string | null; n_papers: number; votes: Record<string, number>;
  majority: Direction; agreement: number; status: "consensus" | "contradictory" | "emerging"; strength: Strength; label: string;
  explanations: string[];
  sides?: Record<string, { paper_id: string; title: string; year: number; quote: string; organism: string | null; study_type: string; duration_days: number | null }[]>;
  labels?: Record<string, string | null>;
};

export type Hypothesis = {
  id: string; a: string; c: string; score: number; text: string; a_label: string; c_label: string;
  bridges: { b: string; label: string; ab_papers: string[]; bc_papers: string[] }[];
};

export type Stats = {
  papers: number; full_text: number; chunks: number; findings: number; nodes: number; edges: number; contradictions: number;
  consensus: number; osdr_linked: number; llm_papers: number; years: [number, number]; study_types: Record<string, number>;
  quote_guard: Record<string, number>; llm: boolean;
  top: Record<string, { id: string; label: string; papers: number }[]>;
  contradictions_preview: Consensus[]; hypotheses_preview: Hypothesis[];
};

export type MissionProfile = {
  id?: string; name: string; destination: string; duration_days: number; microgravity_days: number; partial_gravity_days: number;
  dose_msv_per_day: number; comm_delay_min: number; crew: number; blurb?: string;
};

export type MissionRisk = {
  id: string; name: string; severity: number; exposure: number; relevance: number; uncertainty: number; priority: number;
  tier: "high" | "medium" | "low";
  evidence: { strength: Strength; n_papers: number; n_findings: number; n_human: number; n_flight: number; by_stressor: Record<string, number> };
  key_findings: Finding[]; countermeasures: { id: string; label: string; effective: number; ineffective: number; n_papers: number; papers: string[] }[];
  contradictions: { id: string; label: string }[]; gaps: string[];
};

export type Mission = { profile: MissionProfile; total_dose_msv: number; exposure: Record<string, number>; risks: MissionRisk[]; summary: string };

export type GapMatrix = {
  rows: { id: string; label: string; group: string }[]; cols: { id: string; label: string; group: string }[];
  cells: Record<string, { papers: string[]; flight: number; n?: number }>;
};

export const STUDY_TYPE_LABEL: Record<string, string> = {
  flight: "Spaceflight", both: "Flight + analog", ground_analog: "Ground analog", ground: "Ground lab", review: "Review",
};

export const DIRECTION_LABEL: Record<string, string> = { increase: "Increase", decrease: "Decrease", no_change: "No change", mixed: "Mixed" };
