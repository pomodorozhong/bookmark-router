import { useEffect, useMemo, useState } from "react";
import { hasGroup, reviewAgentProposal, type AgentProposal, type ProposalField, type ProposalOverwrite } from "../domain/agent-review";
import { isWebUrl, type Asset, type Bookmark, type Workspace } from "../domain/model";
import type { LoadMedia } from "./Cover";
import { Dialog } from "./Dialog";
import { IconButton } from "./Icon";

const stateLabels = { pending_review: "Pending review", applied: "Applied", set_aside: "Set aside", stale: "Stale" };
const fieldLabels = { title: "Title", url: "URL", description: "Description", statusId: "Status" };
function fieldValue(bookmark: Bookmark, field: keyof typeof fieldLabels, workspace: Workspace) {
  return field === "statusId" ? workspace.statuses.find((s) => s.id === bookmark.statusId)?.label ?? bookmark.statusId : bookmark[field] || "None";
}
function groupNames(workspace: Workspace, ids: string[]) {
  return ids.map((id) => workspace.tags.find((t) => t.id === id)?.name ?? id).join(" · ") || "None";
}

function ReviewImage({ asset, label, loadMedia }: { asset: Asset; label: string; loadMedia: LoadMedia }) {
  const [src, setSrc] = useState<string>();
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => {
    let canceled = false, objectUrl: string | undefined;
    if (asset.source === "remote") {
      if (asset.url && isWebUrl(asset.url)) setSrc(asset.url);
      else setState("failed");
    } else {
      void loadMedia(asset.blobId!).then((media) => {
        if (canceled) return;
        if (media) setSrc(objectUrl = URL.createObjectURL(media.blob));
        else setState("failed");
      }).catch(() => { if (!canceled) setState("failed"); });
    }
    return () => { canceled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset, loadMedia]);
  return <div className="agent-review-image">
    {state !== "loaded" && <p className={state === "failed" ? "agent-review-image-error" : "subtle"} role="status">{state === "failed" ? "Image could not load." : "Loading image…"}</p>}
    {src && <img src={src} alt={label} hidden={state !== "loaded"} onLoad={() => setState("loaded")} onError={() => setState("failed")} />}
  </div>;
}
function AssetPreview({ asset, label, loadMedia }: { asset?: Asset; label: string; loadMedia: LoadMedia }) {
  if (!asset) return <div className="agent-review-no-image">No image</div>;
  return <>
    {asset.kind === "image" ? <ReviewImage key={JSON.stringify(asset)} asset={asset} label={label} loadMedia={loadMedia} /> : <p>{asset.kind === "video" ? "Video" : "Audio"}</p>}
    <p className="subtle">{asset.source === "remote" && asset.url && isWebUrl(asset.url) ? <a href={asset.url} target="_blank" rel="noreferrer">{asset.url}</a> : asset.filename ?? asset.url ?? "Local media"}</p>
  </>;
}

function assetValue(asset?: Asset) {
  return !asset ? "No image" : asset.source === "local" ? asset.filename ?? "Local media" : asset.url ?? "Remote media";
}
function FieldDiff({ field, before, after, original, originalWorkspace, currentWorkspace, previewWorkspace, overwritten, live = true, loadMedia }: {
  field: ProposalField; before: Bookmark; after: Bookmark; original: Bookmark;
  originalWorkspace: Workspace; currentWorkspace: Workspace; previewWorkspace: Workspace; overwritten: boolean; live?: boolean; loadMedia: LoadMedia;
}) {
  return <div className="agent-review-diff">
    <div>
      <span className="subtle">{live ? "Current" : "Before batch"} {field === "asset" ? "image" : fieldLabels[field].toLowerCase()}{live && " · latest saved value"}</span>
      {field === "asset" ? <AssetPreview asset={before.asset} label={`Current image for ${before.title}`} loadMedia={loadMedia} /> : <p>{fieldValue(before, field, currentWorkspace)}</p>}
      {overwritten && <><p className="agent-review-overwrite">Changed since proposal · will be replaced</p><p className="subtle">At proposal time: {field === "asset" ? assetValue(original.asset) : fieldValue(original, field, originalWorkspace)}</p></>}
    </div>
    <div>
      <span className="subtle">Proposed {field === "asset" ? "image" : fieldLabels[field].toLowerCase()} · will be saved</span>
      {field === "asset" ? <AssetPreview asset={after.asset} label={`Proposed image for ${after.title}`} loadMedia={loadMedia} /> : <p>{fieldValue(after, field, previewWorkspace)}</p>}
    </div>
  </div>;
}
function MembershipDiff({ bookmarkId, tagId, before, after, overwritten }: {
  bookmarkId: string; tagId: string; before: Workspace; after: Workspace; overwritten: boolean;
}) {
  return <div className="agent-review-diff">
    <div><span className="subtle">Current connection · {groupNames(before, [tagId])}</span><p>{hasGroup(before, bookmarkId, tagId) ? "Linked" : "Not linked"}</p>{overwritten && <p className="agent-review-overwrite">Changed since proposal · will be replaced</p>}</div>
    <div><span className="subtle">Proposed connection · will be saved</span><p>{hasGroup(after, bookmarkId, tagId) ? "Linked" : "Not linked"}</p></div>
  </div>;
}

export function AgentReviewDialog({ proposal, proposals, workspace, availability, busy, error, loadMedia, onApply, onApplyAnyway, onSetAside, onSelect, onClose }: {
  proposal?: AgentProposal;
  proposals: AgentProposal[];
  workspace: Workspace;
  availability: "checking" | "available" | "unavailable" | "failed";
  busy: boolean;
  error: string;
  loadMedia: LoadMedia;
  onApply: () => void;
  onApplyAnyway: (reviewedRevision: number) => void;
  onSetAside: () => void;
  onSelect: (proposalId: string) => void;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState<{ proposalId: string; revision: number }>();
  // Confirm only the proposal and saved values shown when the first click happened.
  useEffect(() => { setConfirmation(undefined); }, [proposal?.id, proposal?.state, workspace.id, workspace.revision, error]);
  let creationIndex = 0;
  const reviewable = Boolean(proposal && proposal.state !== "applied");
  const stale = reviewable && proposal && (proposal.state === "stale" || proposal.input.expectedRevision !== workspace.revision);
  const review = useMemo(() => {
    if (!proposal || !reviewable) return undefined;
    try { return { values: reviewAgentProposal(proposal, workspace) }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [proposal, reviewable, workspace]);
  const beforeWorkspace = reviewable && workspace.id === proposal?.input.collectionId ? workspace : proposal?.before;
  const previewWorkspace = review?.values?.preview ?? proposal?.preview;
  const overwrites = review?.values?.overwrites ?? [];
  const confirming = Boolean(stale && review?.values && confirmation?.proposalId === proposal?.id && confirmation?.revision === workspace.revision);
  const overridden = (bookmarkId: string, field: ProposalOverwrite["field"], tagId?: string) => overwrites.some((o) => o.bookmarkId === bookmarkId && o.field === field && o.tagId === tagId);
  const overwriteSummary = overwrites.length ? `${overwrites.length} newer ${overwrites.length === 1 ? "edit will" : "edits will"} be overwritten. Review the current values and their replacements below.` : "No newer edits will be overwritten. Changes outside this proposal keep their latest saved values.";
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
      {proposal && proposals.length > 1 && <label className="agent-review-picker">Batch
        <select aria-label="Choose batch" value={proposal.id} disabled={busy} onChange={(event) => { setConfirmation(undefined); onSelect(event.target.value); }}>
          {proposals.map((batch) => <option key={batch.id} value={batch.id}>{batch.input.summary} · {stateLabels[batch.state]}</option>)}
        </select>
      </label>}
      {error && <div className="alert" role="alert">{error}</div>}
      {!proposal ? (
        <div className="agent-review-empty">
          <h3>No proposal awaiting review</h3>
          <p>{availability === "available" ? "Bookmark tools are ready in this tab. Ask Claude Desktop or Codex to propose a batch, then return here to review it." : availability === "checking" ? "Checking bookmark tool availability…" : availability === "failed" ? "Bookmark tools could not start. Reload this tab after checking your Chrome WebMCP setup." : "WebMCP is unavailable in this browser. Enable it in Chrome and keep this app tab open to use Claude Desktop or Codex."}</p>
        </div>
      ) : (
        <>
          <p className="agent-review-summary" aria-live="polite"><span className="agent-review-state">{proposal.state === "set_aside" ? "Set aside" : stale ? "Stale" : stateLabels[proposal.state]}</span><span className="subtle">{[additions && `${additions} ${additions === 1 ? "addition" : "additions"}`, updates && `${updates} ${updates === 1 ? "update" : "updates"}`].filter(Boolean).join(" · ")} · {proposal.before.name}</span></p>
          {stale && <div className="agent-review-warning" role="alert"><strong>The collection changed after this proposal.</strong><p>{review?.error ? "This batch could not be validated against the latest collection. Review the error below." : overwriteSummary}</p></div>}
          {review?.error && <div className="alert" role="alert">This batch cannot be applied: {review.error} {proposal.state === "set_aside" ? "Ask the agent for a fresh proposal." : "Set it aside and ask the agent for a fresh proposal."}</div>}
          {proposal.state === "applied" && <p role="status">The whole batch was saved. Close this review to use Undo. If you already undid it, this remains a record of the original application.</p>}
          {proposal.state === "set_aside" && <p role="status">Nothing saved. You can apply this batch later or review another batch.</p>}
          {proposal.input.changes.map((change, index) => {
            const id = change.kind === "create" ? proposal.createdBookmarkIds[creationIndex++] : change.bookmarkId;
            const after = previewWorkspace!.bookmarks.find((b) => b.id === id)!;
            const before = beforeWorkspace!.bookmarks.find((b) => b.id === id);
            const original = proposal.before.bookmarks.find((b) => b.id === id);
            return <section className="agent-review-change" key={id} aria-labelledby={`agent-change-${index}`}>
              <div className="agent-review-change-heading"><span className="agent-review-state">{change.kind === "create" ? "Add bookmark" : "Update bookmark"}</span><h3 id={`agent-change-${index}`}>{after.title}</h3></div>
              {change.kind === "create" ? (
                <dl className="agent-review-fields">
                  <dt>URL</dt><dd>{after.url}</dd>
                  <dt>Description</dt><dd>{after.description || "None"}</dd>
                  <dt>Status</dt><dd>{fieldValue(after, "statusId", previewWorkspace!)}</dd>
                  <dt>Add to</dt><dd>{groupNames(previewWorkspace!, change.tagIds ?? [])}</dd>
                  {after.missingTitle && <><dt>Title</dt><dd>Uses the URL; marked as missing a title.</dd></>}
                </dl>
              ) : (
                <>
                  {Object.keys(change.patch ?? {}).map((key) => {
                    const field = key as ProposalField;
                    return <FieldDiff key={field} field={field} before={before ?? original!} after={after} original={original!} originalWorkspace={proposal.before} currentWorkspace={beforeWorkspace!} previewWorkspace={previewWorkspace!} overwritten={overridden(id, field)} live={reviewable} loadMedia={loadMedia} />;
                  })}
                  {[...(change.addTagIds ?? []), ...(change.removeTagIds ?? [])].map((tagId) => <MembershipDiff key={tagId} bookmarkId={id} tagId={tagId} before={beforeWorkspace!} after={previewWorkspace!} overwritten={overridden(id, "membership", tagId)} />)}
                  <p className="subtle">Fields and group connections omitted from this proposal keep their current values.</p>
                </>
              )}
            </section>;
          })}
        </>
      )}
      <footer className="agent-review-save">
        {stale && review?.values && <div className="agent-review-warning" id="agent-apply-warning">
          <strong>{overwrites.length ? `Apply anyway will overwrite ${overwrites.length} newer ${overwrites.length === 1 ? "edit" : "edits"}:` : "No newer edits will be overwritten."}</strong>
          {overwrites.length > 0 && <ul>{overwrites.map((overwrite) => {
            const bookmark = beforeWorkspace!.bookmarks.find((b) => b.id === overwrite.bookmarkId)!;
            return <li key={`${overwrite.bookmarkId}-${overwrite.field}-${overwrite.tagId ?? ""}`}><strong>{bookmark.title}</strong> · {overwrite.field === "membership" ? `Group: ${groupNames(beforeWorkspace!, [overwrite.tagId!])}` : overwrite.field === "asset" ? "Image" : fieldLabels[overwrite.field]}</li>;
          })}</ul>}
          <p>The whole batch will be saved. Other fields keep their latest values. Undo restores the collection from immediately before saving.</p>
        </div>}
        {error && <p className="agent-review-save-error" role="status">Not saved: {error}</p>}
        <div className="agent-review-actions">
          {reviewable ? <>{proposal?.state !== "set_aside" && <button disabled={busy} onClick={onSetAside}>Set aside</button>}{stale ? <button className={`agent-review-apply-anyway${confirming ? " is-confirming" : ""}`} aria-describedby={confirming ? "agent-apply-warning agent-confirm-reminder" : "agent-apply-warning"} disabled={busy || !review?.values} onClick={() => {
            if (confirming) onApplyAnyway(confirmation!.revision);
            else setConfirmation({ proposalId: proposal!.id, revision: workspace.revision });
          }}>{busy ? "Saving batch…" : confirming ? overwrites.length ? "Confirm overwrite" : "Confirm apply" : "Apply anyway"}</button> : <button className="primary" disabled={busy || !review?.values} onClick={onApply}>{busy ? "Saving batch…" : "Apply batch"}</button>}</> : <button onClick={onClose}>Close</button>}
        </div>
        {confirming && <p className="agent-review-confirm-reminder" id="agent-confirm-reminder" role="status">{overwrites.length ? `Nothing saved yet. Confirming will overwrite ${overwrites.length} newer ${overwrites.length === 1 ? "edit" : "edits"} listed above.` : "Nothing saved yet. Confirming will save the whole batch; no newer edits will be overwritten."}</p>}
      </footer>
      <p className="agent-review-note subtle">The whole batch saves together as one Undo action. Set-aside batches stay available in this tab; reloading or switching collections discards proposals. Claude, Codex, and Chrome may also ask for connection or tool permission.</p>
    </Dialog>
  );
}
