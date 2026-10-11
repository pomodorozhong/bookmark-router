import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace, type Workspace } from "../src/domain/model";
import {
  clockwise,
  emptyTriageFilter,
  formatCopy,
  graphVisibility,
  reasonFor,
  relatedOf,
  triageQueue,
} from "../src/domain/triage";

function fixture(): Workspace {
  const w = emptyWorkspace();
  const meta = { revision: 0, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };
  w.tagTypes = [
    { id: "issue", name: "Existing issue", appearance: { color: "#0f766e", size: 64, shape: "circle" } },
    { id: "topic", name: "Topic", appearance: { color: "#475569", size: 52, shape: "rounded-square" } },
  ];
  w.tags = [
    { ...meta, id: "t-pricing", name: "#143 Pricing", typeId: "issue", statusId: "pending", appearance: {} },
    { ...meta, id: "t-seo", name: "SEO", typeId: "topic", statusId: "pending", appearance: {} },
  ];
  w.bubbles = [
    { ...meta, id: "a", title: "Price test", description: "A  pricing\nexperiment", url: "https://www.example.com/a", statusId: "pending",
      notes: [{ label: "Why #143", text: "Concrete experiment." }, { label: "Why this topic", text: 'Refine to "SEO".' }] },
    { ...meta, id: "b", title: "Keywords", description: "", url: "https://b.dev/x", statusId: "done" },
    { ...meta, id: "c", title: "Loose note", description: "", statusId: "dropped" },
  ];
  w.memberships = [
    { id: "1", bubbleId: "a", tagId: "t-pricing" },
    { id: "2", bubbleId: "a", tagId: "t-seo" },
    { id: "3", bubbleId: "b", tagId: "t-seo" },
  ];
  return w;
}

test("queue follows tab outcomes, filter text, group names, and the selection", () => {
  const w = fixture();
  const ids = (list: { id: string }[]) => list.map((b) => b.id);
  assert.deepEqual(ids(triageQueue(w, { tab: "todo", filter: emptyTriageFilter })), ["a"]);
  assert.deepEqual(ids(triageQueue(w, { tab: "done", filter: emptyTriageFilter })), ["b"]);
  assert.deepEqual(ids(triageQueue(w, { tab: "dropped", filter: emptyTriageFilter })), ["c"]);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...emptyTriageFilter, text: "seo" } })), ["a", "b"]);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: { ...emptyTriageFilter, text: "seo", hiddenTypeIds: ["topic"] } })), []);
  assert.deepEqual(ids(triageQueue(w, { tab: "all", filter: emptyTriageFilter, selection: new Set(["b", "c"]) })), ["b", "c"]);
});

test("graph visibility hides decided bookmarks and unmatched groups on request", () => {
  const w = fixture();
  const v = graphVisibility(w, { ...emptyTriageFilter, showDecided: false });
  assert.deepEqual(v.bubbleIds, ["a"]);
  assert.deepEqual(v.hiddenTagIds, []);
  const typed = graphVisibility(w, { ...emptyTriageFilter, text: "keywords" });
  assert.deepEqual(typed.bubbleIds, ["b"]);
  assert.deepEqual(typed.hiddenTagIds, ["t-pricing"]);
  assert.deepEqual(graphVisibility(w, { ...emptyTriageFilter, showDecided: false }, ["b"]).bubbleIds, ["a", "b"]);
});

test("clockwise ordering starts at 12 o'clock and sweeps right", () => {
  const at: Record<string, [number, number]> = { left: [-10, 0], top: [0, -10], bottom: [0, 10], right: [10, 0] };
  const items = Object.keys(at).map((id) => ({ id }));
  assert.deepEqual(clockwise(items, (id) => at[id]).map((i) => i.id), ["top", "right", "bottom", "left"]);
});

test("related bookmarks share a group; reasons match their group", () => {
  const w = fixture();
  assert.deepEqual([...relatedOf(w, "a")], [["b", ["t-seo"]]]);
  const a = w.bubbles[0];
  assert.equal(reasonFor(a, w.tags[0], w), "Concrete experiment.");
  assert.equal(reasonFor(a, w.tags[1], w), 'Refine to "SEO".');
});

test("copy templates fill fields and keep unknown placeholders", () => {
  const w = fixture();
  const [a, b] = w.bubbles;
  assert.equal(formatCopy([a, b], w, "{n}. [{title}]({url}) {domain}", "\n"), "1. [Price test](https://www.example.com/a) example.com\n2. [Keywords](https://b.dev/x) b.dev");
  assert.equal(formatCopy([a], w, "{issues} | {topics} | {status} | {description} | {nope}", ""), "#143 Pricing | SEO | Pending | A pricing experiment | {nope}");
});
