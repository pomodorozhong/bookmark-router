import { Icon } from "./Icon";
import { useId } from "react";

export function WorkspaceFeedback({ message, actionLabel, undoAvailable, busy, onUndo }: {
  message?: string;
  actionLabel?: string;
  undoAvailable: boolean;
  busy: boolean;
  onUndo: () => void;
}) {
  const contextId = useId();
  const context = undoAvailable ? actionLabel : "Nothing to undo";
  return (
    <div className="workspace-feedback">
      <button className="feedback-undo" disabled={!undoAvailable || busy} onClick={onUndo} title={undoAvailable ? `Undo: ${actionLabel}` : "Nothing to undo"} aria-describedby={contextId}><Icon name="history" size={15} />Undo</button>
      <span id={contextId} className="feedback-context" title={context}>{context}</span>
      <span className="feedback-summary" role="status">{message}</span>
    </div>
  );
}
