import { useState } from "react";
import { ShieldIcon, SparkleIcon, FileIcon, ChevronIcon, WarnIcon, CopyIcon, CheckIcon, CodeIcon, ThumbUpIcon, ThumbDownIcon, BrainIcon } from "./icons";
import { INTENT_META } from "../constants";
import { CodeCanvas } from "./CodeCanvas";

function IntentBadge({ intent }) {
  if (!intent) return null;
  const m = INTENT_META[intent] || INTENT_META.general;
  return (
    <span className="intent-badge" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
      <SparkleIcon /> {m.label}
    </span>
  );
}

function FaithfulnessBadge({ score }) {
  if (typeof score !== "number") return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "#10b981" : score >= 0.5 ? "#f59e0b" : "#ef4444";
  const bg    = score >= 0.8 ? "rgba(16,185,129,0.15)" : score >= 0.5 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";
  const label = score >= 0.8 ? "High Faithfulness" : score >= 0.5 ? "Medium Faithfulness" : "Low Faithfulness";
  return (
    <span className="faith-badge" style={{ color, background: bg, border: `1px solid ${color}40`, padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <ShieldIcon /> {pct}% {label}
    </span>
  );
}

function SourcesPanel({ matches }) {
  const [open, setOpen] = useState(false);
  if (!matches?.length) return null;
  return (
    <div className="sources-panel">
      <button className="sources-toggle" onClick={() => setOpen(o => !o)}>
        <FileIcon />
        <span>{matches.length} source{matches.length !== 1 ? "s" : ""} retrieved</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="sources-list">
          {matches.map((m, i) => (
            <div key={i} className="source-row">
              <span className="source-rank">#{i + 1}</span>
              <span className="source-file">{m.file_path}</span>
              <span className="source-lines">L{m.start_line}–{m.end_line}</span>
              <div className="source-score-bar">
                <div style={{ width: `${Math.round(Math.min(m.score || 0, 1) * 100)}%`, background: "var(--accent)", height: "100%", borderRadius: "2px", transition: "width 0.6s ease" }} />
              </div>
              <span className="source-score-val">{m.score?.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code, lang, onOpenCanvas }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="code-block" onClick={() => onOpenCanvas && onOpenCanvas(code, lang)}>
      <div className="code-block-header">
        <span className="code-lang">{lang || "code"}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          {onOpenCanvas && (
            <button className="copy-btn canvas-open-hint" title="Open in code panel" style={{ opacity: 0.7 }}>
              ↗ Open
            </button>
          )}
          <button className="copy-btn" onClick={copy} title="Copy code">
            {copied ? <><CheckIcon /> Copied!</> : <><CopyIcon /> Copy</>}
          </button>
        </div>
      </div>
      <pre className="code-pre"><code>{code}</code></pre>
    </div>
  );
}

function MessageContent({ content, thinking, onOpenCanvas }) {
  const [showThinking, setShowThinking] = useState(false);

  const renderParts = (text) => {
    const parts = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0, match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex)
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      parts.push({ type: "code", lang: match[1], content: match[2].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length)
      parts.push({ type: "text", content: text.slice(lastIndex) });
    if (parts.length === 0)
      parts.push({ type: "text", content: text });

    return parts.map((part, i) =>
      part.type === "code"
        ? <CodeBlock key={i} code={part.content} lang={part.lang} onOpenCanvas={onOpenCanvas} />
        : <div key={i} className="msg-text" dangerouslySetInnerHTML={{ __html: formatText(part.content) }} />
    );
  };

  // Format text: bold, italic, headers, bullets
  const formatText = (text) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^#{1,3} (.+)$/gm, "<h3 style=\"font-size:15px;font-weight:600;color:#fff;margin:12px 0 6px\">$1</h3>")
      .replace(/^[-•] (.+)$/gm, "<div style=\"display:flex;gap:8px;margin:3px 0\"><span style=\"color:var(--accent);flex-shrink:0\">▸</span><span>$1</span></div>")
      .replace(/`([^`]+)`/g, "<code style=\"background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em\">$1</code>")
      .replace(/\n/g, "<br/>");
  };

  return (
    <div className="msg-content">
      {thinking && (
        <div className="thinking-panel">
          <button className="thinking-toggle" onClick={() => setShowThinking(!showThinking)}>
            <div className="thinking-toggle-left">
              <BrainIcon />
              <span>Chain of Thought Reasoning</span>
            </div>
            <ChevronIcon open={showThinking} />
          </button>
          {showThinking && (
            <div className="thinking-content">
              {renderParts(thinking)}
            </div>
          )}
        </div>
      )}
      {renderParts(content)}
    </div>
  );
}

function ArchDiagram({ diagram }) {
  const [hovered, setHovered] = useState(null);
  if (!diagram?.nodes?.length) return null;

  return (
    <div className="arch-diagram">
      <div className="arch-diagram-header">
        <span className="arch-diagram-title">📐 Architecture Diagram</span>
        <span className="arch-diagram-sub">from retrieved source files</span>
      </div>
      <div className="arch-nodes-wrap">
        {diagram.nodes.map((node, i) => (
          <div key={node.id} className="arch-node-col">
            <div
              className="arch-node"
              style={{ borderColor: node.color + "55", "--node-glow": node.color + "22" }}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="arch-node-icon">{node.icon}</div>
              <div className="arch-node-label">{node.label}</div>
              <div className="arch-node-role" style={{ color: node.color }}>{node.role}</div>
              <div className="arch-node-lines">{node.lines}</div>
              {hovered === node.id && (
                <div className="arch-node-tooltip">{node.full_path}</div>
              )}
            </div>
            {i < diagram.nodes.length - 1 && (
              <div className="arch-arrow">
                <div className="arch-arrow-line" />
                <div className="arch-arrow-head">▶</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const [feedback, setFeedback] = useState(null);
  const [canvas, setCanvas] = useState(null); // { code, lang }

  const handleFeedback = async (rating) => {
    setFeedback(rating);
    try {
      await fetch("http://localhost:8000/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ question: "N/A", answer: msg.content, rating, repo_id: "current", intent: msg.intent || "general", faithfulness: msg.faithfulness || 0.0 })
      });
    } catch(e) { console.error(e) }
  };

  return (
    <>
      <div className="msg-row" style={{ animation: "slideUp 0.3s ease" }}>
        <div className={`msg-avatar ${msg.role}`}>
          {isUser ? "U" : <CodeIcon />}
        </div>
        <div className="msg-body">
          <div className="msg-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span className="msg-sender">{isUser ? "You" : "CodeBase AI"}</span>
              {!isUser && msg.intent && <IntentBadge intent={msg.intent} />}
              {!isUser && <FaithfulnessBadge score={msg.faithfulness} />}
            </div>
            {!isUser && (
              <div className="msg-actions" style={{ display: "flex", gap: "8px" }}>
                <button className={`feedback-btn ${feedback === 1 ? 'active' : ''}`} onClick={() => handleFeedback(1)} title="Good response"
                  style={{ background: "transparent", border: "1px solid var(--border)", color: feedback === 1 ? "#10b981" : "var(--muted)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "0.2s" }}>
                  <ThumbUpIcon />
                </button>
                <button className={`feedback-btn ${feedback === -1 ? 'active' : ''}`} onClick={() => handleFeedback(-1)} title="Bad response"
                  style={{ background: "transparent", border: "1px solid var(--border)", color: feedback === -1 ? "#ef4444" : "var(--muted)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "0.2s" }}>
                  <ThumbDownIcon />
                </button>
              </div>
            )}
          </div>

          {msg.diagram && <ArchDiagram diagram={msg.diagram} />}

          <MessageContent
            content={msg.content}
            thinking={msg.thinking}
            onOpenCanvas={(code, lang) => setCanvas({ code, lang })}
          />

          {msg.warning && (
            <div className="warn-banner"><WarnIcon /> {msg.warning}</div>
          )}
          {msg.matches?.length > 0 && <SourcesPanel matches={msg.matches} />}
        </div>
      </div>

      {/* Code Canvas (right-side panel) */}
      {canvas && (
        <CodeCanvas
          code={canvas.code}
          lang={canvas.lang}
          source={msg.matches?.[0] ? `${msg.matches[0].file_path}:L${msg.matches[0].start_line}` : null}
          onClose={() => setCanvas(null)}
        />
      )}
    </>
  );
}

export function TypingIndicator() {
  return (
    <div className="msg-row" style={{ animation: "slideUp 0.3s ease" }}>
      <div className="msg-avatar assistant"><CodeIcon /></div>
      <div className="msg-body">
        <div className="msg-header">
          <span className="msg-sender">CodeBase AI</span>
          <span className="pipeline-badge">
            <span className="pipeline-dot" />
            Thinking...
          </span>
        </div>
        <div className="typing-indicator">
          <div className="typing-bubble">
            <span /><span /><span />
          </div>
          <span className="typing-label">Analyzing your codebase</span>
        </div>
      </div>
    </div>
  );
}