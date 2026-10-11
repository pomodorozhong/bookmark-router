import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { applyCommand } from "../src/domain/commands";
import { builtInCopyPresets, composeCopy } from "../src/domain/copy";
import { distanceMatches, filterBubbles, pathSummary } from "../src/domain/filters";
import { demoWorkspace } from "../src/domain/samples";
import { WorkspaceStore } from "../src/domain/storage";

test("nested filters and same-tag predicates use the shared match pipeline", () => {
  const workspace = demoWorkspace();
  const filter = {
    op: "all" as const,
    rules: [
      {
        op: "any" as const,
        rules: [
          { op: "text" as const, value: "user interviews" },
          { op: "text" as const, value: "market notes" },
        ],
      },
      { op: "not" as const, rule: { op: "status" as const, ids: ["done"] } },
    ],
  };
  assert.deepEqual(filterBubbles(workspace, filter).map((bubble) => bubble.id), [
    "bubble-0",
    "bubble-1",
  ]);
  assert.deepEqual(
    filterBubbles(workspace, { op: "same-tag", name: "Research" }).map(
      (bubble) => bubble.id,
    ),
    ["bubble-0", "bubble-1", "bubble-2", "bubble-3", "bubble-9"],
  );
});

test("distance filtering reports shortest paths across hidden-tag-capable full graph", () => {
  const workspace = demoWorkspace();
  const matches = distanceMatches(workspace, ["tag-0"]);
  const distant = matches.get("bubble-6");
  assert.equal(distant?.distance, 3);
  assert.equal(pathSummary(distant!.path, workspace), "Research → Useful tools → Ideas → Prototype notes");
  assert.ok(filterBubbles(workspace, { op: "distance", tagIds: ["tag-0"], hops: 3 }).some((bubble) => bubble.id === "bubble-6"));
});

test("copy output is exact and local media uses a filename", () => {
  const workspace = demoWorkspace();
  workspace.bubbles[0].asset = {
    source: "local",
    kind: "image",
    blobId: "blob-0",
    filename: "notes.png",
  };
  const output = composeCopy([workspace.bubbles[0]], workspace, {
    fields: ["title", "assetUrl", "status", "tags"],
    separator: " | ",
    format: "plain",
    sort: "title",
  });
  assert.equal(output, "User interviews | notes.png | Pending | Research");
  assert.doesNotMatch(output, /blob:|blob-0/);
  const markdown = composeCopy([workspace.bubbles[0]], workspace, {
    fields: ["title", "url"],
    separator: "\n",
    format: "markdown",
    template: "{{title}}\n{{url}}",
    sort: "title",
  });
  assert.equal(markdown, "User interviews\nhttps://example.com/0");
});

test("copy composer exposes useful quick presets", () => {
  assert.deepEqual(
    builtInCopyPresets.map((preset) => preset.name),
    ["Default", "Link only", "Title only", "Title + link", "Markdown links"],
  );
  assert.deepEqual(builtInCopyPresets.find((preset) => preset.name === "Link only")?.fields, ["url"]);
  assert.deepEqual(builtInCopyPresets.find((preset) => preset.name === "Title only")?.fields, ["title"]);
  const workspace = demoWorkspace();
  const markdown = builtInCopyPresets.find((preset) => preset.name === "Markdown links");
  assert.equal(markdown ? composeCopy([workspace.bubbles[0]], workspace, markdown) : "", "[User interviews](https://example.com/0)");
});

test("saved views, copy presets, and media attachments are revision-checked", () => {
  const workspace = demoWorkspace();
  const view = {
    id: "view-ready",
    name: "Ready",
    filter: { op: "status" as const, ids: ["pending"] },
    sort: "status" as const,
    hiddenTagIds: ["tag-2"],
  };
  const preset = {
    id: "preset-weekly",
    name: "Weekly",
    fields: ["title", "url"] as const,
    separator: "\n",
    format: "plain" as const,
    scope: "current" as const,
    sort: "title" as const,
  };
  const withView = applyCommand(workspace, 0, { type: "view.upsert", view });
  const withPreset = applyCommand(withView, 1, { type: "copy-preset.upsert", preset: { ...preset, fields: [...preset.fields] } });
  const withMedia = applyCommand(withPreset, 2, {
    type: "media.attach",
    assignments: [{
      bubbleId: "bubble-0",
      expectedRecordRevision: 0,
      asset: { source: "local", kind: "image", blobId: "media-0", filename: "cover.png" },
    }],
  });
  assert.equal(withMedia.views[0].name, "Ready");
  assert.equal(withMedia.settings.copyPresets?.[0].name, "Weekly");
  assert.equal(withMedia.bubbles[0].asset?.filename, "cover.png");
  assert.equal(withMedia.bubbles[0].revision, 1);
});

test("media uploads commit the workspace and blob in one IndexedDB transaction", async () => {
  const name = `stage-c-${crypto.randomUUID()}`;
  const store = new WorkspaceStore(name);
  const workspace = demoWorkspace();
  await store.create(workspace);
  const next = await store.attachMedia(
    workspace.id,
    workspace.revision,
    [{
      bubbleId: "bubble-0",
      expectedRecordRevision: 0,
      asset: { source: "local", kind: "audio", blobId: "audio-0", filename: "note.wav" },
    }],
    [{ id: "audio-0", filename: "note.wav", mime: "audio/wav", blob: new Blob(["audio"]) }],
  );
  assert.equal(next.bubbles[0].asset?.filename, "note.wav");
  assert.equal((await store.media("audio-0"))?.workspaceId, workspace.id);
  await store.close();
});

test("removing a collection deletes its positions and media but keeps other collections", async () => {
  const store = new WorkspaceStore(`stage-c-${crypto.randomUUID()}`);
  const doomed = demoWorkspace(), kept = { ...demoWorkspace(), id: "kept" };
  await store.create(doomed);
  await store.create(kept);
  await store.attachMedia(doomed.id, doomed.revision,
    [{ bubbleId: "bubble-0", expectedRecordRevision: 0, asset: { source: "local", kind: "audio", blobId: "audio-0", filename: "a.wav" } }],
    [{ id: "audio-0", filename: "a.wav", mime: "audio/wav", blob: new Blob(["a"]) }]);
  await store.saveGeometry({ workspaceId: doomed.id, positions: {} });
  await store.remove(doomed.id);
  assert.deepEqual((await store.list()).map((w) => w.id), ["kept"]);
  assert.equal(await store.media("audio-0"), undefined);
  assert.equal(await store.getGeometry(doomed.id), undefined);
  await store.close();
});
