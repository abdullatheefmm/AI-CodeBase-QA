export function ConfirmDialog({ message, onYes, onNo }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <p className="confirm-message">⚠️ {message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-no"  onClick={onNo}>Cancel</button>
          <button className="confirm-btn confirm-yes" onClick={onYes}>Delete</button>
        </div>
      </div>
    </div>
  );
}