import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { makeBackup, prepareRestore } from "../src/domain/backup";
import { guessMapping, parseImport, previewImport } from "../src/domain/imports";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";

test("a backup round-trips a multi-megabyte local attachment", async () => {
  const workspace = demoWorkspace();
  const bytes = new Uint8Array(4 * 1024 * 1024).fill(0xab);
  const media = {
    id: "video", workspaceId: workspace.id, filename: "video.mp4", mime: "video/mp4",
    blob: new Blob([bytes], { type: "video/mp4" }),
  };
  workspace.bookmarks[0].asset = { kind: "video", source: "local", blobId: media.id, filename: media.filename };
  const restored = prepareRestore(await makeBackup(workspace, [media]));
  assert.equal(restored.workspace.bookmarks[0].asset?.blobId, restored.media[0].id);
  assert.deepEqual(new Uint8Array(await restored.media[0].blob.arrayBuffer()), bytes);
});

test("media validation still rejects malformed base64 blocks, padding and characters", async () => {
  const workspace = demoWorkspace();
  const backup = await makeBackup(workspace, []);
  for (const base64 of ["A", "AA", "AAA", "A===", "=AAA", "AA=A", "AAAA==", "AAA!", "AAA\n"]) {
    backup.media = [{ id: "file", filename: "file", mime: "application/octet-stream", base64 }];
    assert.throws(() => prepareRestore(backup), /Invalid media encoding/, JSON.stringify(base64));
  }
});

test("download omits images held only by local Undo and still accepts older backups with extra media", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  try {
    await store.create(w);
    const bookmark = w.bookmarks[0];
    const thumbnail = { blobId: "old-cover", source: "cover" as const, sourceUrl: "https://example.com/old.png", capturedAt: bookmark.createdAt };
    await store.setThumbnail(w.id, bookmark.id, thumbnail, { mime: "image/png", blob: new Blob(["old image"]) });
    const edited = await store.command(w.id, w.revision, { type: "bookmark.patch", id: bookmark.id,
      expectedRecordRevision: bookmark.revision, patch: { url: "https://example.com/replacement" } });
    const backup = await store.backup(w.id);
    assert.deepEqual(backup.media, []);
    const olderBackup = { ...backup, media: [{ id: "unused", filename: "old.png", mime: "image/png", base64: "eA==" }] };
    const other = await store.restore(olderBackup);
    assert.deepEqual((await store.backup(other.id)).media, []);
    const undone = await store.undoLast(w.id, edited.revision, (await store.nextUndo(w.id))!.id);
    assert.deepEqual(undone.bookmarks[0].thumbnail, thumbnail);
    assert.equal(await (await store.media(thumbnail.blobId))!.blob.text(), "old image");
    assert.deepEqual((await store.backup(w.id)).media.map((m) => m.id), [thumbnail.blobId]);
  } finally { await store.close(); }
});

test("a portable import undo retains the local media and thumbnail it must restore", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  try {
    await store.create(w);
    const bookmark = w.bookmarks[0];
    const asset = { source: "local" as const, kind: "image" as const, blobId: "original", filename: "original.png" };
    const attached = await store.attachMedia(w.id, w.revision,
      [{ bookmarkId: bookmark.id, expectedRecordRevision: bookmark.revision, asset }],
      [{ id: asset.blobId, filename: asset.filename, mime: "image/png", blob: new Blob(["original image"]) }]);
    await store.setThumbnail(w.id, bookmark.id,
      { blobId: "capture", source: "cover", sourceUrl: "https://example.com/capture", capturedAt: bookmark.createdAt },
      { mime: "image/png", blob: new Blob(["captured image"]) });
    const parsed = parseImport(`url,mediaUrl\n${bookmark.url},https://example.com/new.jpg`, "csv");
    const preview = previewImport(parsed, guessMapping(parsed.headers), attached, { delimiter: "|", commonTags: "", initialStatus: "Pending" });
    await store.import(w.id, { type: "import.commit", expectedRevision: attached.revision, source: "Replacement", preview,
      decisions: [{ row: preview.candidates[0].row, action: "merge" }], statusMapping: {}, typeMapping: {} });
    const backup = await store.backup(w.id);
    assert.deepEqual(backup.media.map((m) => m.id).sort(), ["capture", "original"]);
    const restored = await store.restore(backup);
    const undone = await store.undo(restored.id, restored.revision, restored.batches[0].id, []);
    const original = undone.bookmarks[0];
    assert.equal(await (await store.media(original.asset!.blobId!))!.blob.text(), "original image");
    assert.ok(original.thumbnail && "blobId" in original.thumbnail);
    assert.equal(await (await store.media(original.thumbnail.blobId))!.blob.text(), "captured image");
  } finally { await store.close(); }
});
