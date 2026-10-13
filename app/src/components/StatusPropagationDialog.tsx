import { useMemo, useState } from "react";
import type { Tag, Workspace } from "../domain/model";
import type { Command } from "../domain/commands";
import { Dialog } from "./Dialog";
import { Icon, IconButton } from "./Icon";
import { StatusSegmentedControl } from "./StatusSegmentedControl";

export function StatusPropagationDialog({
  workspace,
  tag,
  onSave,
  onClose,
}: {
  workspace: Workspace;
  tag: Tag;
  onSave: (command: Command) => Promise<void>;
  onClose: () => void;
}) {
  const [statusId, setStatusId] = useState(tag.statusId);
  const [scope, setScope] = useState<"tag" | "linked">("tag");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = useMemo(
    () =>
      workspace.memberships
        .filter((membership) => membership.tagId === tag.id)
        .map((membership) => workspace.bubbles.find((bubble) => bubble.id === membership.bubbleId))
        .filter((bubble): bubble is Workspace["bubbles"][number] => Boolean(bubble)),
    [workspace, tag.id],
  );
  const targets = scope === "tag" ? [tag] : [tag, ...linked];
  const nextStatus = workspace.statuses.find((status) => status.id === statusId);

  async function apply() {
    if (busy || !nextStatus) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        type: "status.bulk",
        targetIds: targets.map((record) => record.id),
        statusId,
        reviewedRecordRevisions: Object.fromEntries(
          targets.map((record) => [record.id, record.revision]),
        ),
        source: "tag",
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      labelledBy="status-propagation-title"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="status-dialog"
    >
      <div className="modal-heading">
        <div>
          <div className="eyebrow">TAG STATUS</div>
          <h2 id="status-propagation-title">Change “{tag.name}” status</h2>
        </div>
        <IconButton
          label="Close status dialog"
          icon="close"
          size={17}
          disabled={busy}
          onClick={onClose}
        />
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <p className="subtle">
        Review the affected records before applying this change. Hidden or filtered bubbles are included here.
      </p>
      <StatusSegmentedControl statuses={workspace.statuses} value={statusId} onChange={setStatusId} disabled={busy} />
      <fieldset className="status-scope">
        <legend>Apply to</legend>
        <label>
          <input
            type="radio"
            name="status-scope"
            checked={scope === "tag"}
            onChange={() => setScope("tag")}
          />
          Tag only
        </label>
        <label>
          <input
            type="radio"
            name="status-scope"
            checked={scope === "linked"}
            onChange={() => setScope("linked")}
          />
          Tag and linked bubbles ({linked.length})
        </label>
      </fieldset>
      <div className="status-review" aria-label="Records affected by status change">
        {targets.map((record) => {
          const current = workspace.statuses.find((status) => status.id === record.statusId);
          return (
            <div className="status-review-row" key={record.id}>
              <span>
                <strong>{"name" in record ? record.name : record.title}</strong>
                <small>{"name" in record ? "Tag" : "Bubble"}</small>
              </span>
              <span className="status-review-change">
                {current?.label} <Icon name="arrow-right" size={13} /> {nextStatus?.label}
              </span>
            </div>
          );
        })}
      </div>
      <footer>
        <button disabled={busy} onClick={onClose}><Icon name="close" size={15} /> Cancel</button>
        <button className="primary" disabled={busy || !nextStatus} onClick={() => void apply()}>
          <Icon name="check" size={15} /> {busy ? "Applying…" : `Apply to ${targets.length} record${targets.length === 1 ? "" : "s"}`}
        </button>
      </footer>
    </Dialog>
  );
}
