import { useState, useEffect, useRef } from "react";
import { API, authHeaders } from "../constants";

const LANG_COLORS = {
  Python:"#3572A5", JavaScript:"#f1e05a", TypeScript:"#2b7489",
  Java:"#b07219", "C++":"#f34b7d", Go:"#00ADD8", Rust:"#dea584",
  Ruby:"#701516", PHP:"#4F5D95", Swift:"#ffac45", Kotlin:"#A97BFF",
  HTML:"#e34c26", CSS:"#563d7c", Shell:"#89e051", Unknown:"#718096",
};

/* ── Repo Card ── */
function RepoCard({ repo, onSelect, onIndex, indexingId, indexJobs }) {
  const color    = LANG_COLORS[repo.language] || LANG_COLORS.Unknown;
  const label    = `${repo.owner?.login || repo.full_name?.split("/")[0] || ""}/${repo.name}`;
  const isMe     = indexingId === label || indexJobs?.some(j => j.name === label && j.status === "indexing");

  return (
    <div className="gh-repo-card">
      <div className="gh-repo-card-body" onClick={() => onSelect(repo)}>
        <div className="gh-repo-top">
          <span className="gh-repo-name">{repo.name}</span>
          {repo.private && <span className="gh-repo-private">private</span>}
        </div>
        {repo.description && <p className="gh-repo-desc">{repo.description}</p>}
        <div className="gh-repo-meta">
          {repo.language && (
            <span className="gh-repo-lang">
              <span className="gh-lang-dot" style={{ background: color }} />
              {repo.language}
            </span>
          )}
          <span className="gh-repo-stat">⭐ {repo.stars}</span>
          <span className="gh-repo-stat">🍴 {repo.forks}</span>
          <span className="gh-repo-stat">{repo.size_kb > 1024 ? `${Math.round(repo.size_kb/1024)}MB` : `${repo.size_kb}KB`}</span>
        </div>
      </div>
      <button
        className={`gh-index-btn ${isMe ? "gh-index-btn-loading" : ""} ${repo.size_kb > 500000 ? "gh-index-btn-toobig" : ""}`}
        onClick={e => { e.stopPropagation(); if (repo.size_kb > 500000) { alert(`This repo is ${Math.round(repo.size_kb/1024)}MB — too large to index (max 500MB)`); return; } onIndex(repo); }}
        disabled={isMe}
        title={repo.size_kb > 500000 ? `Too large (${Math.round(repo.size_kb/1024)}MB)` : "Index this repo — no download needed"}
      >
        {repo.size_kb > 500000
          ? "⚠️ Too big"
          : isMe ? <><span className="gh-dot-spin" />Indexing…</> : "⚡ Index"}
      </button>
    </div>
  );
}

/* ── File Tree ── */
function FileTree({ tree }) {
  const [expanded, setExpanded] = useState({});
  if (!tree?.length) return null;

  const buildTree = (items) => {
    const root = {};
    items.forEach(item => {
      const parts = item.path.split("/");
      let node = root;
      parts.forEach((part, i) => {
        if (!node[part]) node[part] = { __meta: null, __children: {} };
        if (i === parts.length - 1) node[part].__meta = item;
        node = node[part].__children;
      });
    });
    return root;
  };

  const FILE_ICONS = {".py":"🐍",".js":"⚡",".ts":"💙",".jsx":"⚛️",".tsx":"⚛️",
                      ".html":"🌐",".css":"🎨",".json":"📋",".md":"📝",".sql":"🗄️",
                      ".sh":"🔧",".yml":"⚙️",".yaml":"⚙️",".env":"🔑",".txt":"📄"};

  const renderNode = (node, path = "", depth = 0) =>
    Object.entries(node).map(([name, val]) => {
      const fullPath = path ? `${path}/${name}` : name;
      const isDir    = Object.keys(val.__children).length > 0;
      const isOpen   = expanded[fullPath];
      const ext      = name.includes(".") ? "." + name.split(".").pop() : "";
      const icon     = isDir ? (isOpen ? "📂" : "📁") : (FILE_ICONS[ext] || "📄");
      return (
        <div key={fullPath}>
          <div className="gh-tree-row" style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => isDir && setExpanded(p => ({ ...p, [fullPath]: !p[fullPath] }))}>
            <span className="gh-tree-icon">{icon}</span>
            <span className={`gh-tree-name ${isDir ? "gh-tree-dir" : ""}`}>{name}</span>
            {!isDir && val.__meta?.size > 0 && (
              <span className="gh-tree-size">
                {val.__meta.size > 1024 ? `${Math.round(val.__meta.size/1024)}KB` : `${val.__meta.size}B`}
              </span>
            )}
          </div>
          {isDir && isOpen && renderNode(val.__children, fullPath, depth + 1)}
        </div>
      );
    });

  return (
    <div className="gh-tree">
      <div className="gh-tree-header">
        📁 {tree.filter(t => t.type === "blob").length} files · {tree.filter(t => t.type === "tree").length} folders
      </div>
      <div className="gh-tree-body">{renderNode(buildTree(tree))}</div>
    </div>
  );
}

/* ── Indexing Toast ── */
function IndexToast({ jobs, onDismiss }) {
  if (!jobs.length) return null;
  return (
    <div className="gh-toasts">
      {jobs.map(job => (
        <div key={job.repoId} className={`gh-toast ${job.status === "ready" ? "gh-toast-done" : job.status === "error" ? "gh-toast-err" : ""}`}>
          {job.status === "indexing" && <span className="gh-dot-spin" />}
          {job.status === "ready"   && "✅ "}
          {job.status === "error"   && "❌ "}
          <span style={{ flex: 1 }}>
            {job.status === "indexing" && `Indexing ${job.name}…`}
            {job.status === "ready"    && `${job.name} ready! ${job.files} files indexed.`}
            {job.status === "error"    && `${job.name} failed: ${job.errorMsg || "unknown error"}`}
          </span>
          {job.status !== "indexing" && (
            <button className="gh-toast-close" onClick={() => onDismiss(job.repoId)}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main Explorer ── */
export function GithubExplorer({ url, onClose, onRepoIndexed }) {
  const [inputUrl,     setInputUrl]     = useState(url || "");
  const [loading,      setLoading]      = useState(false);
  const [data,         setData]         = useState(null);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [error,        setError]        = useState(null);
  const [indexingId,   setIndexingId]   = useState(null);
  const [indexJobs,    setIndexJobs]    = useState([]);
  const pollRefs = useRef({});

  useEffect(() => { if (url) explore(url); }, []);
  useEffect(() => () => Object.values(pollRefs.current).forEach(clearInterval), []);

  const explore = async (targetUrl) => {
    const u = (targetUrl || inputUrl).trim();
    if (!u) return;
    setLoading(true); setError(null); setData(null); setSelectedRepo(null);
    try {
      const res  = await fetch(`${API}/github/explore`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ url: u }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "GitHub error");
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const selectRepo = async (repo) => {
    setSelectedRepo(null); setLoading(true);
    try {
      const res  = await fetch(`${API}/github/explore`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ url: repo.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail);
      setSelectedRepo(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const downloadZip = async (owner, repo, branch = "main") => {
    try {
      const res  = await fetch(`${API}/github/download?owner=${owner}&repo=${repo}&branch=${branch}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = href; a.download = `${repo}-${branch}.zip`; a.click();
      URL.revokeObjectURL(href);
    } catch (e) { alert("Download failed: " + e.message); }
  };

  const indexRepo = async (repo) => {
    // FIX 2: safely resolve owner from any repo object shape
    const owner  = repo.owner?.login || repo.owner || repo.full_name?.split("/")[0] || "";
    const name   = repo.repo   || repo.name || "";
    const branch = repo.default_branch || "main";
    const label  = `${owner}/${name}`;

    // FIX 1: prevent double-fire
    if (indexingId || indexJobs.some(j => j.name === label && j.status === "indexing")) return;

    if (!owner || !name) { setError("Could not determine owner or repo name."); return; }

    setIndexingId(label);
    try {
      const res  = await fetch(`${API}/github/index`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ owner, repo: name, branch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Index failed");

      const repoId = json.repo_id;
      setIndexJobs(p => [...p, { repoId, name: label, status: "indexing", files: 0 }]);
      setIndexingId(null);

      // Poll for completion every 3s
      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/github/index-status/${repoId}`, { headers: authHeaders() });
          const sj = await sr.json();
          if (sj.status === "ready") {
            clearInterval(poll);
            delete pollRefs.current[repoId];
            setIndexJobs(p => p.map(j => j.repoId === repoId
              ? { ...j, status: "ready", files: sj.files_indexed }
              : j
            ));
            onRepoIndexed && onRepoIndexed({ id: repoId, name: label, files_indexed: sj.files_indexed, chunks_indexed: sj.chunks_indexed });
          } else if (sj.status === "error") {
            clearInterval(poll);
            delete pollRefs.current[repoId];
            // FIX 3: show actual error from backend
            setIndexJobs(p => p.map(j => j.repoId === repoId
              ? { ...j, status: "error", errorMsg: sj.error || "Indexing failed" }
              : j
            ));
          }
        } catch {}
      }, 3000);
      pollRefs.current[repoId] = poll;

    } catch (e) {
      setIndexJobs(p => [...p, { repoId: `err-${Date.now()}`, name: label, status: "error", errorMsg: e.message }]);
      setIndexingId(null);
    }
  };

  const dismissJob  = (repoId) => setIndexJobs(p => p.filter(j => j.repoId !== repoId));
  const currentData = selectedRepo || data;

  return (
    <>
      <div className="gh-overlay" onClick={onClose} />
      <div className="gh-explorer">
        <div className="gh-header">
          <span className="gh-title">🐙 GitHub Explorer</span>
          <button className="gh-close" onClick={onClose}>✕</button>
        </div>

        <div className="gh-url-bar">
          <input
            className="gh-url-input"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="github.com/username  or  github.com/user/repo"
            onKeyDown={e => e.key === "Enter" && explore(inputUrl)}
          />
          <button className="gh-url-go" onClick={() => explore(inputUrl)}>Go →</button>
        </div>

        {loading && (
          <div className="gh-loading">
            <div className="gh-spinner" />
            <span>Fetching from GitHub…</span>
          </div>
        )}
        {error && <div className="gh-error">⚠️ {error}</div>}

        {selectedRepo && data?.type === "user" && (
          <button className="gh-back" onClick={() => setSelectedRepo(null)}>
            ← {data.owner}'s repos
          </button>
        )}

        {currentData && !loading && (
          <div className="gh-content">

            {currentData.type === "user" && (
              <>
                <div className="gh-section-title">
                  👤 <strong>{currentData.owner}</strong> — {currentData.repos.length} public repos
                </div>
                <div className="gh-repos-list">
                  {currentData.repos.map(repo => (
                    <RepoCard
                      key={repo.name} repo={repo}
                      onSelect={selectRepo} onIndex={indexRepo}
                      indexingId={indexingId}
                      indexJobs={indexJobs}
                    />
                  ))}
                </div>
              </>
            )}

            {currentData.type === "repo" && (
              <>
                <div className="gh-repo-detail-header">
                  <div className="gh-repo-detail-info">
                    <div className="gh-repo-detail-name">{currentData.full_name}</div>
                    {currentData.description && (
                      <p className="gh-repo-detail-desc">{currentData.description}</p>
                    )}
                    {currentData.topics?.length > 0 && (
                      <div className="gh-repo-topics">
                        {currentData.topics.slice(0,5).map(t => (
                          <span key={t} className="gh-topic">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="gh-repo-meta" style={{ marginTop: 8 }}>
                      <span className="gh-repo-stat">⭐ {currentData.stars}</span>
                      <span className="gh-repo-stat">🍴 {currentData.forks}</span>
                      <span className="gh-repo-stat">🌿 {currentData.default_branch}</span>
                      {currentData.language && (
                        <span className="gh-repo-lang">
                          <span className="gh-lang-dot" style={{ background: LANG_COLORS[currentData.language] || "#718096" }} />
                          {currentData.language}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="gh-repo-actions">
                    <button
                      className={`gh-btn gh-btn-primary ${indexingId === currentData.full_name || indexJobs.some(j => j.name === currentData.full_name && j.status === 'indexing') ? "gh-index-btn-loading" : ""}`}
                      onClick={() => indexRepo(currentData)}
                      disabled={indexingId === currentData.full_name || indexJobs.some(j => j.name === currentData.full_name && j.status === 'indexing')}
                    >
                      {indexingId === currentData.full_name || indexJobs.some(j => j.name === currentData.full_name && j.status === 'indexing')
                        ? <><span className="gh-dot-spin" /> Indexing…</>
                        : "⚡ Index this repo"}
                    </button>
                    <button
                      className="gh-btn gh-btn-secondary"
                      onClick={() => downloadZip(currentData.owner, currentData.repo, currentData.default_branch)}
                    >
                      ⬇️ Download ZIP
                    </button>
                    <a href={currentData.url} target="_blank" rel="noopener noreferrer" className="gh-btn gh-btn-ghost">
                      View on GitHub ↗
                    </a>
                  </div>
                </div>

                <FileTree tree={currentData.tree} />
              </>
            )}
          </div>
        )}

        <IndexToast jobs={indexJobs} onDismiss={dismissJob} />
      </div>
    </>
  );
}