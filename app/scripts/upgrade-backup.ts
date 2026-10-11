// One-off upgrade of a Bubble & Tag backup (format "bubble-tag", version 1) to a
// Bookmark & Tag backup (format "bookmark-tag", version 2): `bubbles` become
// `bookmarks`, and `bubbleId` / `bubbleIds` become `bookmarkId` / `bookmarkIds`.
// Usage: npm run upgrade-backup -- old-backup.json [new-backup.json]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseImport } from "../src/domain/imports";

type Legacy = Record<string, unknown>;
const membership = ({ bubbleId, ...m }: Legacy) => ({ ...m, bookmarkId: bubbleId });
const list = (value: unknown, map: (item: Legacy) => unknown) => (Array.isArray(value) ? value.map(map) : value);

export function upgradeBackup(text: string): string {
  const old = JSON.parse(text) as Legacy;
  if (old.format !== "bubble-tag" || old.version !== 1) throw new Error("Expected a Bubble & Tag backup (format bubble-tag, version 1).");
  const { bubbles, ...rest } = old.workspace as Legacy;
  const workspace = {
    ...rest,
    schemaVersion: 2,
    bookmarks: bubbles,
    memberships: list(rest.memberships, membership),
    batches: list(rest.batches, ({ bubbleIds, ...batch }) => ({
      ...batch,
      bookmarkIds: bubbleIds,
      ...(batch.beforeMemberships ? { beforeMemberships: list(batch.beforeMemberships, membership) } : {}),
    })),
  };
  const upgraded = JSON.stringify({ ...old, format: "bookmark-tag", version: 2, workspace }, null, 2);
  parseImport(upgraded, "json"); // Throws if the result is not a valid backup.
  return upgraded;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [input, output = input?.replace(/\.json$/, "") + "-bookmark-tag.json"] = process.argv.slice(2);
  if (!input) throw new Error("Usage: npm run upgrade-backup -- old-backup.json [new-backup.json]");
  writeFileSync(output, upgradeBackup(readFileSync(input, "utf8")));
  console.log(`Wrote ${output}`);
}
