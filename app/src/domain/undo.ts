import type { Command } from "./commands";
import type { Workspace } from "./model";

export interface UndoEntry {
  id: string;
  label: string;
  revision: number;
  before: Workspace;
}
export function commandLabel(command: Command): string {
  switch (command.type) {
    case "bookmark.create": return "Add bookmark";
    case "bookmark.patch": return "Edit bookmark";
    case "tag.patch": return "Edit tag";
    case "tag-type.patch": return "Edit tag type";
    case "tag-type.create": return "Create tag type";
    case "tag.create": return "Create tag";
    case "membership.set": return "Change tag connections";
    case "tag.status":
    case "status.bulk": return "Change status";
    case "status.undo": return "Restore statuses";
    case "view.upsert": return "Save view";
    case "view.remove": return "Delete view";
    case "copy-preset.upsert": return "Save copy preset";
    case "copy-preset.remove": return "Delete copy preset";
    case "media.attach": return "Attach media";
    case "status.remove": return "Remove status";
  }
}

// Restore content while advancing revisions so pending edits cannot overwrite it.
export function restoreUndoSnapshot(before: Workspace, current: Workspace): Workspace {
  const restored = structuredClone(before);
  restored.revision = current.revision + 1;
  const currentRecords = new Map([...current.bookmarks, ...current.tags].map((record) => [record.id, record]));
  // Thumbnails aren't edits, so Undo keeps the ones stored since.
  for (const bookmark of restored.bookmarks) {
    const thumbnail = current.bookmarks.find((b) => b.id === bookmark.id)?.thumbnail;
    if (thumbnail) bookmark.thumbnail = structuredClone(thumbnail);
    else delete bookmark.thumbnail;
  }
  const content = (record: Workspace["bookmarks"][number] | Workspace["tags"][number]) => {
    const { revision, updatedAt, ...values } = record;
    return JSON.stringify(values);
  };
  const connections = (workspace: Workspace, id: string) => JSON.stringify(workspace.memberships.filter((membership) => membership.bookmarkId === id).map((membership) => membership.tagId).sort());
  for (const record of [...restored.bookmarks, ...restored.tags]) {
    const existing = currentRecords.get(record.id);
    const previousRevision = record.revision;
    const changed = !existing || content(existing) !== content(record) || connections(before, record.id) !== connections(current, record.id);
    record.revision = changed ? Math.max(existing?.revision ?? 0, record.revision) + 1 : existing.revision;
    record.updatedAt = changed ? new Date().toISOString() : existing.updatedAt;
    // Keep restored import/status histories aligned with the restored content.
    for (const batch of restored.batches) {
      if (batch.afterRevisions[record.id] === previousRevision) batch.afterRevisions[record.id] = record.revision;
    }
    for (const change of restored.settings.statusHistory ?? []) {
      if (change.afterRevisions[record.id] === previousRevision) change.afterRevisions[record.id] = record.revision;
    }
  }
  return restored;
}
