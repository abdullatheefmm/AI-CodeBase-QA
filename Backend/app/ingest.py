import shutil
import zipfile
from pathlib import Path
from uuid import uuid4

from app.config import UPLOADS_DIR, REPOS_DIR


def save_upload(zip_bytes: bytes, filename: str) -> Path:
    safe_name = filename.replace("/", "_").replace("\\", "_")
    dest = UPLOADS_DIR / f"{uuid4().hex}_{safe_name}"
    dest.write_bytes(zip_bytes)
    return dest


def extract_zip(zip_path: Path, repo_id: str) -> Path:
    repo_path = REPOS_DIR / repo_id
    if repo_path.exists():
        shutil.rmtree(repo_path)
    repo_path.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(repo_path)

    children = list(repo_path.iterdir())
    if len(children) == 1 and children[0].is_dir():
        inner = children[0]
        for item in inner.iterdir():
            shutil.move(str(item), str(repo_path))
        shutil.rmtree(inner)

    return repo_path
