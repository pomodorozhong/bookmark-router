import { test } from "node:test";
import assert from "node:assert/strict";
import { demoWorkspace } from "../src/domain/samples";
import { connectionGraph } from "../src/domain/connections";
import { emptyTriageFilter } from "../src/domain/triage";
import { arrangeConnections, connectionSimulation, movingConnectionIds, splitNodeSize } from "../src/components/connections-layout";

test("dragging a bookmark or context tag moves only that connected cluster in either presentation", () => {
  const workspace = demoWorkspace(), bookmark = workspace.bookmarks[0], tag = workspace.tags[0];
  workspace.bookmarks = ["a", "b", "c", "d", "isolate"].map((id) => ({ ...bookmark, id }));
  workspace.tags = ["ab", "bc", "d-only"].map((id) => ({ ...tag, id }));
  workspace.memberships = [
    ["a", "ab"], ["b", "ab"], ["b", "bc"], ["c", "bc"], ["d", "d-only"],
  ].map(([bookmarkId, tagId], i) => ({ id: String(i), bookmarkId, tagId }));
  const g = connectionGraph(workspace, { tab: "all", filter: emptyTriageFilter });
  assert.deepEqual(movingConnectionIds(g, false, "b"), new Set(["a", "b", "c"]));
  const members = new Set(["a", "b", "c", "ab", "bc"]);
  assert.deepEqual(movingConnectionIds(g, true, "b"), members);
  assert.deepEqual(movingConnectionIds(g, true, "bc"), members);
  assert.deepEqual(movingConnectionIds(g, true, "d-only"), new Set(["d", "d-only"]));
  assert.deepEqual(movingConnectionIds(g, true, "isolate"), new Set(["isolate"]));
  assert.deepEqual(movingConnectionIds(g, true, "missing"), new Set());
});

test("tag mode rearranges bookmarks around memberships, while saved layouts and pins remain stable", () => {
  const g = connectionGraph(demoWorkspace(), { tab: "todo", filter: emptyTriageFilter });
  const direct = arrangeConnections(g, false);
  const tags = arrangeConnections(g, true, { positions: direct }, true);
  assert.ok([...g.members.keys()].every((id) => tags[id]));
  assert.ok(g.bookmarks.some((b) => Math.hypot(tags[b.id].x - direct[b.id].x, tags[b.id].y - direct[b.id].y) > 5));
  assert.deepEqual(arrangeConnections(g, false, { positions: direct }), direct);
  assert.deepEqual(arrangeConnections(g, true, { positions: tags }), tags);
  const pinnedId = g.bookmarks[0].id;
  tags[pinnedId] = { x: 123, y: 456, pinned: true };
  const reset = arrangeConnections(g, true, { positions: tags }, true);
  assert.deepEqual(reset[pinnedId], tags[pinnedId]);
  assert.ok(Object.values(reset).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test("saved unpinned nodes remain movable and force links pull neighbors while real pins stay fixed", () => {
  const g = connectionGraph(demoWorkspace(), { tab: "todo", filter: emptyTriageFilter });
  for (const tags of [false, true]) {
    const positions = arrangeConnections(g, tags);
    const root = g.bookmarks.find((b) => g.neighbors.get(b.id)!.size > 0)!.id;
    const neighbor = [...g.neighbors.get(root)!][0];
    const pin = g.bookmarks.find((b) => b.id !== root && b.id !== neighbor)!.id;
    positions[pin].pinned = true;
    const sim = connectionSimulation(g, tags, positions);
    const byId = new Map(sim.nodes().map((n) => [n.id, n]));
    assert.equal(byId.get(root)!.fx, undefined, "restored coordinates must not silently pin every node");
    sim.tick(260);
    const before = { x: byId.get(neighbor)!.x!, y: byId.get(neighbor)!.y! };
    const dragged = byId.get(root)!;
    dragged.fx = dragged.x! + 160; dragged.fy = dragged.y! + 90;
    sim.alpha(0.6).tick(80).stop();
    assert.equal(dragged.x, dragged.fx);
    assert.equal(dragged.y, dragged.fy);
    assert.ok(Math.hypot(byId.get(neighbor)!.x! - before.x, byId.get(neighbor)!.y! - before.y) > 5);
    assert.equal(byId.get(pin)!.x, positions[pin].x);
    assert.equal(byId.get(pin)!.y, positions[pin].y);
  }
});

test("node size distinguishes split impact, including in an overview and when nothing splits", () => {
  assert.ok(splitNodeSize(11, 11) > splitNodeSize(8, 11));
  assert.ok(splitNodeSize(8, 11) > splitNodeSize(0, 11));
  assert.equal(splitNodeSize(0, 0), splitNodeSize(0, 11));
  assert.ok(Number.isFinite(splitNodeSize(0, 0)));
});
