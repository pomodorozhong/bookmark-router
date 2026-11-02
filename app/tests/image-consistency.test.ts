import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { WorkspaceStore } from "../src/domain/storage";
import { demoWorkspace } from "../src/domain/samples";
import { displayImage, findThumbnail } from "../src/domain/thumbnails";
import { filterBookmarks } from "../src/domain/filters";
import { parseImport, guessMapping, previewImport } from "../src/domain/imports";
import { AgentReviewSession } from "../src/domain/agent-review";
import { createAgentTools } from "../src/agent/webmcp";
import type { Thumbnail } from "../src/domain/model";

const captured = (blobId: string): Thumbnail => ({ blobId, source: "cover", sourceUrl: `https://example.com/${blobId}.jpg`, capturedAt: "2026-10-31T00:00:00Z" });
const image = (text: string) => ({ mime: "image/webp", blob: new Blob([text], { type: "image/webp" }) });

test("source edits discard obsolete captures and Undo restores the source-correct offline image", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  b.asset = { kind: "image", source: "remote", url: "https://example.com/old.jpg" };
  await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, b.id, captured("old"), image("old bytes"));
    saved = await store.command(w.id, saved.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: saved.bookmarks[0].revision,
      patch: { asset: { kind: "image", source: "remote", url: "https://example.com/new.jpg" } } });
    assert.equal(saved.bookmarks[0].thumbnail, undefined);
    assert.deepEqual(displayImage(saved.bookmarks[0]), { url: "https://example.com/new.jpg" });
    const undo = (await store.nextUndo(w.id))!;
    saved = await store.setThumbnail(w.id, b.id, captured("new"), image("new bytes"));
    saved = await store.undoLast(w.id, saved.revision, undo.id);
    assert.deepEqual(saved.bookmarks[0].thumbnail, captured("old"));
    assert.equal(await (await store.media("old"))!.blob.text(), "old bytes");
    const restored = await store.restore(await store.backup(w.id));
    const thumb = restored.bookmarks[0].thumbnail!;
    assert.ok("blobId" in thumb);
    assert.equal(await (await store.media(thumb.blobId))!.blob.text(), "old bytes");
    await assert.rejects(store.setThumbnail(w.id, b.id, captured("stale"), image("stale"), { url: b.url, asset: { kind: "image", source: "remote", url: "https://example.com/new.jpg" } }), /changed during/);
  } finally { await store.close(); }
});

test("URL changes clear failed lookups but unrelated edits keep current captures", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, b.id, { failedAt: "2026-10-31T00:00:00Z" });
    saved = await store.command(w.id, saved.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: b.revision, patch: { url: "https://example.com/corrected" } });
    assert.equal(saved.bookmarks[0].thumbnail, undefined);
    saved = await store.setThumbnail(w.id, b.id, captured("corrected"), image("corrected"));
    saved = await store.command(w.id, saved.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: saved.bookmarks[0].revision, patch: { description: "Updated notes" } });
    assert.deepEqual(saved.bookmarks[0].thumbnail, captured("corrected"));
  } finally { await store.close(); }
});

test("an approved agent image replacement wins over a stored thumbnail and is one source-correct Undo", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0]; await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, b.id, captured("agent-before"), image("before"));
    const session = new AgentReviewSession();
    const p = session.submit({ requestId: "image", collectionId: w.id, expectedRevision: saved.revision, changes: [{ kind: "update", bookmarkId: b.id,
      expectedRecordRevision: b.revision, patch: { asset: { kind: "image", source: "remote", url: "https://example.com/approved.jpg" } } }] }, saved);
    session.setBatchTag(p.id, false);
    saved = await session.apply(p.id, saved, store.command.bind(store));
    assert.deepEqual(displayImage(saved.bookmarks[0]), { url: "https://example.com/approved.jpg" });
    saved = await store.undoLast(w.id, saved.revision, (await store.nextUndo(w.id))!.id);
    assert.deepEqual(displayImage(saved.bookmarks[0]), { blobId: "agent-before", icon: false });
  } finally { await store.close(); }
});

test("import image replacement, retries and restored import Undo retain the previous image bytes", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  b.asset = { kind: "image", source: "remote", url: "https://example.com/original.jpg" }; await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, b.id, captured("import-before"), image("original image"));
    const parsed = parseImport(`title,url,image\nReplacement,${b.url},https://example.com/imported.jpg`, "csv");
    const preview = previewImport(parsed, guessMapping(parsed.headers), saved, { delimiter: "|", commonTags: "", initialStatus: "Pending" });
    saved = await store.import(w.id, { type: "import.commit", expectedRevision: saved.revision, preview, decisions: [{ row: 2, action: "merge" }], statusMapping: {}, typeMapping: {}, source: "Images" });
    assert.deepEqual(displayImage(saved.bookmarks[0]), { url: "https://example.com/imported.jpg" });
    saved = await store.setThumbnail(w.id, b.id, captured("import-first"), image("first capture"));
    saved = await store.setThumbnail(w.id, b.id, captured("import-second"), image("second capture"));
    assert.equal(await store.media("import-first"), undefined);
    const restored = await store.restore(await store.backup(w.id));
    const undone = await store.undo(restored.id, restored.revision, restored.batches.at(-1)!.id, []);
    const thumb = undone.bookmarks[0].thumbnail!;
    assert.ok("blobId" in thumb);
    assert.equal(await (await store.media(thumb.blobId))!.blob.text(), "original image");
    assert.deepEqual(undone.bookmarks[0].asset, b.asset);
  } finally { await store.close(); }
});

test("retrying a shared blob cannot delete an image needed by another bookmark's source Undo", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), [a, b] = w.bookmarks;
  a.thumbnail = b.thumbnail = captured("shared-history"); await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, a.id, captured("shared-history"), image("shared bytes"));
    saved = await store.command(w.id, saved.revision, { type: "bookmark.patch", id: a.id, expectedRecordRevision: a.revision, patch: { url: "https://example.com/changed-source" } });
    saved = await store.setThumbnail(w.id, b.id, captured("other-retry"), image("new"));
    assert.equal(await (await store.media("shared-history"))!.blob.text(), "shared bytes");
    saved = await store.undoLast(w.id, saved.revision, (await store.nextUndo(w.id))!.id);
    assert.deepEqual(saved.bookmarks[0].thumbnail, captured("shared-history"));
  } finally { await store.close(); }
});

test("thumbnail retries stay available in import history after content Undo and restore", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  await store.create(w);
  try {
    let saved = await store.setThumbnail(w.id, b.id, captured("history-old"), image("old bytes"));
    const parsed = parseImport(`title,url\nImported title,${b.url}`, "csv");
    const preview = previewImport(parsed, guessMapping(parsed.headers), saved, { delimiter: "|", commonTags: "", initialStatus: "Pending" });
    saved = await store.import(w.id, { type: "import.commit", expectedRevision: saved.revision, preview,
      decisions: [{ row: 2, action: "merge" }], statusMapping: {}, typeMapping: {}, source: "Title update" });
    saved = await store.command(w.id, saved.revision, { type: "bookmark.patch", id: b.id,
      expectedRecordRevision: saved.bookmarks[0].revision, patch: { description: "Later notes" } });
    saved = await store.setThumbnail(w.id, b.id, captured("history-new"), image("new bytes"));
    saved = await store.undoLast(w.id, saved.revision, (await store.nextUndo(w.id))!.id);
    const restored = await store.restore(await store.backup(w.id));
    const undone = await store.undo(restored.id, restored.revision, restored.batches.at(-1)!.id, []);
    const thumb = undone.bookmarks[0].thumbnail!;
    assert.ok("blobId" in thumb);
    assert.equal(await (await store.media(thumb.blobId))!.blob.text(), "new bytes");
    assert.equal(undone.bookmarks[0].title, b.title);
  } finally { await store.close(); }
});

test("stored image presence agrees between filters and existing agent missing-field reports", async () => {
  const w = demoWorkspace(); w.bookmarks.forEach((b) => { delete b.asset; });
  w.bookmarks[0].thumbnail = captured("stored"); w.bookmarks[1].thumbnail = { failedAt: "2026-10-31T00:00:00Z" };
  assert.deepEqual(filterBookmarks(w, { op: "asset", present: true, kind: "image" }).map((b) => b.id), [w.bookmarks[0].id]);
  assert.equal(filterBookmarks(w, { op: "asset", present: false, kind: "image" }).length, w.bookmarks.length - 1);
  const tools = createAgentTools({ session: new AgentReviewSession(), getWorkspace: async () => w });
  const result = JSON.parse(await tools.find((t) => t.name === "search_bookmarks")!.execute({ rules: [{ kind: "has", values: ["image"], not: false }] }));
  assert.equal(result.total, 1); assert.ok(!result.bookmarks[0].missingFields.includes("asset"));
  assert.equal(result.bookmarks[0].thumbnail, undefined);
});

test("a supplied image is captured before a site fallback can replace it", async () => {
  const b = demoWorkspace().bookmarks[0]; b.url = "https://youtu.be/dQw4w9WgXcQ";
  b.asset = { kind: "image", source: "remote", url: "https://example.com/chosen.jpg" };
  const calls: string[] = [];
  const result = await findThumbnail(b, { fetch: (async (url) => { calls.push(String(url)); return new Response(image("chosen").blob, { headers: { "content-type": "image/webp" } }); }) as typeof fetch,
    microlinkLeft: () => 25, microlinkUsed: () => assert.fail("No page lookup needed"), whenMicrolinkUsedUp: "skip" });
  assert.equal(result.kind, "found");
  if (result.kind === "found") assert.equal(result.thumbnail.source, "cover");
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0]).searchParams.get("url"), b.asset.url);
});
