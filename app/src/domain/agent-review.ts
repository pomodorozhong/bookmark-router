import { applyCommand, ConflictError, DuplicateBookmarkError, type Command } from "./commands";
import { storedUrlKey, urlKey, type Asset, type Bookmark, type Workspace } from "./model";

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
export type ProposalState = "pending_review" | "applied" | "rejected" | "stale";
export interface AgentProposal {
  id: string;
  input: ProposalInput;
  state: ProposalState;
  createdBookmarkIds: string[];
  /** Stable creation IDs are assigned once; retries never create a second bookmark. */
  commands: Command[];
  before: Workspace;
  preview: Workspace;
}
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
function previewChanges(input: ProposalInput, source: Workspace, creationIds: string[]): { commands: Command[]; preview: Workspace } {
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
  return { commands, preview };
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
    if (!bookmark) throw new ConflictError("A bookmark in this batch no longer exists. Reject it and ask for a fresh proposal.");
    return { ...change, expectedRecordRevision: bookmark.revision };
  }) };
  const { commands, preview } = previewChanges(input, workspace, proposal.createdBookmarkIds);
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

/** Tab-local review state. Only the human-facing UI calls apply/reject; tools cannot. */
export class AgentReviewSession {
  private proposals = new Map<string, AgentProposal>();
  private requestIds = new Map<string, string>();
  private applying = false;
  private currentId?: string;
  constructor(private readonly changed: () => void = () => {}) {}
  get current(): AgentProposal | undefined { return this.currentId ? this.proposals.get(this.currentId) : undefined; }
  reset() {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    this.proposals.clear(); this.requestIds.clear(); this.currentId = undefined; this.changed();
  }
  refresh(workspace: Workspace) {
    const current = this.current;
    if (current?.state === "pending_review" && (current.input.collectionId !== workspace.id || current.input.expectedRevision !== workspace.revision)) {
      current.state = "stale"; this.changed();
    }
  }
  submit(value: unknown, workspace: Workspace): AgentProposal {
    const input = parseProposal(value);
    this.refresh(workspace);
    const previous = this.requestIds.get(input.requestId);
    if (previous) {
      const proposal = this.proposals.get(previous)!;
      if (JSON.stringify(proposal.input) !== JSON.stringify(input)) throw new AgentInputError("This request ID already belongs to a different proposal.", "request_id_reused");
      return proposal;
    }
    if (this.applying || this.current?.state === "pending_review" || this.current?.state === "stale") throw new AgentInputError("Review or reject the current batch before submitting another.", "review_pending");
    const createdBookmarkIds = input.changes.filter((c) => c.kind === "create").map(() => crypto.randomUUID());
    const { commands, preview } = previewChanges(input, workspace, createdBookmarkIds);
    const proposal: AgentProposal = { id: crypto.randomUUID(), input: structuredClone(input), state: "pending_review", createdBookmarkIds, commands, before: structuredClone(workspace), preview };
    this.proposals.set(proposal.id, proposal); this.requestIds.set(input.requestId, proposal.id); this.currentId = proposal.id;
    this.changed(); return proposal;
  }
  get(id: string, workspace: Workspace): AgentProposal {
    this.refresh(workspace);
    const proposal = this.proposals.get(id);
    if (!proposal) throw new AgentInputError("Proposal is no longer available in this tab.", "proposal_not_found");
    return proposal;
  }
  reject(id: string) {
    if (this.applying) throw new AgentInputError("Wait for the batch to finish saving.", "review_busy");
    const proposal = this.proposals.get(id);
    if (!proposal || !["pending_review", "stale"].includes(proposal.state)) throw new AgentInputError("There is no pending batch to reject.");
    proposal.state = "rejected"; this.changed();
  }
  async apply(id: string, workspace: Workspace, commit: (collectionId: string, expectedRevision: number, commands: Command[], label: string) => Promise<Workspace>, options?: { reviewedRevision: number }): Promise<Workspace> {
    const proposal = this.get(id, workspace);
    if (this.applying) throw new AgentInputError("The batch is already saving.", "review_busy");
    if (proposal.state !== "pending_review" && !(proposal.state === "stale" && options)) throw new ConflictError("This batch is no longer pending. Review the latest values or ask the agent for a fresh proposal.");
    if (options && (proposal.state !== "stale" || options.reviewedRevision !== workspace.revision))
      throw new ConflictError("This collection changed again. Review the updated overwrite warning before applying anyway.");
    // Rebuild and validate immediately before the storage transaction, retaining stable IDs.
    const { commands, preview } = options ? reviewAgentProposal(proposal, workspace) : previewChanges(proposal.input, workspace, proposal.createdBookmarkIds);
    this.applying = true;
    try {
      const saved = await commit(proposal.input.collectionId, workspace.revision, commands, `Agent: ${proposal.input.summary}`);
      proposal.before = structuredClone(workspace); proposal.preview = preview; proposal.commands = commands;
      proposal.state = "applied"; this.changed(); return saved;
    } catch (error) {
      if (error instanceof ConflictError) proposal.state = "stale";
      this.changed(); throw error;
    } finally { this.applying = false; }
  }
}
