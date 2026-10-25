import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand } from "../src/domain/commands";
import { highlightedBookmarks, liveHighlight } from "../src/domain/highlight";
import { demoWorkspace } from "../src/domain/samples";

test("a highlight matches bookmarks with any or all of its tags", () => {
  const w = demoWorkspace(), [a, b] = w.tags;
  const withA = new Set(w.memberships.filter((m) => m.tagId === a.id).map((m) => m.bookmarkId));
  const withB = new Set(w.memberships.filter((m) => m.tagId === b.id).map((m) => m.bookmarkId));
  assert.deepEqual(highlightedBookmarks(w, { tagIds: [a.id], mode: "any" }), withA);
  assert.deepEqual(highlightedBookmarks(w, { tagIds: [a.id, b.id], mode: "any" }), new Set([...withA, ...withB]));
  assert.deepEqual(highlightedBookmarks(w, { tagIds: [a.id, b.id], mode: "all" }), new Set([...withA].filter((id) => withB.has(id))));
  assert.equal(highlightedBookmarks(w, { tagIds: [], mode: "any" }).size, 0);
});

test("a highlight follows membership changes and drops tags that no longer exist", () => {
  let w = demoWorkspace();
  const tag = w.tags[0], outside = w.bookmarks.find((b) => !w.memberships.some((m) => m.bookmarkId === b.id && m.tagId === tag.id))!;
  const highlight = { tagIds: [tag.id, "deleted-tag"], mode: "all" as const };
  assert.deepEqual(liveHighlight(w, highlight).tagIds, [tag.id]);
  assert.ok(!highlightedBookmarks(w, highlight).has(outside.id), "a missing tag doesn't make all mode match nothing or everything");
  assert.ok(highlightedBookmarks(w, highlight).size > 0);
  w = applyCommand(w, w.revision, { type: "membership.set", bookmarkId: outside.id, tagId: tag.id, linked: true });
  assert.ok(highlightedBookmarks(w, highlight).has(outside.id));
});
