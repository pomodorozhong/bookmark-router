import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { AgentReviewSession, defaultBatchTagName, hasGroup, importTypeId, reviewAgentProposal, type ImportProposal, type ProposalInput } from "../src/domain/agent-review";
import { applyCommand } from "../src/domain/commands";
import { defaultAppearance, type Workspace } from "../src/domain/model";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";
import { createAgentTools } from "../src/agent/webmcp";

const changes = (w: Workspace, summary = "Two videos"): ProposalInput => ({ requestId: "videos", collectionId: w.id, expectedRevision: w.revision, summary, changes: [
  { kind: "create", url: "https://www.youtube.com/watch?v=a", title: "First video", tagIds: [w.tags[0].id] },
  { kind: "create", url: "https://www.youtube.com/watch?v=b", title: "Second video" },
  { kind: "update", bookmarkId: w.bookmarks[0].id, expectedRecordRevision: w.bookmarks[0].revision, patch: { description: "Updated" } },
] });
const importPayload = {
  requestId: "watchlist",
  summary: "Watchlist",
  target: { kind: "new_collection", name: "Watchlist" },
  tags: [{ ref: "games", name: "Games" }],
  bookmarks: [{ url: "https://www.youtube.com/watch?v=one", tagRefs: ["games"] }, { url: "https://www.youtube.com/watch?v=two" }],
};
const batchTagOf = (w: Workspace) => w.tags.find((t) => t.typeId === importTypeId);
const today = /^\d{4}-\d{2}-\d{2}/;

test("the batch tag name is the date and summary, or the date and time without a summary", () => {
  const at = new Date(2026, 9, 6, 9, 5);
  assert.equal(defaultBatchTagName("Pricing research", at), "2026-10-06 · Pricing research");
  assert.equal(defaultBatchTagName("", at), "2026-10-06 09:05");
});

test("every batch gets an Import batch tag on its additions, which the reviewer can skip and add back", () => {
  const w = demoWorkspace(), before = structuredClone(w), session = new AgentReviewSession(), p = session.submit(changes(w), w);
  const tag = batchTagOf(p.preview)!;
  assert.match(tag.name, new RegExp(`${today.source} · Two videos$`));
  assert.equal(tag.id, p.batchTag!.tagId);
  assert.equal(p.preview.tagTypes.find((t) => t.id === importTypeId)?.name, "Import");
  assert.deepEqual(p.createdBookmarkIds.map((id) => hasGroup(p.preview, id, tag.id)), [true, true]);
  assert.ok(hasGroup(p.preview, p.createdBookmarkIds[0], w.tags[0].id), "the agent's own tags stay");
  assert.ok(!hasGroup(p.preview, w.bookmarks[0].id, tag.id), "updated bookmarks aren't tagged when the batch adds some");
  session.setBatchTag(p.id, false);
  assert.equal(batchTagOf(p.preview), undefined); assert.equal(p.batchTag, undefined);
  assert.ok(!p.preview.tagTypes.some((t) => t.id === importTypeId), "a skipped tag creates no Import type");
  session.setBatchTag(p.id, true);
  assert.equal(p.batchTag!.tagId, tag.id, "the tag keeps its ID when added back");
  assert.equal(batchTagOf(p.preview)!.name, tag.name);
  assert.deepEqual(w, before, "staging the batch tag saves nothing");
});

test("a batch that only updates bookmarks tags the bookmarks it updates", () => {
  const w = demoWorkspace(), session = new AgentReviewSession();
  const p = session.submit({ ...changes(w), changes: [changes(w).changes[2]] }, w);
  assert.ok(hasGroup(p.preview, w.bookmarks[0].id, batchTagOf(p.preview)!.id));
});

test("a batch without a summary is accepted and its tag is named by date and time", async () => {
  const w = demoWorkspace(), session = new AgentReviewSession();
  const tools = createAgentTools({ session, getWorkspace: async () => w });
  const { summary: _, ...input } = changes(w);
  const result = JSON.parse(await tools.find((t) => t.name === "propose_changes")!.execute(input));
  const p = session.get(result.proposalId, w);
  assert.equal(p.input.summary, "");
  assert.match(p.batchTagName, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("batch tags reuse the Import type, and a user's own Import type keeps its name", () => {
  let w = demoWorkspace();
  w = applyCommand(w, w.revision, { type: "tag-type.create", name: "Import", appearance: defaultAppearance });
  const session = new AgentReviewSession(), p = session.submit(changes(w), w);
  assert.equal(p.preview.tagTypes.find((t) => t.id === importTypeId)?.name, "Import 2");
  const typed = applyCommand(p.preview, p.preview.revision, { type: "tag.create", name: "Later batch", typeId: importTypeId });
  const next = new AgentReviewSession().submit({ ...changes(typed), requestId: "later", changes: [changes(typed).changes[2]] }, typed);
  assert.equal(next.preview.tagTypes.filter((t) => t.id === importTypeId).length, 1, "the type is created once");
});

test("Apply saves the bookmarks, the batch tag, and its links together, and one Undo removes them all", async () => {
  const w = demoWorkspace(), before = structuredClone(w), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit(changes(w), w);
  await assert.rejects(session.apply(p.id, w, async () => { throw new Error("Disk full"); }), /Disk full/);
  assert.deepEqual(await store.get(w.id), before, "a failed save leaves no tag or bookmarks behind");
  session.setAside(p.id);
  assert.ok(p.batchTag, "setting the batch aside keeps the tag");
  const saved = await session.apply(p.id, w, store.command.bind(store));
  const tag = batchTagOf(saved)!;
  assert.deepEqual(saved.memberships.filter((m) => m.tagId === tag.id).map((m) => m.bookmarkId).sort(), [...p.createdBookmarkIds].sort());
  assert.throws(() => session.setBatchTag(p.id, false), /already applied/);
  const undo = (await store.nextUndo(w.id))!, undone = await store.undoLast(w.id, saved.revision, undo.id);
  // Undo bumps record revisions, so compare which records exist.
  assert.deepEqual(undone.tags.map((t) => t.id), before.tags.map((t) => t.id)); assert.deepEqual(undone.memberships, before.memberships);
  assert.deepEqual(undone.tagTypes, before.tagTypes);
  assert.deepEqual(undone.bookmarks.map((b) => b.id), before.bookmarks.map((b) => b.id));
  await store.close();
});

test("a stale batch previews and applies its batch tag against the latest collection", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit(changes(w), w);
  // Another batch saved an Import tag with the same name in the meantime.
  const latest = await store.command(w.id, w.revision, [
    { type: "tag-type.create", id: importTypeId, name: "Import", appearance: defaultAppearance },
    { type: "tag.create", name: p.batchTagName, typeId: importTypeId },
  ]);
  session.refresh(latest);
  const reused = batchTagOf(latest)!;
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(reviewAgentProposal(p, latest).preview, id, reused.id)));
  const saved = await session.apply(p.id, latest, store.command.bind(store), { reviewedRevision: latest.revision });
  assert.equal(saved.tags.filter((t) => t.typeId === importTypeId).length, 1);
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(saved, id, reused.id)));
  await store.close();
});

test("an import's batch tag goes on every bookmark as an Import tag and stays out of the agent's tag refs", async () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), store = new WorkspaceStore(crypto.randomUUID());
  const tools = createAgentTools({ session, getWorkspace: async () => w });
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  const { proposalId } = await call("propose_import", importPayload);
  const p = session.get(proposalId, w) as ImportProposal;
  const tag = batchTagOf(p.staged.collection)!;
  assert.match(tag.name, new RegExp(`${today.source} · Watchlist$`));
  assert.deepEqual(p.staged.collection.tagTypes.map((t) => [t.id, t.name]), [[importTypeId, "Import"]]);
  assert.deepEqual(p.staged.bookmarkIds.map((id) => hasGroup(p.staged.collection, id, tag.id)), [true, true]);
  await session.applyImport(p.id, (staged) => store.createFromImport(staged));
  const status = await call("get_proposal_status", { proposalId });
  assert.deepEqual(Object.keys(status.createdTagIds), ["games"]);
  assert.equal(batchTagOf((await store.get(status.createdCollectionId))!)?.name, tag.name);
  await store.close();
});

test("skipping an import's batch tag restores the agent's own tags", () => {
  const session = new AgentReviewSession(), w = demoWorkspace(), p = session.submitImport(importPayload, w);
  session.setBatchTag(p.id, false);
  assert.deepEqual(p.staged.collection.tags.map((t) => t.name), ["Games"]); assert.equal(p.batchTag, undefined);
  assert.deepEqual(p.staged.collection.tagTypes, []);
});
