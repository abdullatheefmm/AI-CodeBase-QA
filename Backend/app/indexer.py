import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

from app.config import INDEX_DIR

# Primary model — much faster, lighter 384-dim model for CPU
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
# Fallback model for legacy indexes
MODEL_NAME_LEGACY = "sentence-transformers/all-MiniLM-L6-v2"

_models: dict = {}  # cache: model_name -> SentenceTransformer


def get_model(model_name: str = MODEL_NAME) -> SentenceTransformer:
    global _models
    if model_name not in _models:
        print(f"[Indexer] Loading embedding model: {model_name}")
        _models[model_name] = SentenceTransformer(model_name)
    return _models[model_name]


def index_repo(repo_id: str, chunks: List[Dict]) -> Tuple[Path, Path]:
    model = get_model(MODEL_NAME)

    # Use embed_text if available (includes docstring context prefix),
    # otherwise fall back to raw text
    texts = [c.get("embed_text") or c.get("text", "") for c in chunks]

    # BGE models benefit from a passage prefix
    prefixed = [f"Represent this sentence: {t}" if t else t for t in texts]

    embs = model.encode(
        prefixed,
        convert_to_numpy=True,
        show_progress_bar=True,
        normalize_embeddings=True,
        batch_size=64,
    ).astype("float32")

    dim = embs.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embs)

    repo_dir = INDEX_DIR / repo_id
    repo_dir.mkdir(parents=True, exist_ok=True)

    index_path = repo_dir / "faiss.index"
    meta_path  = repo_dir / "meta.json"

    faiss.write_index(index, str(index_path))

    # Save model name + dim alongside chunks so load_index can pick the right encoder
    meta = {
        "model":  MODEL_NAME,
        "dim":    dim,
        "chunks": chunks,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[Indexer] Indexed {len(chunks)} chunks with {MODEL_NAME} ({dim}-dim)")
    return index_path, meta_path


def load_index(repo_id: str):
    """Returns (faiss_index, chunks, model_name) for this repo."""
    repo_dir   = INDEX_DIR / repo_id
    index_path = repo_dir / "faiss.index"
    meta_path  = repo_dir / "meta.json"

    if not index_path.exists() or not meta_path.exists():
        raise FileNotFoundError("Index not found for this repo_id. Upload the repo first.")

    index = faiss.read_index(str(index_path))
    raw   = json.loads(meta_path.read_text(encoding="utf-8"))

    # Support both old format (list of chunks) and new format (dict with model info)
    if isinstance(raw, list):
        chunks     = raw
        model_name = MODEL_NAME_LEGACY  # old index → legacy model
    else:
        chunks     = raw.get("chunks", [])
        model_name = raw.get("model", MODEL_NAME_LEGACY)

    return index, chunks, model_name
