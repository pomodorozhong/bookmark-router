import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { WorkspaceStore } from "../src/domain/storage";
import { emptyWorkspace, type GraphLayout } from "../src/domain/model";
import { graphLayout, withGraphLayout } from "../src/domain/geometry";
import { makeBackup, prepareRestore } from "../src/domain/backup";
import { parseImport } from "../src/domain/imports";

const layout = (x: number): GraphLayout => ({ positions: { a: { x, y: 4, pinned: true } }, viewport: { x, y: 0, zoom: 0.7, anchor: "center" } });
test("each graph arrangement retains its own positions, pins and viewport", () => {
  let g = withGraphLayout(undefined, "w", "tags", layout(1));
  g = withGraphLayout(g, "w", "connections", layout(2));
  g = withGraphLayout(g, "w", "connections-tags", layout(3));
  g = withGraphLayout(g, "w", "tags", layout(4));
  assert.equal(graphLayout(g, "tags")?.positions.a.x, 4);
  assert.deepEqual(graphLayout(g, "connections"), layout(2));
  assert.deepEqual(graphLayout(g, "connections-tags"), layout(3));
  assert.equal(withGraphLayout(g, "other", "connections", layout(9)).connections?.tags, undefined);
});

test("old backups remain valid and optional connection layouts round-trip through restore", async () => {
  const w = emptyWorkspace();
  const legacy = await makeBackup(w, [], { workspaceId: w.id, ...layout(1) });
  assert.equal(prepareRestore(legacy).geometry?.connections, undefined);
  const g = withGraphLayout(withGraphLayout(legacy.geometry, w.id, "connections", layout(2)), w.id, "connections-tags", layout(3));
  const backup = await makeBackup(w, [], g);
  const restored = prepareRestore(backup);
  assert.notEqual(restored.workspace.id, w.id);
  assert.equal(restored.geometry?.workspaceId, restored.workspace.id);
  assert.deepEqual(restored.geometry?.connections, g.connections);
  const bad = structuredClone(backup);
  bad.geometry!.connections!.tags!.positions.a.x = Infinity;
  assert.throws(() => parseImport(JSON.stringify(bad), "json"), /Invalid node position/);
  const badViewport = structuredClone(backup);
  badViewport.geometry!.connections!.direct!.viewport!.zoom = 8;
  assert.throws(() => parseImport(JSON.stringify(badViewport), "json"), /Invalid viewport/);
});

test("separate tabs saving different arrangements preserve each other's pins and viewport", async () => {
  const db = crypto.randomUUID(), first = new WorkspaceStore(db), second = new WorkspaceStore(db);
  try {
    const w = emptyWorkspace();
    await first.create(w);
    await first.saveGeometry({ workspaceId: w.id, ...layout(1) });
    const [a, b] = await Promise.all([first.getGeometry(w.id), second.getGeometry(w.id)]);
    assert.deepEqual(a, b);
    await first.saveGraphLayout(w.id, "connections", layout(2));
    // Even a canvas carrying a stale geometry snapshot owns only its top-level Tags layout.
    const saved = await second.saveGraphLayout(w.id, "tags", { ...b!, ...layout(3) });
    assert.deepEqual(saved.connections?.direct, layout(2));
    await Promise.all([
      first.saveGraphLayout(w.id, "connections-tags", layout(4)),
      second.saveGraphLayout(w.id, "connections", layout(5)),
    ]);
    const g = await first.getGeometry(w.id);
    assert.deepEqual(g?.positions, layout(3).positions);
    assert.deepEqual(g?.viewport, layout(3).viewport);
    assert.deepEqual(g?.connections, { direct: layout(5), tags: layout(4) });
    assert.equal((await first.get(w.id))?.revision, w.revision);
  } finally { await Promise.all([first.close(), second.close()]); }
});
