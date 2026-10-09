import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { emptyWorkspace } from "../src/domain/model";
import {
  parseImport,
  guessMapping,
  previewImport,
  type ImportCommitCommand,
} from "../src/domain/imports";
import {
  commitImport,
  undoImport,
  undoConflicts,
} from "../src/domain/import-commands";
import { applyCommand } from "../src/domain/commands";
import { WorkspaceStore } from "../src/domain/storage";
import { makeBackup, prepareRestore } from "../src/domain/backup";
function command(
  w = emptyWorkspace(),
  text = "title,url,description,tags,status,type\nFirst,https://example.com/1,Original,Reading,Pending,Topic\nSecond,https://example.com/2,Other,Reading,Pending,Topic",
): ImportCommitCommand {
  const p = parseImport(text, "csv");
  const preview = previewImport(p, guessMapping(p.headers), w, {
    delimiter: "|",
    commonTags: "",
    initialStatus: "Pending",
  });
  return {
    type: "import.commit",
    expectedRevision: w.revision,
    preview,
    decisions: preview.candidates.map((c) => ({ row: c.row, action: "keep" })),
    statusMapping: {},
    typeMapping: { Topic: "__create__" },
    source: "Fixture",
  };
}
test("import creates taxonomy and batch; undo preserves subsequent edits", () => {
  const w = emptyWorkspace();
  const imported = commitImport(w, command(w));
  assert.equal(w.bubbles.length, 0);
  assert.equal(imported.bubbles.length, 2);
  assert.equal(imported.tagTypes[0].name, "Topic");
  const b = imported.bubbles[0];
  const edited = applyCommand(imported, 1, {
    type: "bubble.patch",
    id: b.id,
    expectedRecordRevision: 0,
    patch: { description: "Later edit" },
  });
  const batch = edited.batches[0];
  assert.equal(undoConflicts(edited, batch).length, 1);
  assert.throws(() => undoImport(edited, 2, batch.id), /Changed records/);
  const undone = undoImport(edited, 2, batch.id, [b.id]);
  assert.equal(undone.bubbles.length, 1);
  assert.equal(undone.bubbles[0].description, "Later edit");
});
test("merge restores exact prior values and memberships on undo", () => {
  let w = emptyWorkspace();
  w = commitImport(w, command(w));
  const prior = structuredClone(w.bubbles[0]);
  const c = command(
    w,
    "title,url,description,tags,status,type\nReplacement,https://example.com/1,Replaced,New,Done,Topic",
  );
  c.decisions[0].action = "merge";
  const merged = commitImport(w, c);
  assert.equal(merged.bubbles.length, 2);
  assert.equal(merged.bubbles[0].title, "Replacement");
  const undone = undoImport(merged, 2, merged.batches[1].id);
  assert.equal(undone.bubbles[0].title, prior.title);
  assert.equal(undone.bubbles[0].statusId, prior.statusId);
  assert.deepEqual(
    [...undone.memberships].sort((a, b) => a.id.localeCompare(b.id)),
    [...w.memberships].sort((a, b) => a.id.localeCompare(b.id)),
  );
});
test("unknown values and invalid rows reject atomically, stale or duplicate submission conflicts", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()),
    w = emptyWorkspace();
  await store.create(w);
  const c = command(w);
  c.typeMapping = {};
  await assert.rejects(store.import(w.id, c), /Map or create/);
  assert.equal((await store.get(w.id))!.bubbles.length, 0);
  const valid = command(w);
  await store.import(w.id, valid);
  await assert.rejects(store.import(w.id, valid), /changed/);
  assert.equal((await store.get(w.id))!.batches.length, 1);
  await store.close();
});
test("within-import merge requires included target and keeps one record", () => {
  const w = emptyWorkspace();
  const c = command(
    w,
    "title,url,description,tags,status,type\nFirst,https://example.com/1,,Reading,Pending,Topic\nSecond,https://example.com/1,Updated,Ideas,Done,Topic",
  );
  c.decisions[1].action = "merge";
  const result = commitImport(w, c);
  assert.equal(result.bubbles.length, 1);
  assert.equal(result.bubbles[0].title, "Second");
  c.decisions[0].action = "skip";
  assert.throws(() => commitImport(w, c), /target was skipped/);
});
test("membership edits are protected during import undo", () => {
  const w = emptyWorkspace();
  const added = commitImport(w, command(w));
  const edited = applyCommand(added, 1, {
    type: "membership.set",
    bubbleId: added.bubbles[0].id,
    tagId: added.tags[0].id,
    linked: false,
  });
  assert.equal(undoConflicts(edited, edited.batches[0]).length, 1);
});
test("backup roundtrip bundles media, remaps references, and keeps geometry and source", async () => {
  let w = emptyWorkspace();
  w = commitImport(w, command(w));
  w.bubbles[0].asset = {
    kind: "image",
    source: "local",
    blobId: "media",
    filename: "sample.png",
  };
  const geometry = {
    workspaceId: w.id,
    positions: { [w.bubbles[0].id]: { x: 10, y: 20, pinned: true } },
    viewport: { zoom: 1, x: 2, y: 3 },
  };
  const backup = await makeBackup(
    w,
    [
      {
        id: "media",
        workspaceId: w.id,
        filename: "sample.png",
        mime: "image/png",
        blob: new Blob(["fixture"]),
      },
    ],
    geometry,
  );
  const restored = prepareRestore(backup);
  assert.notEqual(restored.workspace.id, w.id);
  assert.notEqual(restored.workspace.bubbles[0].asset?.blobId, "media");
  assert.equal(await restored.media[0].blob.text(), "fixture");
  assert.equal(restored.geometry?.positions[w.bubbles[0].id].pinned, true);
  const store = new WorkspaceStore(crypto.randomUUID());
  await store.create(w);
  const newW = await store.restore(backup);
  assert.equal((await store.list()).length, 2);
  assert.equal(
    (await store.backup(newW.id)).media[0].base64,
    backup.media[0].base64,
  );
  await store.close();
});
test("backup rejects invalid encoding and missing undo snapshot media", async () => {
  const w = emptyWorkspace();
  const backup = await makeBackup(w, []);
  backup.media = [{ id: "x", filename: "x", mime: "image/png", base64: "!" }];
  assert.throws(() => prepareRestore(backup), /encoding/);
});
test("quota failure aborts an import without records or batch fragments", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()),
    w = emptyWorkspace();
  await store.create(w);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    throw new DOMException("Storage is full", "QuotaExceededError");
  };
  try {
    await assert.rejects(store.import(w.id, command(w)), /Storage is full/);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.equal((await store.get(w.id))!.revision, 0);
  assert.equal((await store.get(w.id))!.batches.length, 0);
  await store.close();
});
test("restore failure aborts content and media together", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()),
    w = emptyWorkspace();
  await store.create(w);
  const backup = await makeBackup(w, [
    {
      id: "m",
      workspaceId: w.id,
      filename: "x.png",
      mime: "image/png",
      blob: new Blob(["x"]),
    },
  ]);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (
    ...args: Parameters<IDBObjectStore["add"]>
  ) {
    if (this.name === "media")
      throw new DOMException("Storage is full", "QuotaExceededError");
    return add.apply(this, args);
  };
  try {
    await assert.rejects(store.restore(backup), /Storage is full/);
  } finally {
    IDBObjectStore.prototype.add = add;
  }
  assert.equal((await store.list()).length, 1);
  assert.deepEqual((await store.backup(w.id)).media, []);
  await store.close();
});
test("selected invalid rows reject the entire transaction", async () => {
  const w = emptyWorkspace(),
    store = new WorkspaceStore(crypto.randomUUID());
  await store.create(w);
  const c = command(
    w,
    "title,url,mediaUrl\nGood,https://example.com/good,\nBad,https://example.com/bad,javascript:alert(1)",
  );
  await assert.rejects(store.import(w.id, c), /invalid/);
  assert.equal((await store.get(w.id))!.bubbles.length, 0);
  c.decisions[1].action = "skip";
  assert.equal((await store.import(w.id, c)).bubbles.length, 1);
  await store.close();
});
test("undo snapshots require bundled local media even after asset replacement", async () => {
  let w = emptyWorkspace();
  w = commitImport(w, command(w));
  w.bubbles[0].asset = {
    source: "local",
    kind: "image",
    blobId: "previous",
    filename: "previous.png",
  };
  const c = command(
    w,
    "title,url,mediaUrl\nNew,https://example.com/1,https://example.com/new.png",
  );
  c.decisions[0].action = "merge";
  const merged = commitImport(w, c);
  await assert.rejects(makeBackup(merged, []), /missing local media/);
});
test("unrecognized URLs import, persist, deduplicate, merge and restore as text", async () => {
  const w = emptyWorkspace(),
    store = new WorkspaceStore(crypto.randomUUID());
  await store.create(w);
  const c = command(
    w,
    "title,url\nUnfinished,not-a-url\nUnsafe,javascript:alert(1)",
  );
  assert.ok(
    c.preview.candidates.every((c) => !c.errors.length && c.urlWarning),
  );
  const added = await store.import(w.id, c);
  assert.equal((await store.get(w.id))!.bubbles[0].url, "not-a-url");
  const duplicate = command(added, "title,url\nFixed title,not-a-url");
  assert.equal(duplicate.preview.candidates[0].duplicate?.kind, "workspace");
  duplicate.decisions[0].action = "merge";
  const merged = await store.import(w.id, duplicate);
  assert.equal(merged.bubbles.length, 2);
  const restored = await store.restore(await store.backup(w.id));
  assert.equal(restored.bubbles[0].url, "not-a-url");
  assert.equal(restored.bubbles[1].url, "javascript:alert(1)");
  await store.close();
});
