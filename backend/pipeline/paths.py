from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CSV_PATH = DATA / "processed" / "papers.csv"  # NTRS metadata (pipeline.ntrs meta)
RAW_DIR = DATA / "raw"
KB_DIR = DATA / "kb"          # build output consumed by the API
LLM_DIR = DATA / "llm"        # cached Claude extraction / summaries
LOG_DIR = DATA / "logs"       # audit + feedback logs (JSONL, gitignored)
