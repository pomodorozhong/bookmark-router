import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { emptyWorkspace, type Workspace } from "../src/domain/model";
import { connectionGraph, connectionLinks, impactText, rankConnections, splitOffCount, traceConnections } from "../src/domain/connections";
import { emptyTriageFilter } from "../src/domain/triage";
import { WorkspaceStore } from "../src/domain/storage";

const meta = { revision: 0, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
function fixture(ids: string[], groups: string[][]): Workspace {
  const w = emptyWorkspace();
  w.bookmarks = ids.map((id) => ({ ...meta, id, title: id, description: "", statusId: "pending" }));
  w.tagTypes = [{ id: "topic", name: "Topic", appearance: { color: "#0f766e", size: 64, shape: "circle" } }];
  w.tags = groups.map((_, i) => ({ ...meta, id: `tag-${i}`, name: `Group ${i}`, typeId: "topic", appearance: {}, statusId: "pending" }));
  w.memberships = groups.flatMap((ids, i) => ids.map((id) => ({ id: `${i}-${id}`, bookmarkId: id, tagId: `tag-${i}` })));
  return w;
}
const graphOf = (w: Workspace) => connectionGraph(w, { tab: "todo", filter: emptyTriageFilter });

test("a separating bridge outranks a higher-degree clique; counts only surviving pairs", () => {
  const clique = Array.from({ length: 20 }, (_, i) => `dense-${i}`);
  const chain = ["a", "b", "c", "d", "e", "f", "g"];
  const w = fixture([...chain, ...clique, "isolate"], [clique, ...chain.slice(1).map((id, i) => [chain[i], id])]);
  const ranked = rankConnections(graphOf(w));
  assert.deepEqual(ranked[0], { id: "d", degree: 2, separation: 9, before: 7, pieces: [["a", "b", "c"], ["e", "f", "g"]] });
  assert.equal(ranked.find((c) => c.id === "dense-0")?.degree, 19);
  assert.equal(ranked.find((c) => c.id === "dense-0")?.separation, 0);
  assert.equal(splitOffCount(ranked[0]), 3);
  assert.equal(splitOffCount(ranked.find((c) => c.id === "dense-0")!), 0);
  assert.equal(impactText(ranked[0]), "Splits 7 into 3 + 3 bookmarks.");
  assert.equal(impactText(ranked.at(-1)!), "No connections in this view.");
});

test("split-off size counts all smaller surviving pieces, excluding the target and largest piece", () => {
  const base = { id: "bridge", before: 10, separation: 26, degree: 3 };
  assert.equal(splitOffCount({ ...base, pieces: [["a", "b"], ["c", "d", "e", "f"], ["g", "h", "i"]] }), 5);
  assert.equal(splitOffCount({ ...base, pieces: [["a", "b", "c"]] }), 0);
  assert.equal(splitOffCount({ ...base, pieces: [] }), 0);
});

test("cycles, cliques, isolates, empty graphs and ties have deterministic fallbacks", () => {
  const w = fixture(["c", "b", "a", "loose"], [["a", "b"], ["b", "c"], ["c", "a"]]);
  w.bookmarks.find((b) => b.id === "b")!.createdAt = "2025-01-01T00:00:00Z";
  const ranks = rankConnections(graphOf(w));
  assert.deepEqual(ranks.map((r) => r.id), ["b", "a", "c", "loose"]);
  assert.ok(ranks.every((r) => r.separation === 0));
  assert.match(impactText(ranks[0]), /Removes 2 connections; this step won’t split/);
  assert.deepEqual(rankConnections(graphOf(fixture([], []))), []);
});

test("projection deduplicates memberships and pairs while preserving shared-tag evidence", () => {
  const w = fixture(["a", "b", "c"], [["a", "b"], ["a", "b", "c"]]);
  w.memberships.push({ ...w.memberships[0], id: "duplicate" }, { id: "dangling", tagId: "missing", bookmarkId: "a" });
  const g = graphOf(w);
  assert.equal(g.edges.length, 3);
  assert.deepEqual(g.edges.find((e) => e.source === "a" && e.target === "b")?.sharedTagIds, ["tag-0", "tag-1"]);
  assert.equal(g.neighbors.get("a")?.size, 2);
  assert.deepEqual(g.members.get("tag-0"), ["a", "b"]);
});

test("scope respects outcomes, search, rules, selection and shown types without keeping the current record", () => {
  const w = fixture(["a", "b", "c", "d"], [["a", "b", "c", "d"]]);
  w.statuses.push({ id: "custom-complete", label: "Shipped", outcome: "completed", color: "#000" });
  w.bookmarks[1].statusId = "custom-complete";
  w.bookmarks[2].statusId = "dropped";
  assert.deepEqual(graphOf(w).bookmarks.map((b) => b.id), ["a", "d"]);
  const search = connectionGraph(w, { tab: "todo", filter: { ...emptyTriageFilter, text: "a" } });
  assert.deepEqual(search.bookmarks.map((b) => b.id), ["a"]);
  assert.equal(rankConnections(search)[0].degree, 0);
  const hidden = connectionGraph(w, { tab: "todo", filter: { ...emptyTriageFilter, hiddenTypeIds: ["topic"] } });
  assert.equal(hidden.edges.length, 0);
  assert.equal(hidden.members.size, 0);
  const selected = connectionGraph(w, { tab: "all", filter: emptyTriageFilter, selection: new Set(["a", "b"]) });
  assert.deepEqual(selected.bookmarks.map((b) => b.id), ["a", "b"]);
  const rules = connectionGraph(w, { tab: "all", filter: { ...emptyTriageFilter, rules: [{ kind: "status", values: ["custom-complete"], not: false }] } });
  assert.deepEqual(rules.bookmarks.map((b) => b.id), ["b"]);
});

test("trace uses shortest bookmark hops and tag presentation cannot change analysis", () => {
  const w = fixture(["a", "b", "c", "d", "isolated"], [["a", "b"], ["b", "c"], ["c", "d"]]);
  const g = graphOf(w), before = rankConnections(g);
  assert.deepEqual([...traceConnections(g, "a")], [["a", 0], ["b", 1], ["c", 2], ["d", 3]]);
  assert.deepEqual([...traceConnections(g, "isolated")], [["isolated", 0]]);
  assert.equal(traceConnections(g, "missing").size, 0);
  const direct = connectionLinks(g, false), withTags = connectionLinks(g, true);
  assert.equal(direct.length, 3);
  assert.equal(withTags.length, 6);
  assert.ok(withTags.every((e) => g.neighbors.has(e.source) && g.members.has(e.target)));
  assert.deepEqual(rankConnections(g), before);
  assert.ok(before.every((c) => g.neighbors.has(c.id)));
});

test("committed decisions match the forecast and Undo restores priorities; a rejected command leaves state intact", async () => {
  const w = fixture(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]]);
  const store = new WorkspaceStore(`connections-${crypto.randomUUID()}`);
  await store.create(w);
  const before = rankConnections(graphOf(w));
  const saved = await store.command(w.id, w.revision, { type: "bookmark.patch", id: "c", expectedRecordRevision: 0, patch: { statusId: "done" } });
  assert.deepEqual(graphOf(saved).components.map((c) => c.length), before[0].pieces.map((c) => c.length));
  await assert.rejects(store.command(w.id, w.revision, { type: "bookmark.patch", id: "a", expectedRecordRevision: 0, patch: { statusId: "done" } }));
  assert.deepEqual(rankConnections(graphOf((await store.get(w.id))!)), rankConnections(graphOf(saved)));
  const entry = await store.nextUndo(w.id);
  assert.ok(entry);
  const restored = await store.undoLast(w.id, saved.revision, entry.id);
  assert.deepEqual(rankConnections(graphOf(restored)), before);
});
