"""
auth.py – FastAPI auth router (no email verification)
Routes:
  POST /auth/register   – sign up, instantly active
  POST /auth/login      – login, returns JWT
  GET  /auth/me         – get current user info
  POST /auth/logout     – client-side logout
"""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

from app.database   import users_col
from app.auth_utils import (
    hash_password, verify_password,
    create_access_token, decode_access_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name:     str
    email:    EmailStr
    password: str


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


# ── Dependency: get current user from JWT ─────────────────────────────────────
async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user = await users_col.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    return user


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/register")
async def register(req: RegisterRequest):
    # Validate
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if not req.name.strip():
        raise HTTPException(400, "Name is required.")

    # Check duplicate email
    existing = await users_col.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(400, "An account with this email already exists.")

    # Create user — verified immediately, no email step
    user = {
        "name":          req.name.strip(),
        "email":         req.email.lower(),
        "password_hash": hash_password(req.password),
        "verified":      True,
        "created_at":    datetime.utcnow(),
    }
    result = await users_col.insert_one(user)

    # Auto-login on register — return token immediately
    access_token = create_access_token(str(result.inserted_id), req.email.lower())
    return {
        "message":      "Account created successfully!",
        "access_token": access_token,
        "email":        req.email.lower(),
        "name":         req.name.strip(),
        "user_id":      str(result.inserted_id),
    }


@router.post("/login")
async def login(req: LoginRequest):
    user = await users_col.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password.")

    await users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )

    access_token = create_access_token(str(user["_id"]), user["email"])
    return {
        "access_token": access_token,
        "email":        user["email"],
        "name":         user.get("name", user["email"].split("@")[0]),
        "user_id":      str(user["_id"]),
    }


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return {
        "user_id":    str(current_user["_id"]),
        "email":      current_user["email"],
        "name":       current_user.get("name", ""),
        "created_at": current_user.get("created_at"),
        "last_login": current_user.get("last_login"),
    }


@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully."}