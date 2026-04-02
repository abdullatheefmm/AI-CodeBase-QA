from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

UPLOADS_DIR = DATA_DIR / "uploads"
REPOS_DIR   = DATA_DIR / "repos"
INDEX_DIR   = DATA_DIR / "indexes"

for d in (UPLOADS_DIR, REPOS_DIR, INDEX_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Only index actual code files — skip docs, configs, data files
# This alone cuts indexing time by 40-60% for large repos
ALLOWED_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".java", ".kt", ".go", ".rs",
    ".cpp", ".c", ".h", ".cs",
    ".php", ".rb", ".swift",
    ".html", ".css", ".scss",
}

# Expanded ignore list — skip anything that isn't source code
IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", ".next",
    ".venv", "venv", "env", "__pycache__",
    ".idea", ".vscode", ".pytest_cache", ".mypy_cache",
    ".turbo", ".cache", "coverage", "vendor",
    "third_party", "thirdparty", "deps", "dependencies",
    "bin", "obj", "out", "target", "release", "debug",
    "static", "media", "assets", "public", "images",
    "migrations", "locale", "i18n", "fixtures",
    "docs", "doc", "documentation", "examples", "example",
    "test", "tests", "spec", "specs", "__tests__",
    "benchmark", "benchmarks", "perf",
}

# Skip files larger than 200KB — large files slow indexing drastically
MAX_FILE_BYTES = 200_000  # 200KB (was 1.5MB)