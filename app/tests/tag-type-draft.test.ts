import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { WorkspaceStore } from "../src/domain/storage";
import { ConflictError, type Command } from "../src/domain/commands";
import { demoWorkspace } from "../src/domain/samples";

test("saving a tag type from a refreshed tab protects its original edit target", async () => {
  const name = crypto.randomUUID(), editor = new WorkspaceStore(name), other = new WorkspaceStore(name);
  try {
    const w = demoWorkspace(), type = w.tagTypes[0];
    await editor.create(w);
    const draft: Command = {
      type: "tag-type.patch", id: type.id, expectedType: type,
      patch: { name: "Reading list", appearance: { ...type.appearance, color: "#b91c1c" } },
    };
    for (const change of [{ name: "Renamed" }, { appearance: { color: "#15803d" } }]) {
      const edited = await other.command(w.id, (await other.get(w.id))!.revision,
        { type: "tag-type.patch", id: type.id, patch: change });
      const history = await other.nextUndo(w.id);
      await assert.rejects(editor.command(w.id, (await editor.get(w.id))!.revision, draft), ConflictError);
      assert.deepEqual(await editor.get(w.id), edited);
      assert.deepEqual(await editor.nextUndo(w.id), history);
      await other.undoLast(w.id, edited.revision, history!.id);
    }
    const changed = await other.command(w.id, (await other.get(w.id))!.revision, { type: "tag.create", name: "Unrelated" });
    const saved = await editor.command(w.id, changed.revision, draft);
    assert.equal(saved.tagTypes[0].name, "Reading list");
    assert.equal(saved.tagTypes[0].appearance.color, "#b91c1c");
    assert.ok(saved.tags.some((tag) => tag.name === "Unrelated"));
  } finally {
    await editor.close();
    await other.close();
  }
});
