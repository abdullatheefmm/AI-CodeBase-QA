# pyre-ignore-all-errors
import os, json, re
from typing import List, Dict
from dotenv import load_dotenv
from groq import Groq

load_dotenv(override=True)
api_key = os.getenv("GROQ_API_KEY")

client = Groq(api_key=api_key)

def simple_generate(prompt: str, history: List[Dict] = None, max_tokens: int = 6000, temperature: float = 0.2) -> str:
    try:
        messages = []
        if history:
            for msg in history:
                # Groq strictly accepts 'user', 'assistant', 'system' roles
                role = "assistant" if msg.get("role") == "model" else msg.get("role", "user")
                messages.append({"role": role, "content": msg.get("content", "")})
        
        messages.append({"role": "user", "content": prompt})

        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            max_tokens=max_tokens,
            temperature=temperature
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"[LLM] Error: {e}")
        return ""

def classify_intent(query: str) -> str:
    prompt = f"""Classify the intent of this programming question into one of: 'bug', 'explain', 'architecture', 'refactor', 'search', 'general'.
Query: {query}
Return ONLY the one-word label."""
    res = simple_generate(prompt)
    label = res.lower().strip().replace("'", "").replace('"', '')
    valid = ["bug", "explain", "architecture", "refactor", "search", "general"]
    return label if label in valid else "general"

def _split_cot(text: str) -> tuple[str, str]:
    """Parse <thinking>...</thinking> block from LLM output."""
    m = re.search(r"<thinking>(.*?)</thinking>", text, flags=re.DOTALL)
    if m:
        thinking = m.group(1).strip()
        answer = text[m.end():].strip()
        return thinking, answer
    return "", text

def generate_answer_gemini(question: str, contexts: List[Dict], intent: str = "general") -> Dict:
    context_text = ""
    for i, c in enumerate(contexts):
        context_text += f"\n--- Source {i+1}: {c['file_path']} (lines {c.get('start_line','?')}-{c.get('end_line','?')}) ---\n{c.get('snippet','')}\n"

    prompt = f"""You are an expert AI software engineer and code analyst. You are directly chatting with a developer.
Your goal is to be exceptionally helpful, intelligent, and flexible. Do exactly what the user asks!

Question/Request: {question}

Code Context (with exact file sources):
{context_text}

Guidelines:
1. Provide a detailed, highly accurate answer. Use markdown formatting (headers, bullet points, bolding).
2. If the user asks for a diagram, flowchart, or architecture breakdown, use a ```mermaid code block. Fully respect and implement ANY stylistic requests the user makes (e.g., "neon theme", custom colors, "dark mode") by using Mermaid's theme initialization directives (like %%{{init: {{'theme': 'base', 'themeVariables': {{...}}}}}}%%). Do not refuse stylistic requests!
3. If the user asks for code, provide it with the source filename as a comment. If they don't explicitly ask for code, keep snippets minimal to what is necessary for explanation.
4. Reference sources explicitly in your answer (e.g., "In `app/routes.py`, the login route...").
5. Do not blindly refuse to generate visualizations or format your output just because it isn't "in the code context". You are allowed to use your general knowledge to organize, style, and structure the answer exactly how the user asked.
6. Keep your answer balanced: be sufficient to address the user's intent without dumping an excessively huge, unreadable wall of text.
7. IMPORTANT: First wrap your internal chain-of-thought reasoning in <thinking>...</thinking> tags. THEN, outside the tags, provide your actual detailed final answer. Do not stop after thinking!
"""
    raw_res = simple_generate(prompt, max_tokens=6000, temperature=0.3)
    thinking, answer = _split_cot(raw_res)
    
    faith = 0.9 if contexts and answer else 0.0
    if "not in the code provided" in answer.lower() or "insufficient" in answer.lower():
        faith = 0.4
    if not answer.strip():
        faith = 0.0

    return {
        "answer": answer,
        "thinking": thinking,
        "intent": intent,
        "faithfulness": faith,
        "warning": None,
        "suggestions": [],
        "diagram": None
    }

def generate_repo_suggestions(sample_files: List[str], sample_chunks: List[Dict]) -> List[str]:
    """Generate AI-powered starter questions for the indexed repo."""
    files_str = "\n".join(sample_files[:10])
    prompt = f"""Based on the following files from a repository, generate 4 specific, highly relevant questions a developer might ask to explore this codebase.
    
Files:
{files_str}

Output ONLY the 4 questions, one per line, without numbers or quotes."""

    res = simple_generate(prompt)
    lines = [l.strip().lstrip("1234567890.- )\"'") for l in res.splitlines() if l.strip()]
    return lines[:4] if len(lines) >= 4 else ["Explain this repo's architecture", "Find potential bugs in the code", "How does authentication work?", "Summarize the main entry points"]