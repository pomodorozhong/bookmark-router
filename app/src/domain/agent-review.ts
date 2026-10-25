import { applyCommand, ConflictError, DuplicateBookmarkError, type Command } from "./commands";
import { storedUrlKey, urlKey, type Asset, type Bookmark, type Workspace } from "./model";
import { ImportInputError, stageCollectionImport, type CollectionImportBookmark, type CollectionImportTag, type StagedCollectionImport } from "./collection-import";

export type RemoteImage = Asset & { kind: "image"; source: "remote"; url: string };

export interface CreateChange {
  kind: "create";
  title?: string;
  url: string;
  description?: string;
  statusId?: string;
  tagIds?: string[];
}
export interface UpdateChange {
  kind: "update";
  bookmarkId: string;
  expectedRecordRevision: number;
  patch?: Partial<Pick<Bookmark, "title" | "description" | "url" | "statusId">> & { asset?: RemoteImage };
  addTagIds?: string[];
  removeTagIds?: string[];
}
export interface ProposalInput {
  requestId: string;
  collectionId: string;
  expectedRevision: number;
  summary: string;
  changes: Array<CreateChange | UpdateChange>;
}
export type ProposalState = "pending_review" | "applied" | "set_aside" | "stale";
/** A tag the reviewer adds to a batch's bookmarks before applying. It stays with the proposal in this tab and is saved only by Apply. */
export interface BatchTag {
  name: string;
  /** Edit batches only: also tag the existing bookmarks the batch updates, not just the ones it adds. */
  includeUpdates: boolean;
}
export interface AgentProposal {
  kind: "changes";
  id: string;
  input: ProposalInput;
  state: ProposalState;
  createdBookmarkIds: string[];
  /** Stable creation IDs are assigned once; retries never create a second bookmark. */
  commands: Command[];
  before: Workspace;
  preview: Workspace;
  /** `tagId` is assigned once and used only if no tag with the name exists when the batch is applied. */
  batchTag?: BatchTag & { tagId: string };
}
export interface ImportProposalInput {
  requestId: string;
  summary: string;
  target: { kind: "new_collection"; name: string };
  tags: CollectionImportTag[];
  bookmarks: CollectionImportBookmark[];
}
/** A complete new collection staged for review. It doesn't depend on the active collection, so it never goes stale. */
export interface ImportProposal {
  kind: "import";
  id: string;
  input: ImportProposalInput;
  state: Exclude<ProposalState, "stale">;
  /** Stable IDs are assigned once here; retries and Apply reuse them. Adding or changing the batch tag stages it again. */
  staged: StagedCollectionImport;
  /** `ref` is the tag reference added for the batch tag; it is absent when the batch tag reuses a declared tag. */
  batchTag?: { name: string; ref?: string };
}
export type ReviewProposal = AgentProposal | ImportProposal;
export type ProposalField = keyof NonNullable<UpdateChange["patch"]>;
export interface ProposalOverwrite {
  bookmarkId: string;
  field: ProposalField | "membership";
  tagId?: string;
}
export interface ProposalReview {
  before: Workspace;
  preview: Workspace;
  commands: Command[];
  overwrites: ProposalOverwrite[];
}
export class AgentInputError extends Error {
  constructor(message: string, public readonly code = "invalid_input") {
    super(message);
    this.name = "AgentInputError";
  }
}
export function inputObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentInputError("Expected an object.");
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new AgentInputError("Input contains unsupported fields.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new AgentInputError(`${label} must be ${allowEmpty ? "text" : "non-empty text"}.`);
  return value;
}
function revision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new AgentInputError("Revision must be a non-negative integer.");
  return value as number;
}
function ids(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim()) || new Set(value).size !== value.length)
    throw new AgentInputError("Group IDs must be unique non-empty strings.");
  return value as string[];
}
function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : text(value, label, true);
}
function remoteImage(value: unknown): RemoteImage {
  const asset = inputObject(value, ["kind", "source", "url"]);
  if (asset.kind !== "image" || asset.source !== "remote") throw new AgentInputError("Asset must be a remote image with an HTTP or HTTPS URL.");
  const url = text(asset.url, "Image URL").trim();
  try {
    return { kind: "image", source: "remote", url: urlKey(url) };
  } catch {
    throw new AgentInputError("Image URL must use HTTP or HTTPS.");
  }
}
export function parseProposal(value: unknown): ProposalInput {
  const input = inputObject(value, ["requestId", "collectionId", "expectedRevision", "summary", "changes"]);
  if (!Array.isArray(input.changes) || !input.changes.length) throw new AgentInputError("Include at least one bookmark change.");
  const changes = input.changes.map((value): CreateChange | UpdateChange => {
    const kind = (value as { kind?: unknown } | null)?.kind;
    if (kind === "create") {
      const c = inputObject(value, ["kind", "title", "url", "description", "statusId", "tagIds"]);
      return { kind, url: text(c.url, "URL"), title: optionalText(c.title, "Title"), description: optionalText(c.description, "Description"), statusId: optionalText(c.statusId, "Status"), tagIds: ids(c.tagIds) };
    }
    if (kind === "update") {
      const c = inputObject(value, ["kind", "bookmarkId", "expectedRecordRevision", "patch", "addTagIds", "removeTagIds"]);
      const rawPatch = c.patch === undefined ? undefined : inputObject(c.patch, ["title", "description", "url", "statusId", "asset"]);
      const patch = rawPatch ? { ...rawPatch } : undefined;
      if (patch) for (const [key, value] of Object.entries(patch)) {
        if (key === "asset") patch.asset = remoteImage(value);
        else text(value, key, key === "description" || key === "url");
      }
      return { kind, bookmarkId: text(c.bookmarkId, "Bookmark ID"), expectedRecordRevision: revision(c.expectedRecordRevision), patch: patch as UpdateChange["patch"], addTagIds: ids(c.addTagIds), removeTagIds: ids(c.removeTagIds) };
    }
    throw new AgentInputError("Change kind must be create or update.");
  });
  return { requestId: text(input.requestId, "Request ID"), collectionId: text(input.collectionId, "Collection ID"), expectedRevision: revision(input.expectedRevision), summary: text(input.summary, "Summary").trim(), changes };
}
export function parseImportProposal(value: unknown): ImportProposalInput {
  const input = inputObject(value, ["requestId", "summary", "target", "tags", "bookmarks"]);
  const target = inputObject(input.target, ["kind", "name"]);
  if (target.kind !== "new_collection") throw new AgentInputError("Target kind must be new_collection.");
  if (input.tags !== undefined && !Array.isArray(input.tags)) throw new AgentInputError("Tags must be an array.");
  if (!Array.isArray(input.bookmarks) || !input.bookmarks.length) throw new AgentInputError("Include at least one bookmark.");
  const tags = ((input.tags ?? []) as unknown[]).map((value) => {
    const tag = inputObject(value, ["ref", "name"]);
    return { ref: text(tag.ref, "Tag reference"), name: text(tag.name, "Tag name") };
  });
  const bookmarks = input.bookmarks.map((value): CollectionImportBookmark => {
    const b = inputObject(value, ["url", "title", "description", "tagRefs", "asset"]);
    if (b.tagRefs !== undefined && (!Array.isArray(b.tagRefs) || b.tagRefs.some((ref) => typeof ref !== "string" || !ref.trim())))
      throw new AgentInputError("Tag references must be non-empty strings.");
    return { url: text(b.url, "URL"), title: optionalText(b.title, "Title"), description: optionalText(b.description, "Description"), tagRefs: b.tagRefs as string[] | undefined, asset: b.asset === undefined ? undefined : remoteImage(b.asset) };
  });
  return { requestId: text(input.requestId, "Request ID"), summary: text(input.summary, "Summary").trim(), target: { kind: "new_collection", name: text(target.name, "Collection name").trim() }, tags, bookmarks };
}
function previewChanges(input: ProposalInput, source: Workspace, creationIds: string[], batchTag?: AgentProposal["batchTag"]): { commands: Command[]; preview: Workspace } {
  if (input.collectionId !== source.id || input.expectedRevision !== source.revision) throw new ConflictError();
  let preview = source, createIndex = 0;
  const commands: Command[] = [], edited = new Set<string>();
  const run = (command: Command) => { preview = applyCommand(preview, preview.revision, command); commands.push(command); };
  for (const change of input.changes) {
    if (change.kind === "create") {
      const { kind: _, ...fields } = change;
      run({ type: "bookmark.create", ...fields, id: creationIds[createIndex++] });
      continue;
    }
    if (edited.has(change.bookmarkId)) throw new AgentInputError("Combine updates to the same bookmark into one change.");
    edited.add(change.bookmarkId);
    const bookmark = preview.bookmarks.find((b) => b.id === change.bookmarkId);
    if (!bookmark || bookmark.revision !== change.expectedRecordRevision) throw new ConflictError();
    const add = change.addTagIds ?? [], remove = change.removeTagIds ?? [];
    if (add.some((id) => remove.includes(id))) throw new AgentInputError("A group cannot be both added and removed.");
    if ([...add, ...remove].some((id) => !preview.tags.some((t) => t.id === id))) throw new AgentInputError("Choose existing groups.");
    const patch = { ...change.patch };
    if (patch.title !== undefined) { patch.title = patch.title.trim(); if (!patch.title) throw new AgentInputError("Title cannot be blank."); }
    if (patch.url !== undefined) {
      patch.url = patch.url.trim() ? urlKey(patch.url.trim()) : "";
      const duplicate = patch.url && preview.bookmarks.find((b) => b.id !== bookmark.id && b.url && storedUrlKey(b.url) === storedUrlKey(patch.url!));
      if (duplicate) throw new DuplicateBookmarkError(duplicate.id);
    }
    if (!Object.keys(patch).length && !add.length && !remove.length) throw new AgentInputError("Update needs a field or group change.");
    if (Object.keys(patch).length) run({ type: "bookmark.patch", id: bookmark.id, expectedRecordRevision: bookmark.revision, patch });
    for (const tagId of add) run({ type: "membership.set", bookmarkId: bookmark.id, tagId, linked: true });
    for (const tagId of remove) run({ type: "membership.set", bookmarkId: bookmark.id, tagId, linked: false });
  }
  if (batchTag) {
    const tagId = batchTagMatch(preview, batchTag.name)?.id ?? batchTag.tagId;
    if (tagId === batchTag.tagId) run({ type: "tag.create", id: tagId, name: batchTag.name });
    const updated = batchTag.includeUpdates ? input.changes.flatMap((c) => c.kind === "update" ? [c.bookmarkId] : []) : [];
    for (const bookmarkId of [...creationIds, ...updated])
      if (!hasGroup(preview, bookmarkId, tagId)) run({ type: "membership.set", bookmarkId, tagId, linked: true });
  }
  return { commands, preview };
}
/** The existing tag a batch tag name reuses: a plain tag with that exact name first, then a tag of any type. */
export function batchTagMatch(workspace: Workspace, name: string) {
  const exact = workspace.tags.filter((t) => t.name === name.trim());
  return exact.find((t) => !t.typeId) ?? exact[0];
}
/** Stages an import with the batch tag added to every bookmark, reusing a declared tag of the same name. */
function stageImport(input: ImportProposalInput, batchTagName?: string): { staged: StagedCollectionImport; batchTag?: ImportProposal["batchTag"] } {
  let { tags, bookmarks } = input, batchTag: ImportProposal["batchTag"];
  if (batchTagName) {
    const declared = tags.find((t) => t.name.trim().toLowerCase() === batchTagName.toLowerCase());
    let ref = declared?.ref ?? "batch-tag";
    while (!declared && tags.some((t) => t.ref === ref)) ref += "-";
    if (!declared) tags = [...tags, { ref, name: batchTagName }];
    bookmarks = bookmarks.map((b) => b.tagRefs?.includes(ref) ? b : { ...b, tagRefs: [...(b.tagRefs ?? []), ref] });
    batchTag = { name: batchTagName, ref: declared ? undefined : ref };
  }
  try {
    return { staged: stageCollectionImport({ name: input.target.name, source: `Agent: ${input.summary}`, tags, bookmarks }), batchTag };
  } catch (error) {
    if (error instanceof ImportInputError) throw new AgentInputError(error.message);
    throw error;
  }
}

function sameField(a: Bookmark, b: Bookmark, field: ProposalField) {
  if (field === "asset") return (["kind", "source", "url", "blobId", "filename"] as const).every((key) => a.asset?.[key] === b.asset?.[key]);
  if (field === "title") return a.title === b.title && Boolean(a.missingTitle) === Boolean(b.missingTitle);
  return (a[field] ?? "") === (b[field] ?? "");
}
export function hasGroup(workspace: Workspace, bookmarkId: string, tagId: string) {
  return workspace.memberships.some((m) => m.bookmarkId === bookmarkId && m.tagId === tagId);
}

/** Revalidate the original intent against current content without changing the proposal or saving. */
export function reviewAgentProposal(proposal: AgentProposal, workspace: Workspace): ProposalReview {
  if (proposal.input.collectionId !== workspace.id) throw new ConflictError("This batch belongs to another collection.");
  const input: ProposalInput = { ...proposal.input, expectedRevision: workspace.revision, changes: proposal.input.changes.map((change) => {
    if (change.kind === "create") return change;
    const bookmark = workspace.bookmarks.find((b) => b.id === change.bookmarkId);
    if (!bookmark) throw new ConflictError("A bookmark in this batch no longer exists. Set it aside and ask for a fresh proposal.");
    return { ...change, expectedRecordRevision: bookmark.revision };
  }) };
  const { commands, preview } = previewChanges(input, workspace, proposal.createdBookmarkIds, proposal.batchTag);
  const overwrites: ProposalOverwrite[] = [];
  for (const change of input.changes) {
    if (change.kind !== "update") continue;
    const original = proposal.before.bookmarks.find((b) => b.id === change.bookmarkId)!;
    const current = workspace.bookmarks.find((b) => b.id === change.bookmarkId)!;
    const after = preview.bookmarks.find((b) => b.id === change.bookmarkId)!;
    for (const field of Object.keys(change.patch ?? {}) as ProposalField[]) {
      if (!sameField(original, current, field) && !sameField(current, after, field)) overwrites.push({ bookmarkId: change.bookmarkId, field });
    }
    for (const tagId of [...(change.addTagIds ?? []), ...(change.removeTagIds ?? [])]) {
      const linked = hasGroup(workspace, change.bookmarkId, tagId);
      if (linked !== hasGroup(proposal.before, change.bookmarkId, tagId) && linked !== hasGroup(preview, change.bookmarkId, tagId))
        overwrites.push({ bookmarkId: change.bookmarkId, field: "membership", tagId });
    }
  }
  return { before: workspace, preview, commands, overwrites };
}

/** Tab-local review state. Only the human-facing UI applies or sets batches aside. */
export class AgentReviewSession {
  private proposals = new Map<string, ReviewProposal>();
  private requestIds = new Map<string, string>();
  private applying = false;
  private currentId?: string;
  constructor(private readonly changed: () => void = () => {}) {}
  get current(): ReviewProposal | undefined { return this.currentId ? this.proposals.get(this.currentId) : undefined; }
  get batches(): ReviewProposal[] { return [...this.proposals.values()]; }
  get pending(): ReviewProposal | undefined { return this.batches.find((p) => p.state === "pending_review" || p.state === "stale"); }
  select(id: string) {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    if (!this.proposals.has(id)) throw new AgentInputError("Proposal is no longer available in this tab.", "proposal_not_found");
    this.currentId = id; this.changed();
  }
  reset() {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    this.proposals.clear(); this.requestIds.clear(); this.currentId = undefined; this.changed();
  }
  /** Switching collections discards edit batches for the old one; import proposals stay reviewable from any collection. */
  discardCollectionBatches() {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    for (const [id, proposal] of this.proposals) {
      if (proposal.kind !== "changes") continue;
      this.proposals.delete(id);
      this.requestIds.delete(proposal.input.requestId);
    }
    if (this.currentId && !this.proposals.has(this.currentId)) this.currentId = this.pending?.id ?? this.batches.at(-1)?.id;
    this.changed();
  }
  refresh(workspace: Workspace) {
    let changed = false;
    for (const proposal of this.proposals.values()) {
      if (proposal.kind === "changes" && proposal.state === "pending_review" && (proposal.input.collectionId !== workspace.id || proposal.input.expectedRevision !== workspace.revision)) {
        proposal.state = "stale"; changed = true;
      }
    }
    if (changed) this.changed();
  }
  submit(value: unknown, workspace: Workspace): AgentProposal {
    const input = parseProposal(value);
    this.refresh(workspace);
    const previous = this.retry(input);
    if (previous) {
      if (previous.kind !== "changes") throw new AgentInputError("This request ID already belongs to a different proposal.", "request_id_reused");
      return previous;
    }
    if (this.applying || this.pending) throw new AgentInputError("Apply or set aside the pending batch before submitting another.", "review_pending");
    const createdBookmarkIds = input.changes.filter((c) => c.kind === "create").map(() => crypto.randomUUID());
    const { commands, preview } = previewChanges(input, workspace, createdBookmarkIds);
    const proposal: AgentProposal = { kind: "changes", id: crypto.randomUUID(), input: structuredClone(input), state: "pending_review", createdBookmarkIds, commands, before: structuredClone(workspace), preview };
    this.proposals.set(proposal.id, proposal); this.requestIds.set(input.requestId, proposal.id); this.currentId = proposal.id;
    this.changed(); return proposal;
  }
  /** Stages a complete new collection for review. Writes nothing. */
  submitImport(value: unknown, workspace: Workspace): ImportProposal {
    const input = parseImportProposal(value);
    this.refresh(workspace);
    const previous = this.retry(input);
    if (previous) {
      if (previous.kind !== "import") throw new AgentInputError("This request ID already belongs to a different proposal.", "request_id_reused");
      return previous;
    }
    if (this.applying || this.pending) throw new AgentInputError("Apply or set aside the pending batch before submitting another.", "review_pending");
    const { staged } = stageImport(input);
    const proposal: ImportProposal = { kind: "import", id: crypto.randomUUID(), input: structuredClone(input), state: "pending_review", staged };
    this.proposals.set(proposal.id, proposal); this.requestIds.set(input.requestId, proposal.id); this.currentId = proposal.id;
    this.changed(); return proposal;
  }
  /** The proposal already submitted under this request ID, if its input is identical. */
  private retry(input: ProposalInput | ImportProposalInput): ReviewProposal | undefined {
    const previous = this.requestIds.get(input.requestId);
    if (!previous) return undefined;
    const proposal = this.proposals.get(previous)!;
    if (JSON.stringify(proposal.input) !== JSON.stringify(input)) throw new AgentInputError("This request ID already belongs to a different proposal.", "request_id_reused");
    return proposal;
  }
  get(id: string, workspace: Workspace): ReviewProposal {
    this.refresh(workspace);
    const proposal = this.proposals.get(id);
    if (!proposal) throw new AgentInputError("Proposal is no longer available in this tab.", "proposal_not_found");
    return proposal;
  }
  /** Adds, changes, or removes the reviewer's batch tag. Saves nothing. */
  setBatchTag(id: string, batchTag: BatchTag | undefined) {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    const proposal = this.proposals.get(id);
    if (!proposal) throw new AgentInputError("Proposal is no longer available in this tab.", "proposal_not_found");
    if (proposal.state === "applied") throw new AgentInputError("This batch was already applied.");
    const name = batchTag?.name.trim();
    if (batchTag && !name) throw new AgentInputError("Enter a tag name.");
    if (proposal.kind === "import") {
      const next = stageImport(proposal.input, name);
      proposal.staged = next.staged; proposal.batchTag = next.batchTag;
    } else {
      const next = batchTag && { name: name!, includeUpdates: batchTag.includeUpdates, tagId: proposal.batchTag?.tagId ?? crypto.randomUUID() };
      // A stale batch is previewed against the latest collection when reviewed or applied.
      if (proposal.state === "pending_review") {
        const { commands, preview } = previewChanges(proposal.input, proposal.before, proposal.createdBookmarkIds, next);
        proposal.commands = commands; proposal.preview = preview;
      }
      proposal.batchTag = next;
    }
    this.changed();
  }
  setAside(id: string) {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    const proposal = this.proposals.get(id);
    if (!proposal || !["pending_review", "stale"].includes(proposal.state)) throw new AgentInputError("There is no pending batch to set aside.");
    proposal.state = "set_aside"; this.changed();
  }
  async apply(id: string, workspace: Workspace, commit: (collectionId: string, expectedRevision: number, commands: Command[], label: string) => Promise<Workspace>, options?: { reviewedRevision: number }): Promise<Workspace> {
    const proposal = this.get(id, workspace);
    if (proposal.kind !== "changes") throw new AgentInputError("Apply imports with applyImport.");
    if (this.applying) throw new AgentInputError("The batch is already saving.", "review_busy");
    const stale = proposal.state === "stale" || proposal.input.expectedRevision !== workspace.revision;
    if (proposal.state === "applied" || (stale && !options)) throw new ConflictError("Review the latest values and overwrite warning before applying this batch.");
    if (options && (!stale || options.reviewedRevision !== workspace.revision))
      throw new ConflictError("This collection changed again. Review the updated overwrite warning before applying anyway.");
    // Rebuild and validate immediately before the storage transaction, retaining stable IDs.
    const { commands, preview } = options ? reviewAgentProposal(proposal, workspace) : previewChanges(proposal.input, workspace, proposal.createdBookmarkIds, proposal.batchTag);
    this.applying = true;
    try {
      const saved = await commit(proposal.input.collectionId, workspace.revision, commands, `Agent: ${proposal.input.summary}`);
      proposal.before = structuredClone(workspace); proposal.preview = preview; proposal.commands = commands;
      proposal.state = "applied"; this.changed(); return saved;
    } catch (error) {
      if (error instanceof ConflictError && proposal.state !== "set_aside") proposal.state = "stale";
      this.changed(); throw error;
    } finally { this.applying = false; }
  }
  /** Creates the staged collection through one atomic save. Only the human-facing UI calls this. */
  async applyImport(id: string, create: (staged: StagedCollectionImport) => Promise<Workspace>): Promise<Workspace> {
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.kind !== "import") throw new AgentInputError("Proposal is no longer available in this tab.", "proposal_not_found");
    if (this.applying) throw new AgentInputError("The batch is already saving.", "review_busy");
    if (proposal.state === "applied") throw new ConflictError("This import was already applied.");
    this.applying = true;
    try {
      const saved = await create(proposal.staged);
      proposal.state = "applied"; return saved;
    } finally { this.applying = false; this.changed(); }
  }
}
