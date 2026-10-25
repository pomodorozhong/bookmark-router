import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { AgentReviewSession, hasGroup, reviewAgentProposal, type ImportProposal, type ProposalInput } from "../src/domain/agent-review";
import { applyCommand } from "../src/domain/commands";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";
import { createAgentTools } from "../src/agent/webmcp";
import type { Workspace } from "../src/domain/model";

const changes = (w: Workspace): ProposalInput => ({ requestId: "videos", collectionId: w.id, expectedRevision: w.revision, summary: "Two videos", changes: [
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
const tagNamed = (w: Workspace, name: string) => w.tags.find((t) => t.name === name);

test("a batch tag links the additions, keeps proposed tags, and can include updated bookmarks", () => {
  const w = demoWorkspace(), before = structuredClone(w), session = new AgentReviewSession(), p = session.submit(changes(w), w);
  session.setBatchTag(p.id, { name: "  Video batch  ", includeUpdates: false });
  const tag = tagNamed(p.preview, "Video batch")!;
  assert.equal(tag.id, p.batchTag!.tagId); assert.equal(tag.typeId, undefined);
  assert.deepEqual(p.createdBookmarkIds.map((id) => hasGroup(p.preview, id, tag.id)), [true, true]);
  assert.ok(hasGroup(p.preview, p.createdBookmarkIds[0], w.tags[0].id));
  assert.ok(!hasGroup(p.preview, w.bookmarks[0].id, tag.id));
  session.setBatchTag(p.id, { name: "Video batch", includeUpdates: true });
  assert.equal(p.batchTag!.tagId, tag.id, "the new tag keeps its ID across edits");
  assert.ok(hasGroup(p.preview, w.bookmarks[0].id, tag.id));
  session.setBatchTag(p.id, undefined);
  assert.equal(tagNamed(p.preview, "Video batch"), undefined); assert.equal(p.batchTag, undefined);
  assert.deepEqual(w, before, "editing the batch tag saves nothing");
  assert.throws(() => session.setBatchTag(p.id, { name: " ", includeUpdates: false }), /Enter a tag name/);
});

test("a batch tag reuses an existing tag with the same name instead of creating one", () => {
  let w = demoWorkspace();
  w = applyCommand(w, w.revision, { type: "tag.create", name: w.tags[0].name });
  const plain = w.tags.at(-1)!, session = new AgentReviewSession(), p = session.submit(changes(w), w);
  session.setBatchTag(p.id, { name: plain.name, includeUpdates: false });
  assert.equal(p.preview.tags.length, w.tags.length, "no tag was created");
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(p.preview, id, plain.id)), "the plain tag wins over a typed tag of the same name");
  const typed = w.tags.find((t) => t.typeId && t.name !== plain.name)!;
  session.setBatchTag(p.id, { name: typed.name, includeUpdates: false });
  assert.equal(p.preview.tags.length, w.tags.length);
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(p.preview, id, typed.id)));
});

test("Apply saves the bookmarks, the batch tag, and its links together, and one Undo removes them all", async () => {
  const w = demoWorkspace(), before = structuredClone(w), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit(changes(w), w);
  session.setBatchTag(p.id, { name: "Video batch", includeUpdates: true });
  await assert.rejects(session.apply(p.id, w, async () => { throw new Error("Disk full"); }), /Disk full/);
  assert.deepEqual(await store.get(w.id), before, "a failed save leaves no tag or bookmarks behind");
  session.setAside(p.id);
  assert.equal(p.batchTag!.name, "Video batch", "setting the batch aside keeps the choice");
  assert.deepEqual(await store.get(w.id), before);
  const saved = await session.apply(p.id, w, store.command.bind(store));
  const tag = tagNamed(saved, "Video batch")!;
  assert.deepEqual(saved.memberships.filter((m) => m.tagId === tag.id).map((m) => m.bookmarkId).sort(), [...p.createdBookmarkIds, w.bookmarks[0].id].sort());
  assert.throws(() => session.setBatchTag(p.id, undefined), /already applied/);
  const undo = (await store.nextUndo(w.id))!, undone = await store.undoLast(w.id, saved.revision, undo.id);
  // Undo bumps record revisions, so compare which tags exist.
  assert.deepEqual(undone.tags.map((t) => t.id), before.tags.map((t) => t.id)); assert.deepEqual(undone.memberships, before.memberships);
  assert.deepEqual(undone.bookmarks.map((b) => b.id), before.bookmarks.map((b) => b.id));
  await store.close();
});

test("a stale batch previews and applies its batch tag against the latest collection", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()), session = new AgentReviewSession();
  await store.create(w);
  const p = session.submit(changes(w), w);
  const latest = await store.command(w.id, w.revision, { type: "tag.create", name: "Video batch" });
  session.refresh(latest);
  session.setBatchTag(p.id, { name: "Video batch", includeUpdates: false });
  const reused = tagNamed(latest, "Video batch")!;
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(reviewAgentProposal(p, latest).preview, id, reused.id)));
  const saved = await session.apply(p.id, latest, store.command.bind(store), { reviewedRevision: latest.revision });
  assert.equal(saved.tags.filter((t) => t.name === "Video batch").length, 1);
  assert.ok(p.createdBookmarkIds.every((id) => hasGroup(saved, id, reused.id)));
  await store.close();
});

test("an import's batch tag goes on every bookmark, reuses a declared tag, and stays out of the agent's tag refs", async () => {
  const w = demoWorkspace(), session = new AgentReviewSession(), store = new WorkspaceStore(crypto.randomUUID());
  const tools = createAgentTools({ session, getWorkspace: async () => w });
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  const { proposalId } = await call("propose_import", importPayload);
  const p = session.get(proposalId, w) as ImportProposal;
  session.setBatchTag(p.id, { name: "games", includeUpdates: true });
  assert.equal(p.staged.collection.tags.length, 1, "a declared tag with the same name is reused");
  assert.equal(p.staged.collection.memberships.length, 2);
  session.setBatchTag(p.id, { name: "Video batch", includeUpdates: false });
  const tag = tagNamed(p.staged.collection, "Video batch")!;
  assert.deepEqual(p.staged.bookmarkIds.map((id) => hasGroup(p.staged.collection, id, tag.id)), [true, true]);
  await session.applyImport(p.id, (staged) => store.createFromImport(staged));
  const status = await call("get_proposal_status", { proposalId });
  assert.deepEqual(Object.keys(status.createdTagIds), ["games"]);
  assert.ok((await store.get(status.createdCollectionId))!.tags.some((t) => t.name === "Video batch"));
  await store.close();
});

test("removing an import's batch tag restores the agent's own tags", async () => {
  const session = new AgentReviewSession(), w = demoWorkspace(), p = session.submitImport(importPayload, w);
  session.setBatchTag(p.id, { name: "Video batch", includeUpdates: false });
  session.setBatchTag(p.id, undefined);
  assert.deepEqual(p.staged.collection.tags.map((t) => t.name), ["Games"]); assert.equal(p.batchTag, undefined);
});
