import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { parseImport, guessMapping, previewImport } from "../src/domain/imports";
import { commitImport } from "../src/domain/import-commands";
import { applyCommand } from "../src/domain/commands";
import { emptyWorkspace, type Workspace } from "../src/domain/model";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";
import { AgentReviewSession } from "../src/domain/agent-review";

const options = { delimiter: "|", commonTags: "", initialStatus: "Pending" };

test("same-line HTML links have distinct decision IDs and retain their physical lines", () => {
  const parsed = parseImport('<DL><DT><H3>Research</H3><DL><DT><A HREF="https://example.com/a">A</A><DT><A HREF="https://example.com/b">B</A>\n<DT><A HREF="https://example.com/c">C</A></DL></DL>', "html");
  assert.deepEqual(parsed.rows.map((r) => r.row), [1, 2, 3]);
  assert.deepEqual(parsed.rows.map((r) => r.sourceLine), [1, 1, 2]);
  const w = emptyWorkspace(), preview = previewImport(parsed, guessMapping(parsed.headers), w, options);
  assert.deepEqual(preview.candidates.map((c) => c.sourceLine), [1, 1, 2]);
  const saved = commitImport(w, { type: "import.commit", expectedRevision: w.revision, preview,
    decisions: preview.candidates.map((c) => ({ row: c.row, action: "keep" })), statusMapping: {}, typeMapping: {}, source: "HTML" });
  assert.deepEqual(saved.bookmarks.map((b) => b.title), ["A", "B", "C"]);
  assert.equal(saved.memberships.length, 3);
});

test("same-line HTML duplicates can merge with the unique earlier decision", () => {
  const parsed = parseImport('<DL><DT><A HREF="https://example.com/same">A</A><DT><A HREF="https://example.com/same">B</A></DL>', "html");
  const w = emptyWorkspace(), preview = previewImport(parsed, guessMapping(parsed.headers), w, options);
  assert.equal(preview.candidates[1].duplicate?.row, 1);
  const saved = commitImport(w, { type: "import.commit", expectedRevision: 0, preview,
    decisions: [{ row: 1, action: "keep" }, { row: 2, action: "merge" }], statusMapping: {}, typeMapping: {}, source: "HTML" });
  assert.equal(saved.bookmarks.length, 1); assert.equal(saved.bookmarks[0].title, "B");
});

test("restores reject non-text rendering fields atomically", async () => {
  const w = demoWorkspace(), store = new WorkspaceStore(crypto.randomUUID()); await store.create(w);
  try {
    const backup = await store.backup(w.id);
    backup.media.push({ id: "local", filename: "valid.png", mime: "image/png", base64: "aW1hZ2U=" });
    const corruptions: Array<(w: Workspace) => void> = [
      (w) => { w.tags[0].description = 42 as unknown as string; },
      (w) => { w.tags[0].description = {} as string; },
      (w) => { w.tags[0].appearance.icon = 42 as unknown as string; },
      (w) => { w.tagTypes[0].name = {} as string; },
      (w) => { w.statuses[0].label = {} as string; },
      (w) => { w.views.push({ id: "bad", name: {} as string, sort: "title", hiddenTagIds: [], filter: { op: "all", rules: [] } }); },
      (w) => { w.bookmarks[0].asset = { kind: "image", source: "local", blobId: "local", filename: {} as string }; },
      (w) => { w.bookmarks[0].asset = { kind: "image", source: "remote", url: ["https://example.com/image.png"] as unknown as string }; },
      (w) => { w.bookmarks[0].createdAt = ["2026-10-31"] as unknown as string; },
      (w) => { w.bookmarks[0].updatedAt = 1 as unknown as string; },
    ];
    for (const corrupt of corruptions) {
      const bad = structuredClone(backup); corrupt(bad.workspace);
      assert.throws(() => parseImport(JSON.stringify(bad), "json"), /Invalid workspace/);
      await assert.rejects(store.restore(bad), /Invalid workspace/);
      assert.deepEqual(await store.list(), [w]);
      assert.equal(await store.nextUndo(w.id), undefined);
    }
    const legacy = structuredClone(backup);
    legacy.workspace.tags[0].description = null as unknown as string;
    legacy.workspace.tags[0].appearance.icon = null as unknown as string;
    const restored = await store.restore(legacy);
    assert.equal(restored.schemaVersion, 2); assert.equal(restored.bookmarks.length, w.bookmarks.length);
  } finally { await store.close(); }
});

test("creation recognizes renamed built-in To triage without introducing a custom default policy", () => {
  const w = emptyWorkspace(); w.statuses[0].label = "Inbox";
  const saved = applyCommand(w, 0, { type: "bookmark.create", url: "https://example.com/manual" });
  assert.equal(saved.bookmarks[0].statusId, "pending");
  const explicit = applyCommand(w, 0, { type: "bookmark.create", url: "https://example.com/done", statusId: "done" });
  assert.equal(explicit.bookmarks[0].statusId, "done");
  const session = new AgentReviewSession();
  const staged = session.submit({ requestId: "renamed-default", collectionId: w.id, expectedRevision: 0,
    changes: [{ kind: "create", url: "https://example.com/agent" }] }, w);
  assert.equal(staged.preview.bookmarks[0].statusId, "pending");
  const custom = structuredClone(w); custom.statuses[0].id = "custom-inbox";
  assert.throws(() => applyCommand(custom, 0, { type: "bookmark.create", url: "https://example.com/custom" }), /Pending default/);
  const closedDefault = structuredClone(w); closedDefault.statuses[0].outcome = "completed";
  assert.throws(() => applyCommand(closedDefault, 0, { type: "bookmark.create", url: "https://example.com/closed" }), /Pending default/);
});
