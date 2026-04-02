import { useRef } from "react";
import { PlusIcon, ArrowUpIcon, CodeIcon } from "./icons";

export function InputBar({ question, setQuestion, onSend, onOpenModal, activeRepo, loading }) {
  const inputRef = useRef(null);

  const handleInput = (e) => {
    setQuestion(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div className="input-zone">
      {activeRepo && (
        <div className="active-repo">
          <CodeIcon />
          <span>{activeRepo.name?.replace(/\.(zip|tar\.gz|tar)$/, "")}</span>
          {activeRepo.files_indexed && (
            <span className="repo-meta-badge"> | {activeRepo.files_indexed} files</span>
          )}
        </div>
      )}
      <div className="input-bar">
        <button className="bar-btn plus-btn" onClick={onOpenModal} title="Add repository">
          <PlusIcon />
        </button>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={question}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your code…"
          disabled={loading}
        />
        <button
          className={`bar-btn send-btn ${question.trim() ? "ready" : ""}`}
          onClick={onSend}
          disabled={!question.trim() || loading}
          title="Send"
        >
          <ArrowUpIcon />
        </button>
      </div>
      <p className="input-hint">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}