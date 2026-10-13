import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { demoWorkspace } from "../src/domain/samples";
import { currentQuota, displayImage, findThumbnail, githubImage, nextQuotaDay, repairImageUrl, thumbnailServices, wsrv, youtubeId, type LookupDeps } from "../src/domain/thumbnails";
import { WorkspaceStore } from "../src/domain/storage";
import { guessMapping, parseImport, previewImport } from "../src/domain/imports";
import { validateWorkspace, type Bookmark, type Thumbnail } from "../src/domain/model";

const image = () => new Response(new Blob(["image bytes"], { type: "image/webp" }), { headers: { "content-type": "image/webp" } });
const json = (value: unknown, status = 200, headers?: Record<string, string>) => Response.json(value, { status, headers });
function bookmark(url = "https://example.com/article"): Bookmark {
  return { ...demoWorkspace().bookmarks[0], url, asset: undefined };
}
function deps(fetcher: (url: string) => Promise<Response> | Response, changes: Partial<LookupDeps> = {}): LookupDeps {
  return { fetch: ((input) => Promise.resolve(fetcher(String(input)))) as typeof fetch,
    microlinkLeft: () => 25, microlinkUsed: () => {}, whenMicrolinkUsedUp: "skip", ...changes };
}
const captured = (blobId: string): Thumbnail => ({ blobId, source: "cover", sourceUrl: "https://example.com/cover.png", capturedAt: "2026-10-14T00:00:00Z" });

test("URL rules accept supported hosts and double-encode screenshot URLs", () => {
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), undefined);
  assert.equal(githubImage("https://github.com/owner/repo/issues/3"), "https://opengraph.githubassets.com/1/owner/repo/issues/3");
  assert.equal(repairImageUrl("https://boyney.iohttps//images.unsplash.com/photo"), "https://images.unsplash.com/photo");
  const src = "https://rdl.ink/render/https%3A%2F%2Fexample.com%2F";
  assert.equal(new URL(wsrv(src)).searchParams.get("url"), src);
  assert.ok(thumbnailServices(bookmark()).some((s) => s.service === "DuckDuckGo"));
});

test("X recovers the current avatar without spending a Microlink lookup", async () => {
  const calls: string[] = [];
  const result = await findThumbnail(bookmark("https://twitter.com/author/status/123"), deps((url) => {
    calls.push(url);
    if (url.includes("api.fxtwitter.com")) return json({ status: { author: { avatar_url: "https://pbs.twimg.com/current.jpg" } } });
    return image();
  }, { microlinkUsed: () => assert.fail("X shouldn't use Microlink") }));
  assert.equal(result.kind, "found");
  if (result.kind === "found") assert.equal(result.thumbnail.source, "fxtwitter");
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get("url"), "https://pbs.twimg.com/current.jpg");
});

test("a 404 image placeholder is rejected, then an expired cover falls through to Microlink", async () => {
  const b = bookmark("https://youtube.com/watch?v=dQw4w9WgXcQ");
  b.asset = { source: "remote", kind: "image", url: "https://cdn.example.com/expired.jpg" };
  let used = 0;
  const result = await findThumbnail(b, deps((url) => {
    if (url.includes("api.microlink")) return json({ status: "success", data: { image: { url: "https://example.com/fresh.jpg" } } });
    const source = new URL(url).searchParams.get("url")!;
    if (source.includes("i.ytimg.com")) return new Response("placeholder", { status: 404, headers: { "content-type": "image/jpeg" } });
    if (source.includes("expired")) return json({ message: "The requested URL returned error: 403" }, 404);
    return image();
  }, { microlinkUsed: () => used++ }));
  assert.equal(result.kind, "found");
  if (result.kind === "found") assert.equal(result.thumbnail.source, "microlink");
  assert.equal(used, 1);
  assert.equal(b.asset.url, "https://cdn.example.com/expired.jpg");
});

test("bulk lookup waits at the daily limit; individual lookup can continue to screenshot", async () => {
  const calls: string[] = [];
  const d = deps((url) => { calls.push(url); return image(); }, { microlinkLeft: () => 0, whenMicrolinkUsedUp: "wait" });
  const result = await findThumbnail(bookmark(), d);
  assert.equal(result.kind, "waiting");
  assert.equal(calls.length, 0);
  const manual = await findThumbnail(bookmark(), { ...d, whenMicrolinkUsedUp: "skip" });
  assert.equal(manual.kind, "found");
  if (manual.kind === "found") assert.equal(manual.thumbnail.source, "screenshot");
});

test("a Microlink 429 pauses bulk lookup instead of storing a permanent fallback", async () => {
  let left = 1, calls = 0;
  const result = await findThumbnail(bookmark(), deps(() => { calls++; return json({ status: "fail" }, 429); }, {
    microlinkLeft: () => left, microlinkUsed: (remaining) => { left = remaining!; }, whenMicrolinkUsedUp: "wait",
  }));
  assert.equal(result.kind, "waiting");
  assert.equal(left, 0);
  assert.equal(calls, 1);
});

test("a cached Microlink result reports the service quota and does not force another charge", async () => {
  let recorded: unknown;
  await findThumbnail(bookmark(), deps((url) => url.includes("api.microlink")
    ? json({ status: "success", data: { image: { url: "https://example.com/fresh.jpg" } } }, 200, { "x-rate-limit-remaining": "18", "x-cache-status": "HIT" }) : image(),
  { microlinkUsed: (left, cached) => { recorded = { left, cached }; } }));
  assert.deepEqual(recorded, { left: 18, cached: true });
});

test("GitHub rate limits persist a cooldown and cancellation prevents further services", async () => {
  let retryAt = 0;
  const d = deps(() => json({ message: "The requested URL returned error: 429" }, 404), {
    githubLimited: (time) => { retryAt = time; }, githubRetryAt: () => retryAt, whenMicrolinkUsedUp: "wait",
  });
  assert.equal((await findThumbnail(bookmark("https://github.com/owner/repo"), d)).kind, "waiting");
  assert.ok(retryAt >= Date.now() + 14 * 60_000);
  assert.equal((await findThumbnail(bookmark("https://github.com/owner/repo"), { ...d, fetch: (() => assert.fail("cooldown")) as typeof fetch })).kind, "waiting");
  const controller = new AbortController();
  await assert.rejects(findThumbnail(bookmark(), deps(() => { controller.abort(); throw controller.signal.reason; }, { signal: controller.signal })), { name: "AbortError" });
});

test("rate limits in site rules and screenshot fallback never become permanent failures", async () => {
  for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://x.com/author/status/123", "https://example.com/article"]) {
    let calls = 0;
    const result = await findThumbnail(bookmark(url), deps(() => { calls++; return json({}, 429); }, { microlinkLeft: () => 0 }));
    assert.equal(result.kind, "waiting");
    assert.equal(calls, 1);
  }
  const result = await findThumbnail(bookmark(), deps((url) => {
    const source = new URL(url).searchParams.get("url")!;
    return json({ message: `The requested URL returned error: ${source.includes("duckduckgo") ? 429 : 404}` }, 404);
  }, { microlinkLeft: () => 0 }));
  assert.equal(result.kind, "waiting");
});

test("quota resets at the UTC day boundary and malformed saved counts are clamped", () => {
  const now = new Date("2026-10-14T23:59:59Z");
  assert.equal(currentQuota({ day: "2026-10-13", left: 0 }, now).left, 25);
  assert.equal(currentQuota({ day: "2026-10-14", left: -1 }, now).left, 0);
  assert.equal(currentQuota({ day: "2026-10-14", left: 100 }, now).left, 25);
  assert.equal(new Date(nextQuotaDay(now)).toISOString(), "2026-10-15T00:00:00.000Z");
});

test("thumbnail capture, retry, Undo, and backup restore preserve edits and image bytes", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  b.asset = { source: "remote", kind: "image", url: "https://example.com/imported.jpg" };
  await store.create(w);
  const edited = await store.command(w.id, w.revision, { type: "bookmark.patch", id: b.id, expectedRecordRevision: b.revision, patch: { title: "Edited title" } });
  const undo = await store.nextUndo(w.id);
  const stored = await store.setThumbnail(w.id, b.id, captured("first"), { mime: "image/webp", blob: new Blob(["first"], { type: "image/webp" }) });
  assert.equal(stored.revision, edited.revision);
  assert.equal(stored.bookmarks[0].revision, edited.bookmarks[0].revision);
  assert.deepEqual(await store.nextUndo(w.id), undo);
  await store.setThumbnail(w.id, b.id, { failedAt: "2026-10-14T00:00:00Z" });
  assert.deepEqual((await store.get(w.id))!.bookmarks[0].thumbnail, captured("first"));
  await store.setThumbnail(w.id, b.id, captured("second"), { mime: "image/webp", blob: new Blob(["second"], { type: "image/webp" }) });
  assert.equal(await store.media("first"), undefined);
  const restoredEdit = await store.undoLast(w.id, stored.revision, undo!.id);
  assert.equal(restoredEdit.bookmarks[0].title, b.title);
  assert.deepEqual(restoredEdit.bookmarks[0].thumbnail, captured("second"));
  const backup = await store.backup(w.id), restored = await store.restore(backup);
  const thumb = restored.bookmarks[0].thumbnail!;
  assert.ok("blobId" in thumb);
  assert.notEqual(thumb.blobId, "second");
  assert.equal(await (await store.media(thumb.blobId))!.blob.text(), "second");
  assert.deepEqual(restored.bookmarks[0].asset, b.asset);
  assert.deepEqual(displayImage(restored.bookmarks[0]), { blobId: thumb.blobId, icon: false });
  backup.media = [];
  assert.throws(() => parseImport(JSON.stringify(backup), "json"), /missing the thumbnail/);
  await store.close();
});

test("thumbnail writes roll back on quota failure and reject a changed URL", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  await store.create(w);
  await store.setThumbnail(w.id, b.id, captured("original"), { mime: "image/webp", blob: new Blob(["original"]) });
  await assert.rejects(store.setThumbnail(w.id, b.id, captured("new"), { mime: "image/webp", blob: new Blob(["new"]) }, { url: "https://changed.test" }), /changed during/);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
    if (this.name === "media") throw new DOMException("Storage is full", "QuotaExceededError");
    return put.apply(this, args);
  };
  try { await assert.rejects(store.setThumbnail(w.id, b.id, captured("new"), { mime: "image/webp", blob: new Blob(["new"]) }), /Storage is full/); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal(await (await store.media("original"))!.blob.text(), "original");
  assert.equal(await store.media("new"), undefined);
  assert.deepEqual((await store.get(w.id))!.bookmarks[0].thumbnail, captured("original"));
  await store.close();
});

test("attached images win and malformed thumbnails cannot enter a workspace", () => {
  const w = demoWorkspace(), b = w.bookmarks[0];
  b.thumbnail = captured("thumb");
  b.asset = { source: "local", kind: "image", blobId: "attached", filename: "image.png" };
  assert.deepEqual(displayImage(b), { blobId: "attached" });
  for (const invalid of [null, "text", { blobId: "thumb", failedAt: "2026-10-14T00:00:00Z" }, { failedAt: "invalid" }]) {
    b.thumbnail = invalid as Thumbnail;
    assert.throws(() => validateWorkspace(w), /invalid thumbnail/);
  }
});

test("an import merge and its Undo keep the current thumbnail without a stale backup reference", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace(), b = w.bookmarks[0];
  b.url = "https://example.com/article";
  await store.create(w);
  let current = await store.setThumbnail(w.id, b.id, captured("first"), { mime: "image/webp", blob: new Blob(["first"]) });
  const parsed = parseImport("title,url\nReplacement,https://example.com/article", "csv");
  const preview = previewImport(parsed, guessMapping(parsed.headers), current, { delimiter: "|", commonTags: "", initialStatus: "Pending" });
  current = await store.import(w.id, { type: "import.commit", expectedRevision: current.revision, preview,
    decisions: preview.candidates.map((candidate) => ({ row: candidate.row, action: "merge" })), statusMapping: {}, typeMapping: {}, source: "Fixture" });
  assert.equal(current.batches.at(-1)!.beforeMerged[0].thumbnail, undefined);
  current = await store.setThumbnail(w.id, b.id, captured("second"), { mime: "image/webp", blob: new Blob(["second"]) });
  assert.equal(await store.media("first"), undefined);
  await store.backup(w.id);
  const undone = await store.undo(w.id, current.revision, current.batches.at(-1)!.id, []);
  assert.equal(undone.bookmarks[0].title, b.title);
  assert.deepEqual(undone.bookmarks[0].thumbnail, captured("second"));
  await store.close();
});

test("retry keeps media shared by another bookmark in a restored collection", async () => {
  const store = new WorkspaceStore(crypto.randomUUID()), w = demoWorkspace();
  w.bookmarks[0].thumbnail = w.bookmarks[1].thumbnail = captured("shared");
  await store.create(w);
  await store.setThumbnail(w.id, w.bookmarks[0].id, captured("shared"), { mime: "image/webp", blob: new Blob(["shared"]) });
  await store.setThumbnail(w.id, w.bookmarks[0].id, captured("new"), { mime: "image/webp", blob: new Blob(["new"]) });
  assert.equal(await (await store.media("shared"))!.blob.text(), "shared");
  await store.backup(w.id);
  await store.close();
});
