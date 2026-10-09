import { ConflictError } from "./commands";
import {
  defaultAppearance,
  storedUrlKey,
  validateWorkspace,
  type Bubble,
  type ImportBatch,
  type Workspace,
} from "./model";
import type { ImportCommitCommand } from "./imports";
export function commitImport(
  source: Workspace,
  command: ImportCommitCommand,
): Workspace {
  if (
    source.revision !== command.expectedRevision ||
    command.preview.workspaceRevision !== source.revision
  )
    throw new ConflictError();
  const w = structuredClone(source),
    now = new Date().toISOString();
  const batch: ImportBatch = {
    id: crypto.randomUUID(),
    source: command.source,
    createdAt: now,
    bubbleIds: [],
    beforeMerged: [],
    afterRevisions: {},
    beforeMemberships: [],
    createdTagIds: [],
    createdTypeIds: [],
    createdStatusIds: [],
  };
  const seenRows = new Set<number>(),
    rowTargets = new Map<number, string>();
  for (const decision of command.decisions) {
    if (
      !["skip", "keep", "merge"].includes(decision.action) ||
      !command.preview.candidates.some((c) => c.row === decision.row)
    )
      throw new Error("Invalid import decision.");
    if (seenRows.has(decision.row))
      throw new Error("Repeated import decision.");
    seenRows.add(decision.row);
  }
  for (const c of command.preview.candidates) {
    const decision = command.decisions.find((d) => d.row === c.row);
    if (!decision || decision.action === "skip") continue;
    if (c.errors.length) throw new Error(`Row ${c.row} is invalid.`);
    let statusId = w.statuses.find((s) => s.label === c.status)?.id;
    if (!statusId) {
      const mapping = command.statusMapping[c.status];
      if (mapping === "__create__") {
        const status = {
          id: crypto.randomUUID(),
          label: c.status,
          color: "#64748b",
          outcome: "active" as const,
        };
        w.statuses.push(status);
        batch.createdStatusIds!.push(status.id);
        statusId = status.id;
      } else if (w.statuses.some((s) => s.id === mapping)) statusId = mapping;
      else
        throw new Error(`Map or create status “${c.status}” before importing.`);
    }
    let typeId = c.tagType
      ? w.tagTypes.find((t) => t.name === c.tagType)?.id
      : undefined;
    if (c.tagType && !typeId) {
      const mapping = command.typeMapping[c.tagType];
      if (mapping === "__create__") {
        typeId = crypto.randomUUID();
        w.tagTypes.push({
          id: typeId,
          name: c.tagType,
          appearance: defaultAppearance,
        });
        batch.createdTypeIds!.push(typeId);
      } else if (w.tagTypes.some((t) => t.id === mapping)) typeId = mapping;
      else
        throw new Error(
          `Map or create tag type “${c.tagType}” before importing.`,
        );
    }
    let bubble: Bubble;
    if (decision.action === "merge") {
      const target =
        c.duplicate?.id ??
        (c.duplicate?.row ? rowTargets.get(c.duplicate.row) : undefined);
      const found = w.bubbles.find((b) => b.id === target);
      if (
        !found ||
        !c.url ||
        !found.url ||
        storedUrlKey(c.url) !== storedUrlKey(found.url)
      )
        throw new Error(
          `Row ${c.row}: merge target was skipped or changed. Keep both, or include the earlier row.`,
        );
      bubble = found;
      if (
        source.bubbles.some((b) => b.id === bubble.id) &&
        !batch.beforeMerged.some((b) => b.id === bubble.id)
      ) {
        batch.beforeMerged.push(structuredClone(bubble));
        batch.beforeMemberships!.push(
          ...w.memberships.filter((m) => m.bubbleId === bubble.id),
        );
      }
      if (!c.missingTitle) {
        bubble.title = c.title;
        bubble.missingTitle = false;
      }
      if (c.description) bubble.description = c.description;
      bubble.statusId = statusId;
      bubble.revision++;
      bubble.updatedAt = now;
      bubble.importBatchId = batch.id;
    } else {
      bubble = {
        id: crypto.randomUUID(),
        title: c.title,
        description: c.description,
        url: c.url,
        statusId,
        missingTitle: c.missingTitle,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        importBatchId: batch.id,
      };
      w.bubbles.push(bubble);
    }
    if (c.mediaUrl)
      bubble.asset = {
        source: "remote",
        url: c.mediaUrl,
        kind: /\.(mp4|webm|mov)(\?|$)/i.test(c.mediaUrl)
          ? "video"
          : /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(c.mediaUrl)
            ? "audio"
            : "image",
      };
    for (const name of c.tags) {
      let tag = w.tags.find((t) => t.name === name && t.typeId === typeId);
      if (!tag) {
        tag = {
          id: crypto.randomUUID(),
          name,
          typeId,
          appearance: {},
          statusId: w.statuses[0].id,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        w.tags.push(tag);
        batch.createdTagIds!.push(tag.id);
      }
      if (
        !w.memberships.some(
          (m) => m.bubbleId === bubble.id && m.tagId === tag!.id,
        )
      )
        w.memberships.push({
          id: crypto.randomUUID(),
          bubbleId: bubble.id,
          tagId: tag.id,
        });
    }
    rowTargets.set(c.row, bubble.id);
    if (!batch.bubbleIds.includes(bubble.id)) batch.bubbleIds.push(bubble.id);
    batch.afterRevisions[bubble.id] = bubble.revision;
  }
  if (!batch.bubbleIds.length)
    throw new Error("No records selected for import.");
  w.batches.push(batch);
  w.revision++;
  validateWorkspace(w);
  return w;
}
export function undoConflicts(w: Workspace, batch: ImportBatch): Bubble[] {
  return batch.bubbleIds.flatMap((id) => {
    const b = w.bubbles.find((b) => b.id === id);
    return b && b.revision !== batch.afterRevisions[id] ? [b] : [];
  });
}
export function undoImport(
  source: Workspace,
  expectedRevision: number,
  batchId: string,
  keepChangedIds: string[] = [],
): Workspace {
  if (source.revision !== expectedRevision) throw new ConflictError();
  const w = structuredClone(source),
    batch = w.batches.find((b) => b.id === batchId);
  if (!batch) throw new Error("Import batch no longer exists.");
  const conflicts = undoConflicts(w, batch);
  if (conflicts.some((b) => !keepChangedIds.includes(b.id)))
    throw new ConflictError("Changed records need review before undo.");
  if (keepChangedIds.some((id) => !conflicts.some((b) => b.id === id)))
    throw new Error("Only changed records can be kept during undo.");
  const revert = new Set(
      batch.bubbleIds.filter((id) => !keepChangedIds.includes(id)),
    ),
    removed = new Set<string>();
  for (const id of revert) {
    const before = batch.beforeMerged.find((b) => b.id === id),
      index = w.bubbles.findIndex((b) => b.id === id);
    if (before && index >= 0)
      w.bubbles[index] = {
        ...before,
        revision: w.bubbles[index].revision + 1,
        updatedAt: new Date().toISOString(),
      };
    else if (index >= 0) {
      w.bubbles.splice(index, 1);
      removed.add(id);
    }
    w.memberships = w.memberships.filter((m) => m.bubbleId !== id);
    if (before)
      w.memberships.push(
        ...(batch.beforeMemberships ?? []).filter((m) => m.bubbleId === id),
      );
  }
  // Preserve earlier histories while removing references to bubbles that no longer exist.
  for (const other of w.batches)
    other.bubbleIds = other.bubbleIds.filter((id) => !removed.has(id));
  batch.bubbleIds = batch.bubbleIds.filter((id) => !revert.has(id));
  batch.beforeMerged = batch.beforeMerged.filter((b) => !revert.has(b.id));
  batch.beforeMemberships = batch.beforeMemberships?.filter(
    (m) => !revert.has(m.bubbleId),
  );
  if (
    !batch.bubbleIds.length &&
    !w.views.some((v) => JSON.stringify(v.filter).includes(batch.id))
  )
    w.batches = w.batches.filter((b) => b.id !== batch.id);
  // Keep imported taxonomy: saved views and earlier undo snapshots can reference it.
  w.revision++;
  validateWorkspace(w);
  return w;
}
