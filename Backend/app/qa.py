import re
from typing import List, Dict, Optional
from collections import defaultdict
import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder
from app.indexer import load_index, get_model

_cross_encoder: Optional[CrossEncoder] = None

def _cross() -> CrossEncoder:
    global _cross_encoder
    if _cross_encoder is None:
        _cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=256)
    return _cross_encoder

def _bm25_scores(query: str, chunks: List[Dict], k1: float = 1.5, b: float = 0.75) -> np.ndarray:
    tokens = re.findall(r"\w+", query.lower())
    if not tokens: return np.zeros(len(chunks))
    
    texts = [(c.get("text", "") or "").lower() for c in chunks]
    lengths = np.array([len(t.split()) for t in texts], dtype=float)
    avgdl = lengths.mean() if lengths.mean() > 0 else 1.0

    scores = np.zeros(len(texts))
    for term in tokens:
        pattern = re.compile(r"\b" + re.escape(term) + r"\b")
        for i, text in enumerate(texts):
            tf = len(pattern.findall(text))
            idf = np.log((len(texts) + 1) / (1 + sum(1 for t in texts if term in t)))
            denom = tf + k1 * (1 - b + b * lengths[i] / avgdl)
            scores[i] += idf * (tf * (k1 + 1)) / denom if denom > 0 else 0
    return scores

def _hyde_query(question: str, gemini_fn) -> str:
    try:
        prompt = f"Write a short code snippet that answers:\n\n{question}\n\nReturn ONLY code."
        snippet = gemini_fn(prompt, [])
        return snippet.strip() if snippet else question
    except: return question

def _expand_queries(question: str, gemini_fn) -> List[str]:
    try:
        prompt = f"Generate 3 search queries for code retrieval.\n\nQuestion: {question}"
        raw = gemini_fn(prompt, [])
        queries = [l.strip() for l in raw.splitlines() if l.strip()][:3]
        return [question] + queries
    except: return [question]

def _compress_history(history: List[Dict], gemini_fn) -> str:
    turns = "\n".join(f"{m['role']}: {m['content']}" for m in history[-3:])
    try:
        summary = gemini_fn(f"Summarize this chat context in 1 sentence:\n\n{turns}", [])
        return summary.strip()
    except: return turns

def retrieve(
    repo_id: str,
    question: str,
    top_k: int = 5,
    history: Optional[List[Dict]] = None,
    gemini_fn = None,
    use_hyde: bool = False,
    use_multiquery: bool = False,
    use_reranking: bool = True,
    use_hybrid: bool = True,
    use_memory: bool = False,
) -> List[Dict]:
    from app.config import INDEX_DIR
    target_repos = [repo_id] if repo_id != "all" else [d.name for d in INDEX_DIR.iterdir() if d.is_dir()]
    
    all_candidate_scores = defaultdict(float)
    all_chunks_cache = {}

    for r_id in target_repos:
        try:
            index, chunks, repo_model = load_index(r_id)
            all_chunks_cache[r_id] = chunks
            bi = get_model(repo_model)
        except: continue

        enriched = question
        if use_memory and gemini_fn and history:
            context = _compress_history(history, gemini_fn)
            enriched = f"{context}\n\n{question}"

        queries = [enriched]
        if use_hyde and gemini_fn: queries.append(_hyde_query(enriched, gemini_fn))
        if use_multiquery and gemini_fn: queries.extend(_expand_queries(enriched, gemini_fn))

        for q_text in list(set(queries)):
            emb = bi.encode([q_text], convert_to_numpy=True, normalize_embeddings=True).astype("float32")
            scores, ids = index.search(emb, top_k * 2)
            for score, idx in zip(scores[0], ids[0]):
                if idx != -1: all_candidate_scores[(r_id, int(idx))] = max(all_candidate_scores[(r_id, int(idx))], float(score))

        if use_hybrid:
            bm25 = _bm25_scores(question, chunks)
            bm_max = bm25.max()
            if bm_max > 0: bm25 /= bm_max
            for idx in range(len(chunks)):
                key = (r_id, idx)
                all_candidate_scores[key] = 0.7 * all_candidate_scores[key] + 0.3 * float(bm25[idx])

    sorted_candidates = sorted(all_candidate_scores.items(), key=lambda x: x[1], reverse=True)[:top_k*2]
    
    if use_reranking and sorted_candidates:
        ce = _cross()
        pairs = [(question, all_chunks_cache[r_id][idx].get("text", "")[:300]) for (r_id, idx), _ in sorted_candidates]
        ce_scores = ce.predict(pairs)
        reranked = sorted(zip(sorted_candidates, ce_scores), key=lambda x: x[1], reverse=True)
        final_pool = [res[0][0] for res in reranked[:top_k]]
    else:
        final_pool = [item[0] for item in sorted_candidates[:top_k]]

    results = []
    for (r_id, idx) in final_pool:
        c = all_chunks_cache[r_id][idx]
        results.append({
            "repo_id": r_id,
            "file_path": c.get("file_path", "?"),
            "start_line": c.get("start_line", "?"),
            "end_line": c.get("end_line", "?"),
            "snippet": (c.get("text", "") or "")[:500],
        })
    return results