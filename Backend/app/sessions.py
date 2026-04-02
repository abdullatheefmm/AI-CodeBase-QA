"""
sessions.py – Chat session persistence routes
Routes:
  GET    /sessions            – list all sessions for current user
  POST   /sessions            – create new session
  GET    /sessions/{id}       – get session with messages
  PUT    /sessions/{id}       – update session (save messages)
  DELETE /sessions/{id}       – delete session
"""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from app.database import sessions_col, repos_col
from app.auth     import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ── Pydantic models ───────────────────────────────────────────────────────────
class MessageModel(BaseModel):
    role:         str
    content:      str
    intent:       Optional[str]   = None
    faithfulness: Optional[float] = None
    warning:      Optional[str]   = None
    matches:      Optional[list]  = None


class CreateSessionRequest(BaseModel):
    title:   str = "New Chat"
    repo_id: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    title:    Optional[str]          = None
    messages: Optional[List[dict]]   = None
    repo_id:  Optional[str]          = None


def _fmt(session: dict) -> dict:
    session["id"] = str(session.pop("_id"))
    return session


# ── Routes ────────────────────────────────────────────────────────────────────
@router.get("")
async def list_sessions(current_user=Depends(get_current_user)):
    cursor = sessions_col.find(
        {"user_id": str(current_user["_id"])},
        {"messages": 0}               # exclude messages for performance
    ).sort("updated_at", -1).limit(50)

    sessions = []
    async for s in cursor:
        sessions.append(_fmt(s))
    return sessions


@router.post("")
async def create_session(req: CreateSessionRequest, current_user=Depends(get_current_user)):
    doc = {
        "user_id":    str(current_user["_id"]),
        "title":      req.title,
        "repo_id":    req.repo_id,
        "messages":   [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await sessions_col.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.get("/{session_id}")
async def get_session(session_id: str, current_user=Depends(get_current_user)):
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(400, "Invalid session ID")

    session = await sessions_col.find_one({
        "_id":     oid,
        "user_id": str(current_user["_id"]),
    })
    if not session:
        raise HTTPException(404, "Session not found")
    return _fmt(session)


@router.put("/{session_id}")
async def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    current_user=Depends(get_current_user),
):
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(400, "Invalid session ID")

    updates = {"updated_at": datetime.utcnow()}
    if req.title    is not None: updates["title"]    = req.title
    if req.messages is not None: updates["messages"] = req.messages
    if req.repo_id  is not None: updates["repo_id"]  = req.repo_id

    result = await sessions_col.update_one(
        {"_id": oid, "user_id": str(current_user["_id"])},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user=Depends(get_current_user)):
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(400, "Invalid session ID")

    result = await sessions_col.delete_one({
        "_id":     oid,
        "user_id": str(current_user["_id"]),
    })
    if result.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}