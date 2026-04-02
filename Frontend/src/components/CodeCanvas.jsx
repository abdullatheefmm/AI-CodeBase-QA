import { useState, useEffect } from "react";
import { CopyIcon, CheckIcon } from "./icons";

export function CodeCanvas({ code, lang, source, onClose }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const lines = code.split("\n");

  return (
    <>
      {/* Backdrop */}
      <div
        className="canvas-backdrop"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="code-canvas"
        style={{
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div className="canvas-header">
          <div className="canvas-title-group">
            <div className="canvas-lang-badge">{lang || "code"}</div>
            {source && <div className="canvas-source">{source}</div>}
          </div>
          <div className="canvas-actions">
            <button className="canvas-action-btn" onClick={copy} title="Copy all">
              {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
            </button>
            <button className="canvas-action-btn canvas-close-btn" onClick={handleClose} title="Close panel">
              ✕ Close
            </button>
          </div>
        </div>

        {/* Code */}
        <div className="canvas-body">
          <div className="canvas-line-numbers">
            {lines.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre className="canvas-code">
            <code>{code}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="canvas-footer">
          <span>{lines.length} lines · {lang || "plaintext"}</span>
          {source && <span className="canvas-footer-source">from {source}</span>}
        </div>
      </div>
    </>
  );
}
