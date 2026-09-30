# Emberfall — Flame in Freefall — common tasks. Run `make help`.
# pass backend/.env to uv when present (ANTHROPIC_API_KEY etc.)
RUN = uv run $$( [ -f .env ] && echo --env-file .env )

.PHONY: help setup data fetch process extract collect build embed eval test label api web dev docker up

help:
	@grep -E '^[a-z-]+:.*## ' Makefile | sed 's/:.*## /\t/' | column -t -s $$'\t'

setup: ## Install backend (uv) and web (pnpm) dependencies
	cd backend && uv sync --extra dense
	cd web && pnpm install

data: fetch process build ## Full pipeline: download papers -> process -> build KB (~40 min, mostly NCBI downloads)

fetch: ## Download full text for every PMCID in the CSV (BioC JSON, efetch XML fallback; resumable)
	cd backend && uv run python -m pipeline.fetch

process: ## Parse full text into sections, passages, metadata
	cd backend && uv run python -m pipeline.process

extract: ## Claude extraction + summaries via the Batch API (needs ANTHROPIC_API_KEY): submit, then `make collect`
	cd backend && $(RUN) python -m pipeline.extract_llm submit

collect: ## Collect finished Claude batch results, then rebuild the KB
	cd backend && $(RUN) python -m pipeline.extract_llm collect && uv run python -m pipeline.build

build: ## Build KB: findings, graph, consensus/conflicts, gaps, trends, risks, hypotheses, search indexes
	cd backend && uv run python -m pipeline.build

embed: ## (Re)compute dense passage embeddings only (~30 min on CPU; resumable, cached per block)
	cd backend && uv run python -m pipeline.embed


test: ## Backend unit tests
	cd backend && uv run --with pytest pytest -q

label: ## Sample 100 extracted findings into backend/eval/extraction_labels.csv for human accuracy labelling
	cd backend && uv run python -m eval.extraction sample --n 100

eval: ## Score retrieval (with per-stage baselines), refusals, citations and faithfulness
	cd backend && $(RUN) python -m eval.run_eval

api: ## Run the API on :8000
	cd backend && $(RUN) uvicorn app.main:app --port 8000 --reload --reload-dir app

web: ## Run the web app on :3000 (proxies /api to :8000)
	cd web && pnpm dev

dev: ## Run API and web together
	$(MAKE) -j2 api web

docker: ## Build the API image (bundles data/kb)
	docker build -f backend/Dockerfile -t emberfall-api .

up: ## Run the whole stack in Docker (API :8000, web :3000)
	docker compose up --build
