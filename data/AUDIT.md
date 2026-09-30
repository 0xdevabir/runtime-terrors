# Data audit

Generated 2026-09-30 from `data/processed/ntrs_audit.json` (`uv run python -m pipeline.ntrs audit`).
Only NTRS has been collected so far (see `SOURCES.md`).

## NTRS literature — `data/processed/papers.csv`

**Type: semi-structured text** (metadata + abstracts + report PDFs). It is not an experiment table;
experiment conditions (O₂ %, pressure, flow velocity, spread rate…) exist only inside abstracts and full text
and would have to be extracted.

### Record counts

| | Count |
|---|---:|
| Raw hits across 7 queries (with overlap) | 1,859 |
| Unique records after dedupe by NTRS id | **1,334** |
| &nbsp;&nbsp;NTRS submissions / CHORUS journal links | 1,317 / 17 |
| With a PDF link | **965** |
| Without a PDF → **abstract/metadata only** | **369** |
| &nbsp;&nbsp;of which also have no abstract (title only) | 18 |
| Empty abstract (all records) | 27 |
| Missing publication year | 72 |
| Title/abstract mentions a combustion term (flame, fire, combust, flammab, ignit, extinct, burn, droplet, soot) | 1,188 (855 with PDF) |
| Abstract contains a number with an O₂/pressure/velocity unit (%, kPa, atm, psia, cm/s, mm/s, m/s) | 138 |

Hits per query: microgravity combustion 1,076 · spacecraft fire safety 319 · flame spread microgravity 194 ·
droplet combustion microgravity 181 · flammability oxygen concentration 60 · Saffire spacecraft fire 28 ·
SoFIE solid fuel ignition extinction 1.

Mentions in title/abstract: Saffire 25 · CIR 29 · BASS 8 · FLEX 6 · ACME 5 · SoFIE 1.

### Columns (`papers.csv`)

| Column | Notes | Missing |
|---|---|---:|
| `id` | NTRS id (int-like; 14-digit for CHORUS) | 0 |
| `title` | | 0 |
| `year` | From `publications[].publicationDate`; blank if NTRS has none | 72 |
| `authors` | `;`-separated, NTRS order | — |
| `abstract` | Whitespace-normalised | 27 |
| `center` | NASA center code (GRC 685, CDMS 436, JSC 68, MSFC 53, HQ 42, …) | 17 |
| `pdf_url` / `has_pdf` | First PDF in `downloads[]` | 369 without |
| `sti_type` | CONFERENCE_PAPER 763, OTHER 122, PRESENTATION 75, TM 65, … VIDEO 9 | 0 |
| `disseminated` | `DOCUMENT_AND_METADATA` 985 / `METADATA_ONLY` 349 | 0 |
| `doi` | Only when NTRS lists one | many |
| `source_index`, `ntrs_url`, `queries` | Provenance | 0 |

No units apply at the metadata level.

### Year distribution (by decade)

| 1950s | 1960s | 1970s | 1980s | 1990s | 2000s | 2010s | 2020s | unknown |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 45 | 91 | 518 | 453 | 127 | 25 | 72 |

The corpus peaks in 1995–2004 (the NASA microgravity combustion conference proceedings). ISS-era work
(Saffire, BASS, FLEX, ACME, 2010+) is only about 150 records.

### PDFs — **paused**

| | |
|---|---|
| Downloaded | 5 of 965 (345.6 MB) |
| Text extracted | 0 |
| Failures logged | 0 |

The download was stopped deliberately. A 25-file random HEAD sample estimated about 0.9 GB for all 965 PDFs,
but the first files were 1970s scanned proceedings of 19–147 MB each. Scanned PDFs also have no text layer for
`pypdf`. NTRS serves its own extracted text per document (`links.fulltext`); for the 126 MB proceedings PDF that
file is 578 KB. How to continue is an open decision (see the Step 0 questions).

## ML readiness

**Not ML-ready as collected.** No NTRS record has tabular experiment rows. Any experiment table
(conditions → spread rate / extinction) would come from LLM extraction of numbers in abstracts and full text.
Only about 138 abstracts show such numbers at all, and every extracted value needs to be marked as extracted
and linked to its passage. A structured experiment dataset (e.g. from NASA PSI) has **not** been located or
confirmed yet.

## Other files in `data/` (from the previous project)

`data/raw/PMC*.json` (about 52 MB, space-biology full text, gitignored, deletion already staged in git),
`data/SB_publication_PMC.csv`, and `data/kb/` (77 MB built space-biology KB). They have not been touched and
are pending your decision.
