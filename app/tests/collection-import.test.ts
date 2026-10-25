import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { WorkspaceStore } from "../src/domain/storage";
import { ConflictError } from "../src/domain/commands";
import { ImportInputError, revalidateCollectionImport, stageCollectionImport, type CollectionImportInput } from "../src/domain/collection-import";

const input = (): CollectionImportInput => ({
  name: "YouTube watchlist — grouped",
  source: "Agent import",
  tags: [
    { ref: "software", name: "Software engineering" },
    { ref: "games", name: "Games & game design" },
    { ref: "later", name: "Watch later" },
  ],
  bookmarks: [
    { url: "https://www.youtube.com/watch?v=one", title: "One", description: "Why it helps", tagRefs: ["software", "games"], asset: { kind: "image", source: "remote", url: "https://i.ytimg.com/vi/one/hqdefault.jpg" } },
    { url: "https://www.youtube.com/watch?v=two", tagRefs: ["games"] },
  ],
});
const tagNames = (w: ReturnType<typeof stageCollectionImport>["collection"], bookmarkId: string) =>
  w.memberships.filter((m) => m.bookmarkId === bookmarkId).map((m) => w.tags.find((t) => t.id === m.tagId)!.name).sort();

test("staging builds the whole new collection with linked, untyped tags and Pending bookmarks", () => {
  const staged = stageCollectionImport(input()), w = staged.collection;
  assert.equal(w.name, "YouTube watchlist — grouped");
  assert.equal(w.revision, 1);
  assert.equal(w.bookmarks.length, 2);
  assert.equal(w.tags.length, 3);
  assert.equal(w.memberships.length, 3);
  assert.ok(w.tags.every((t) => t.typeId === undefined && t.statusId === "pending"));
  assert.ok(w.bookmarks.every((b) => b.statusId === "pending"));
  const [one, two] = staged.bookmarkIds.map((id) => w.bookmarks.find((b) => b.id === id)!);
  assert.deepEqual(tagNames(w, one.id), ["Games & game design", "Software engineering"]);
  assert.deepEqual(one.asset, { source: "remote", kind: "image", url: "https://i.ytimg.com/vi/one/hqdefault.jpg" });
  assert.equal(one.description, "Why it helps");
  assert.equal(two.title, "https://www.youtube.com/watch?v=two");
  assert.equal(two.missingTitle, true);
  assert.equal(two.asset, undefined);
  // A declared tag no bookmark uses is still created.
  assert.ok(w.tags.some((t) => t.id === staged.tagIds.later && t.name === "Watch later"));
  assert.equal(tagNames(w, two.id).length, 1);
  assert.equal(w.memberships.find((m) => m.bookmarkId === two.id)!.tagId, staged.tagIds.games);
  assert.deepEqual(w.batches.map((b) => b.source), ["Agent import"]);
  assert.deepEqual(w.batches[0].bookmarkIds, staged.bookmarkIds);
  assert.deepEqual([...w.batches[0].createdTagIds!].sort(), Object.values(staged.tagIds).sort());
  assert.equal(staged.empty.id, w.id);
  assert.equal(staged.empty.bookmarks.length, 0);
});

test("staging assigns IDs once, and revalidating reuses them", () => {
  const staged = stageCollectionImport(input());
  const ids = [staged.collection.id, staged.batchId, ...staged.collection.tags.map((t) => t.id), ...staged.collection.bookmarks.map((b) => b.id), ...staged.collection.memberships.map((m) => m.id)];
  assert.deepEqual([...ids].sort(), [...staged.ids].sort());
  assert.deepEqual(revalidateCollectionImport(staged).collection, staged.collection);
  assert.notEqual(stageCollectionImport(input()).collection.id, staged.collection.id);
});

test("staging rejects inconsistent tags, links and images before building anything", () => {
  const rejects = (change: (i: CollectionImportInput) => void, message: RegExp) => {
    const i = input();
    change(i);
    assert.throws(() => stageCollectionImport(i), (e: Error) => e instanceof ImportInputError && message.test(e.message));
  };
  rejects((i) => { i.tags[1].ref = "software"; }, /reference “software” is used more than once/);
  rejects((i) => { i.tags[1].name = " software ENGINEERING"; }, /declared more than once/);
  rejects((i) => { i.bookmarks[1].tagRefs = ["music"]; }, /unknown tag reference “music”/);
  rejects((i) => { i.bookmarks[1].tagRefs = ["games", "games"]; }, /same tag more than once/);
  rejects((i) => { i.bookmarks[1].url = "https://www.youtube.com/watch?v=one"; }, /Bookmark 2 repeats the URL of bookmark 1/);
  rejects((i) => { i.bookmarks[1].url = "not a link"; }, /Bookmark 2 needs an HTTP or HTTPS URL/);
  rejects((i) => { i.bookmarks[1].url = "ftp://example.com/file"; }, /needs an HTTP or HTTPS URL/);
  rejects((i) => { i.bookmarks[1].url = "  "; }, /needs an HTTP or HTTPS URL/);
  rejects((i) => { i.bookmarks[0].asset = { kind: "image", source: "remote", url: "javascript:alert(1)" }; }, /remote image/);
  rejects((i) => { i.bookmarks[0].asset = { kind: "video", source: "remote", url: "https://example.com/a.mp4" } as never; }, /remote image/);
  rejects((i) => { i.name = " "; }, /Name the new collection/);
  rejects((i) => { i.bookmarks = []; }, /at least one bookmark/);
});

test("an image URL that looks like a video is still stored as an image", () => {
  const i = input();
  i.bookmarks[0].asset = { kind: "image", source: "remote", url: "https://example.com/preview.mp4" };
  assert.equal(stageCollectionImport(i).collection.bookmarks[0].asset?.kind, "image");
});

test("applying creates the staged collection in one save with one Undo action", async () => {
  const store = new WorkspaceStore(crypto.randomUUID());
  const staged = stageCollectionImport(input());
  assert.deepEqual(await store.list(), []);
  const saved = await store.createFromImport(staged);
  assert.deepEqual(saved, staged.collection);
  assert.deepEqual(await store.get(staged.collection.id), staged.collection);
  assert.equal((await store.nextUndo(saved.id))?.label, "Import 2 bookmarks");
  await store.close();
});

test("Undo removes everything the import added and leaves the new collection empty", async () => {
  const store = new WorkspaceStore(crypto.randomUUID());
  const staged = stageCollectionImport(input());
  const saved = await store.createFromImport(staged);
  const undone = await store.undoLast(saved.id, saved.revision, (await store.nextUndo(saved.id))!.id);
  assert.equal(undone.id, saved.id);
  assert.equal(undone.name, "YouTube watchlist — grouped");
  assert.deepEqual([undone.bookmarks, undone.tags, undone.memberships, undone.batches], [[], [], [], []]);
  assert.equal(undone.revision, saved.revision + 1);
  assert.equal(await store.nextUndo(saved.id), undefined);
  await store.close();
});

test("a failed apply leaves no collection behind", async () => {
  const store = new WorkspaceStore(crypto.randomUUID());
  const staged = stageCollectionImport(input());
  await store.createFromImport(staged);
  await assert.rejects(store.createFromImport(staged), (e: Error) => e instanceof ConflictError && /already applied/.test(e.message));
  assert.equal((await store.list()).length, 1);

  const changed = stageCollectionImport(input());
  changed.collection.bookmarks[0].title = "Edited after staging";
  await assert.rejects(store.createFromImport(changed), ConflictError);
  const extra = stageCollectionImport(input());
  extra.ids.push(crypto.randomUUID());
  await assert.rejects(store.createFromImport(extra), ConflictError);
  assert.equal((await store.list()).length, 1);

  const full = stageCollectionImport(input());
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function () { throw new DOMException("Storage is full.", "QuotaExceededError"); };
  try {
    await assert.rejects(store.createFromImport(full), /Storage is full/);
  } finally {
    IDBObjectStore.prototype.add = add;
  }
  assert.equal(await store.get(full.collection.id), undefined);
  assert.equal((await store.list()).length, 1);
  await store.close();
});
