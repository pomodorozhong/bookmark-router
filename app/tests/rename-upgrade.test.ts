import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { parseImport } from "../src/domain/imports";
import { upgradeWorkspace, validateWorkspace, type Workspace } from "../src/domain/model";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";

// A collection as it was saved before bookmarks were renamed from "bubbles" (schema version 1).
function legacy(w: Workspace) {
  const { bookmarks, ...rest } = w;
  const membership = ({ bookmarkId, ...m }: Workspace["memberships"][number]) => ({ ...m, bubbleId: bookmarkId });
  return {
    ...rest,
    schemaVersion: 1,
    bubbles: bookmarks,
    memberships: w.memberships.map(membership),
    batches: w.batches.map(({ bookmarkIds, ...b }) => ({ ...b, bubbleIds: bookmarkIds, ...(b.beforeMemberships ? { beforeMemberships: b.beforeMemberships.map(membership) } : {}) })),
  };
}

test("a version 1 collection upgrades to the bookmark names", () => {
  const w = demoWorkspace();
  const upgraded = upgradeWorkspace(legacy(w) as unknown as Workspace);
  validateWorkspace(upgraded);
  assert.deepEqual(upgraded.bookmarks, w.bookmarks);
  assert.deepEqual(upgraded.memberships, w.memberships);
  assert.equal(upgradeWorkspace(w), w, "current collections pass through untouched");
});

test("a bubble-tag version 1 backup still restores", () => {
  const w = demoWorkspace();
  const parsed = parseImport(JSON.stringify({ format: "bubble-tag", version: 1, workspace: legacy(w), media: [] }), "json");
  assert.equal(parsed.restore?.version, 2);
  assert.equal(parsed.restore?.workspace.bookmarks.length, w.bookmarks.length);
  assert.equal(parsed.restore?.workspace.memberships[0].bookmarkId, w.memberships[0].bookmarkId);
});

test("a collection saved in the browser before the rename opens, edits, and undoes", async () => {
  const name = `test-${crypto.randomUUID()}`, w = demoWorkspace();
  const db = await openDB(name, 1, { upgrade(d) { d.createObjectStore("workspaces", { keyPath: "id" }); d.createObjectStore("geometry", { keyPath: "workspaceId" }); d.createObjectStore("media", { keyPath: "id" }); } });
  await db.put("workspaces", legacy(w));
  db.close();
  const store = new WorkspaceStore(name);
  const opened = (await store.get(w.id))!;
  assert.equal(opened.bookmarks.length, w.bookmarks.length);
  const first = opened.bookmarks[0];
  await store.command(w.id, opened.revision, { type: "bookmark.patch", id: first.id, expectedRecordRevision: first.revision, patch: { title: "Renamed" } });
  assert.equal((await store.get(w.id))!.bookmarks[0].title, "Renamed");
  const undo = (await store.nextUndo(w.id))!;
  await store.undoLast(w.id, undo.revision, undo.id);
  assert.equal((await store.get(w.id))!.bookmarks[0].title, first.title);
  await store.close();
});
