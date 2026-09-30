# Data sources

Everything here is reproducible with `cd backend && uv run python -m pipeline.ntrs all`
(cached; re-running only fetches what is missing). Raw downloads live in `data/raw/` (gitignored).

## NASA Technical Reports Server (NTRS) — **in use**

| | |
|---|---|
| URL | https://ntrs.nasa.gov/search · API `https://ntrs.nasa.gov/api/citations/search` |
| Contains | Metadata + abstracts of NASA technical reports, conference papers, presentations, and CHORUS-linked journal articles; PDFs for records disseminated as `DOCUMENT_AND_METADATA` |
| Format | JSON (search API), PDF (downloads) |
| Access | Public, no login, no API key |
| License / terms | Per-record `copyright.determinationType` in the raw JSON (most NASA-authored items are `GOV_PUBLIC_USE_PERMITTED`). Non-NASA items (journal reprints, contractor reports) can carry publisher copyright: use short quotes with citation and link back to NTRS; do not redistribute those PDFs. |
| Accessed | 2026-09-30 |
| Status | Usable |

**Queries** (run verbatim, results deduplicated by NTRS id):
`microgravity combustion` · `flame spread microgravity` · `Saffire spacecraft fire` · `spacecraft fire safety` ·
`flammability oxygen concentration` · `droplet combustion microgravity` · `SoFIE solid fuel ignition extinction`

**Implementation notes**
- The API **ignores `page.number`** (every page returns the first 100 hits). Paging uses `page.from=<offset>`, verified: `flame spread microgravity` gives 100 + 94 = 194 = reported total.
- Search is full-text relevance ranked, not a strict filter: the broad `microgravity combustion` query (1,076 hits) includes loosely related items (e.g. general microgravity fluids / materials work). Relevance filtering is a later pipeline step, not done here.
- Record ids are integers for NTRS submissions and 14-digit strings for CHORUS-index journal articles (DOI, no PDF on NTRS).
- Politeness: 1 request/second, exponential-backoff retries on 429/5xx/network errors. PDF cache capped at 1 GB (`MAX_PDF_BYTES`).
- Failures (HTTP errors, non-PDF responses, PDFs with no text layer) are appended to `data/raw/ntrs/failures.log`.

**Outputs**
| Path | What |
|---|---|
| `data/raw/ntrs/metadata/<query>__fromNNNNN.json` | Raw API pages, unchanged, with query + fetch timestamp |
| `data/raw/ntrs/pdfs/<id>.pdf` | Original PDFs |
| `data/processed/papers.csv` | One row per unique record: `id, title, year, authors, abstract, center, pdf_url, has_pdf, sti_type, disseminated, doi, source_index, ntrs_url, queries` |
| `data/processed/text/<id>.txt` | Text extracted with `pypdf` (no OCR) |
| `data/processed/ntrs_audit.json` | Counts behind `data/AUDIT.md` |

`year` is the publication date from `publications[]`; it is left blank (not guessed) when NTRS has none.

## Not yet collected

Named in the planning brief but **not fetched** in this pass (NTRS-only scope agreed 2026-09-30):
NASA Physical Sciences Informatics (psi.nasa.gov, Angular app; API/access not yet confirmed), data.nasa.gov,
Zenodo, Figshare, Harvard Dataverse, Mendeley Data, NIST, OpenAlex/Semantic Scholar.

The official challenge page (spaceappschallenge.org, 2026) currently publishes only the summary; its
details and resources sections are empty (`detailsContent`/`resourcesTabContent` = null in the site API
on 2026-09-30), so there is no official resource list to align with yet.
