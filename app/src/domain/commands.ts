import {
  validateWorkspace,
  type Asset,
  type Bubble,
  type TagType,
  type Tag,
  type CopyPreset,
  type SavedView,
  type Workspace,
} from "./model";
export type Command =
  | {
      type: "bubble.patch";
      id: string;
      expectedRecordRevision: number;
      patch: Partial<
        Pick<Bubble, "title" | "description" | "url" | "asset" | "statusId">
      >;
    }
  | {
      type: "tag.patch";
      id: string;
      expectedRecordRevision: number;
      patch: Partial<
        Pick<
          Tag,
          "name" | "description" | "url" | "typeId" | "statusId" | "appearance"
        >
      >;
    }
  | {
      type: "tag-type.patch";
      id: string;
      patch: {
        name?: string;
        appearance?: Partial<TagType["appearance"]>;
      };
    }
  | { type: "tag.create"; name: string; typeId?: string }
  | { type: "membership.set"; bubbleId: string; tagId: string; linked: boolean }
  | {
      type: "tag.status";
      id: string;
      statusId: string;
      reviewedBubbleRevisions?: Record<string, number>;
    }
  | {
      type: "status.bulk";
      targetIds: string[];
      statusId: string;
      reviewedRecordRevisions: Record<string, number>;
      source: "tag" | "selection";
    }
  | {
      type: "status.undo";
      changeId: string;
      reviewedRecordRevisions: Record<string, number>;
    }
  | { type: "view.upsert"; view: SavedView }
  | { type: "view.remove"; id: string }
  | { type: "copy-preset.upsert"; preset: CopyPreset }
  | { type: "copy-preset.remove"; id: string }
  | {
      type: "media.attach";
      assignments: Array<{
        bubbleId: string;
        expectedRecordRevision: number;
        asset: Asset;
      }>;
    }
  | { type: "status.remove"; id: string; replacementId: string };
export class ConflictError extends Error {
  constructor(
    message = "This collection changed. Refresh the preview before applying changes.",
  ) {
    super(message);
    this.name = "ConflictError";
  }
}
export function applyCommand(
  source: Workspace,
  expectedRevision: number,
  command: Command,
): Workspace {
  if (source.revision !== expectedRevision) throw new ConflictError();
  const w = structuredClone(source),
    now = new Date().toISOString();
  if (command.type === "bubble.patch" || command.type === "tag.patch") {
    const records = command.type === "bubble.patch" ? w.bubbles : w.tags;
    const record = records.find((r) => r.id === command.id);
    if (!record || record.revision !== command.expectedRecordRevision)
      throw new ConflictError();
    const allowed =
      command.type === "bubble.patch"
        ? ["title", "description", "url", "asset", "statusId"]
        : ["name", "description", "url", "typeId", "statusId", "appearance"];
    if (
      !command.patch ||
      Object.keys(command.patch).some((key) => !allowed.includes(key))
    )
      throw new Error("Patch contains unsupported fields.");
    if (command.type === "bubble.patch" && command.patch.title)
      (record as Bubble).missingTitle = false;
    Object.assign(record, command.patch, {
      revision: record.revision + 1,
      updatedAt: now,
    });
  } else if (command.type === "tag-type.patch") {
    const type = w.tagTypes.find((item) => item.id === command.id);
    if (!type) throw new ConflictError("Tag type no longer exists.");
    if (
      !command.patch ||
      Object.keys(command.patch).some((key) => !["name", "appearance"].includes(key))
    )
      throw new Error("Patch contains unsupported fields.");
    if (command.patch.name !== undefined && !command.patch.name.trim())
      throw new Error("Tag type needs a name.");
    if (
      command.patch.name !== undefined &&
      w.tagTypes.some(
        (other) => other.id !== type.id && other.name === command.patch.name!.trim(),
      )
    )
      throw new Error("Choose a new tag type name.");
    if (command.patch.name !== undefined) type.name = command.patch.name.trim();
    if (command.patch.appearance)
      type.appearance = { ...type.appearance, ...command.patch.appearance };
  } else if (command.type === "tag.create") {
    const name = command.name.trim();
    if (
      !name ||
      w.tags.some((t) => t.name === name && t.typeId === command.typeId)
    )
      throw new Error("Choose a new tag name.");
    w.tags.push({
      id: crypto.randomUUID(),
      name,
      typeId: command.typeId,
      statusId: w.statuses[0].id,
      appearance: {},
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  } else if (command.type === "membership.set") {
    const bubble = w.bubbles.find((b) => b.id === command.bubbleId),
      tag = w.tags.find((t) => t.id === command.tagId);
    if (!bubble || !tag) throw new Error("Bubble or tag no longer exists.");
    const exists = w.memberships.some(
      (m) => m.bubbleId === bubble.id && m.tagId === tag.id,
    );
    if (exists !== command.linked) {
      bubble.revision++;
      bubble.updatedAt = now;
      tag.revision++;
      tag.updatedAt = now;
    }
    if (!command.linked)
      w.memberships = w.memberships.filter(
        (m) => m.bubbleId !== command.bubbleId || m.tagId !== command.tagId,
      );
    if (command.linked && !exists)
      w.memberships.push({
        id: crypto.randomUUID(),
        bubbleId: command.bubbleId,
        tagId: command.tagId,
      });
  } else if (command.type === "tag.status") {
    const tag = w.tags.find((t) => t.id === command.id);
    if (!tag) throw new ConflictError("Tag no longer exists.");
    const linked = w.memberships
      .filter((m) => m.tagId === tag.id)
      .map((m) => w.bubbles.find((b) => b.id === m.bubbleId)!);
    if (command.reviewedBubbleRevisions) {
      const reviewed = command.reviewedBubbleRevisions;
      if (
        linked.length !== Object.keys(reviewed).length ||
        linked.some((b) => reviewed[b.id] !== b.revision)
      )
        throw new ConflictError();
      for (const b of linked) {
        b.statusId = command.statusId;
        b.revision++;
        b.updatedAt = now;
      }
    }
    tag.statusId = command.statusId;
    tag.revision++;
    tag.updatedAt = now;
  } else if (command.type === "status.bulk") {
    const targetIds = [...new Set(command.targetIds)];
    if (!targetIds.length || targetIds.length !== command.targetIds.length)
      throw new Error("Choose at least one unique record.");
    if (!w.statuses.some((status) => status.id === command.statusId))
      throw new Error("Choose an existing status.");
    const records = targetIds.map((id) =>
      [...w.bubbles, ...w.tags].find((record) => record.id === id),
    );
    if (records.some((record) => !record))
      throw new ConflictError("A selected record no longer exists.");
    const reviewed = command.reviewedRecordRevisions;
    if (
      !reviewed ||
      Object.keys(reviewed).length !== targetIds.length ||
      targetIds.some((id) => reviewed[id] !== records.find((r) => r!.id === id)!.revision)
    )
      throw new ConflictError();
    const changeId = crypto.randomUUID();
    const before = Object.fromEntries(
      records.map((record) => [
        record!.id,
        { statusId: record!.statusId, revision: record!.revision },
      ]),
    );
    const afterRevisions: Record<string, number> = {};
    for (const record of records) {
      record!.statusId = command.statusId;
      record!.revision++;
      record!.updatedAt = now;
      afterRevisions[record!.id] = record!.revision;
    }
    const history = w.settings.statusHistory ?? [];
    w.settings.statusHistory = [
      ...history,
      {
        id: changeId,
        createdAt: now,
        source: command.source,
        targetIds,
        statusId: command.statusId,
        before,
        afterRevisions,
      },
    ];
  } else if (command.type === "status.undo") {
    const history = w.settings.statusHistory ?? [],
      change = history.find((item) => item.id === command.changeId);
    if (!change) throw new Error("Status change is no longer available to undo.");
    const records = change.targetIds.map((id) =>
      [...w.bubbles, ...w.tags].find((record) => record.id === id),
    );
    if (records.some((record) => !record))
      throw new ConflictError("A status-change record no longer exists.");
    if (
      Object.keys(command.reviewedRecordRevisions).length !== change.targetIds.length ||
      change.targetIds.some(
        (id) =>
          command.reviewedRecordRevisions[id] !== change.afterRevisions[id] ||
          records.find((record) => record!.id === id)!.revision !== change.afterRevisions[id],
      )
    )
      throw new ConflictError("These records changed after the status update.");
    for (const record of records) {
      const previous = change.before[record!.id];
      record!.statusId = previous.statusId;
      record!.revision++;
      record!.updatedAt = now;
    }
    w.settings.statusHistory = history.filter((item) => item.id !== change.id);
  } else if (command.type === "view.upsert") {
    const view = structuredClone(command.view);
    view.name = view.name.trim();
    if (!view.name) throw new Error("Saved view needs a name.");
    const index = w.views.findIndex((item) => item.id === view.id);
    if (index >= 0) w.views[index] = view;
    else w.views.push(view);
  } else if (command.type === "view.remove") {
    w.views = w.views.filter((view) => view.id !== command.id);
  } else if (command.type === "copy-preset.upsert") {
    const preset = structuredClone(command.preset);
    preset.name = preset.name.trim();
    if (!preset.name) throw new Error("Copy preset needs a name.");
    const presets = w.settings.copyPresets ?? [],
      index = presets.findIndex((item) => item.id === preset.id);
    if (index >= 0) presets[index] = preset;
    else presets.push(preset);
    w.settings.copyPresets = presets;
  } else if (command.type === "copy-preset.remove") {
    w.settings.copyPresets = (w.settings.copyPresets ?? []).filter(
      (preset) => preset.id !== command.id,
    );
  } else if (command.type === "media.attach") {
    if (!command.assignments.length)
      throw new Error("Choose at least one media file.");
    const ids = new Set<string>();
    for (const assignment of command.assignments) {
      if (ids.has(assignment.bubbleId))
        throw new Error("Each bubble can receive one file per upload.");
      ids.add(assignment.bubbleId);
      const bubble = w.bubbles.find((item) => item.id === assignment.bubbleId);
      if (!bubble || bubble.revision !== assignment.expectedRecordRevision)
        throw new ConflictError();
      if (
        assignment.asset.source !== "local" ||
        !assignment.asset.blobId ||
        !assignment.asset.filename
      )
        throw new Error("Uploaded media needs a local file reference.");
      bubble.asset = assignment.asset;
      bubble.revision++;
      bubble.updatedAt = now;
    }
  } else if (command.type === "status.remove") {
    if (
      command.id === command.replacementId ||
      !w.statuses.some((s) => s.id === command.replacementId)
    )
      throw new Error("Choose a different replacement status.");
    for (const record of [...w.bubbles, ...w.tags])
      if (record.statusId === command.id) {
        record.statusId = command.replacementId;
        record.revision++;
        record.updatedAt = now;
      }
    w.statuses = w.statuses.filter((s) => s.id !== command.id);
    if (w.settings.statusHistory)
      w.settings.statusHistory = w.settings.statusHistory.filter(
        (change) =>
          change.statusId !== command.id &&
          !Object.values(change.before).some(
            (previous) => previous.statusId === command.id,
          ),
      );
  }
  w.revision++;
  validateWorkspace(w);
  return w;
}
