import { useState, useEffect } from "react";
import { API, authHeaders } from "../constants";

// File extension → color + icon mapping (like VS Code)
const EXT_META = {
  py:   { color: "#3572A5", icon: "🐍" },
  js:   { color: "#f1e05a", icon: "⚡" },
  jsx:  { color: "#61dafb", icon: "⚛" },
  ts:   { color: "#3178c6", icon: "🔷" },
  tsx:  { color: "#3178c6", icon: "⚛" },
  html: { color: "#e34c26", icon: "🌐" },
  css:  { color: "#563d7c", icon: "🎨" },
  json: { color: "#cbcb41", icon: "📋" },
  md:   { color: "#083fa1", icon: "📝" },
  txt:  { color: "#aaaaaa", icon: "📄" },
  yml:  { color: "#cb171e", icon: "⚙️" },
  yaml: { color: "#cb171e", icon: "⚙️" },
  env:  { color: "#4CAF50", icon: "🔧" },
  sql:  { color: "#e38c00", icon: "🗄️" },
  sh:   { color: "#89e051", icon: "💻" },
  java: { color: "#b07219", icon: "☕" },
  cpp:  { color: "#f34b7d", icon: "⚙️" },
  c:    { color: "#555555", icon: "⚙️" },
  go:   { color: "#00ADD8", icon: "🐹" },
  rs:   { color: "#dea584", icon: "🦀" },
};

function getExtMeta(filename) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_META[ext] || { color: "#8b8b8b", icon: "📄" };
}

function FileNode({ name, info, depth, onSelect, selectedFile }) {
  const meta = getExtMeta(name);
  const isSelected = selectedFile === name;
  return (
    <div
      className={`ft-file ${isSelected ? "ft-selected" : ""}`}
      style={{ paddingLeft: `${16 + depth * 16}px` }}
      onClick={() => onSelect && onSelect(name, info)}
      title={`${name} · ${info.lines} lines · ${info.chunks} chunk${info.chunks !== 1 ? "s" : ""} indexed`}
    >
      <span className="ft-file-icon" style={{ color: meta.color }}>{meta.icon}</span>
      <span className="ft-file-name">{name}</span>
      <span className="ft-file-lines">{info.lines}L</span>
    </div>
  );
}

function DirNode({ name, subtree, depth, onSelect, selectedFile }) {
  const [open, setOpen] = useState(depth < 2);

  const dirs  = subtree.__dirs__  || {};
  const files = subtree.__files__ || [];
  const totalChildren = Object.keys(dirs).length + files.length;

  return (
    <div className="ft-dir-group">
      <div
        className="ft-dir"
        style={{ paddingLeft: `${16 + depth * 16}px` }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="ft-chevron" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        <span className="ft-dir-icon">📁</span>
        <span className="ft-dir-name">{name}</span>
        <span className="ft-dir-count">{totalChildren}</span>
      </div>

      {open && (
        <div className="ft-children">
          {Object.entries(dirs).sort().map(([dName, sub]) => (
            <DirNode key={dName} name={dName} subtree={sub} depth={depth + 1} onSelect={onSelect} selectedFile={selectedFile} />
          ))}
          {files.sort((a, b) => a.name.localeCompare(b.name)).map(f => (
            <FileNode key={f.name} name={f.name} info={f} depth={depth + 1} onSelect={onSelect} selectedFile={selectedFile} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ repoId, repoName, onClose }) {
  const [tree, setTree]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch]     = useState("");

  useEffect(() => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/repos/${repoId}/tree`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setTree(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [repoId]);

  // Flatten tree for search
  const allFiles = [];
  function flatten(subtree, path = "") {
    const dirs  = subtree.__dirs__  || {};
    const files = subtree.__files__ || [];
    files.forEach(f => allFiles.push({ ...f, path: path ? `${path}/${f.name}` : f.name }));
    Object.entries(dirs).forEach(([d, sub]) => flatten(sub, path ? `${path}/${d}` : d));
  }
  if (tree) flatten(tree.tree || {});
  const filtered = search.trim()
    ? allFiles.filter(f => f.path.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div className="ft-panel">
      <div className="ft-header">
        <div className="ft-header-title">
          <span className="ft-header-icon">📂</span>
          <span>Explorer</span>
        </div>
        <button className="ft-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="ft-repo-label">
        <span className="ft-repo-chevron">∨</span>
        <span className="ft-repo-name">{repoName?.replace(/\.(zip|tar\.gz|tar)$/, "") || "Repository"}</span>
        {tree && <span className="ft-repo-count">{tree.total_files} files</span>}
      </div>

      <div className="ft-search-wrap">
        <input
          className="ft-search"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="ft-body">
        {loading && (
          <div className="ft-loading">
            <div className="ft-spinner" />
            <span>Loading file tree...</span>
          </div>
        )}
        {error && <div className="ft-error">Error: {error}</div>}
        {!loading && !error && tree && !filtered && (
          <>
            {Object.entries(tree.tree.__dirs__ || {}).sort().map(([name, sub]) => (
              <DirNode key={name} name={name} subtree={sub} depth={0} onSelect={f => setSelected(f)} selectedFile={selected} />
            ))}
            {(tree.tree.__files__ || []).sort((a, b) => a.name.localeCompare(b.name)).map(f => (
              <FileNode key={f.name} name={f.name} info={f} depth={0} onSelect={name => setSelected(name)} selectedFile={selected} />
            ))}
          </>
        )}
        {filtered && (
          <div className="ft-search-results">
            {filtered.length === 0 && <div className="ft-empty">No files match.</div>}
            {filtered.map(f => {
              const meta = getExtMeta(f.name);
              return (
                <div
                  key={f.path}
                  className={`ft-file ${selected === f.name ? "ft-selected" : ""}`}
                  style={{ paddingLeft: "16px" }}
                  onClick={() => setSelected(f.name)}
                >
                  <span className="ft-file-icon" style={{ color: meta.color }}>{meta.icon}</span>
                  <div className="ft-search-result-info">
                    <span className="ft-file-name">{f.name}</span>
                    <span className="ft-search-result-path">{f.path}</span>
                  </div>
                  <span className="ft-file-lines">{f.lines}L</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="ft-statusbar">
          <span style={{ color: getExtMeta(selected).color }}>{getExtMeta(selected).icon}</span>
          <span className="ft-statusbar-name">{selected}</span>
        </div>
      )}
    </div>
  );
}