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

test("with radii, nodes land in free space beside their links", () => {
  // A packed grid of placed bookmarks, two tags left out, and an unlinked node.
  const placed = new Map<string, readonly [number, number]>();
  for (let i = 0; i < 25; i++) placed.set(`b${i}`, [(i % 5) * 70, Math.floor(i / 5) * 70]);
  const memberships = [
    ...[0, 1, 2].map((i) => ({ bookmarkId: `b${i}`, tagId: "tag-a" })),
    ...[22, 23, 24].map((i) => ({ bookmarkId: `b${i}`, tagId: "tag-b" })),
  ];
  const radius = (id: string) => (id.startsWith("tag") ? 46 : 34);
  const result = placeNear(["tag-a", "tag-b", "loose"], placed, memberships, [140, 140], radius);
  assert.equal(result.size, 3);
  for (const [id, point] of result) {
    for (const [other, p] of placed) assert.ok(distance(point, p) >= radius(id) + radius(other), `${id} overlaps ${other}`);
    for (const [other, p] of result) if (other !== id) assert.ok(distance(point, p) >= radius(id) + radius(other), `${id} overlaps ${other}`);
    // Within reach of the placed layout, not flung off-screen.
    assert.ok(point[0] > -300 && point[0] < 580 && point[1] > -300 && point[1] < 580, `${id} is far away at ${point}`);
  }
  // Each tag stays nearer its own bookmarks than the other tag's.
  assert.ok(distance(result.get("tag-a")!, placed.get("b1")!) < distance(result.get("tag-a")!, placed.get("b23")!));
  assert.ok(distance(result.get("tag-b")!, placed.get("b23")!) < distance(result.get("tag-b")!, placed.get("b1")!));
});

test("a node linked to several placed nodes starts among them", () => {
  const placed = new Map([["b1", [0, 0] as const], ["b2", [600, 0] as const], ["b3", [300, 500] as const]]);
  const memberships = ["b1", "b2", "b3"].map((bookmarkId) => ({ bookmarkId, tagId: "tag" }));
  const result = placeNear(["tag"], placed, memberships, [0, 0], () => 40);
  assert.ok(distance(result.get("tag")!, [300, 167]) < 120);
});
