import { test } from "node:test";
import assert from "node:assert/strict";
import { placeNear } from "../src/components/graph-placement";

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("new nodes start beside linked nodes, and new groups stay together", () => {
  const placed = new Map([["tag-a", [1000, 1000] as const]]);
  const memberships = [
    { bookmarkId: "b1", tagId: "tag-a" },
    { bookmarkId: "b2", tagId: "tag-new" },
    { bookmarkId: "b3", tagId: "tag-new" },
  ];
  const result = placeNear(["tag-new", "b1", "b2", "b3"], placed, memberships, [0, 0]);
  assert.equal(result.size, 4);
  assert.ok(distance(result.get("b1")!, [1000, 1000]) < 120);
  // The unlinked group starts around the center, with bookmarks next to their new tag.
  assert.ok(distance(result.get("tag-new")!, [0, 0]) < 120);
  assert.ok(distance(result.get("b2")!, result.get("tag-new")!) < 120);
  assert.ok(distance(result.get("b3")!, result.get("tag-new")!) < 120);
  assert.notDeepEqual(result.get("b2"), result.get("b3"));
});
