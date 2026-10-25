import { useEffect, useMemo, useState } from "react";
import { batchTagMatch, hasGroup, reviewAgentProposal, type AgentProposal, type BatchTag, type ImportProposal, type ProposalField, type ProposalOverwrite, type ReviewProposal } from "../domain/agent-review";
import { isWebUrl, statusLabel, type Asset, type Bookmark, type Workspace } from "../domain/model";
import type { LoadMedia } from "./Cover";
import { Dialog, DialogHeader } from "./Dialog";
import { Icon } from "./Icon";

const stateLabels = { pending_review: "Pending review", applied: "Applied", set_aside: "Set aside", stale: "Stale" };
const fieldLabels = { title: "Title", url: "URL", description: "Description", statusId: "Status" };
function fieldValue(bookmark: Bookmark, field: keyof typeof fieldLabels, workspace: Workspace) {
  return field === "statusId" ? statusLabel(workspace, bookmark.statusId) : bookmark[field] || "None";
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

function BatchPicker({ proposal, proposals, busy, onSelect }: { proposal: ReviewProposal; proposals: ReviewProposal[]; busy: boolean; onSelect: (proposalId: string) => void }) {
  if (proposals.length < 2) return null;
  return <label className="agent-review-picker">Batch
    <select aria-label="Choose batch" value={proposal.id} disabled={busy} onChange={(event) => onSelect(event.target.value)}>
      {proposals.map((batch) => <option key={batch.id} value={batch.id}>{batch.input.summary} · {stateLabels[batch.state]}</option>)}
    </select>
  </label>;
}

function BatchTagChip({ name, note }: { name: string; note: string }) {
  return <span className="agent-review-batch-chip"><Icon name="tag" size={13} />{name}<small>{note}</small></span>;
}
/** The reviewer's optional tag for every bookmark in a batch. The draft lives here; the chosen tag lives on the proposal. */
function BatchTagPanel({ value, additions, updates, newCollection, defaultName, reuses, applied, busy, onEditing, onChange }: {
  value?: BatchTag;
  /** Bookmarks the tag always covers. */
  additions: number;
  /** Titles of existing bookmarks the batch updates, which the tag covers only when chosen. */
  updates: string[];
  newCollection: boolean;
  defaultName: string;
  /** Names the existing tag a name would reuse, if any. */
  reuses: (name: string) => string | undefined;
  applied: boolean;
  busy: boolean;
  onEditing: (editing: boolean) => void;
  /** Returns an error message when the tag can't be staged. */
  onChange: (value?: BatchTag) => string | undefined;
}) {
  const [draft, setDraft] = useState<BatchTag & { error?: string }>();
  useEffect(() => { onEditing(Boolean(draft)); return () => onEditing(false); }, [draft, onEditing]);
  // A batch with no additions can only tag the bookmarks it updates.
  const scope = (v: BatchTag) => additions + (v.includeUpdates || !additions ? updates.length : 0);
  const plural = (n: number) => `${n} ${n === 1 ? "bookmark" : "bookmarks"}`;
  const intro = newCollection ? "Give every bookmark in the new collection one shared tag, so you can find this batch later." : "Give the bookmarks in this batch one shared tag, so you can find them among your other bookmarks later.";
  if (applied && !value) return null;
  if (draft && !applied) {
    const name = draft.name.trim(), reused = name ? reuses(name) : undefined, count = scope(draft);
    const save = () => {
      if (!name) return setDraft({ ...draft, error: "Enter a tag name." });
      const error = onChange({ name, includeUpdates: draft.includeUpdates || !additions });
      setDraft(error ? { ...draft, error } : undefined);
    };
    return <section className="agent-review-batch" aria-labelledby="batch-tag-title">
      <div className="agent-review-batch-heading"><h3 id="batch-tag-title"><Icon name="tag" size={15} />Batch tag</h3><p className="subtle">{intro}</p></div>
      <label className="agent-review-batch-field">Tag name
        <input type="text" value={draft.name} aria-describedby="batch-tag-hint" autoFocus disabled={busy}
          onChange={(event) => setDraft({ ...draft, name: event.target.value, error: undefined })}
          onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") { event.stopPropagation(); setDraft(undefined); } }} />
      </label>
      <p id="batch-tag-hint" className={`agent-review-batch-hint${draft.error ? " is-error" : reused ? " is-reuse" : ""}`} role={draft.error ? "alert" : undefined}>
        {draft.error ?? (reused ? `Uses your existing tag ${reused}. No new tag is created.` : name ? "Creates a new plain tag (no tag type) when you apply." : "A plain tag with no tag type.")}
      </p>
      <div className="agent-review-batch-scope">
        {newCollection ? <p><Icon name="check" size={14} />All {plural(additions)} in the new collection</p> : <>
          {additions > 0 && <p><Icon name="check" size={14} />The {plural(additions)} this batch adds</p>}
          {additions > 0 && updates.length > 0 && <label><input type="checkbox" checked={draft.includeUpdates} disabled={busy} onChange={(event) => setDraft({ ...draft, includeUpdates: event.target.checked })} />
            <span>Also the {updates.length} existing {updates.length === 1 ? "bookmark" : "bookmarks"} this batch updates<span className="subtle">{updates.join(" · ")}</span></span></label>}
          {!additions && <p><Icon name="check" size={14} />The {plural(updates.length)} this batch updates</p>}
        </>}
        <strong>Tags {plural(count)}</strong>
      </div>
      <div className="agent-review-batch-actions">
        <button type="button" className="primary" disabled={busy} onClick={save}>Add to {plural(count)}</button>
        <button type="button" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</button>
      </div>
    </section>;
  }
  if (!value) return <section className="agent-review-batch" aria-labelledby="batch-tag-title">
    <div className="agent-review-batch-row">
      <div className="agent-review-batch-heading"><h3 id="batch-tag-title"><Icon name="tag" size={15} />Batch tag <span className="subtle">· optional</span></h3><p className="subtle">{intro}</p></div>
      <button type="button" disabled={busy} onClick={() => setDraft({ name: defaultName, includeUpdates: false })}><Icon name="tag" size={15} />Add a batch tag</button>
    </div>
  </section>;
  const count = scope(value);
  return <section className="agent-review-batch is-set" aria-labelledby="batch-tag-title">
    <div className="agent-review-batch-heading"><h3 id="batch-tag-title"><Icon name="tag" size={15} />Batch tag</h3>
      <p className="subtle">{applied ? `Saved with the batch on ${plural(count)}.` : `Will be added to ${plural(count)} when you apply. Tags the agent proposed stay as they are.`}</p></div>
    <div className="agent-review-batch-row">
      <BatchTagChip name={value.name} note={reuses(value.name) ? "existing tag" : "new tag"} />
      {!applied && <span className="agent-review-batch-actions">
        <button type="button" disabled={busy} onClick={() => setDraft({ ...value })}>Change</button>
        <button type="button" disabled={busy} onClick={() => onChange(undefined)}>Remove</button>
      </span>}
    </div>
  </section>;
}
/** Suggests a batch tag name from the batch's summary and size. */
function defaultBatchTagName(summary: string, count: number) {
  return `${summary.length <= 40 ? summary : "Agent batch"} — ${count} ${count === 1 ? "link" : "links"}`;
}

type ReviewProps = {
  proposal?: ReviewProposal;
  proposals: ReviewProposal[];
  workspace: Workspace;
  availability: "checking" | "available" | "unavailable" | "failed";
  busy: boolean;
  error: string;
  loadMedia: LoadMedia;
  onApply: () => void;
  onApplyAnyway: (reviewedRevision: number) => void;
  onApplyImport: () => void;
  onSetAside: () => void;
  /** Stages the batch tag on the current proposal; returns an error message when it can't. */
  onBatchTag: (value?: BatchTag) => string | undefined;
  onSelect: (proposalId: string) => void;
  onClose: () => void;
};
export function AgentReviewDialog(props: ReviewProps) {
  const { proposal } = props;
  return proposal?.kind === "import" ? <ImportReview {...props} proposal={proposal} /> : <ChangeReview {...props} proposal={proposal} />;
}

function ChangeReview({ proposal, proposals, workspace, availability, busy, error, loadMedia, onApply, onApplyAnyway, onSetAside, onBatchTag, onSelect, onClose }: ReviewProps & { proposal?: AgentProposal }) {
  const [confirmation, setConfirmation] = useState<{ proposalId: string; revision: number }>();
  const [editingTag, setEditingTag] = useState(false);
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
  const batchTag = proposal?.batchTag, tagSource = beforeWorkspace ?? workspace;
  const reuses = (name: string) => {
    const tag = batchTagMatch(tagSource, name);
    return tag && `“${tag.name}” (${tagSource.tagTypes.find((t) => t.id === tag.typeId)?.name ?? "no tag type"})`;
  };
  return (
    <Dialog labelledBy="agent-review-title" className="agent-review-modal" onClose={() => { if (!busy) onClose(); }}>
      <DialogHeader id="agent-review-title" label="Agent" title="Agent review" description={proposal?.input.summary ?? "Batch review before saving"} closeLabel="Close agent review" disabled={busy} onClose={onClose} />
      {proposal && <BatchPicker proposal={proposal} proposals={proposals} busy={busy} onSelect={(id) => { setConfirmation(undefined); onSelect(id); }} />}
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
          <BatchTagPanel key={proposal.id} value={batchTag} additions={additions} updates={proposal.input.changes.flatMap((c) => c.kind === "update" ? [tagSource.bookmarks.find((b) => b.id === c.bookmarkId)?.title ?? c.bookmarkId] : [])}
            newCollection={false} defaultName={defaultBatchTagName(proposal.input.summary, additions || updates)} reuses={reuses} applied={proposal.state === "applied"} busy={busy} onEditing={setEditingTag} onChange={onBatchTag} />
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
                  <dt>Add to</dt><dd>{(change.tagIds?.length || !batchTag) && groupNames(previewWorkspace!, change.tagIds ?? [])}{batchTag && change.tagIds?.length ? " " : null}{batchTag && <BatchTagChip name={batchTag.name} note="batch tag" />}</dd>
                  {after.missingTitle && <><dt>Title</dt><dd>Uses the URL; marked as missing a title.</dd></>}
                </dl>
              ) : (
                <>
                  {Object.keys(change.patch ?? {}).map((key) => {
                    const field = key as ProposalField;
                    return <FieldDiff key={field} field={field} before={before ?? original!} after={after} original={original!} originalWorkspace={proposal.before} currentWorkspace={beforeWorkspace!} previewWorkspace={previewWorkspace!} overwritten={overridden(id, field)} live={reviewable} loadMedia={loadMedia} />;
                  })}
                  {[...(change.addTagIds ?? []), ...(change.removeTagIds ?? [])].map((tagId) => <MembershipDiff key={tagId} bookmarkId={id} tagId={tagId} before={beforeWorkspace!} after={previewWorkspace!} overwritten={overridden(id, "membership", tagId)} />)}
                  {batchTag?.includeUpdates && <p className="agent-review-batch-line">Adds the batch tag <BatchTagChip name={batchTag.name} note="batch tag" /></p>}
                  <p className="subtle">Fields and tags omitted from this proposal keep their current values.</p>
                </>
              )}
            </section>;
          })}
        </>
      )}
      <p className="agent-review-note subtle">The whole batch saves together as one Undo action. Set-aside batches stay available in this tab; reloading or switching collections discards proposals. Claude, Codex, and Chrome may also ask for connection or tool permission.</p>
      {reviewable && <footer className="agent-review-save">
        {stale && review?.values && <div className="agent-review-warning" id="agent-apply-warning">
          <strong>{overwrites.length ? `Apply anyway will overwrite ${overwrites.length} newer ${overwrites.length === 1 ? "edit" : "edits"}:` : "No newer edits will be overwritten."}</strong>
          {overwrites.length > 0 && <ul>{overwrites.map((overwrite) => {
            const bookmark = beforeWorkspace!.bookmarks.find((b) => b.id === overwrite.bookmarkId)!;
            return <li key={`${overwrite.bookmarkId}-${overwrite.field}-${overwrite.tagId ?? ""}`}><strong>{bookmark.title}</strong> · {overwrite.field === "membership" ? `Tag: ${groupNames(beforeWorkspace!, [overwrite.tagId!])}` : overwrite.field === "asset" ? "Image" : fieldLabels[overwrite.field]}</li>;
          })}</ul>}
          <p>The whole batch will be saved. Other fields keep their latest values. Undo restores the collection from immediately before saving.</p>
        </div>}
        {error && <p className="agent-review-save-error" role="status">Not saved: {error}</p>}
        <div className="agent-review-actions">
          {proposal?.state !== "set_aside" && <button disabled={busy} onClick={onSetAside}>Set aside</button>}{stale ? <button className={`agent-review-apply-anyway${confirming ? " is-confirming" : ""}`} aria-describedby={confirming ? "agent-apply-warning agent-confirm-reminder" : "agent-apply-warning"} disabled={busy || editingTag || !review?.values} onClick={() => {
            if (confirming) onApplyAnyway(confirmation!.revision);
            else setConfirmation({ proposalId: proposal!.id, revision: workspace.revision });
          }}>{busy ? "Saving batch…" : confirming ? overwrites.length ? "Confirm overwrite" : "Confirm apply" : "Apply anyway"}</button> : <button className="primary" disabled={busy || editingTag || !review?.values} onClick={onApply}>{busy ? "Saving batch…" : "Apply batch"}</button>}
        </div>
        {editingTag && <p className="agent-review-batch-pending" role="status">Finish or cancel the batch tag to apply.</p>}
        {confirming && <p className="agent-review-confirm-reminder" id="agent-confirm-reminder" role="status">{overwrites.length ? `Nothing saved yet. Confirming will overwrite ${overwrites.length} newer ${overwrites.length === 1 ? "edit" : "edits"} listed above.` : "Nothing saved yet. Confirming will save the whole batch; no newer edits will be overwritten."}</p>}
      </footer>}
    </Dialog>
  );
}

function RowThumb({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <span className="import-review-thumb is-empty">No image</span>;
  if (failed) return <span className="import-review-thumb is-failed">Could not load</span>;
  return <img className="import-review-thumb" src={url} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
function ImportReview({ proposal, proposals, busy, error, loadMedia, onApplyImport, onSetAside, onBatchTag, onSelect, onClose }: ReviewProps & { proposal: ImportProposal }) {
  const [tagFilter, setTagFilter] = useState<string>();
  const [editingTag, setEditingTag] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { setTagFilter(undefined); setQuery(""); }, [proposal.id]);
  const { collection, bookmarkIds } = proposal.staged;
  const bookmarks = useMemo(() => bookmarkIds.map((id) => collection.bookmarks.find((b) => b.id === id)!), [collection, bookmarkIds]);
  const tagsOf = useMemo(() => new Map(bookmarks.map((b) => [b.id, collection.memberships.filter((m) => m.bookmarkId === b.id).map((m) => m.tagId)])), [collection, bookmarks]);
  const tags = useMemo(() => collection.tags.map((t) => ({ ...t, count: collection.memberships.filter((m) => m.tagId === t.id).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), [collection]);
  const tagName = (id: string) => collection.tags.find((t) => t.id === id)?.name ?? id;
  const text = query.trim().toLowerCase();
  const visible = bookmarks.filter((b) => (!tagFilter || tagsOf.get(b.id)!.includes(tagFilter)) && (!text || `${b.title} ${b.url ?? ""} ${b.description}`.toLowerCase().includes(text)));
  const thumbnails = bookmarks.filter((b) => b.asset).length;
  const reviewable = proposal.state !== "applied";
  return (
    <Dialog labelledBy="agent-review-title" className="agent-review-modal" onClose={() => { if (!busy) onClose(); }}>
      <DialogHeader id="agent-review-title" label="Agent" title="Agent review" description={proposal.input.summary} closeLabel="Close agent review" disabled={busy} onClose={onClose} />
      <BatchPicker proposal={proposal} proposals={proposals} busy={busy} onSelect={onSelect} />
      <p className="agent-review-summary" aria-live="polite"><span className="agent-review-state">{stateLabels[proposal.state]}</span><span className="subtle">New collection · {bookmarks.length} {bookmarks.length === 1 ? "addition" : "additions"}</span></p>
      {proposal.state === "set_aside" && <p role="status">Nothing saved. You can apply this import later from any collection in this tab.</p>}
      {proposal.state === "applied" && <p role="status">The whole import was saved as a new collection. Close this review to use Undo. If you already undid it, this remains a record of the original import.</p>}
      {error && <div className="alert" role="alert">Not saved: {error} No collection was created. Try Apply again, or set the import aside.</div>}
      <BatchTagPanel key={proposal.id} value={proposal.batchTag && { name: proposal.batchTag.name, includeUpdates: false }} additions={proposal.input.bookmarks.length} updates={[]} newCollection
        defaultName={defaultBatchTagName(proposal.input.summary, proposal.input.bookmarks.length)} applied={proposal.state === "applied"} busy={busy} onEditing={setEditingTag} onChange={onBatchTag}
        reuses={(name) => { const tag = proposal.input.tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase()); return tag && `“${tag.name}” from this import`; }} />
      <section className="import-review-target" aria-labelledby="import-review-name">
        <span className="eyebrow">Creates a new collection</span>
        <h3 id="import-review-name">{collection.name}</h3>
        <dl className="import-review-totals">
          <div><dt>Bookmarks</dt><dd>{bookmarks.length}</dd></div>
          <div><dt>Tags</dt><dd>{collection.tags.length}</dd></div>
          <div><dt>Tag links</dt><dd>{collection.memberships.length}</dd></div>
          <div><dt>Thumbnails</dt><dd>{thumbnails}</dd></div>
        </dl>
        <p className="subtle">Every bookmark starts as {statusLabel(collection, "pending")}. Tags are plain tags with no type.</p>
      </section>
      {tags.length > 0 && <>
        <div className="import-review-heading"><h3>Tags</h3><span className="subtle">Select a tag to see its bookmarks</span></div>
        <ul className="import-review-tags">{tags.map((t) => <li key={t.id}>
          <button type="button" aria-pressed={tagFilter === t.id} onClick={() => setTagFilter(tagFilter === t.id ? undefined : t.id)}>{t.name} <span>{t.count}</span></button>
        </li>)}</ul>
      </>}
      <div className="import-review-heading"><h3>Bookmarks</h3><span className="subtle">{tagFilter ? `${visible.length} in ${tagName(tagFilter)}` : text ? `${visible.length} of ${bookmarks.length} match` : bookmarks.length}</span></div>
      <div className="import-review-tools">
        <input type="search" aria-label="Search proposed bookmarks" placeholder="Search titles, links and descriptions" value={query} onChange={(event) => setQuery(event.target.value)} />
        {(tagFilter || text) && <button type="button" className="text-button" onClick={() => { setTagFilter(undefined); setQuery(""); }}>Show all {bookmarks.length}</button>}
      </div>
      <ul className="import-review-list">
        {visible.map((b) => {
          const names = tagsOf.get(b.id)!.map(tagName).join(" · ") || "No tags";
          return <li key={b.id}><details>
            <summary><RowThumb url={b.asset?.url} /><span className="import-review-row"><strong>{b.title}</strong><span className="subtle">{names}</span></span></summary>
            <div className="import-review-detail">
              <dl className="agent-review-fields">
                <dt>URL</dt><dd>{b.url && isWebUrl(b.url) ? <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a> : b.url}</dd>
                <dt>Description</dt><dd>{b.description || "None"}</dd>
                <dt>Status</dt><dd>{statusLabel(collection, b.statusId)}</dd>
                <dt>Tags</dt><dd>{names}</dd>
                {b.missingTitle && <><dt>Title</dt><dd>Uses the URL; marked as missing a title.</dd></>}
              </dl>
              <div><AssetPreview asset={b.asset} label={`Proposed thumbnail for ${b.title}`} loadMedia={loadMedia} /></div>
            </div>
          </details></li>;
        })}
        {!visible.length && <li className="subtle import-review-empty">No proposed bookmarks match.</li>}
      </ul>
      <p className="agent-review-note subtle">Nothing is saved until you apply. The import stays in this tab while you switch collections; reloading the tab discards it. Thumbnails are stored after Apply, the same way as for other bookmarks.</p>
      {reviewable && <footer className="agent-review-save">
        <p className="subtle import-review-footnote">Apply creates the collection and everything in it in one save, as one Undo action. Undo leaves the new collection empty.</p>
        <div className="agent-review-actions">
          {proposal.state !== "set_aside" && <button disabled={busy} onClick={onSetAside}>Set aside</button>}
          <button className="primary" disabled={busy || editingTag} onClick={onApplyImport}>{busy ? "Creating collection…" : "Apply import"}</button>
        </div>
        {editingTag && <p className="agent-review-batch-pending" role="status">Finish or cancel the batch tag to apply.</p>}
      </footer>}
    </Dialog>
  );
}
