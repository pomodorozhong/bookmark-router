import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { emptyWorkspace, validateWorkspace, type SavedView, type Workspace } from "../src/domain/model";
import { emptyTriageFilter, compileRules, readRules, graphVisibility, triageQueue, ruleValueCounts, tagVisible } from "../src/domain/triage";
import { connectionGraph, rankConnections, traceConnections } from "../src/domain/connections";
import { saveView, loadView, resetSearchAndState, type ViewSettings } from "../src/domain/saved-views";
import { WorkspaceStore } from "../src/domain/storage";
import { makeBackup, prepareRestore } from "../src/domain/backup";

test("custom and cross-timezone saved date ranges are never rounded into month chips", async () => {
  const w = fixture(), settings = base();
  const original = { op: "all" as const, rules: [{ op: "date" as const, field: "createdAt" as const,
    from: "2026-09-15T00:00:00.000Z", to: "2026-10-15T23:59:59.999Z" }] };
  const saved: SavedView = { id: "custom-range", name: "Custom range", sort: "title", hiddenTagIds: [], filter: original };
  w.views.push(saved); validateWorkspace(w);
  assert.equal(readRules(original), undefined); assert.equal(loadView(saved, settings), undefined);
  assert.deepEqual(saved.filter, original);
  const restored = prepareRestore(await makeBackup(w, [])).workspace;
  assert.deepEqual(restored.views[0].filter, original);
  const exact = compileRules([{ kind: "added", values: ["2026-10"], not: false }]);
  assert.deepEqual(readRules(exact), { text: "", rules: [{ kind: "added", values: ["2026-10"], not: false }] });
  const shifted = structuredClone(exact);
  if (shifted.op !== "all") assert.fail("Expected compiled rules");
  const range = shifted.rules[0];
  if (range.op !== "date") assert.fail("Expected monthly range");
  range.from = new Date(Date.parse(range.from!) + 3600000).toISOString();
  assert.equal(readRules(shifted), undefined);
  assert.equal(readRules({ op: "all", rules: [{ op: "date", field: "createdAt", from: "2026-10-01T00:00:00Z" }] }), undefined);
});

test("saved filters that compact controls cannot represent never lose conditions", () => {
  const w = fixture();
  const filters: SavedView["filter"][] = [
    { op: "all", rules: [{ op: "text", value: "one" }, { op: "text", value: "two" }] },
    { op: "all", rules: [{ op: "status", ids: [] }] },
    { op: "all", rules: [{ op: "tags", ids: [], mode: "any" }] },
    { op: "all", rules: [{ op: "tag-type", ids: [] }] },
  ];
  for (const filter of filters) {
    const view: SavedView = { id: "unsupported", name: "Legacy filter", sort: "title", hiddenTagIds: [], filter };
    w.views = [view]; validateWorkspace(w);
    const original = structuredClone(view);
    assert.equal(loadView(view, base()), undefined);
    assert.deepEqual(view, original);
  }
});

function fixture(): Workspace {
  const w = emptyWorkspace();
  const meta = { revision: 0, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };
  w.tagTypes = ["topic", "issue"].map((id) => ({ id, name: id, appearance: { color: "#0f766e", size: 64, shape: "circle" as const } }));
  w.tags = ["a", "b", "c"].map((id) => ({ ...meta, id, name: `Tag ${id}`, typeId: id === "c" ? "issue" : "topic", statusId: "pending", appearance: {} }));
  w.bookmarks = ["one", "two", "three", "loose"].map((id) => ({ ...meta, id, title: id, description: "", statusId: "pending" }));
  w.memberships = [["one", "a"], ["two", "a"], ["two", "b"], ["three", "b"], ["one", "c"], ["three", "c"]].map(([bookmarkId, tagId], i) => ({ id: String(i), bookmarkId, tagId }));
  return w;
}
const ids = (records: { id: string }[]) => records.map((r) => r.id);
const base = (): ViewSettings => ({ filter: structuredClone(emptyTriageFilter), tab: "all", highlight: { tagIds: [], mode: "any" }, fadeRest: true, view: "tags", showTags: false, contextTag: undefined });

test("type hiding removes only its tags and supplied links, while Show cannot override the type", () => {
  const w = fixture(), filter = { ...emptyTriageFilter, hiddenTypeIds: ["topic"] };
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter })), ["one", "two", "three", "loose"]);
  assert.deepEqual(graphVisibility(w, filter).hiddenTagIds, ["a", "b"]);
  const g = connectionGraph(w, { tab: "all", filter });
  assert.deepEqual(g.edges.map((e) => [e.source, e.target, e.sharedTagIds]), [["one", "three", ["c"]]]);
  assert.equal(tagVisible(w.tags[0], filter), false);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...filter, showUngrouped: false } })), ["one", "three"]);
});

test("Hide tag keeps members eligible and only removes links the tag supplies", () => {
  const w = fixture(), filter = { ...emptyTriageFilter, hiddenTagIds: ["a"] };
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter })), ids(w.bookmarks));
  assert.deepEqual(graphVisibility(w, filter, "all", ["two"]).hiddenTagIds, ["a"]);
  const g = connectionGraph(w, { tab: "all", filter });
  assert.equal(g.members.has("a"), false);
  assert.deepEqual(g.edges.flatMap((e) => e.sharedTagIds).sort(), ["b", "c"]);
  // Bookmarks with memberships only in a hidden tag count as untagged for inclusion.
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...filter, hiddenTagIds: ["a", "b"], showUngrouped: false } })), ["one", "three"]);
});

test("Hide tag + bookmarks excludes overlapping members everywhere, and several rules exclude their union", () => {
  const w = fixture(), filter = { ...emptyTriageFilter, hiddenTagIds: ["a"], hiddenBookmarkTagIds: ["a"] };
  const before = structuredClone(w);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter, selection: new Set(["one", "two", "three", "loose"]) })), ["three", "loose"]);
  assert.deepEqual(graphVisibility(w, filter, "all", ["one"]).bookmarkIds, ["three", "loose"]);
  const g = connectionGraph(w, { tab: "all", filter });
  assert.deepEqual(ids(g.bookmarks), ["three", "loose"]);
  assert.deepEqual(rankConnections(g).map((c) => c.id).sort(), ["loose", "three"]);
  assert.equal(traceConnections(g, "one").size, 0);
  const countFilter = { ...filter, rules: [{ kind: "status" as const, values: [], not: false }] };
  assert.equal(ruleValueCounts(w, countFilter, "all", 0).get("pending"), 2);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...filter, hiddenBookmarkTagIds: ["a", "b"] } })), ["loose"]);
  assert.deepEqual(w, before);
});

test("tag-type bookmark rules use OR values, AND with other rules, Not, and round trip without changing date/search semantics", () => {
  const w = fixture();
  const rules = [{ kind: "tag-type" as const, values: ["issue", "topic"], not: false }, { kind: "added" as const, values: ["2026-10"], not: false }];
  assert.deepEqual(readRules(compileRules(rules, "one")), { rules, text: "one" });
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...emptyTriageFilter, rules } })), ["one", "two", "three"]);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...emptyTriageFilter, rules: [{ kind: "tag-type", values: ["issue"], not: true }] } })), ["two", "loose"]);
  // A bookmark rule reads memberships independently of graph tag visibility.
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...emptyTriageFilter, hiddenTypeIds: ["issue"], rules: [{ kind: "tag-type", values: ["issue"], not: false }] } })), ["one", "three"]);
});

test("combined Saved views round trip all settings and allow an unfiltered baseline", () => {
  const w = fixture(), current: ViewSettings = { ...base(), tab: "done", view: "connections", showTags: true, contextTag: "c", highlight: { tagIds: ["a", "b"], mode: "all" }, fadeRest: false,
    filter: { ...emptyTriageFilter, text: "one", rules: [{ kind: "tag-type", values: ["issue"], not: false }], hiddenTypeIds: ["topic"], hiddenTagIds: ["a"], hiddenBookmarkTagIds: ["a"], showEmptyGroups: false, showUngrouped: false } };
  const saved = saveView("Both targets", current); w.views.push(saved); validateWorkspace(w);
  assert.deepEqual(loadView(saved, base()), current);
  assert.deepEqual(loadView(saveView("Baseline", base()), current), base());
  saved.graph!.highlight.tagIds.push("c");
  assert.deepEqual(current.highlight.tagIds, ["a", "b"]);
  const reset = resetSearchAndState(current);
  assert.deepEqual(reset, { ...current, tab: "todo", filter: { ...current.filter, text: "" } });
});

test("legacy views and backups keep absent settings, while restoring their original filter and hidden tags", async () => {
  const w = fixture(), legacy: SavedView = { id: "old", name: "Old", filter: compileRules([], "one"), hiddenTagIds: ["a"], sort: "title" };
  w.views.push(legacy); validateWorkspace(w);
  const current = { ...base(), tab: "dropped" as const, view: "connections" as const, showTags: true, highlight: { tagIds: ["c"], mode: "all" as const }, filter: { ...emptyTriageFilter, hiddenTypeIds: ["topic"], hiddenBookmarkTagIds: ["b"] } };
  const backup = await makeBackup(w, []), restored = prepareRestore(backup).workspace;
  assert.deepEqual(loadView(restored.views[0], current), { ...current, filter: { ...current.filter, text: "one", hiddenTagIds: ["a"] } });
});

test("new Saved fields persist through commands, reload, portable backups, delete and Undo without touching records or geometry", async () => {
  const w = fixture(), store = new WorkspaceStore(crypto.randomUUID());
  try {
    await store.create(w);
    const geometry = { workspaceId: w.id, positions: { one: { x: 30, y: 70, pinned: true } } };
    await store.saveGeometry(geometry);
    const settings = { ...base(), filter: { ...emptyTriageFilter, hiddenTagIds: ["a"], hiddenBookmarkTagIds: ["a"] } };
    const view = saveView("Combined", settings);
    let saved = await store.command(w.id, w.revision, { type: "view.upsert", view });
    assert.deepEqual(loadView((await store.get(w.id))!.views[0], base()), settings);
    const backup = await store.backup(w.id), restored = prepareRestore(backup);
    assert.deepEqual(restored.workspace.views, saved.views);
    assert.deepEqual(restored.geometry!.positions, geometry.positions);
    assert.deepEqual(saved.bookmarks, w.bookmarks); assert.deepEqual(saved.memberships, w.memberships);
    saved = await store.command(w.id, saved.revision, { type: "view.remove", id: view.id });
    assert.equal(saved.views.length, 0);
    saved = await store.undoLast(w.id, saved.revision, (await store.nextUndo(w.id))!.id);
    assert.deepEqual(saved.views, [view]);
    saved = await store.undoLast(w.id, saved.revision, (await store.nextUndo(w.id))!.id);
    assert.deepEqual(saved.views, []);
    assert.deepEqual((await store.getGeometry(w.id))!.positions, geometry.positions);
  } finally { await store.close(); }
});

test("invalid new Saved settings fail atomically without changing content or Undo history", async () => {
  const w = fixture(), store = new WorkspaceStore(crypto.randomUUID()); await store.create(w);
  try {
    const original = saveView("Valid", base());
    for (const patch of [{ hiddenTypeIds: ["missing"] }, { hiddenBookmarkTagIds: ["missing"] }, { highlight: { tagIds: ["missing"], mode: "any", fade: true } }, { tab: "unknown" }, { showTags: "yes" }, { contextTag: "missing" }]) {
      const view = structuredClone(original); Object.assign(view.graph!, patch);
      await assert.rejects(store.command(w.id, 0, { type: "view.upsert", view }), /invalid saved graph settings/);
      assert.deepEqual(await store.get(w.id), w); assert.equal(await store.nextUndo(w.id), undefined);
    }
  } finally { await store.close(); }
});
