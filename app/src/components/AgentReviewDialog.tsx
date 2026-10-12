import type { AgentProposal } from "../domain/agent-review";
import type { Bookmark, Workspace } from "../domain/model";
import { Dialog } from "./Dialog";
import { IconButton } from "./Icon";

const stateLabels = { pending_review: "Pending review", applied: "Applied", rejected: "Rejected", stale: "Stale · refresh needed" };
const fieldLabels = { title: "Title", url: "URL", description: "Description", statusId: "Status" };
function fieldValue(bookmark: Bookmark, field: keyof typeof fieldLabels, workspace: Workspace) {
  return field === "statusId" ? workspace.statuses.find((s) => s.id === bookmark.statusId)?.label ?? bookmark.statusId : bookmark[field] || "None";
}
function groupNames(workspace: Workspace, ids: string[]) {
  return ids.map((id) => workspace.tags.find((t) => t.id === id)?.name ?? id).join(" · ") || "None";
}

export function AgentReviewDialog({ proposal, availability, busy, error, onApply, onReject, onClose }: {
  proposal?: AgentProposal;
  availability: "checking" | "available" | "unavailable" | "failed";
  busy: boolean;
  error: string;
  onApply: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  let creationIndex = 0;
  const reviewable = proposal?.state === "pending_review" || proposal?.state === "stale";
  const additions = proposal?.input.changes.filter((c) => c.kind === "create").length ?? 0;
  const updates = (proposal?.input.changes.length ?? 0) - additions;
  return (
    <Dialog labelledBy="agent-review-title" className="agent-review-modal" onClose={() => { if (!busy) onClose(); }}>
      <div className="modal-heading">
        <div>
          <h2 id="agent-review-title">Agent review</h2>
          <p className="subtle">{proposal?.input.summary ?? "Batch review before saving"}</p>
        </div>
        <IconButton label="Close agent review" icon="close" disabled={busy} onClick={onClose} />
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {!proposal ? (
        <div className="agent-review-empty">
          <h3>No proposal awaiting review</h3>
          <p>{availability === "available" ? "Bookmark tools are ready in this tab. Ask Claude Desktop or Codex to propose a batch, then return here to review it." : availability === "checking" ? "Checking bookmark tool availability…" : availability === "failed" ? "Bookmark tools could not start. Reload this tab after checking your Chrome WebMCP setup." : "WebMCP is unavailable in this browser. Enable it in Chrome and keep this app tab open to use Claude Desktop or Codex."}</p>
        </div>
      ) : (
        <>
          <p className="agent-review-summary" aria-live="polite"><span className="agent-review-state">{stateLabels[proposal.state]}</span><span className="subtle">{[additions && `${additions} ${additions === 1 ? "addition" : "additions"}`, updates && `${updates} ${updates === 1 ? "update" : "updates"}`].filter(Boolean).join(" · ")} · {proposal.before.name}</span></p>
          {proposal.state === "stale" && <div className="alert" role="alert">This collection changed after the proposal was made. Reject this batch, then ask the agent to read the latest collection and submit a fresh proposal.</div>}
          {proposal.state === "applied" && <p role="status">The whole batch was saved. Close this review to use Undo. If you already undid it, this remains a record of the original application.</p>}
          {proposal.state === "rejected" && <p role="status">Batch rejected. No bookmark changes saved.</p>}
          {proposal.input.changes.map((change, index) => {
            const id = change.kind === "create" ? proposal.createdBookmarkIds[creationIndex++] : change.bookmarkId;
            const after = proposal.preview.bookmarks.find((b) => b.id === id)!;
            const before = proposal.before.bookmarks.find((b) => b.id === id);
            return <section className="agent-review-change" key={id} aria-labelledby={`agent-change-${index}`}>
              <div className="agent-review-change-heading"><span className="agent-review-state">{change.kind === "create" ? "Add bookmark" : "Update bookmark"}</span><h3 id={`agent-change-${index}`}>{after.title}</h3></div>
              {change.kind === "create" ? (
                <dl className="agent-review-fields">
                  <dt>URL</dt><dd>{after.url}</dd>
                  <dt>Description</dt><dd>{after.description || "None"}</dd>
                  <dt>Status</dt><dd>{fieldValue(after, "statusId", proposal.preview)}</dd>
                  <dt>Add to</dt><dd>{groupNames(proposal.preview, change.tagIds ?? [])}</dd>
                  {after.missingTitle && <><dt>Title</dt><dd>Uses the URL; marked as missing a title.</dd></>}
                </dl>
              ) : (
                <>
                  {Object.keys(change.patch ?? {}).map((key) => {
                    const field = key as keyof typeof fieldLabels;
                    return <div className="agent-review-diff" key={field}>
                      <div><span className="subtle">Current {fieldLabels[field].toLowerCase()}</span><p>{fieldValue(before!, field, proposal.before)}</p></div>
                      <div><span className="subtle">Proposed {fieldLabels[field].toLowerCase()}</span><p>{fieldValue(after, field, proposal.preview)}</p></div>
                    </div>;
                  })}
                  <dl className="agent-review-fields">
                    {!!change.addTagIds?.length && <><dt>Add to</dt><dd>{groupNames(proposal.preview, change.addTagIds)}</dd></>}
                    {!!change.removeTagIds?.length && <><dt>Remove from</dt><dd>{groupNames(proposal.before, change.removeTagIds)}</dd></>}
                  </dl>
                  <p className="subtle">Fields and group connections omitted from this proposal keep their current values.</p>
                </>
              )}
            </section>;
          })}
        </>
      )}
      <footer>
        {reviewable ? <><button disabled={busy} onClick={onReject}>Reject batch</button><button className="primary" disabled={busy || proposal?.state !== "pending_review"} onClick={onApply}>{busy ? "Saving batch…" : "Apply batch"}</button></> : <button onClick={onClose}>Close</button>}
      </footer>
      <p className="agent-review-note subtle">The whole batch saves together as one Undo action. Proposals stay in this tab; reloading or switching collections discards them. Claude, Codex, and Chrome may also ask for connection or tool permission.</p>
    </Dialog>
  );
}
