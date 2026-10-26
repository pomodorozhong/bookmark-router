import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { AgentReviewSession, AgentInputError, hasGroup, importTypeId, reviewAgentProposal, type AgentProposal, type ProposalInput } from "../src/domain/agent-review";
import { applyCommand, ConflictError, DuplicateBookmarkError } from "../src/domain/commands";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";
import { createAgentTools, detectWebMcp, registerAgentTools, type WebMcpTool } from "../src/agent/webmcp";
import type { Workspace } from "../src/domain/model";

const input = (w: Workspace, requestId = "task-1"): ProposalInput => ({ requestId, collectionId: w.id, expectedRevision: w.revision, summary: "Add two references", changes: [
  { kind: "create", url: "https://example.org/first", tagIds: [w.tags[0].id] },
  { kind: "create", title: "Second reference", url: "https://example.org/second", description: "A note", tagIds: [w.tags[0].id] },
] });

test("create command defaults title and Pending, advances group revisions, and rejects invalid input", () => {
  const w = demoWorkspace(), next = applyCommand(w, 0, { type: "bookmark.create", id: "new", url: "https://EXAMPLE.org", tagIds: [w.tags[0].id] });
  const b = next.bookmarks.at(-1)!;
  assert.equal(b.url, "https://example.org/"); assert.equal(b.title, b.url); assert.equal(b.missingTitle, true); assert.equal(b.statusId, "pending");
  assert.equal(next.tags[0].revision, w.tags[0].revision + 1); assert.equal(next.memberships.at(-1)!.bookmarkId, b.id);
  assert.equal(w.bookmarks.length, 12);
  assert.throws(() => applyCommand(next, next.revision, { type: "bookmark.create", url: "https://example.org/" }), DuplicateBookmarkError);
  for (const fields of [{ url: "javascript:alert(1)" }, { url: "https://a.test", statusId: "gone" }, { url: "https://a.test", id: w.tags[0].id }, { url: "https://a.test", tagIds: ["gone"] }, { url: "https://a.test", tagIds: [w.tags[0].id, w.tags[0].id] }])
    assert.throws(() => applyCommand(w, 0, { type: "bookmark.create", ...fields }));
  w.statuses = w.statuses.filter((s) => s.id !== "pending");
  // Use a valid collection without a Pending status: explicit status is required.
  w.bookmarks.forEach((b) => b.statusId = "done"); w.tags.forEach((t) => t.statusId = "done");
  assert.throws(() => applyCommand(w, 0, { type: "bookmark.create", url: "https://a.test" }), /Pending default/);
  assert.equal(applyCommand(w, 0, { type: "bookmark.create", url: "https://a.test", statusId: "done" }).bookmarks.at(-1)!.statusId, "done");
});

test("tag.create keeps a caller-supplied ID and rejects one already in use", () => {
  const w = demoWorkspace(), next = applyCommand(w, 0, { type: "tag.create", id: "batch-tag", name: "Batch" });
  assert.equal(next.tags.at(-1)!.id, "batch-tag"); assert.equal(next.tags.at(-1)!.typeId, undefined);
  for (const id of [" ", "batch-tag", next.bookmarks[0].id]) assert.throws(() => applyCommand(next, next.revision, { type: "tag.create", id, name: "Other" }), /new tag ID/);
  assert.notEqual(applyCommand(w, 0, { type: "tag.create", name: "Batch" }).tags.at(-1)!.id, "batch-tag");
});

test("proposals do not save, duplicate retries are stable, and only one batch can await review", () => {
  const w = demoWorkspace(), before = structuredClone(w), session = new AgentReviewSession(), proposal = session.submit(input(w), w);
  assert.deepEqual(w, before); assert.equal(proposal.state, "pending_review"); assert.equal(proposal.preview.bookmarks.length, 14);
  assert.equal(session.submit(input(w), w), proposal);
  assert.throws(() => session.submit(input(w, "other-task"), w), (e: unknown) => e instanceof AgentInputError && e.code === "review_pending");
  assert.throws(() => session.submit({ ...input(w), summary: "Different" }, w), (e: unknown) => e instanceof AgentInputError && e.code === "request_id_reused");
  session.setAside(proposal.id); assert.equal(proposal.state, "set_aside"); assert.deepEqual(w, before);
  assert.equal(session.submit(input(w, "other-task"), w).state, "pending_review");
  session.reset(); assert.equal(session.current, undefined); assert.throws(() => session.get(proposal.id, w), /no longer available/);
});

test("invalid proposals fail before staging, including duplicate URLs, fields, groups, and revisions", () => {
  const w = demoWorkspace(), session = new AgentReviewSession();
  const badChanges = [
    [{ kind: "delete", bookmarkId: w.bookmarks[0].id }],
    [{ kind: "create", url: "https://a.test", tagIds: ["missing"] }],
    [{ kind: "create", url: "https://a.test", asset: { url: "https://a.test" } }],
    [{ kind: "create", url: "https://a.test", title: 7 }],
    [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { url: w.bookmarks[1].url } }],
    [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { description: 7 } }],
    [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: " " } }],
    [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 5, patch: { title: "New" } }],
    [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, addTagIds: [w.tags[0].id], removeTagIds: [w.tags[0].id] }],
    [{ kind: "create", url: "https://a.test" }, { kind: "create", url: "https://A.test/" }],
    [],
  ];
  for (const changes of badChanges) { assert.throws(() => session.submit({ ...input(w), changes }, w)); assert.equal(session.current, undefined); }
  assert.throws(() => session.submit({ ...input(w), expectedRevision: -1 }, w));
  assert.throws(() => session.submit({ ...input(w), collectionId: "wrong" }, w), ConflictError);
});

test("batch selection retains set-aside proposals without freeing another pending batch", () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), first = session.submit(input(w), w);
  session.setAside(first.id);
  const second = session.submit(input(w, "second"), w);
  session.select(first.id);
  assert.equal(session.current, first); assert.equal(session.pending, second);
  assert.deepEqual(session.batches, [first, second]);
  assert.equal(session.submit(input(w), w), first);
  assert.equal(first.state, "set_aside"); assert.equal(session.current, first);
  assert.throws(() => session.submit(input(w, "third"), w), (e: unknown) => e instanceof AgentInputError && e.code === "review_pending");
  session.refresh({ ...w, revision: w.revision + 1 });
  assert.equal(second.state, "stale"); assert.equal(first.state, "set_aside"); assert.equal(session.pending, second);
  assert.throws(() => session.select("missing"), /no longer available/);
  session.reset(); assert.deepEqual(session.batches, []); assert.equal(session.pending, undefined);
  assert.throws(() => session.select(first.id), /no longer available/);
});

test("a set-aside batch applies later with stable creation IDs and one Undo", async () => {
  const w = demoWorkspace(), before = structuredClone(w), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit(input(w), w), ids = [...p.createdBookmarkIds];
  session.setAside(p.id);
  assert.deepEqual(await store.get(w.id), before); assert.equal(await store.nextUndo(w.id), undefined);
  assert.equal(session.submit(input(w), w), p);
  const saved = await session.apply(p.id, w, store.command.bind(store));
  assert.equal(p.state, "applied"); assert.deepEqual(saved.bookmarks.slice(-2).map((b) => b.id), ids);
  await assert.rejects(session.apply(p.id, saved, store.command.bind(store)), ConflictError);
  const undo = (await store.nextUndo(w.id))!;
  const undone = await store.undoLast(w.id, saved.revision, undo.id);
  assert.deepEqual(undone.bookmarks, before.bookmarks); assert.deepEqual(undone.memberships, before.memberships);
  await store.close();
});

test("an older set-aside batch reviews newer edits, protects races and failure retries, and Undo preserves another batch", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const firstInput: ProposalInput = { ...input(w), changes: [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Agent title" } }] };
  const first = session.submit(firstInput, w), originalInput = structuredClone(first.input); session.setAside(first.id);
  const second = session.submit(input(w, "second"), w);
  let current = await session.apply(second.id, w, store.command.bind(store));
  current = await store.command(w.id, current.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Manual title" } });
  session.select(first.id);
  assert.equal(first.state, "set_aside"); assert.deepEqual(reviewAgentProposal(first, current).overwrites, [{ bookmarkId: w.bookmarks[0].id, field: "title" }]);
  await assert.rejects(session.apply(first.id, current, store.command.bind(store)), ConflictError);
  await assert.rejects(session.apply(first.id, current, store.command.bind(store), { reviewedRevision: w.revision }), /changed again/);
  await assert.rejects(session.apply(first.id, current, async () => { throw new Error("Disk full"); }, { reviewedRevision: current.revision }), /Disk full/);
  assert.equal(first.state, "set_aside"); assert.deepEqual(await store.get(w.id), current);
  const unseen = await store.command(w.id, current.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: current.bookmarks[0].revision, patch: { title: "Newest manual title" } });
  await assert.rejects(session.apply(first.id, current, store.command.bind(store), { reviewedRevision: current.revision }), ConflictError);
  assert.equal(first.state, "set_aside"); assert.deepEqual(await store.get(w.id), unseen);
  const saved = await session.apply(first.id, unseen, store.command.bind(store), { reviewedRevision: unseen.revision });
  assert.equal(saved.bookmarks[0].title, "Agent title"); assert.equal(saved.bookmarks.length, 14);
  assert.deepEqual(first.input, originalInput);
  const undo = (await store.nextUndo(w.id))!, undone = await store.undoLast(w.id, saved.revision, undo.id);
  const content = (w: Workspace) => w.bookmarks.map(({ revision: _, updatedAt: __, ...b }) => b);
  assert.deepEqual(content(undone), content(unseen)); assert.deepEqual(undone.memberships, unseen.memberships);
  assert.ok(undone.bookmarks[0].revision > unseen.bookmarks[0].revision);
  assert.equal(second.state, "applied"); await store.close();
});

test("tools report set-aside batches and identical retries without reviving or saving them", async () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), before = structuredClone(w);
  const tools = createAgentTools({ session, getWorkspace: async () => w });
  const call = async (name: string, value: unknown) => JSON.parse(await tools.find((t) => t.name === name)!.execute(value));
  const staged = await call("propose_changes", input(w)); session.setAside(staged.proposalId);
  const status = await call("get_proposal_status", { proposalId: staged.proposalId });
  assert.equal(status.state, "set_aside"); assert.deepEqual(status.createdBookmarkIds, []);
  assert.match(status.nextStep, /apply it later/); assert.match(status.nextStep, /Do not resubmit/);
  assert.equal((await call("propose_changes", input(w))).state, "set_aside");
  const newer = await call("propose_changes", input(w, "newer"));
  assert.equal(newer.state, "pending_review");
  assert.equal((await call("get_proposal_status", { proposalId: staged.proposalId })).state, "set_aside");
  assert.equal(session.current?.id, newer.proposalId); assert.deepEqual(w, before);
});

test("field updates preserve omitted values and apply group changes, then one Undo restores the entire batch", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const proposal = session.submit({ ...input(w), changes: [
    ...input(w).changes,
    { kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { description: "Updated note" }, addTagIds: [w.tags[1].id], removeTagIds: [w.tags[0].id] },
  ] }, w);
  const saved = await session.apply(proposal.id, w, store.command.bind(store));
  assert.equal(proposal.state, "applied"); assert.equal(saved.bookmarks.length, 14); assert.equal(saved.bookmarks[0].title, w.bookmarks[0].title); assert.equal(saved.bookmarks[0].url, w.bookmarks[0].url);
  assert.equal(saved.bookmarks[0].description, "Updated note");
  assert.equal(saved.memberships.some((m) => m.bookmarkId === w.bookmarks[0].id && m.tagId === w.tags[0].id), false);
  const undo = (await store.nextUndo(w.id))!; assert.equal(undo.label, "Agent: Add two references");
  const undone = await store.undoLast(w.id, saved.revision, undo.id);
  assert.equal(undone.bookmarks.length, 12); assert.equal(undone.bookmarks[0].description, w.bookmarks[0].description); assert.deepEqual(undone.memberships, w.memberships);
  assert.equal(await store.nextUndo(w.id), undefined); assert.equal(session.get(proposal.id, undone).state, "applied");
  await assert.rejects(session.apply(proposal.id, undone, store.command.bind(store)), ConflictError);
  await store.close();
});

test("stale review and a concurrent storage write cannot overwrite newer content", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w); const p = session.submit(input(w), w);
  const newer = await store.command(w.id, 0, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Manual edit" } });
  // The caller may still hold the old snapshot; the storage transaction enforces revision too.
  await assert.rejects(session.apply(p.id, w, store.command.bind(store)), ConflictError);
  assert.equal(p.state, "stale"); assert.deepEqual(await store.get(w.id), newer);
  session.setAside(p.id);
  const fresh = session.submit(input(newer, "fresh"), newer);
  session.refresh({ ...newer, revision: newer.revision + 1 }); assert.equal(fresh.state, "stale");
  await assert.rejects(session.apply(fresh.id, newer, store.command.bind(store)), ConflictError);
  await store.close();
});

test("overwrite review lists overlapping fields and group changes, while preserving unrelated newer edits", () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), b = w.bookmarks[0];
  const proposal = session.submit({ ...input(w), changes: [{ kind: "update", bookmarkId: b.id, expectedRecordRevision: b.revision,
    patch: { title: "Agent title", description: "Agent note", asset: { kind: "image", source: "remote", url: "https://images.example/agent.jpg" } },
    addTagIds: [w.tags[1].id], removeTagIds: [w.tags[2].id] }] }, w);
  let current = applyCommand(w, w.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: b.revision, patch: { title: "Manual title", description: "Agent note", statusId: "done", asset: { kind: "image", source: "local", blobId: "manual", filename: "manual.png" } } });
  // Reverse connections requested by the proposal; add another connection outside its scope.
  current = applyCommand(current, current.revision, { type: "membership.set", bookmarkId: b.id, tagId: w.tags[2].id, linked: true });
  current = applyCommand(current, current.revision, { type: "membership.set", bookmarkId: b.id, tagId: w.tags[1].id, linked: true });
  current = applyCommand(current, current.revision, { type: "membership.set", bookmarkId: b.id, tagId: w.tags[1].id, linked: false });
  current = applyCommand(current, current.revision, { type: "bookmark.patch", id: w.bookmarks[1].id, expectedRecordRevision: 0, patch: { description: "Unrelated newer note" } });
  session.refresh(current);
  const before = structuredClone(current), original = structuredClone(proposal.input), review = reviewAgentProposal(proposal, current);
  assert.deepEqual(review.overwrites, [{ bookmarkId: b.id, field: "title" }, { bookmarkId: b.id, field: "asset" }, { bookmarkId: b.id, field: "membership", tagId: w.tags[2].id }]);
  assert.equal(review.before.bookmarks[0].title, "Manual title");
  assert.equal(review.preview.bookmarks[0].statusId, "done");
  assert.equal(review.preview.bookmarks[1].description, "Unrelated newer note");
  assert.equal(hasGroup(review.preview, b.id, w.tags[0].id), true);
  assert.equal(hasGroup(review.preview, b.id, w.tags[1].id), true);
  assert.equal(hasGroup(review.preview, b.id, w.tags[2].id), false);
  assert.deepEqual(current, before); assert.deepEqual(proposal.input, original); assert.deepEqual(proposal.before, w);
});

test("unrelated staleness and values already matching the proposal report no overwritten edits", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit({ ...input(w), changes: [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Agent title", asset: { kind: "image", source: "remote", url: "https://images.example/a.jpg" } }, addTagIds: [w.tags[1].id] }] }, w);
  let current = await store.command(w.id, w.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { description: "Manual note" } });
  assert.deepEqual(reviewAgentProposal(p, current).overwrites, []);
  current = await store.command(w.id, current.revision, [
    { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: current.bookmarks[0].revision, patch: { title: "Agent title", asset: { url: "https://images.example/a.jpg", source: "remote", kind: "image" } } },
    { type: "membership.set", bookmarkId: w.bookmarks[0].id, tagId: w.tags[1].id, linked: true },
  ]);
  assert.deepEqual(reviewAgentProposal(p, current).overwrites, []);
  await assert.rejects(session.apply(p.id, current, store.command.bind(store)), ConflictError);
  const saved = await session.apply(p.id, current, store.command.bind(store), { reviewedRevision: current.revision });
  assert.equal(saved.bookmarks[0].description, "Manual note"); assert.equal(p.state, "applied");
  await store.close();
});

test("overwrite review also detects newer URLs, statuses, and a manually removed connection that will be re-added", () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), b = w.bookmarks[0];
  const p = session.submit({ ...input(w), changes: [{ kind: "update", bookmarkId: b.id, expectedRecordRevision: b.revision, patch: { url: "https://example.org/agent", statusId: "in-progress" }, addTagIds: [w.tags[0].id] }] }, w);
  let current = applyCommand(w, w.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: b.revision, patch: { url: "https://example.org/manual", statusId: "done" } });
  current = applyCommand(current, current.revision, { type: "membership.set", bookmarkId: b.id, tagId: w.tags[0].id, linked: false });
  const review = reviewAgentProposal(p, current);
  assert.deepEqual(review.overwrites, [{ bookmarkId: b.id, field: "url" }, { bookmarkId: b.id, field: "statusId" }, { bookmarkId: b.id, field: "membership", tagId: w.tags[0].id }]);
  assert.equal(review.before.bookmarks[0].statusId, "done"); assert.equal(review.preview.bookmarks[0].statusId, "in-progress");
  assert.equal(hasGroup(review.before, b.id, w.tags[0].id), false); assert.equal(hasGroup(review.preview, b.id, w.tags[0].id), true);
});

test("Apply anyway saves a mixed batch once and Undo restores latest manual fields, memberships and local media", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession(), b = w.bookmarks[0];
  await store.create(w);
  const request: ProposalInput = { ...input(w), changes: [...input(w).changes, { kind: "update", bookmarkId: b.id, expectedRecordRevision: b.revision, patch: { title: "Agent title", asset: { kind: "image", source: "remote", url: "https://images.example/a.jpg" } }, removeTagIds: [w.tags[1].id] }] };
  const p = session.submit(request, w), stableIds = [...p.createdBookmarkIds];
  let current = await store.attachMedia(w.id, w.revision, [{ bookmarkId: b.id, expectedRecordRevision: 0, asset: { kind: "image", source: "local", blobId: "manual-image", filename: "manual.png" } }], [{ id: "manual-image", filename: "manual.png", mime: "image/png", blob: new Blob(["manual image"], { type: "image/png" }) }]);
  current = await store.command(w.id, current.revision, [
    { type: "bookmark.patch", id: b.id, expectedRecordRevision: current.bookmarks[0].revision, patch: { title: "Manual title", description: "Keep newer note", statusId: "done" } },
    { type: "membership.set", bookmarkId: b.id, tagId: w.tags[1].id, linked: true },
  ]);
  session.refresh(current);
  const saved = await session.apply(p.id, current, store.command.bind(store), { reviewedRevision: current.revision });
  assert.equal(saved.bookmarks.length, 14); assert.deepEqual(p.createdBookmarkIds, stableIds);
  assert.equal(saved.bookmarks[0].title, "Agent title"); assert.equal(saved.bookmarks[0].description, "Keep newer note"); assert.equal(saved.bookmarks[0].statusId, "done");
  assert.equal(hasGroup(saved, b.id, w.tags[1].id), false);
  assert.deepEqual(p.before, current); assert.equal(p.preview.bookmarks[0].description, "Keep newer note");
  assert.equal(session.submit(request, saved), p); assert.equal(saved.bookmarks.filter((bookmark) => stableIds.includes(bookmark.id)).length, 2);
  await assert.rejects(session.apply(p.id, saved, store.command.bind(store), { reviewedRevision: saved.revision }), ConflictError);
  const entry = (await store.nextUndo(w.id))!;
  const undone = await store.undoLast(w.id, saved.revision, entry.id);
  assert.equal(undone.bookmarks.length, current.bookmarks.length);
  assert.deepEqual(undone.bookmarks.map(({ revision, updatedAt, ...bookmark }) => bookmark), current.bookmarks.map(({ revision, updatedAt, ...bookmark }) => bookmark));
  assert.deepEqual(undone.memberships, current.memberships);
  assert.equal(await (await store.media("manual-image"))!.blob.text(), "manual image");
  await store.close();
});

test("Apply anyway requires the exact reviewed revision and protects against storage races", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w); const p = session.submit(input(w), w);
  const current = await store.command(w.id, w.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "First manual edit" } });
  session.refresh(current); const reviewedRevision = current.revision;
  const newer = await store.command(w.id, current.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: current.bookmarks[0].revision, patch: { title: "Second manual edit" } });
  await assert.rejects(session.apply(p.id, newer, store.command.bind(store), { reviewedRevision }), /changed again/);
  await assert.rejects(session.apply(p.id, current, store.command.bind(store), { reviewedRevision }), ConflictError);
  assert.equal(p.state, "stale"); assert.deepEqual(await store.get(w.id), newer);
  const saved = await session.apply(p.id, newer, store.command.bind(store), { reviewedRevision: newer.revision });
  assert.equal(saved.bookmarks.length, 14); assert.equal(saved.bookmarks[0].title, "Second manual edit");
  await store.close();
});

test("Apply anyway revalidates duplicate URLs, removed records and groups, invalid status, and collection identity", async () => {
  for (const failure of ["duplicate-create", "duplicate-update", "bookmark", "group", "status", "collection"] as const) {
    const w = demoWorkspace(), session = new AgentReviewSession();
    const p = session.submit({ ...input(w), changes: [...input(w).changes, { kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { url: "https://example.org/new-url", statusId: "done" }, addTagIds: [w.tags[1].id] }] }, w);
    const current = structuredClone(w); current.revision++;
    if (failure === "duplicate-create") current.bookmarks[1].url = "https://example.org/first";
    if (failure === "duplicate-update") current.bookmarks[1].url = "https://example.org/new-url";
    if (failure === "bookmark") current.bookmarks.shift();
    if (failure === "group") current.tags.splice(1, 1);
    if (failure === "status") current.statuses = current.statuses.filter((s) => s.id !== "done");
    if (failure === "collection") current.id = "other";
    session.refresh(current); let committed = false;
    assert.throws(() => reviewAgentProposal(p, current));
    await assert.rejects(session.apply(p.id, current, async () => { committed = true; return current; }, { reviewedRevision: current.revision }));
    assert.equal(committed, false); assert.equal(p.state, "stale");
    session.setAside(p.id);
    await assert.rejects(session.apply(p.id, current, async () => { committed = true; return current; }, { reviewedRevision: current.revision }));
    assert.equal(committed, false); assert.equal(p.state, "set_aside");
  }
});

test("failed Apply anyway keeps the warning and original proposal available for a retry", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w); const p = session.submit(input(w), w);
  const current = await store.command(w.id, 0, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Manual" } });
  session.refresh(current);
  await assert.rejects(session.apply(p.id, current, async () => { throw new Error("Disk full"); }, { reviewedRevision: current.revision }), /Disk full/);
  assert.equal(p.state, "stale"); assert.deepEqual(p.before, w); assert.deepEqual(await store.get(w.id), current);
  const saved = await session.apply(p.id, current, store.command.bind(store), { reviewedRevision: current.revision });
  assert.equal(p.state, "applied"); assert.equal(saved.bookmarks.length, 14);
  await store.close();
});

test("failed batch storage rolls back every operation and can be retried", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w); const p = session.submit(input(w), w);
  await assert.rejects(store.command(w.id, 0, [...p.commands, { type: "bookmark.patch", id: "missing", expectedRecordRevision: 0, patch: { title: "Fail" } }]));
  assert.deepEqual(await store.get(w.id), w); assert.equal(await store.nextUndo(w.id), undefined);
  await assert.rejects(session.apply(p.id, w, async () => { throw new Error("Disk full"); }), /Disk full/);
  assert.equal(p.state, "pending_review");
  let release!: (w: Workspace) => void;
  const saving = session.apply(p.id, w, async () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(session.apply(p.id, w, store.command.bind(store)), /already saving/);
  assert.throws(() => session.setAside(p.id), /finish saving/); assert.throws(() => session.reset(), /finish saving/);
  assert.throws(() => session.select(p.id), /finish saving/);
  release(await store.command(w.id, 0, p.commands)); await saving;
  assert.equal(p.state, "applied"); await store.close();
});

test("tools read all groups and statuses, use compact filter semantics, and return duplicate IDs without exposing approval", async () => {
  let w = demoWorkspace(); const session = new AgentReviewSession(), tools = createAgentTools({ session, getWorkspace: async () => w });
  const call = async (name: string, input: unknown = {}) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  assert.deepEqual(tools.map((t) => t.name), ["get_collection_context", "search_bookmarks", "read_group", "get_copy_content", "propose_changes", "propose_import", "get_proposal_status"]);
  assert.equal((await call("get_collection_context")).bookmarkCount, 12);
  const group = await call("read_group", { groupId: w.tags[0].id }); assert.equal(group.bookmarks.length, 5);
  const found = await call("search_bookmarks", { text: "Research", rules: [{ kind: "status", values: ["done"], not: true }] }); assert.equal(found.total, 5);
  assert.equal((await call("search_bookmarks", { rules: [{ kind: "status", values: ["invalid"], not: false }] })).error.code, "invalid_input");
  const duplicate = await call("propose_changes", { ...input(w), changes: [{ kind: "create", url: w.bookmarks[0].url }] });
  assert.equal(duplicate.error.code, "duplicate_url"); assert.equal(duplicate.error.bookmarkId, w.bookmarks[0].id);
  const staged = await call("propose_changes", input(w)); assert.equal(staged.state, "pending_review"); assert.deepEqual(staged.createdBookmarkIds, []);
  w = applyCommand(w, 0, { type: "tag.create", name: "Manual" });
  const stale = await call("get_proposal_status", { proposalId: staged.proposalId });
  assert.equal(stale.state, "stale"); assert.match(stale.nextStep, /overwrite warning/); assert.match(stale.nextStep, /only the human-facing UI/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(tools[0].execute({}, { signal: abort.signal }));
});

test("WebMCP is optional, registration uses abort cleanup, and failed or cancelled registration leaves no tools", async () => {
  const host = { session: new AgentReviewSession(), getWorkspace: async () => demoWorkspace() };
  assert.equal(detectWebMcp(undefined), undefined); assert.equal((await registerAgentTools(host)).available, false);
  const registered = new Map<string, WebMcpTool>();
  const context = { registerTool(tool: WebMcpTool, options: { signal: AbortSignal }) { registered.set(tool.name, tool); options.signal.addEventListener("abort", () => registered.delete(tool.name), { once: true }); } };
  const handle = await registerAgentTools(host, context); assert.equal(handle.available, true); assert.equal(registered.size, 7);
  handle.dispose(); assert.equal(registered.size, 0);
  await assert.rejects(registerAgentTools(host, { registerTool(tool, options) { context.registerTool(tool, options); if (tool.name === "read_group") throw new Error("Registration failed"); } }), /Registration failed/);
  assert.equal(registered.size, 0);
  const abort = new AbortController(); abort.abort(); assert.equal((await registerAgentTools(host, context, abort.signal)).available, false); assert.equal(registered.size, 0);
});

test("agent copy reads the live selection in order, including filtered-out bookmarks and latest edits", async () => {
  let w = demoWorkspace();
  const before = structuredClone(w), session = new AgentReviewSession();
  let context = { collectionId: w.id, selection: [w.bookmarks[2].id, w.bookmarks[0].id], list: [w.bookmarks[0].id], current: w.bookmarks[1].id };
  const saved = { template: "{n}. {title} — {groups}", separator: "\n\n" };
  const tool = createAgentTools({ session, getWorkspace: async () => w, getCopyContext: () => context, getCopyFormat: () => saved }).find((t) => t.name === "get_copy_content")!;
  const call = async (input: unknown = {}) => JSON.parse(await tool.execute(input));
  assert.equal(tool.annotations.readOnlyHint, true);
  const selected = await call();
  assert.equal(selected.scope, "selection"); assert.equal(selected.total, 2);
  assert.deepEqual(selected.bookmarks.map((b: { id: string }) => b.id), context.selection);
  assert.equal(selected.text, `1. ${w.bookmarks[2].title} — Research, Ideas\n\n2. ${w.bookmarks[0].title} — Research`);
  assert.deepEqual(w, before); assert.equal(session.current, undefined);
  const list = await call({ scope: "list", template: "{url}", separator: ", " });
  assert.equal(list.text, w.bookmarks[0].url); assert.equal(list.total, 1);
  assert.equal((await call({ scope: "current", template: "{title}" })).text, w.bookmarks[1].title);
  assert.deepEqual(saved, { template: "{n}. {title} — {groups}", separator: "\n\n" });
  w = applyCommand(w, 0, { type: "bookmark.patch", id: w.bookmarks[2].id, expectedRecordRevision: 0, patch: { title: "Latest title" } });
  assert.match((await call()).text, /^1\. Latest title/);
  context = { ...context, selection: [w.bookmarks[1].id] };
  assert.equal((await call()).bookmarks[0].id, w.bookmarks[1].id);
});

test("agent copy returns full output beyond the preview limit and handles empty or unavailable UI state", async () => {
  const w = demoWorkspace();
  w.bookmarks = Array.from({ length: 45 }, (_, i) => ({ ...w.bookmarks[0], id: `copy-${i}`, title: `Bookmark ${i}` }));
  let context: import("../src/copy-settings").CopyContext | undefined = { collectionId: w.id, selection: w.bookmarks.map((b) => b.id).reverse(), list: [] };
  const tool = createAgentTools({ session: new AgentReviewSession(), getWorkspace: async () => w, getCopyContext: () => context }).find((t) => t.name === "get_copy_content")!;
  const call = async (input: unknown = {}) => JSON.parse(await tool.execute(input));
  const full = await call({ template: "{n}. {title}" });
  assert.equal(full.total, 45); assert.equal(full.bookmarks.length, 45); assert.equal(full.text.split("\n").length, 45); assert.match(full.text, /45\. Bookmark 0$/);
  for (const input of [{ scope: "all" }, { template: 3 }, { separator: null }, { clipboard: true }]) assert.equal((await call(input)).error.code, "invalid_input");
  context = { ...context!, selection: undefined };
  assert.equal((await call()).total, 0); assert.equal((await call()).text, ""); assert.match((await call()).message, /No bookmarks selected/);
  assert.equal((await call({ scope: "current" })).total, 0);
  context = { ...context, collectionId: "another-collection", selection: [w.bookmarks[0].id] };
  assert.equal((await call()).error.code, "copy_context_unavailable");
  context = undefined;
  assert.equal((await call()).error.code, "copy_context_unavailable");
});

test("selected missing fields can be read, proposed, reviewed and undone without overwriting populated fields", async () => {
  let w = demoWorkspace();
  w.bookmarks[0].title = w.bookmarks[0].url!; w.bookmarks[0].missingTitle = true;
  w.bookmarks[1].description = "   ";
  w.bookmarks[2].url = "";
  w.bookmarks[3].description = ""; // Missing but outside the user's selection.
  const before = structuredClone(w), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const selectedIds = w.bookmarks.slice(0, 3).map((b) => b.id);
  const tools = createAgentTools({ session, getWorkspace: async () => w, getCopyContext: () => ({ collectionId: w.id, selection: selectedIds, list: [selectedIds[0]] }) });
  const call = async (name: string, input: unknown = {}) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  const selected = await call("get_copy_content");
  assert.deepEqual(selected.bookmarks[0].missingFields, ["title", "asset"]);
  assert.deepEqual(selected.bookmarks[1].missingFields, ["description", "asset"]);
  assert.deepEqual(selected.bookmarks[2].missingFields, ["url", "asset"]);
  const changes: ProposalInput["changes"] = [
    { kind: "update", bookmarkId: selected.bookmarks[0].id, expectedRecordRevision: selected.bookmarks[0].revision, patch: { title: "Source title" } },
    { kind: "update", bookmarkId: selected.bookmarks[1].id, expectedRecordRevision: selected.bookmarks[1].revision, patch: { description: "Source description" } },
    { kind: "update", bookmarkId: selected.bookmarks[2].id, expectedRecordRevision: selected.bookmarks[2].revision, patch: { url: "https://source.example/reference" } },
  ];
  const result = await call("propose_changes", { requestId: "fill-selection", collectionId: selected.collectionId, expectedRevision: selected.revision, summary: "Fill missing titles and descriptions in selection", changes });
  assert.equal(result.state, "pending_review"); assert.deepEqual(await store.get(w.id), before);
  const p = session.current as AgentProposal;
  assert.equal(p.preview.bookmarks[0].missingTitle, false); assert.equal(p.preview.bookmarks[0].description, before.bookmarks[0].description);
  assert.equal(p.preview.bookmarks[1].title, before.bookmarks[1].title);
  assert.equal(p.preview.bookmarks[2].title, before.bookmarks[2].title); assert.equal(p.preview.bookmarks[2].description, before.bookmarks[2].description);
  assert.deepEqual(p.preview.bookmarks.slice(3), before.bookmarks.slice(3));
  // Only the batch tag adds links.
  const batchTagId = p.preview.tags.find((t) => t.typeId === importTypeId)!.id;
  assert.deepEqual(p.preview.memberships.filter((m) => m.tagId !== batchTagId), before.memberships);
  assert.deepEqual(p.preview.bookmarks.map((b) => b.statusId), before.bookmarks.map((b) => b.statusId));
  w = await session.apply(p.id, w, store.command.bind(store));
  assert.equal(w.bookmarks[0].title, "Source title"); assert.equal(w.bookmarks[1].description, "Source description");
  assert.equal(w.bookmarks[2].url, "https://source.example/reference");
  const undo = (await store.nextUndo(w.id))!;
  w = await store.undoLast(w.id, w.revision, undo.id);
  assert.equal(w.bookmarks[0].title, before.bookmarks[0].title); assert.equal(w.bookmarks[0].missingTitle, true);
  assert.equal(w.bookmarks[1].description, before.bookmarks[1].description);
  assert.equal(w.bookmarks[2].url, "");
  await store.close();
});

test("agent can fill a selected missing image while preserving existing assets and undo the whole batch", async () => {
  let w = demoWorkspace();
  w.bookmarks[1].asset = { kind: "image", source: "remote", url: "https://images.example/existing.jpg" };
  const before = structuredClone(w), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const tools = createAgentTools({ session, getWorkspace: async () => w, getCopyContext: () => ({ collectionId: w.id, selection: w.bookmarks.slice(0, 2).map((b) => b.id), list: [] }) });
  const call = async (name: string, value: unknown = {}) => JSON.parse(await tools.find((t) => t.name === name)!.execute(value));
  const selected = await call("get_copy_content");
  assert.deepEqual(selected.bookmarks[0].missingFields, ["asset"]);
  assert.deepEqual(selected.bookmarks[1].missingFields, []);
  for (const result of [await call("search_bookmarks", { text: w.bookmarks[0].title }), await call("read_group", { groupId: w.tags[0].id })])
    assert.deepEqual(result.bookmarks.find((b: { id: string }) => b.id === w.bookmarks[0].id).missingFields, ["asset"]);
  const request = { ...input(w, "fill-image"), summary: "Fill missing image", changes: [{ kind: "update", bookmarkId: selected.bookmarks[0].id, expectedRecordRevision: selected.bookmarks[0].revision, patch: { asset: { kind: "image", source: "remote", url: "  https://IMAGES.example/cover.jpg  " } } }] };
  const staged = await call("propose_changes", request);
  assert.equal(staged.state, "pending_review");
  assert.equal((await call("propose_changes", request)).proposalId, staged.proposalId);
  assert.deepEqual(await store.get(w.id), before); assert.equal(await store.nextUndo(w.id), undefined);
  const proposal = session.current as AgentProposal, asset = { kind: "image", source: "remote", url: "https://images.example/cover.jpg" };
  assert.deepEqual(proposal.preview.bookmarks[0].asset, asset);
  assert.deepEqual(proposal.preview.bookmarks.slice(1), before.bookmarks.slice(1));
  assert.deepEqual(proposal.preview.memberships.filter((m) => m.tagId !== proposal.batchTag!.tagId), before.memberships);
  w = await session.apply(proposal.id, w, store.command.bind(store));
  assert.deepEqual(w.bookmarks[0].asset, asset);
  assert.deepEqual(w.bookmarks.slice(1), before.bookmarks.slice(1));
  for (const field of ["title", "description", "url", "statusId"] as const) assert.equal(w.bookmarks[0][field], before.bookmarks[0][field]);
  assert.deepEqual((await call("get_copy_content")).bookmarks[0].missingFields, []);
  const undo = (await store.nextUndo(w.id))!;
  w = await store.undoLast(w.id, w.revision, undo.id);
  assert.equal(w.bookmarks[0].asset, undefined); assert.deepEqual(w.bookmarks[1].asset, before.bookmarks[1].asset);
  assert.deepEqual(w.memberships, before.memberships); assert.equal(await store.nextUndo(w.id), undefined);
  await store.close();
});

test("reviewed image replacements restore a local or remote asset on Undo; setting aside and staleness never replace it", async () => {
  for (const original of [
    { kind: "image", source: "local", blobId: "existing-blob", filename: "existing.png" },
    { kind: "image", source: "remote", url: "https://images.example/original.png" },
  ] as const) {
    let w = demoWorkspace(); w.bookmarks[0].asset = original;
    const store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession(); await store.create(w);
    const request = { ...input(w, "replace-image"), changes: [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { asset: { kind: "image", source: "remote", url: "https://images.example/replacement.png" } } }] };
    const rejected = session.submit(request, w); session.setAside(rejected.id);
    assert.deepEqual((await store.get(w.id))!.bookmarks[0].asset, original); assert.equal(await store.nextUndo(w.id), undefined);
    const proposal = session.submit({ ...request, requestId: "apply-image" }, w);
    w = await session.apply(proposal.id, w, store.command.bind(store));
    const undo = (await store.nextUndo(w.id))!; w = await store.undoLast(w.id, w.revision, undo.id);
    assert.deepEqual(w.bookmarks[0].asset, original);
    const stale = session.submit({ ...request, requestId: "stale-image", expectedRevision: w.revision, changes: [{ ...request.changes[0], expectedRecordRevision: w.bookmarks[0].revision }] }, w);
    w = await store.command(w.id, w.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: w.bookmarks[0].revision, patch: { description: "Manual edit" } });
    await assert.rejects(session.apply(stale.id, w, store.command.bind(store)), ConflictError);
    assert.equal(stale.state, "stale"); assert.deepEqual((await store.get(w.id))!.bookmarks[0].asset, original);
    await store.close();
  }
});

test("asset proposals reject unsupported media, unsafe URLs, local references and malformed objects before staging", async () => {
  const w = demoWorkspace(), session = new AgentReviewSession();
  const tool = createAgentTools({ session, getWorkspace: async () => w }).find((t) => t.name === "propose_changes")!;
  const invalid = [
    null, "https://images.example/cover.png", {},
    { kind: "image", source: "remote" },
    { kind: "image", source: "remote", url: "   " },
    { kind: "image", source: "remote", url: 7 },
    ...["javascript:alert(1)", "data:image/png;base64,AA==", "file:///tmp/image.png", "blob:https://example.org/id", "ftp://example.org/image.png", "not-a-url"].map((url) => ({ kind: "image", source: "remote", url })),
    { kind: "image", source: "local", blobId: "missing", filename: "image.png" },
    { kind: "video", source: "remote", url: "https://images.example/video.mp4" },
    { kind: "audio", source: "remote", url: "https://images.example/audio.mp3" },
    { kind: "image", source: "remote", url: "https://images.example/cover.png", blobId: "extra" },
    { kind: "image", source: "remote", url: "https://images.example/cover.png", filename: "extra" },
  ];
  for (const asset of invalid) {
    const result = JSON.parse(await tool.execute({ ...input(w), changes: [{ kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { asset } }] }));
    assert.equal(result.error.code, "invalid_input"); assert.equal(session.current, undefined);
  }
});
