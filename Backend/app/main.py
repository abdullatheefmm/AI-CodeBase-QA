# pyre-ignore-all-errors
from dotenv import load_dotenv
load_dotenv()

import re, uuid, shutil, traceback
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path

from app.ingest        import save_upload, extract_zip
from app.chunker       import build_chunks
from app.indexer       import index_repo
from app.qa            import retrieve
from app.llm_gemini    import generate_answer_gemini, classify_intent, simple_generate
from app.database      import init_db, repos_col
from app.auth          import router as auth_router, get_current_user
from app.sessions      import router as sessions_router
from app.github_router import router as github_router
from app.config        import INDEX_DIR

app = FastAPI(title="CodeBase AI")
app.add_middleware(CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
    ],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()

app.include_router(auth_router)
app.include_router(sessions_router)
app.include_router(github_router)

class HistoryMessage(BaseModel):
    role: str
    content: str

class AnswerRequest(BaseModel):
    repo_id:        str    
    question:       str
    top_k:          int = 6
    history:        List[HistoryMessage] = []
    use_hyde:       bool = False
    use_multiquery: bool = False
    use_reranking:  bool = True
    use_hybrid:     bool = True
    use_memory:     bool = False

@app.get("/health")
def health():
    return {"ok": True, "model": "llama-3.3-70b (Groq)"}

@app.post("/upload")
async def upload_repo(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Upload a .zip repository")
    repo_id   = str(uuid.uuid4())[:8]
    zip_bytes = await file.read()
    zip_path  = save_upload(zip_bytes, file.filename)
    repo_path = extract_zip(zip_path, repo_id)
    chunks    = build_chunks(repo_path)
    if len(chunks) < 5:
        raise HTTPException(400, "Repo too small or no supported code files found")
    index_repo(repo_id, chunks)
    await repos_col.insert_one({
        "repo_id": repo_id, "user_id": str(current_user["_id"]),
        "name": file.filename,
        "files_indexed":  len(set(c["file_path"] for c in chunks)),
        "chunks_indexed": len(chunks),
        "created_at": datetime.utcnow(),
    })
    return {
        "repo_id": repo_id,
        "files_indexed":  len(set(c["file_path"] for c in chunks)),
        "chunks_indexed": len(chunks),
    }

@app.get("/repos")
async def list_repos(current_user=Depends(get_current_user)):
    cursor = repos_col.find({"user_id": str(current_user["_id"])}).sort("created_at", -1)
    repos  = []
    async for r in cursor:
        r["id"] = r.pop("repo_id")
        r.pop("_id", None); r.pop("user_id", None)
        repos.append(r)
    return repos

@app.delete("/repos/{repo_id}")
async def delete_repo(repo_id: str, current_user=Depends(get_current_user)):
    doc = await repos_col.find_one({"repo_id": repo_id, "user_id": str(current_user["_id"])})
    if not doc:
        raise HTTPException(404, "Repo not found")
    await repos_col.delete_one({"repo_id": repo_id})
    index_dir = INDEX_DIR / repo_id
    if index_dir.exists():
        shutil.rmtree(index_dir, ignore_errors=True)
    return {"deleted": repo_id}

@app.get("/repos/{repo_id}/tree")
async def get_repo_tree(repo_id: str, current_user=Depends(get_current_user)):
    """Return a hierarchical file/folder tree built from the indexed chunks."""
    from app.indexer import load_index
    try:
        _, chunks, _ = load_index(repo_id)
    except FileNotFoundError:
        raise HTTPException(404, "Repo index not found")

    # Collect unique file paths + their chunk counts and line ranges
    file_info: dict = {}
    for c in chunks:
        fp = c.get("file_path", "")
        if not fp:
            continue
        if fp not in file_info:
            file_info[fp] = {"chunks": 0, "lines": c.get("end_line", 0)}
        file_info[fp]["chunks"] += 1
        file_info[fp]["lines"] = max(file_info[fp]["lines"], c.get("end_line", 0))

    # Build nested tree dict
    def insert(tree: dict, parts: list, info: dict):
        node = parts[0]
        if len(parts) == 1:
            # It's a file
            tree.setdefault("__files__", []).append({
                "name": node,
                "lines": info["lines"],
                "chunks": info["chunks"],
            })
        else:
            tree.setdefault("__dirs__", {}).setdefault(node, {})
            insert(tree["__dirs__"][node], parts[1:], info)

    root: dict = {}
    for fp, info in sorted(file_info.items()):
        parts = fp.replace("\\", "/").split("/")
        insert(root, parts, info)

    return {"tree": root, "total_files": len(file_info)}

@app.post("/answer")
async def answer(req: AnswerRequest, current_user=Depends(get_current_user)):
    if not req.question.strip():
        raise HTTPException(400, "Empty question")

    intent = classify_intent(req.question)
    print(f"[Answer] Q: {req.question[:60]} | intent: {intent}")

    history_dicts = [m.model_dump() for m in req.history]

    try:
        results = retrieve(
            repo_id=req.repo_id, question=req.question,
            top_k=req.top_k, history=history_dicts, gemini_fn=simple_generate,
            use_hyde=req.use_hyde, use_multiquery=req.use_multiquery,
            use_reranking=req.use_reranking, use_hybrid=req.use_hybrid,
            use_memory=req.use_memory,
        )
    except FileNotFoundError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        traceback.print_exc()   # ← full stack trace in backend terminal
        raise HTTPException(500, f"Retrieval failed: {e}")

    if not results:
        return {
            "question": req.question,
            "answer":   "No relevant code found in this repository.",
            "thinking": "",
            "intent": intent, "faithfulness": 0.0, "warning": None,
            "sources": [], "matches": [],
        }

    contexts = results[:5]
    try:
        llm_result = generate_answer_gemini(req.question, contexts, intent=intent)
    except Exception as e:
        raise HTTPException(500, f"Answer generation failed: {e}")

    sources = [
        f'{r.get("file_path","?")}:{r.get("start_line","?")}-{r.get("end_line","?")}'
        for r in results[:5]
    ]

    return {
        "question":     req.question,
        "answer":       llm_result["answer"],
        "thinking":     llm_result.get("thinking", ""),
        "intent":       llm_result["intent"],
        "faithfulness": llm_result["faithfulness"],
        "warning":      llm_result["warning"],
        "sources":      sources,
        "matches":      results,
        "suggestions":  llm_result.get("suggestions", []),
        "diagram":      llm_result.get("diagram", None),
    }