import { test } from "node:test";
import assert from "node:assert/strict";
import { convertPrototype, type Prototype } from "../src/domain/prototype";
import { prepareRestore } from "../src/domain/backup";

const bookmark = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  original: { title: `Title ${id}`, note: "", excerpt: `Excerpt ${id}`, url: `https://example.com/${id}`, cover: "", tags: "indie-dev" },
  display_title: `Title ${id}`,
  url: `https://example.com/${id}`,
  classification: { proposed_category_id: "pricing", approved_category_id: null, reason: "Pricing topic." },
  triage: { suggested_next_action: "review" },
  ...extra,
});
const fixture: Prototype = {
  metadata: { title: "Tracker" },
  category_review: { categories: [{ id: "pricing", label: "Pricing", group: "Monetization" }] },
  issue_catalog: [{ number: 7, title: "Pricing", url: "https://github.com/o/r/issues/7", body_snapshot: "Study pricing." }],
  references_for_existing_issues: [
    { bookmark_id: "1", issue_number: 7, label: "Price test", reason: "Concrete experiment.", recommendation: "avoid_duplicate", presence: "reference_present" },
    { bookmark_id: "2", issue_number: 7, label: "Maybe", reason: "Related.", recommendation: "add_reference", presence: "not_observed_in_issue_snapshot" },
  ],
  bookmarks_worth_their_own_issues: [
    { id: "launch", title: "Launch plan", rationale: "Why.", questions: ["How?"], seed_bookmark_ids: ["2"], approved_seed_bookmark_ids: [] },
  ],
  duplicate_groups: [{ bookmark_ids: ["1", "2"], proposed_canonical_bookmark_id: "1", reason: "Same post." }],
  bookmarks: [
    bookmark("1", { original: { title: "One", note: "My note", excerpt: "Ex", url: "https://example.com/1", cover: "https://example.com/1.png", tags: "" } }),
    bookmark("2", { display_title: "", source_review: { historical_link_check: { status: "not_found", note: "404.", observed_on: "2026-09-12" } } }),
  ],
  node_progress: { "bookmark:1": "done", "issue:7": "done", "topic:pricing": "dropped" },
};

test("prototype conversion keeps decisions as memberships and suggestions as notes", () => {
  const { workspace: w } = convertPrototype(fixture, "2026-10-11T00:00:00.000Z");
  const pairs = w.memberships.map((m) => `${m.bubbleId}>${m.tagId}`).sort();
  assert.deepEqual(pairs, ["bookmark:1>issue:7", "bookmark:1>topic:pricing", "bookmark:2>topic:pricing"]);
  const [one, two] = w.bubbles;
  assert.equal(one.statusId, "done");
  assert.equal(two.statusId, "pending");
  assert.equal(one.description, "My note\n\nEx");
  assert.deepEqual(one.asset, { kind: "image", source: "remote", url: "https://example.com/1.png" });
  assert.equal(two.title, "https://example.com/2");
  assert.equal(two.missingTitle, true);
  assert.equal(two.source?.fields.tags, "indie-dev");
  const labels = two.notes!.map((n) => n.label);
  assert.ok(labels.includes("Suggested for #7"));
  assert.ok(labels.includes("Suggested for proposed idea"));
  assert.ok(labels.includes("Link check: Not found"));
  assert.ok(labels.includes("Possible duplicate (keep the other)"));
  assert.ok(!labels.some((l) => l.startsWith("Suggested next")));
  assert.equal(w.tags.find((t) => t.id === "topic:pricing")!.statusId, "dropped");
  assert.equal(w.tags.find((t) => t.id === "proposal:launch")!.typeId, "type:proposed-idea");
});

test("converted backup restores", () => {
  const restored = prepareRestore(convertPrototype(fixture, "2026-10-11T00:00:00.000Z"));
  assert.equal(restored.workspace.bubbles.length, 2);
  assert.equal(restored.workspace.bubbles[1].notes?.length, 5);
});
