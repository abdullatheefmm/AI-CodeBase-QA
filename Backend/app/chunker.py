"""
chunker.py – Smart chunking with docstring extraction
- AST-based for Python (extracts functions, classes + their docstrings)
- Regex for JS/TS
- Contextual prefix: adds file/class context to each chunk for better retrieval
- Skips empty/generated files
"""
from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import List, Dict

from app.config import ALLOWED_EXTS, IGNORE_DIRS, MAX_FILE_BYTES

SKIP_PATTERNS = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "pipfile.lock", "composer.lock",
    ".min.js", ".min.css", ".bundle.js", ".chunk.js",
    ".map", ".d.ts", "__pycache__", "node_modules", "venv", ".venv"
}

def _is_ignored(path: Path) -> bool:
    for part in path.parts:
        if part in IGNORE_DIRS:
            return True
    return False

def _is_skipped(path: Path) -> bool:
    name = path.name.lower()
    for pattern in SKIP_PATTERNS:
        if name.endswith(pattern):
            return True
    return False

def iter_code_files(repo_path: Path) -> List[Path]:
    files: List[Path] = []
    for p in repo_path.rglob("*"):
        if not p.is_file():         continue
        if _is_ignored(p):          continue
        if _is_skipped(p):          continue
        if p.suffix.lower() not in ALLOWED_EXTS: continue
        try:
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
            if p.stat().st_size < 50:
                continue
        except Exception:
            continue
        files.append(p)
    return files


def chunk_text_lines(text: str, max_lines: int = 80, overlap: int = 15):
    """
    Line-based fallback chunking for file types without AST support.
    """
    lines = text.splitlines()
    chunks = []
    start = 0
    n = len(lines)
    while start < n:
        end = min(start + max_lines, n)
        chunk = "\n".join(lines[start:end])
        if chunk.strip():
            chunks.append((start + 1, end, chunk))
        if end == n:
            break
        start = max(0, end - overlap)
    return chunks


def _get_docstring(node) -> str:
    """Extract the docstring from an AST node, or empty string."""
    try:
        ds = ast.get_docstring(node)
        return ds.strip() if ds else ""
    except Exception:
        return ""


def _extract_python_symbols(text: str) -> List[Dict]:
    """
    AST-based: one chunk per function/class.
    Also extracts docstrings as a separate NLP field for better
    retrieval on high-level 'what does X do?' questions.
    Adds the enclosing class name as context prefix for methods.
    """
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []

    lines = text.splitlines()
    symbol_chunks = []

    # First pass: collect class ranges so we can tag methods with their class
    class_ranges: List[tuple] = []  # (start_line, end_line, class_name)
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            end = getattr(node, "end_lineno", node.lineno + 1)
            class_ranges.append((node.lineno, end, node.name))

    def _enclosing_class(lineno: int) -> str:
        for c_start, c_end, c_name in class_ranges:
            if c_start <= lineno <= c_end:
                return c_name
        return ""

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        start = node.lineno - 1
        end   = getattr(node, "end_lineno", start + 1)
        body  = "\n".join(lines[start:end])
        if not body.strip():
            continue

        kind      = "class" if isinstance(node, ast.ClassDef) else "function"
        docstring = _get_docstring(node)
        enc_class = _enclosing_class(node.lineno) if kind == "function" else ""

        # Build a context prefix: "Class MyClass > def my_method: does X"
        context_parts = []
        if enc_class and enc_class != node.name:
            context_parts.append(f"Class {enc_class}")
        context_parts.append(f"{'class' if kind == 'class' else 'def'} {node.name}")
        if docstring:
            context_parts.append(f"# {docstring[:200]}")
        context_prefix = " | ".join(context_parts)

        symbol_chunks.append({
            "start_line":     node.lineno,
            "end_line":       end,
            "text":           body,
            "symbol_name":    node.name,
            "symbol_kind":    kind,
            "docstring":      docstring,
            "context_prefix": context_prefix,
            "enclosing_class": enc_class,
        })

    return symbol_chunks


def _extract_js_symbols(text: str) -> List[Dict]:
    """
    Regex-based JS/TS symbol extraction.
    Also extracts JSDoc comments (/** ... */) as docstrings.
    """
    pattern = re.compile(
        r"(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()",
        re.MULTILINE,
    )
    # JSDoc pattern: /** ... */
    jsdoc_pattern = re.compile(r"/\*\*(.*?)\*/", re.DOTALL)

    lines = text.splitlines()
    chunks = []
    for m in pattern.finditer(text):
        name    = m.group(1) or m.group(2) or m.group(3) or "anonymous"
        line_no = text[:m.start()].count("\n")
        end_line = min(line_no + 60, len(lines))
        body     = "\n".join(lines[line_no:end_line])
        if not body.strip():
            continue

        # Look for JSDoc comment just before this symbol
        docstring = ""
        pre_text = text[:m.start()]
        jsdoc_match = jsdoc_pattern.search(pre_text[-500:])  # search last 500 chars
        if jsdoc_match:
            docstring = re.sub(r'\s*\*\s*', ' ', jsdoc_match.group(1)).strip()[:200]

        context_prefix = f"function {name}"
        if docstring:
            context_prefix += f" | # {docstring}"

        chunks.append({
            "start_line":     line_no + 1,
            "end_line":       end_line,
            "text":           body,
            "symbol_name":    name,
            "symbol_kind":    "function",
            "docstring":      docstring,
            "context_prefix": context_prefix,
            "enclosing_class": "",
        })
    return chunks


def _extract_dependencies(text: str, ext: str) -> List[str]:
    """Extract file/module dependencies for the graph view."""
    deps = []
    if ext == ".py":
        try:
            tree = ast.parse(text)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names: deps.append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.module: deps.append(node.module)
        except Exception: pass
    elif ext in (".js", ".jsx", ".ts", ".tsx"):
        # Match: import { x } from './y' OR const x = require('./y')
        imports = re.findall(r"from\s+['\"](.*?)['\"]", text)
        requires = re.findall(r"require\(['\"](.*?)['\"]\)", text)
        deps.extend(imports + requires)
    return list(set(deps))


def build_chunks(repo_path: Path) -> List[Dict]:
    chunks: List[Dict] = []
    file_metadata: Dict[str, Dict] = {} # rel_path -> {imports: []}

    all_files = iter_code_files(repo_path)
    print(f"[Chunker] Found {len(all_files)} code files to index")

    for f in all_files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception: continue
        if not text.strip(): continue

        rel = str(f.relative_to(repo_path)).replace("\\", "/")
        ext = f.suffix.lower()

        # Track dependencies for the Graph View
        file_metadata[rel] = {
            "name": f.name,
            "imports": _extract_dependencies(text, ext)
        }

        # Symbol-aware extraction for Python and JS/TS
        symbol_chunks: List[Dict] = []
        if ext == ".py":
            symbol_chunks = _extract_python_symbols(text)
        elif ext in (".js", ".jsx", ".ts", ".tsx"):
            symbol_chunks = _extract_js_symbols(text)

        if symbol_chunks:
            for sc in symbol_chunks:
                # Embed context_prefix + code for richer vector representation
                embed_text = sc.get("context_prefix", "")
                if embed_text:
                    embed_text = embed_text + "\n\n" + sc["text"]
                else:
                    embed_text = sc["text"]

                chunks.append({
                    "file_path":      rel,
                    "start_line":     sc["start_line"],
                    "end_line":       sc["end_line"],
                    "text":           sc["text"],           # raw code (shown to user)
                    "embed_text":     embed_text,           # enriched text for embedding
                    "symbol_name":    sc.get("symbol_name", ""),
                    "symbol_kind":    sc.get("symbol_kind", ""),
                    "docstring":      sc.get("docstring", ""),
                    "enclosing_class": sc.get("enclosing_class", ""),
                    "file_imports":   file_metadata[rel]["imports"],
                })
        else:
            # Line-based for other file types
            for (l1, l2, chunk) in chunk_text_lines(text):
                chunks.append({
                    "file_path":      rel,
                    "start_line":     l1,
                    "end_line":       l2,
                    "text":           chunk,
                    "embed_text":     chunk,
                    "symbol_name":    "",
                    "symbol_kind":    "",
                    "docstring":      "",
                    "enclosing_class": "",
                    "file_imports":   file_metadata[rel]["imports"],
                })

    print(f"[Chunker] Built {len(chunks)} chunks from {len(all_files)} files")
    return chunks