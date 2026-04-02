import { useRef, useState } from "react";
import { PlusIcon } from "./icons";

export function UploadModal({ onClose, onUpload }) {
  const fileRef    = useRef(null);
  const [file,     setFile]    = useState(null);
  const [loading,  setLoading] = useState(false);
  const [progress, setProgress]= useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setProgress("Uploading…");
    await onUpload(file, setProgress);
    setLoading(false);
    setProgress(null);
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Repository</h2>
        <p className="modal-sub">Upload a zipped codebase. It will be chunked, embedded, and indexed.</p>
        <div className="drop-zone" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".zip" hidden onChange={e => setFile(e.target.files[0])} />
          <div className="drop-zone-text"><PlusIcon /></div>
          <span className="drop-zone-sub">{file ? file.name : "Click to select a .zip file"}</span>
          {file && <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
        </div>
        {progress && (
          <div className="upload-progress">
            <div className="upload-spinner" />
            <span>{progress}</span>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-upload" onClick={handleUpload} disabled={!file || loading}>
            {loading ? "Processing…" : "Upload & Index"}
          </button>
        </div>
      </div>
    </div>
  );
}