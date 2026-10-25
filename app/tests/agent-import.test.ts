import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { AgentReviewSession, type ImportProposal } from "../src/domain/agent-review";
import { demoWorkspace } from "../src/domain/samples";
import { emptyWorkspace, type Workspace } from "../src/domain/model";
import { WorkspaceStore } from "../src/domain/storage";
import { createAgentTools } from "../src/agent/webmcp";

const payload = (requestId = "watchlist-1") => ({
  requestId,
  summary: "Create and organize the YouTube watchlist",
  target: { kind: "new_collection", name: "YouTube watchlist — grouped" },
  tags: [{ ref: "software", name: "Software engineering" }, { ref: "games", name: "Games & game design" }],
  bookmarks: [
    { url: "https://www.youtube.com/watch?v=one", title: "One", description: "Why it helps", tagRefs: ["software", "games"], asset: { kind: "image", source: "remote", url: "https://i.ytimg.com/vi/one/hqdefault.jpg" } },
    { url: "https://www.youtube.com/watch?v=two", tagRefs: ["games"] },
  ],
});
function setup(w: Workspace = demoWorkspace()) {
  const session = new AgentReviewSession(), host = { session, getWorkspace: async () => w };
  const tools = createAgentTools(host);
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  return { session, tools, call, host };
}

test("propose_import declares a strict schema and is the only new writing tool", () => {
  const { tools } = setup();
  const tool = tools.find((t) => t.name === "propose_import")!;
  assert.equal(tool.annotations.readOnlyHint, false);
  const schema = tool.inputSchema as { required: string[]; additionalProperties: boolean; properties: Record<string, any> };
  assert.deepEqual(schema.required, ["requestId", "summary", "target", "bookmarks"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.target.properties.kind.const, "new_collection");
  assert.equal(schema.properties.bookmarks.items.additionalProperties, false);
  assert.ok(!tools.some((t) => /apply|approve/i.test(t.name)));
});

test("submitting stages the import without writing, and identical retries return the same proposal", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  const before = await store.list(), { call, session } = setup(w);
  const first = await call("propose_import", payload());
  assert.equal(first.state, "pending_review"); assert.equal(first.kind, "import"); assert.deepEqual(first.createdBookmarkIds, []);
  assert.equal(first.collectionName, "YouTube watchlist — grouped");
  assert.deepEqual(await store.list(), before);
  const staged = (session.current as ImportProposal).staged;
  assert.equal(staged.collection.bookmarks.length, 2); assert.equal(staged.collection.memberships.length, 3);
  const retry = await call("propose_import", payload());
  assert.equal(retry.proposalId, first.proposalId);
  assert.equal((session.current as ImportProposal).staged, staged);
  const reused = await call("propose_import", { ...payload(), summary: "Something else" });
  assert.equal(reused.error.code, "request_id_reused");
  await store.close();
});

test("invalid imports are rejected with the import's own message and stage nothing", async () => {
  const { call, session } = setup();
  const repeated = payload(); repeated.bookmarks[1].url = repeated.bookmarks[0].url;
  const cases: [unknown, RegExp][] = [
    [repeated, /Bookmark 2 repeats the URL of bookmark 1/],
    [{ ...payload(), tags: [{ ref: "games", name: "A" }, { ref: "games", name: "B" }] }, /reference “games” is used more than once/],
    [{ ...payload(), bookmarks: [{ url: "https://a.test", tagRefs: ["music"] }] }, /unknown tag reference “music”/],
    [{ ...payload(), target: { kind: "existing_collection", name: "X" } }, /new_collection/],
    [{ ...payload(), extra: true }, /unsupported fields/],
    [{ ...payload(), bookmarks: [{ url: "https://a.test", asset: { kind: "image", source: "remote", url: "ftp://a.test/x.jpg" } }] }, /HTTP or HTTPS/],
    [{ ...payload(), bookmarks: [] }, /at least one bookmark/],
  ];
  for (const [input, message] of cases) {
    const result = await call("propose_import", input);
    assert.equal(result.error.code, "invalid_input", String(message)); assert.match(result.error.message, message);
  }
  assert.equal(session.current, undefined);
});

test("an import shares the one-pending-batch limit with propose_changes", async () => {
  const w = demoWorkspace(), { call, session } = setup(w);
  const imported = await call("propose_import", payload());
  const changes = { requestId: "task-1", collectionId: w.id, expectedRevision: w.revision, summary: "Add one", changes: [{ kind: "create", url: "https://example.org/new" }] };
  assert.equal((await call("propose_changes", changes)).error.code, "review_pending");
  assert.equal((await call("propose_import", payload("watchlist-2"))).error.code, "review_pending");
  session.setAside(imported.proposalId);
  assert.equal((await call("get_proposal_status", { proposalId: imported.proposalId })).state, "set_aside");
  const batch = await call("propose_changes", changes);
  assert.equal(batch.state, "pending_review");
  assert.equal((await call("propose_import", { ...payload(), requestId: "task-1" })).error.code, "request_id_reused");
});

test("the import stays reviewable across collection switches, while edit batches are discarded", async () => {
  const w = demoWorkspace(), { call, session } = setup(w);
  const imported = await call("propose_import", payload());
  session.setAside(imported.proposalId);
  const batch = await call("propose_changes", { requestId: "task-1", collectionId: w.id, expectedRevision: w.revision, summary: "Add one", changes: [{ kind: "create", url: "https://example.org/new" }] });
  const other = emptyWorkspace("Other");
  session.refresh(other);
  assert.equal((session.batches.find((p) => p.id === imported.proposalId))!.state, "set_aside");
  session.discardCollectionBatches();
  assert.deepEqual(session.batches.map((p) => p.id), [imported.proposalId]);
  assert.equal(session.current?.id, imported.proposalId);
  assert.equal((await call("get_proposal_status", { proposalId: batch.proposalId })).error.code, "proposal_not_found");
  assert.equal((await call("get_proposal_status", { proposalId: imported.proposalId })).state, "set_aside");
});

test("Apply creates the collection atomically and status returns its IDs; a failed Apply stays pending", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  const { call, session } = setup(w);
  const imported = await call("propose_import", payload());
  await assert.rejects(session.applyImport(imported.proposalId, async () => { throw new DOMException("Storage is full.", "QuotaExceededError"); }), /Storage is full/);
  assert.equal((await call("get_proposal_status", { proposalId: imported.proposalId })).state, "pending_review");
  assert.equal((await store.list()).length, 1);
  const created = await session.applyImport(imported.proposalId, (staged) => store.createFromImport(staged));
  const status = await call("get_proposal_status", { proposalId: imported.proposalId });
  assert.equal(status.state, "applied");
  assert.equal(status.createdCollectionId, created.id);
  assert.deepEqual(Object.keys(status.createdTagIds), ["software", "games"]);
  assert.deepEqual(status.createdBookmarkIds, created.batches[0].bookmarkIds);
  assert.deepEqual(await store.get(created.id), created);
  assert.equal((await store.nextUndo(created.id))?.label, "Import 2 bookmarks");
  await assert.rejects(session.applyImport(imported.proposalId, (staged) => store.createFromImport(staged)), /already applied/);
  assert.equal((await store.list()).length, 2);
  // A new proposal is allowed once the import was applied.
  assert.equal((await call("propose_import", payload("watchlist-2"))).state, "pending_review");
  await store.close();
});
