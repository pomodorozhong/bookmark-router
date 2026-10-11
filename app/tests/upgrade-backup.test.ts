import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../src/domain/imports";
import type { Workspace } from "../src/domain/model";
import { demoWorkspace } from "../src/domain/samples";
import { upgradeBackup } from "../scripts/upgrade-backup";

// A collection as Bubble & Tag saved it, before bookmarks were renamed.
function legacy(w: Workspace) {
  const { bookmarks, ...rest } = w;
  const membership = ({ bookmarkId, ...m }: Workspace["memberships"][number]) => ({ ...m, bubbleId: bookmarkId });
  return {
    ...rest,
    schemaVersion: 1,
    bubbles: bookmarks,
    memberships: w.memberships.map(membership),
    batches: w.batches.map(({ bookmarkIds, ...b }) => ({ ...b, bubbleIds: bookmarkIds })),
  };
}

test("a Bubble & Tag backup upgrades to one Bookmark & Tag restores", () => {
  const w = demoWorkspace();
  const upgraded = upgradeBackup(JSON.stringify({ format: "bubble-tag", version: 1, workspace: legacy(w), media: [] }));
  const restore = parseImport(upgraded, "json").restore!;
  assert.deepEqual(restore.workspace.bookmarks, w.bookmarks);
  assert.deepEqual(restore.workspace.memberships, w.memberships);
  assert.throws(() => upgradeBackup(upgraded), /Expected a Bubble & Tag backup/);
});
