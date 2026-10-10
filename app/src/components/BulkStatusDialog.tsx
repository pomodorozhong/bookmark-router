import { useState } from "react";
import type { Bubble, Workspace } from "../domain/model";
import type { Command } from "../domain/commands";
import { Dialog } from "./Dialog";
import { Icon, IconButton } from "./Icon";
import { StatusSegmentedControl } from "./StatusSegmentedControl";

export function BulkStatusDialog({
  workspace,
  bubbleIds,
  onSave,
  onClose,
}: {
  workspace: Workspace;
  bubbleIds: string[];
  onSave: (command: Command) => Promise<void>;
  onClose: () => void;
}) {
  const bubbles = bubbleIds
    .map((id) => workspace.bubbles.find((bubble) => bubble.id === id))
    .filter((bubble): bubble is Bubble => Boolean(bubble));
  const [statusId, setStatusId] = useState(workspace.statuses[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nextStatus = workspace.statuses.find((status) => status.id === statusId);

  async function apply() {
    if (busy || !nextStatus || !bubbles.length) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        type: "status.bulk",
        source: "selection",
        targetIds: bubbles.map((bubble) => bubble.id),
        statusId,
        reviewedRecordRevisions: Object.fromEntries(
          bubbles.map((bubble) => [bubble.id, bubble.revision]),
        ),
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy="selection-status-title" onClose={() => { if (!busy) onClose(); }} className="status-dialog">
      <div className="modal-heading"><div><div className="eyebrow">BULK STATUS</div><h2 id="selection-status-title">Change selected bubble statuses</h2></div><IconButton label="Close bulk status dialog" icon="close" size={17} disabled={busy} onClick={onClose} /></div>
      {error && <div className="alert" role="alert">{error}</div>}
      <p className="subtle">Review the selected bubbles before applying. Use Undo in the bottom bar to reverse saved changes, starting with the most recent.</p>
      <StatusSegmentedControl statuses={workspace.statuses} value={statusId} onChange={setStatusId} disabled={busy} />
      <div className="status-review" aria-label="Selected bubbles for status change">{bubbles.map((bubble) => <div className="status-review-row" key={bubble.id}><span><strong>{bubble.title}</strong><small>{workspace.statuses.find((status) => status.id === bubble.statusId)?.label}</small></span><span className="status-review-change">{workspace.statuses.find((status) => status.id === bubble.statusId)?.label}<Icon name="arrow-right" size={13} />{nextStatus?.label}</span></div>)}</div>
      <footer><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !nextStatus || !bubbles.length} onClick={() => void apply()}><Icon name="check" size={15} />{busy ? "Applying…" : "Apply reviewed status"}</button></footer>
    </Dialog>
  );
}
