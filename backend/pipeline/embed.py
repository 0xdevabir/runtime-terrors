"""Dense passage embeddings (fastembed, BAAI/bge-small-en-v1.5), resumable.

CPU embedding of the full corpus takes ~30 min, so it runs in blocks cached under
data/kb/emb_parts/ keyed by a hash of each block's text: an interrupted run resumes, and a
rebuild with unchanged chunks costs nothing.

in:  data/kb/chunks.jsonl
out: data/kb/embeddings.npy (float16, L2-normalised, one row per chunk)
"""
import hashlib
import json
import time

import numpy as np

from pipeline.paths import KB_DIR

MODEL = "BAAI/bge-small-en-v1.5"
BLOCK = 512
PARTS = KB_DIR / "emb_parts"


def embed_corpus(corpus: list[str]) -> np.ndarray:
    from fastembed import TextEmbedding

    PARTS.mkdir(exist_ok=True)
    model, parts, keep, t0 = None, [], set(), time.time()
    for start in range(0, len(corpus), BLOCK):
        block = corpus[start:start + BLOCK]
        key = hashlib.sha1("\x00".join([MODEL, *block]).encode()).hexdigest()[:16]
        path = PARTS / f"{key}.npy"
        keep.add(path.name)
        if not path.exists():
            model = model or TextEmbedding(MODEL)
            vecs = np.array(list(model.embed(block, batch_size=16)), dtype=np.float32)
            vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
            np.save(path, vecs.astype(np.float16))
            done = start + len(block)
            print(f"[embed] {done}/{len(corpus)} ({time.time() - t0:.0f}s)", flush=True)
        parts.append(np.load(path))
    for stale in PARTS.glob("*.npy"):
        if stale.name not in keep:
            stale.unlink()
    return np.concatenate(parts)


def main() -> None:
    corpus = [json.loads(l)["text"] for l in open(KB_DIR / "chunks.jsonl")]
    vecs = embed_corpus(corpus)
    np.save(KB_DIR / "embeddings.npy", vecs)
    print(f"[embed] dense embeddings {vecs.shape}")


if __name__ == "__main__":
    main()
