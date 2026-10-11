import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { WorkspaceStore } from "../src/domain/storage";
import { demoWorkspace } from "../src/domain/samples";
import { ConflictError } from "../src/domain/commands";
import { parseImport, guessMapping, previewImport } from "../src/domain/imports";

test("undo persists, reverses grouped edits in order, and advances revisions", async () => {
  const name = crypto.randomUUID();
  let store = new WorkspaceStore(name);
  const w = demoWorkspace();
  await store.create(w);
  const first = await store.command(w.id, w.revision, [
    { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: 0, patch: { title: "Edited" } },
    { type: "membership.set", bookmarkId: w.bookmarks[0].id, tagId: w.tags[0].id, linked: false },
  ]);
  const second = await store.command(w.id, first.revision, { type: "tag.create", name: "New tag" });
  await store.close();
  store = new WorkspaceStore(name);
  assert.equal((await store.nextUndo(w.id))?.label, "Create tag");
  const undoneTag = await store.undoLast(w.id, second.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(undoneTag.tags.length, w.tags.length);
  assert.equal(undoneTag.bookmarks[0].title, "Edited");
  const undoneEdit = await store.undoLast(w.id, undoneTag.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(undoneEdit.bookmarks[0].title, w.bookmarks[0].title);
  assert.deepEqual(undoneEdit.memberships, w.memberships);
  assert.ok(undoneEdit.bookmarks[0].revision > first.bookmarks[0].revision);
  assert.equal(undoneEdit.revision, second.revision + 2);
  assert.equal(await store.nextUndo(w.id), undefined);
  await assert.rejects(store.command(w.id, undoneEdit.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: first.bookmarks[0].revision, patch: { title: "Stale" } }), ConflictError);
  await store.close();
});

test("failed grouped changes and failed undo leave content and history intact", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  await assert.rejects(store.command(w.id, 0, [
    { type: "tag.create", name: "Would be partial" },
    { type: "bookmark.patch", id: "absent", expectedRecordRevision: 0, patch: { title: "Invalid" } },
  ]));
  assert.deepEqual(await store.get(w.id), w);
  assert.equal(await store.nextUndo(w.id), undefined);
  const changed = await store.command(w.id, 0, { type: "tag.create", name: "Saved" });
  const entry = (await store.nextUndo(w.id))!;
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
    if (this.name === "workspaces") throw new DOMException("Storage full", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  try { await assert.rejects(store.undoLast(w.id, changed.revision, entry.id), /Storage full/); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await store.get(w.id), changed);
  assert.deepEqual(await store.nextUndo(w.id), entry);
  await store.close();
});

test("another tab's newer action cannot be undone using an old target", async () => {
  const name = crypto.randomUUID(), a = new WorkspaceStore(name), b = new WorkspaceStore(name), w = demoWorkspace();
  await a.create(w);
  const first = await a.command(w.id, 0, { type: "tag.create", name: "First" });
  const oldTarget = (await a.nextUndo(w.id))!;
  const second = await b.command(w.id, first.revision, { type: "tag.create", name: "Second" });
  await assert.rejects(a.undoLast(w.id, first.revision, oldTarget.id), ConflictError);
  await assert.rejects(a.undoLast(w.id, second.revision, oldTarget.id), ConflictError);
  assert.equal((await a.get(w.id))!.tags.length, second.tags.length);
  await a.close(); await b.close();
});

test("undo reverses import and media attachment without losing earlier data", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  const parsed = parseImport("title,url\nNew link,https://example.com/new-undo", "csv");
  const preview = previewImport(parsed, guessMapping(parsed.headers), w, { delimiter: "|", commonTags: "", initialStatus: "Pending" });
  const imported = await store.import(w.id, { type: "import.commit", expectedRevision: w.revision, preview, decisions: preview.candidates.map((c) => ({ row: c.row, action: "keep" })), statusMapping: {}, typeMapping: {}, source: "Test" });
  const mediaId = crypto.randomUUID();
  const attached = await store.attachMedia(w.id, imported.revision, [{ bookmarkId: w.bookmarks[0].id, expectedRecordRevision: 0, asset: { kind: "image", source: "local", blobId: mediaId, filename: "test.png" } }], [{ id: mediaId, filename: "test.png", mime: "image/png", blob: new Blob(["image"]) }]);
  const mediaUndone = await store.undoLast(w.id, attached.revision, (await store.nextUndo(w.id))!.id);
  assert.deepEqual(mediaUndone.bookmarks[0].asset, w.bookmarks[0].asset);
  assert.equal(mediaUndone.bookmarks.length, imported.bookmarks.length);
  const importUndone = await store.undoLast(w.id, mediaUndone.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(importUndone.bookmarks.length, w.bookmarks.length);
  assert.deepEqual(importUndone.batches, w.batches);
  assert.deepEqual(importUndone.memberships, w.memberships);
  await store.close();
});

test("existing v1 collections load without history and preserve geometry and media", async () => {
  const name = crypto.randomUUID(), w = demoWorkspace();
  const old = await openDB(name, 1, { upgrade(db) {
    db.createObjectStore("workspaces", { keyPath: "id" });
    db.createObjectStore("geometry", { keyPath: "workspaceId" });
    db.createObjectStore("media", { keyPath: "id" });
  } });
  await old.put("workspaces", w);
  await old.put("geometry", { workspaceId: w.id, positions: {} });
  await old.put("media", { id: "original", workspaceId: w.id, blob: new Blob(["kept"]) });
  old.close();
  const store = new WorkspaceStore(name);
  assert.deepEqual(await store.get(w.id), w);
  assert.deepEqual((await store.getGeometry(w.id))?.positions, {});
  assert.equal(await (await store.media("original"))!.blob.text(), "kept");
  assert.equal(await store.nextUndo(w.id), undefined);
  await store.close();
});

test("undoing a status change after undoing a later edit restores original statuses", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  const status = await store.command(w.id, 0, { type: "status.bulk", source: "selection", targetIds: [w.bookmarks[0].id], statusId: "done", reviewedRecordRevisions: { [w.bookmarks[0].id]: 0 } });
  const edited = await store.command(w.id, status.revision, { type: "bookmark.patch", id: w.bookmarks[0].id, expectedRecordRevision: status.bookmarks[0].revision, patch: { title: "Later edit" } });
  const titleUndone = await store.undoLast(w.id, edited.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(titleUndone.bookmarks[0].statusId, "done");
  assert.equal(titleUndone.bookmarks[0].title, w.bookmarks[0].title);
  const statusUndone = await store.undoLast(w.id, titleUndone.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(statusUndone.bookmarks[0].statusId, w.bookmarks[0].statusId);
  await store.close();
});

test("history is isolated by collection, capped at 50, and excluded from backups", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), other = demoWorkspace();
  other.id = crypto.randomUUID();
  await store.create(w); await store.create(other);
  let current = w;
  for (let i = 0; i < 51; i++) current = await store.command(w.id, current.revision, { type: "bookmark.patch", id: current.bookmarks[0].id, expectedRecordRevision: current.bookmarks[0].revision, patch: { title: `Edit ${i}` } });
  assert.equal(await store.nextUndo(other.id), undefined);
  assert.equal("_undoHistory" in (await store.get(w.id))!, false);
  assert.equal("_undoHistory" in (await store.backup(w.id)).workspace, false);
  for (let i = 0; i < 50; i++) current = await store.undoLast(w.id, current.revision, (await store.nextUndo(w.id))!.id);
  assert.equal(current.bookmarks[0].title, "Edit 0");
  assert.equal(await store.nextUndo(w.id), undefined);
  await store.close();
});

test("undoing connections advances the bookmark revision even when its fields are unchanged", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  await store.create(w);
  const changed = await store.command(w.id, 0, { type: "membership.set", bookmarkId: w.bookmarks[0].id, tagId: w.tags[0].id, linked: false });
  const restored = await store.undoLast(w.id, changed.revision, (await store.nextUndo(w.id))!.id);
  assert.deepEqual(restored.memberships, w.memberships);
  assert.ok(restored.bookmarks[0].revision > changed.bookmarks[0].revision);
  await store.close();
});
