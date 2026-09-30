# API image. Build from the repo root so the prebuilt knowledge base is included:
#   docker build -f backend/Dockerfile -t emberfall-api .
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /srv/backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --extra dense --no-install-project

COPY backend/ ./
COPY data/kb/ /srv/data/kb/
# Pre-download the embedding model so cold starts don't hit the HF Hub
RUN uv run python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

EXPOSE 8000
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
