export const API = "http://localhost:8000";

export function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export const INTENT_META = {
  bug:          { label: "Bug Hunt",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.25)" },
  explain:      { label: "Explain",      color: "#3b82f6", bg: "rgba(59,130,246,0.12)",   border: "rgba(59,130,246,0.25)" },
  architecture: { label: "Architecture", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",   border: "rgba(139,92,246,0.25)" },
  refactor:     { label: "Refactor",     color: "#10b981", bg: "rgba(16,185,129,0.12)",   border: "rgba(16,185,129,0.25)" },
  search:       { label: "Search",       color: "#f59e0b", bg: "rgba(245,158,11,0.12)",   border: "rgba(245,158,11,0.25)" },
  general:      { label: "General",      color: "#d97757", bg: "rgba(217,119,87,0.12)",   border: "rgba(217,119,87,0.25)" },
  github:       { label: "GitHub",       color: "#6366f1", bg: "rgba(99,102,241,0.12)",   border: "rgba(99,102,241,0.25)" },
};

export const NLP_FEATURES = [
  { key: "use_hyde",       label: "HyDE",         desc: "Generates a code snippet to improve retrieval — adds ~3s" },
  { key: "use_multiquery", label: "Multi-Query",   desc: "Expands into 3 sub-queries for broader coverage — adds ~4s" },
  { key: "use_reranking",  label: "Re-ranking",    desc: "Re-scores candidates for higher precision — adds ~0.5s" },
  { key: "use_hybrid",     label: "Hybrid Search", desc: "Vector (70%) + BM25 keyword (30%) — fast, recommended ON" },
  { key: "use_memory",     label: "Memory",        desc: "Compresses chat history for follow-up questions — adds ~2s" },
];

export const DEFAULT_NLP_FLAGS = {
  use_hyde:       false,
  use_multiquery: false,
  use_reranking:  true,
  use_hybrid:     true,
  use_memory:     false,
};

export const SUGGESTIONS = [
  "Explain this repo's architecture",
  "Find potential bugs in the code",
  "How does authentication work?",
  "Summarize the main entry points",
];