"""
database.py – MongoDB connection using Motor (async driver)
"""
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import IndexModel, ASCENDING
import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/")
DB_NAME   = "codebase_ai"

client = AsyncIOMotorClient(MONGO_URI)
db     = client[DB_NAME]

# Collections
users_col    = db["users"]
repos_col    = db["repos"]
sessions_col = db["chat_sessions"]


async def init_db():
    """Create indexes on startup."""
    await users_col.create_index("email", unique=True)
    await users_col.create_index("verify_token")
    await repos_col.create_index([("user_id", ASCENDING)])
    await sessions_col.create_index([("user_id", ASCENDING)])
    await sessions_col.create_index([("updated_at", ASCENDING)])