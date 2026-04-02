import { useState } from "react";
import { CodeIcon, PenIcon, ToggleIcon, LogoutIcon, TrashIcon } from "./icons";
import { NLP_FEATURES } from "../constants";
import { FileTree } from "./FileTree";

function NLPPanel({ flags, setFlags }) {
  return (
    <div className="nlp-panel">
      <p className="section-label">NLP PIPELINE</p>
      {NLP_FEATURES.map(f => (
        <div key={f.key} className="nlp-row" title={f.desc}>
          <div className="nlp-info">
            <span className="nlp-label">{f.label}</span>
            <span className="nlp-desc">{f.desc}</span>
          </div>
          <button className={`toggle-btn ${flags[f.key] ? "on" : ""}`} onClick={() => setFlags(p => ({ ...p, [f.key]: !p[f.key] }))}>
            <div className="toggle-knob" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ user, repos, repoId, setRepoId, sessions, activeSessionId, onNewChat, onSelectSession, onDeleteSession, onDeleteRepo, onLogout, nlpFlags, setNlpFlags, profileOpen, setProfileOpen }) {
  const [explorerRepo, setExplorerRepo] = useState(null); // { id, name }

  const activeRepo = repos.find(r => r.id === repoId);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="logo">
            <div className="logo-icon"><CodeIcon /></div>
            <span className="logo-text">CodeBase AI</span>
          </div>
          <button className="icon-btn" onClick={onNewChat} title="New chat">
            {/* pencil icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>

        <div className="sidebar-scrollable">
          {repos.length > 0 && (
            <div className="sidebar-section">
              <p className="section-label">REPOSITORIES</p>
              <div className="repo-list">
                {repos.map(r => (
                  <div key={r.id} className={`repo-item-wrap ${repoId === r.id ? "active" : ""}`}>
                    <button
                      className={`history-item repo-item ${repoId === r.id ? "active" : ""}`}
                      onClick={() => setRepoId(r.id)}
                    >
                      <CodeIcon />
                      <span className="history-title">
                        {r.name?.replace(/\.(zip|tar\.gz|tar)$/, "")}
                      </span>
                      {r.files_indexed && (
                        <span className="repo-files-badge">{r.files_indexed} files</span>
                      )}
                    </button>
                    {/* Delete button */}
                    <button
                      className="repo-delete-btn"
                      title="Delete repository"
                      onClick={e => onDeleteRepo(e, r.id)}
                    >
                      <TrashIcon />
                    </button>
                    {/* Explorer button */}
                    <button
                      className="repo-explore-btn"
                      title="Open file explorer"
                      onClick={e => {
                        e.stopPropagation();
                        setExplorerRepo(explorerRepo?.id === r.id ? null : { id: r.id, name: r.name });
                      }}
                    >
                      {explorerRepo?.id === r.id ? "▾" : "▵"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <p className="section-label">RECENTS</p>
            <div className="history-list">
              {sessions.length === 0 && (
                <p className="empty-history">No chats yet. Start by asking a question.</p>
              )}
              {sessions.map(s => (
                <div key={s.id} className={`history-item-wrap ${s.id === activeSessionId ? "active" : ""}`}>
                  <button
                    className={`history-item ${s.id === activeSessionId ? "active" : ""}`}
                    onClick={() => onSelectSession(s.id)}
                  >
                    <span className="history-title" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title || "New Chat"}
                    </span>
                  </button>
                  <button className="history-delete" onClick={(e) => onDeleteSession(e, s.id)} title="Delete">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-bottom">
          <NLPPanel flags={nlpFlags} setFlags={setNlpFlags} />

          <div className="profile-dropdown-container sidebar-profile">
            <button className="profile-btn-sidebar" onClick={() => setProfileOpen(!profileOpen)}>
              <div className="user-avatar">{user[0].toUpperCase()}</div>
              <span className="user-email">{user}</span>
            </button>
            {profileOpen && (
              <div className="profile-dropdown top-anchored">
                <div className="profile-email">{user}</div>
                <div className="profile-divider" />
                <button className="profile-item" onClick={() => alert("Profile details modal coming soon!")}>Profile</button>
                <button className="profile-item signout" onClick={onLogout}>Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* File Tree Panel — slides in next to sidebar */}
      {explorerRepo && (
        <FileTree
          repoId={explorerRepo.id}
          repoName={explorerRepo.name}
          onClose={() => setExplorerRepo(null)}
        />
      )}
    </>
  );
}