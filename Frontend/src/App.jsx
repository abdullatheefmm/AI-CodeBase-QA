import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

import { AuthScreen, VerifyScreen }           from "./components/AuthScreen";
import { Sidebar }                             from "./components/Sidebar";
import { MessageBubble, TypingIndicator }      from "./components/MessageBubble";
import { InputBar }                            from "./components/InputBar";
import { UploadModal }                         from "./components/UploadModal";
import { GithubExplorer }                      from "./components/GithubExplorer";
import { CodeIcon, PlusIcon }                            from "./components/icons";
import { API, authHeaders, DEFAULT_NLP_FLAGS, NLP_FEATURES, SUGGESTIONS } from "./constants";

export default function App() {
  const urlParams   = new URLSearchParams(window.location.search);
  const verifyToken = urlParams.get("token");
  const [user, setUser] = useState(() => localStorage.getItem("email") || null);

  const handleLogin  = (email) => { setUser(email); window.history.replaceState({}, "", "/"); };
  const handleLogout = () => {
    localStorage.removeItem("token"); localStorage.removeItem("email"); localStorage.removeItem("name");
    setUser(null);
  };

  if (verifyToken) return <VerifyScreen token={verifyToken} onLogin={handleLogin} />;
  if (!user)       return <AuthScreen onLogin={handleLogin} />;
  return <MainApp user={user} onLogout={handleLogout} />;
}

function MainApp({ user, onLogout }) {
  const [repoId,          setRepoId]        = useState("");
  const [repos,           setRepos]         = useState([]);
  const [question,        setQuestion]      = useState("");
  const [sessions,        setSessions]      = useState([]);
  const [activeSessionId, setActiveSession] = useState(null);
  const [loading,         setLoading]       = useState(false);
  const [showModal,       setShowModal]     = useState(false);
  const [nlpFlags,        setNlpFlags]      = useState(DEFAULT_NLP_FLAGS);
  const [githubUrl,       setGithubUrl]     = useState(null);
  const [profileOpen,     setProfileOpen]   = useState(false);

  useEffect(() => {
    const handleClick = (e) => { if (!e.target.closest(".profile-dropdown-container")) setProfileOpen(false); };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const chatEnd = useRef(null);
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages      = activeSession?.messages || [];
  const activeRepo    = repos.find(r => r.id === repoId);

  useEffect(() => { loadRepos(); loadSessions(); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const loadRepos = async () => {
    try {
      const res = await fetch(`${API}/repos`, { headers: authHeaders() });
      const d   = await res.json();
      if (res.ok) setRepos(d);
    } catch (e) { console.error(e); }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(`${API}/sessions`, { headers: authHeaders() });
      const d   = await res.json();
      if (res.ok) setSessions(d.map(s => ({ ...s, messages: s.messages || [] })));
    } catch (e) { console.error(e); }
  };

  const loadSessionMessages = async (sessionId) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, { headers: authHeaders() });
      const d   = await res.json();
      if (res.ok) setSessions(p => p.map(s => s.id === sessionId ? { ...s, messages: d.messages || [] } : s));
    } catch (e) { console.error(e); }
  };

  const saveSession = async (sessionId, updates) => {
    try {
      await fetch(`${API}/sessions/${sessionId}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(updates) });
    } catch (e) { console.error(e); }
  };

  const newChat = async () => {
    try {
      const res = await fetch(`${API}/sessions`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ title: "New Chat", repo_id: repoId || null }),
      });
      const d = await res.json();
      if (res.ok) { setSessions(p => [d, ...p]); setActiveSession(d.id); }
    } catch (e) { console.error(e); }
  };

  const selectSession = async (sessionId) => {
    setActiveSession(sessionId);
    const s = sessions.find(s => s.id === sessionId);
    if (s && (!s.messages || !s.messages.length)) await loadSessionMessages(sessionId);
    if (s?.repo_id) setRepoId(s.repo_id);
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders() });
      setSessions(p => p.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) setActiveSession(null);
    } catch (e) { console.error(e); }
  };

  const deleteRepo = async (e, repoToDeleteId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this repository?")) return;
    try {
      await fetch(`${API}/repos/${repoToDeleteId}`, { method: "DELETE", headers: authHeaders() });
      setRepos(p => p.filter(r => r.id !== repoToDeleteId));
      if (repoId === repoToDeleteId) setRepoId("");
    } catch (err) { console.error(err); }
  };

  const handleUpload = async (file, setProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    setProgress("Indexing codebase…");
    try {
      const res = await fetch(`${API}/upload`, {
        method: "POST", body: fd,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail);
      setRepoId(d.repo_id);
      setRepos(p => [{ id: d.repo_id, name: file.name, files_indexed: d.files_indexed, chunks_indexed: d.chunks_indexed }, ...p]);
      setShowModal(false);
    } catch (e) { alert("Upload failed: " + e.message); }
  };

  const askAI = useCallback(async (questionText) => {
    const q = questionText || question;
    if (!q.trim()) return;

    // Detect GitHub URL in question → open explorer
    const ghMatch = q.match(/https?:\/\/github\.com\/[^\s]+/);
    if (ghMatch) {
      setGithubUrl(ghMatch[0]);
    }

    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const res = await fetch(`${API}/sessions`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ title: q.slice(0, 42), repo_id: repoId || null }),
        });
        const d = await res.json();
        if (res.ok) { setSessions(p => [d, ...p]); sessionId = d.id; setActiveSession(d.id); }
      } catch (e) { console.error(e); }
    }

    const userMsg = { role: "user", content: q };
    const updated = [...messages, userMsg];
    setSessions(p => p.map(s => s.id === sessionId
      ? { ...s, title: s.messages.length === 0 ? q.slice(0, 42) : s.title, messages: updated }
      : s
    ));
    setQuestion("");
    setLoading(true);

    const history = updated.slice(-8).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API}/answer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ repo_id: repoId, question: q, history, ...nlpFlags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      if (data.github_url) setGithubUrl(data.github_url);

      const assistantMsg = {
        role:         "assistant",
        content:      data.answer,
        thinking:     data.thinking || null,
        intent:       data.intent,
        faithfulness: data.faithfulness,
        warning:      data.warning,
        matches:      data.matches,
        suggestions:  data.suggestions  || [],
        diagram:      data.diagram      || null,
        github_url:   data.github_url   || null,
      };
      const finalMessages = [...updated, assistantMsg];
      setSessions(p => p.map(s => s.id === sessionId ? { ...s, messages: finalMessages } : s));
      await saveSession(sessionId, {
        messages: finalMessages.map(m => ({ role: m.role, content: m.content, thinking: m.thinking || null, intent: m.intent || null, faithfulness: m.faithfulness || null })),
        title:   messages.length === 0 ? q.slice(0, 42) : activeSession?.title,
        repo_id: repoId || null,
      });
    } catch (e) {
      const errMsg = { role: "assistant", content: "Error: " + e.message };
      setSessions(p => p.map(s => s.id === sessionId ? { ...s, messages: [...updated, errMsg] } : s));
    }
    setLoading(false);
  }, [question, messages, activeSessionId, repoId, nlpFlags]);

  return (
    <div className="app">
      <Sidebar
        user={user} repos={repos} repoId={repoId} setRepoId={setRepoId}
        sessions={sessions} activeSessionId={activeSessionId}
        onNewChat={newChat} onSelectSession={selectSession}
        onDeleteSession={deleteSession} onDeleteRepo={deleteRepo} onLogout={onLogout}
        nlpFlags={nlpFlags} setNlpFlags={setNlpFlags}
        profileOpen={profileOpen} setProfileOpen={setProfileOpen}
      />

      <div className="app-view">
        <main className="main">
          <div className="content-area">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-logo">
                  <CodeIcon />
                </div>
                <h1 className="welcome-heading">What can I help you with?</h1>
                <p className="welcome-body">
                  Upload a repo with <span className="plus-badge" onClick={() => setShowModal(true)} style={{cursor:"pointer", display:"inline-flex", padding: "2px", border: "1px solid var(--border)", borderRadius:"4px", verticalAlign:"middle"}}><PlusIcon /></span>, ask anything, or paste a GitHub URL.
                </p>

                <div className="welcome-pills">
                  {NLP_FEATURES.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setNlpFlags(p => ({ ...p, [f.key]: !p[f.key] }))}
                      className={`nlp-pill ${nlpFlags[f.key] ? "active" : ""}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="suggestion-grid">
                  {SUGGESTIONS.map(t => (
                    <button key={t} className="suggestion-chip" onClick={() => askAI(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-scroll">
                <div className="chat-inner">
                  {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
                  {loading && <TypingIndicator />}
                  <div ref={chatEnd} />
                </div>
              </div>
            )}
          </div>

          <div className="input-wrap">
            <InputBar
              question={question} setQuestion={setQuestion}
              onSend={() => askAI()} onOpenModal={() => setShowModal(true)}
              activeRepo={activeRepo} loading={loading}
            />
          </div>
        </main>
      </div>

      {githubUrl && (
        <GithubExplorer
          url={githubUrl}
          onClose={() => setGithubUrl(null)}
          onRepoIndexed={(newRepo) => {
            setRepos(p => [newRepo, ...p]);
            setRepoId(newRepo.id);
          }}
        />
      )}

      {showModal && <UploadModal onClose={() => setShowModal(false)} onUpload={handleUpload} />}
    </div>
  );
}