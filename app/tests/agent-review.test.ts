import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { AgentReviewSession, AgentInputError, type ProposalInput } from "../src/domain/agent-review";
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

test("proposals do not save, duplicate retries are stable, and only one batch can await review", () => {
  const w = demoWorkspace(), before = structuredClone(w), session = new AgentReviewSession(), proposal = session.submit(input(w), w);
  assert.deepEqual(w, before); assert.equal(proposal.state, "pending_review"); assert.equal(proposal.preview.bookmarks.length, 14);
  assert.equal(session.submit(input(w), w), proposal);
  assert.throws(() => session.submit(input(w, "other-task"), w), (e: unknown) => e instanceof AgentInputError && e.code === "review_pending");
  assert.throws(() => session.submit({ ...input(w), summary: "Different" }, w), (e: unknown) => e instanceof AgentInputError && e.code === "request_id_reused");
  session.reject(proposal.id); assert.equal(proposal.state, "rejected"); assert.deepEqual(w, before);
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
  session.reject(p.id);
  const fresh = session.submit(input(newer, "fresh"), newer);
  session.refresh({ ...newer, revision: newer.revision + 1 }); assert.equal(fresh.state, "stale");
  await assert.rejects(session.apply(fresh.id, newer, store.command.bind(store)), ConflictError);
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
  assert.throws(() => session.reject(p.id), /finish saving/); assert.throws(() => session.reset(), /finish saving/);
  release(await store.command(w.id, 0, p.commands)); await saving;
  assert.equal(p.state, "applied"); await store.close();
});

test("tools read all groups and statuses, use compact filter semantics, and return duplicate IDs without exposing approval", async () => {
  let w = demoWorkspace(); const session = new AgentReviewSession(), tools = createAgentTools({ session, getWorkspace: async () => w });
  const call = async (name: string, input: unknown = {}) => JSON.parse(await tools.find((t) => t.name === name)!.execute(input));
  assert.deepEqual(tools.map((t) => t.name), ["get_collection_context", "search_bookmarks", "read_group", "get_copy_content", "propose_changes", "get_proposal_status"]);
  assert.equal((await call("get_collection_context")).bookmarkCount, 12);
  const group = await call("read_group", { groupId: w.tags[0].id }); assert.equal(group.bookmarks.length, 5);
  const found = await call("search_bookmarks", { text: "Research", rules: [{ kind: "status", values: ["done"], not: true }] }); assert.equal(found.total, 5);
  assert.equal((await call("search_bookmarks", { rules: [{ kind: "status", values: ["invalid"], not: false }] })).error.code, "invalid_input");
  const duplicate = await call("propose_changes", { ...input(w), changes: [{ kind: "create", url: w.bookmarks[0].url }] });
  assert.equal(duplicate.error.code, "duplicate_url"); assert.equal(duplicate.error.bookmarkId, w.bookmarks[0].id);
  const staged = await call("propose_changes", input(w)); assert.equal(staged.state, "pending_review"); assert.deepEqual(staged.createdBookmarkIds, []);
  w = applyCommand(w, 0, { type: "tag.create", name: "Manual" });
  assert.equal((await call("get_proposal_status", { proposalId: staged.proposalId })).state, "stale");
  const abort = new AbortController(); abort.abort(); await assert.rejects(tools[0].execute({}, { signal: abort.signal }));
});

test("WebMCP is optional, registration uses abort cleanup, and failed or cancelled registration leaves no tools", async () => {
  const host = { session: new AgentReviewSession(), getWorkspace: async () => demoWorkspace() };
  assert.equal(detectWebMcp(undefined), undefined); assert.equal((await registerAgentTools(host)).available, false);
  const registered = new Map<string, WebMcpTool>();
  const context = { registerTool(tool: WebMcpTool, options: { signal: AbortSignal }) { registered.set(tool.name, tool); options.signal.addEventListener("abort", () => registered.delete(tool.name), { once: true }); } };
  const handle = await registerAgentTools(host, context); assert.equal(handle.available, true); assert.equal(registered.size, 6);
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
  assert.deepEqual(selected.bookmarks[0].missingFields, ["title"]);
  assert.deepEqual(selected.bookmarks[1].missingFields, ["description"]);
  assert.deepEqual(selected.bookmarks[2].missingFields, ["url"]);
  const changes: ProposalInput["changes"] = [
    { kind: "update", bookmarkId: selected.bookmarks[0].id, expectedRecordRevision: selected.bookmarks[0].revision, patch: { title: "Source title" } },
    { kind: "update", bookmarkId: selected.bookmarks[1].id, expectedRecordRevision: selected.bookmarks[1].revision, patch: { description: "Source description" } },
    { kind: "update", bookmarkId: selected.bookmarks[2].id, expectedRecordRevision: selected.bookmarks[2].revision, patch: { url: "https://source.example/reference" } },
  ];
  const result = await call("propose_changes", { requestId: "fill-selection", collectionId: selected.collectionId, expectedRevision: selected.revision, summary: "Fill missing titles and descriptions in selection", changes });
  assert.equal(result.state, "pending_review"); assert.deepEqual(await store.get(w.id), before);
  const p = session.current!;
  assert.equal(p.preview.bookmarks[0].missingTitle, false); assert.equal(p.preview.bookmarks[0].description, before.bookmarks[0].description);
  assert.equal(p.preview.bookmarks[1].title, before.bookmarks[1].title);
  assert.equal(p.preview.bookmarks[2].title, before.bookmarks[2].title); assert.equal(p.preview.bookmarks[2].description, before.bookmarks[2].description);
  assert.deepEqual(p.preview.bookmarks.slice(3), before.bookmarks.slice(3));
  assert.deepEqual(p.preview.memberships, before.memberships);
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
