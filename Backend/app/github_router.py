"""
github_router.py — GitHub integration
- List all repos of a user/org
- Show repo files/structure  
- Download repo as ZIP
- Auto-index repo directly (no upload needed)
"""
from __future__ import annotations
import os, re, io, zipfile, tempfile, shutil, httpx, uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv()

from app.chunker  import build_chunks
from app.indexer  import index_repo
from app.database import repos_col
from app.auth     import get_current_user
from datetime import datetime

router = APIRouter(prefix="/github", tags=["github"])

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
BASE = "https://api.github.com"

def _headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h

def _parse_github_url(url: str) -> dict:
    url = url.strip().rstrip("/")
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", url)
    if m:
        return {"type": "repo", "owner": m.group(1), "repo": m.group(2)}
    m = re.match(r"https?://github\.com/([^/]+)$", url)
    if m:
        return {"type": "user", "owner": m.group(1)}
    return {"type": "unknown"}


class GithubRequest(BaseModel):
    url: str

class IndexRequest(BaseModel):
    owner:  str
    repo:   str
    branch: str = "main"


@router.post("/explore")
async def explore_github(req: GithubRequest):
    parsed = _parse_github_url(req.url)
    if parsed["type"] == "unknown":
        raise HTTPException(400, "Invalid GitHub URL. Use github.com/user or github.com/user/repo")

    async with httpx.AsyncClient(timeout=15) as client:

        if parsed["type"] == "user":
            owner = parsed["owner"]
            resp = await client.get(f"{BASE}/users/{owner}/repos", headers=_headers(),
                                    params={"per_page": 50, "sort": "updated", "type": "public"})
            if resp.status_code == 404:
                resp = await client.get(f"{BASE}/orgs/{owner}/repos", headers=_headers(),
                                        params={"per_page": 50, "sort": "updated"})
            if resp.status_code != 200:
                raise HTTPException(resp.status_code, f"GitHub API error: {resp.text}")

            repos = resp.json()
            return {
                "type":  "user",
                "owner": owner,
                "repos": [
                    {
                        "name":           r["name"],
                        "full_name":      r["full_name"],
                        "description":    r.get("description") or "",
                        "url":            r["html_url"],
                        "clone_url":      r["clone_url"],
                        "zip_url":        f"https://github.com/{r['full_name']}/archive/refs/heads/{r.get('default_branch','main')}.zip",
                        "stars":          r.get("stargazers_count", 0),
                        "forks":          r.get("forks_count", 0),
                        "language":       r.get("language") or "Unknown",
                        "updated_at":     r.get("updated_at",""),
                        "private":        r.get("private", False),
                        "size_kb":        r.get("size", 0),
                        "default_branch": r.get("default_branch", "main"),
                        "owner":          owner,
                    }
                    for r in repos
                ],
            }

        elif parsed["type"] == "repo":
            owner, repo = parsed["owner"], parsed["repo"]
            info_resp = await client.get(f"{BASE}/repos/{owner}/{repo}", headers=_headers())
            if info_resp.status_code == 404:
                raise HTTPException(404, f"Repo {owner}/{repo} not found")
            if info_resp.status_code != 200:
                raise HTTPException(info_resp.status_code, f"GitHub error: {info_resp.text}")

            info = info_resp.json()
            default_branch = info.get("default_branch", "main")

            tree_resp = await client.get(
                f"{BASE}/repos/{owner}/{repo}/git/trees/{default_branch}",
                headers=_headers(), params={"recursive": "1"}
            )
            tree = []
            if tree_resp.status_code == 200:
                tree_data = tree_resp.json().get("tree", [])
                tree = [
                    {"path": t["path"], "type": t["type"], "size": t.get("size", 0)}
                    for t in tree_data if t["type"] in ("blob", "tree")
                ][:300]

            return {
                "type":           "repo",
                "owner":          owner,
                "repo":           repo,
                "full_name":      info["full_name"],
                "description":    info.get("description") or "",
                "url":            info["html_url"],
                "zip_url":        f"https://github.com/{owner}/{repo}/archive/refs/heads/{default_branch}.zip",
                "clone_url":      info["clone_url"],
                "stars":          info.get("stargazers_count", 0),
                "forks":          info.get("forks_count", 0),
                "language":       info.get("language") or "Unknown",
                "default_branch": default_branch,
                "size_kb":        info.get("size", 0),
                "topics":         info.get("topics", []),
                "tree":           tree,
            }


@router.get("/download")
async def download_repo(owner: str, repo: str, branch: str = "main"):
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(zip_url, headers=_headers())
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, "Could not download ZIP from GitHub")
        filename = f"{repo}-{branch}.zip"
        return StreamingResponse(
            iter([resp.content]),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )


@router.post("/index")
async def index_github_repo(
    req: IndexRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """
    Download + index a GitHub repo directly — no manual upload needed.
    Returns repo_id immediately; indexing runs in background.
    """
    repo_id  = str(uuid.uuid4())[:8]
    zip_url  = f"https://github.com/{req.owner}/{req.repo}/archive/refs/heads/{req.branch}.zip"

    # Check size first
    print(f"[GitHub Index] Request: owner={req.owner!r} repo={req.repo!r} branch={req.branch!r}")
    if not req.owner or not req.repo:
        raise HTTPException(400, f"Missing owner or repo name. Got owner={req.owner!r} repo={req.repo!r}")
    async with httpx.AsyncClient(timeout=10) as client:
        info_resp = await client.get(f"{BASE}/repos/{req.owner}/{req.repo}", headers=_headers())
        if info_resp.status_code == 404:
            raise HTTPException(404, f"Repo {req.owner}/{req.repo} not found on GitHub")
        if info_resp.status_code != 200:
            raise HTTPException(info_resp.status_code, f"GitHub API error: {info_resp.text[:200]}")
        size_kb = info_resp.json().get("size", 0)
        size_mb = size_kb // 1024
        if size_kb > 500_000:  # 500MB hard limit
            raise HTTPException(400, f"Repo too large ({size_mb}MB). Max 500MB. Try a smaller repo.")

    # Insert pending record immediately
    await repos_col.insert_one({
        "repo_id":        repo_id,
        "user_id":        str(current_user["_id"]),
        "name":           f"{req.owner}/{req.repo}",
        "files_indexed":  0,
        "chunks_indexed": 0,
        "status":         "indexing",
        "created_at":     datetime.utcnow(),
    })

    # Index in background
    background_tasks.add_task(
        _download_and_index,
        repo_id=repo_id,
        owner=req.owner,
        repo=req.repo,
        branch=req.branch,
        zip_url=zip_url,
        user_id=str(current_user["_id"]),
    )

    return {
        "repo_id": repo_id,
        "status":  "indexing",
        "message": f"Indexing {req.owner}/{req.repo} in the background. It will appear in your repo list when done.",
    }


@router.get("/index-status/{repo_id}")
async def index_status(repo_id: str, current_user=Depends(get_current_user)):
    """Poll this to check if background indexing is done."""
    doc = await repos_col.find_one({"repo_id": repo_id})
    if not doc:
        raise HTTPException(404, "Repo not found")
    return {
        "repo_id":        repo_id,
        "status":         doc.get("status", "unknown"),
        "files_indexed":  doc.get("files_indexed", 0),
        "chunks_indexed": doc.get("chunks_indexed", 0),
        "name":           doc.get("name",""),
    }


async def _download_and_index(repo_id: str, owner: str, repo: str, branch: str, zip_url: str, user_id: str):
    """Background task: download ZIP, extract, chunk, index."""
    tmp_dir = None
    try:
        print(f"[GitHub Index] Downloading {owner}/{repo}...")
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(zip_url, headers=_headers())
            if resp.status_code != 200:
                raise Exception(f"Download failed: {resp.status_code}")

        # Extract ZIP to temp dir
        tmp_dir = Path(tempfile.mkdtemp())
        zip_bytes = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_bytes) as zf:
            zf.extractall(tmp_dir)

        # GitHub ZIPs have a top-level folder like "repo-main/"
        extracted_dirs = [d for d in tmp_dir.iterdir() if d.is_dir()]
        repo_path = extracted_dirs[0] if extracted_dirs else tmp_dir

        print(f"[GitHub Index] Chunking {repo_path}...")
        chunks = build_chunks(repo_path)  # Pass Path object, not str

        if len(chunks) < 3:
            raise Exception("Repo has no supported code files")

        print(f"[GitHub Index] Indexing {len(chunks)} chunks...")
        index_repo(repo_id, chunks)

        files_count = len(set(c["file_path"] for c in chunks))

        # Update DB record
        await repos_col.update_one(
            {"repo_id": repo_id},
            {"$set": {
                "files_indexed":  files_count,
                "chunks_indexed": len(chunks),
                "status":         "ready",
            }}
        )
        print(f"[GitHub Index] ✓ Done! {files_count} files, {len(chunks)} chunks")

    except Exception as e:
        print(f"[GitHub Index] ✗ Error: {e}")
        await repos_col.update_one(
            {"repo_id": repo_id},
            {"$set": {"status": "error", "error": str(e)}}
        )
    finally:
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)