"""
auth_utils.py – JWT creation/verification + bcrypt password hashing
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt

SECRET_KEY      = os.getenv("JWT_SECRET", "change-this-to-a-long-random-string-in-production")
ALGORITHM       = "HS256"
TOKEN_EXPIRE_DAYS = 30


# ── Password hashing ─────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub":   user_id,
        "email": email,
        "exp":   datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── Email verification token ──────────────────────────────────────────────────
def generate_verify_token() -> str:
    return secrets.token_urlsafe(32)