"""
generate_questions.py
Auto-generates evaluation questions from your codebase using AST parsing.

Run from Backend folder:
  python evaluation/generate_questions.py

Output: evaluation/test_questions.json
"""
import os
import ast
import json
import re
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR      = Path(__file__).parent.parent / "app"
OUTPUT_FILE  = Path(__file__).parent / "test_questions.json"

# Question templates for different code constructs
FUNCTION_TEMPLATES = [
    "How does the {name} function work?",
    "What does {name} do in the codebase?",
    "How is {name} implemented?",
    "Explain the purpose of {name}.",
]

CLASS_TEMPLATES = [
    "What is the {name} class used for?",
    "How does the {name} class work?",
    "Explain the {name} class.",
]

FILE_TEMPLATES = [
    "What is the purpose of {name}?",
    "What does {name} contain?",
    "How does {name} work?",
    "Explain the functionality in {name}.",
]

# Keywords to extract per file for better matching
KEYWORD_MAP = {
    "auth.py":         ["JWT", "token", "login", "register", "password", "user"],
    "auth_utils.py":   ["JWT", "bcrypt", "hash", "encode", "decode", "secret"],
    "database.py":     ["MongoDB", "Motor", "connection", "collection", "index"],
    "email_service.py":["SMTP", "Gmail", "send", "email", "MIMEText"],
    "main.py":         ["FastAPI", "router", "upload", "CORS", "startup"],
    "qa.py":           ["FAISS", "embedding", "retrieval", "HyDE", "BM25", "rerank"],
    "llm_gemini.py":   ["Gemini", "generate", "prompt", "intent", "faithfulness"],
    "sessions.py":     ["session", "chat", "history", "MongoDB", "store"],
    "streaming.py":    ["stream", "SSE", "yield", "chunk", "event"],
    "chunker.py":      ["chunk", "AST", "split", "function", "class", "token"],
}


def extract_functions_and_classes(filepath: Path):
    """Parse a Python file and extract function/class names."""
    functions = []
    classes   = []
    try:
        source = filepath.read_text(encoding="utf-8", errors="ignore")
        tree   = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
                functions.append(node.name)
            elif isinstance(node, ast.ClassDef):
                classes.append(node.name)
    except Exception as e:
        print(f"  Could not parse {filepath.name}: {e}")
    return functions, classes


def clean_name(name: str) -> str:
    """Convert snake_case to readable text."""
    return name.replace("_", " ").strip()


def generate_questions():
    questions = []
    seen      = set()  # avoid duplicate questions

    print(f"\nScanning: {APP_DIR}\n")

    py_files = sorted(APP_DIR.glob("*.py"))
    if not py_files:
        print("No Python files found! Check APP_DIR path.")
        return []

    for filepath in py_files:
        fname    = filepath.name
        keywords = KEYWORD_MAP.get(fname, [])
        print(f"Processing: {fname}")

        functions, classes = extract_functions_and_classes(filepath)

        # 1. File-level questions
        import random
        random.seed(42)
        for template in FILE_TEMPLATES[:2]:  # 2 questions per file
            q = template.format(name=fname)
            if q not in seen:
                seen.add(q)
                questions.append({
                    "question":          q,
                    "expected_files":    [fname],
                    "expected_keywords": keywords,
                    "source":            "file",
                    "difficulty":        "easy"
                })

        # 2. Function-level questions (top 3 functions per file)
        for func in functions[:3]:
            readable = clean_name(func)
            template = random.choice(FUNCTION_TEMPLATES)
            q        = template.format(name=readable)
            if q not in seen:
                seen.add(q)
                questions.append({
                    "question":          q,
                    "expected_files":    [fname],
                    "expected_keywords": keywords + [func],
                    "source":            "function",
                    "difficulty":        "medium"
                })

        # 3. Class-level questions
        for cls in classes[:2]:
            template = random.choice(CLASS_TEMPLATES)
            q        = template.format(name=cls)
            if q not in seen:
                seen.add(q)
                questions.append({
                    "question":          q,
                    "expected_files":    [fname],
                    "expected_keywords": keywords + [cls],
                    "source":            "class",
                    "difficulty":        "medium"
                })

    # 4. Add cross-file questions (harder, more realistic)
    cross_file_questions = [
        {
            "question": "How does the authentication flow work end to end?",
            "expected_files": ["auth.py", "auth_utils.py", "database.py"],
            "expected_keywords": ["JWT", "token", "password", "MongoDB", "user"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How does a user question get answered from start to finish?",
            "expected_files": ["main.py", "qa.py", "llm_gemini.py"],
            "expected_keywords": ["retrieve", "embed", "generate", "answer", "context"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How is code indexed and made searchable?",
            "expected_files": ["main.py", "qa.py"],
            "expected_keywords": ["chunk", "embed", "FAISS", "index", "upload"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How does the NLP pipeline improve search quality?",
            "expected_files": ["qa.py"],
            "expected_keywords": ["HyDE", "rerank", "hybrid", "BM25", "multi-query"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How are user sessions and chat history managed?",
            "expected_files": ["sessions.py", "database.py"],
            "expected_keywords": ["session", "MongoDB", "history", "store", "retrieve"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How does streaming differ from normal response generation?",
            "expected_files": ["streaming.py", "llm_gemini.py"],
            "expected_keywords": ["stream", "SSE", "chunk", "yield", "token"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "How does the system handle errors and exceptions?",
            "expected_files": ["main.py", "auth.py"],
            "expected_keywords": ["HTTPException", "error", "try", "except", "raise"],
            "source": "cross_file",
            "difficulty": "hard"
        },
        {
            "question": "What security measures are implemented?",
            "expected_files": ["auth.py", "auth_utils.py"],
            "expected_keywords": ["bcrypt", "JWT", "hash", "secret", "token"],
            "source": "cross_file",
            "difficulty": "hard"
        },
    ]

    for q in cross_file_questions:
        if q["question"] not in seen:
            seen.add(q["question"])
            questions.append(q)

    return questions


def main():
    # Create output directory
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    questions = generate_questions()

    if not questions:
        print("\nNo questions generated. Check that APP_DIR points to your app folder.")
        return

    # Save to JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)

    # Print summary
    print(f"\n{'='*50}")
    print(f"Generated {len(questions)} questions")
    print(f"Saved to: {OUTPUT_FILE}")
    print(f"{'='*50}")

    # Breakdown by difficulty
    easy   = [q for q in questions if q["difficulty"] == "easy"]
    medium = [q for q in questions if q["difficulty"] == "medium"]
    hard   = [q for q in questions if q["difficulty"] == "hard"]

    print(f"\nBreakdown:")
    print(f"  Easy   (file-level):     {len(easy)} questions")
    print(f"  Medium (function-level): {len(medium)} questions")
    print(f"  Hard   (cross-file):     {len(hard)} questions")

    print(f"\nSample questions:")
    for q in questions[:5]:
        print(f"  [{q['difficulty']}] {q['question']}")
    print(f"  ... and {len(questions)-5} more")


if __name__ == "__main__":
    main()