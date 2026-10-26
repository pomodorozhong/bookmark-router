import {
  validateWorkspace,
  storedUrlKey,
  urlKey,
  type Asset,
  type Bookmark,
  type TagType,
  type Tag,
  type CopyPreset,
  type SavedView,
  type Workspace,
} from "./model";
export interface BookmarkCreateInput {
  id?: string;
  title?: string;
  url: string;
  description?: string;
  statusId?: string;
  tagIds?: string[];
}
export class DuplicateBookmarkError extends Error {
  constructor(public readonly bookmarkId: string) {
    super(`This URL already belongs to bookmark ${bookmarkId}. Update that bookmark explicitly.`);
    this.name = "DuplicateBookmarkError";
  }
}
export type Command =
  | ({ type: "bookmark.create" } & BookmarkCreateInput)
  | {
      type: "bookmark.patch";
      id: string;
      expectedRecordRevision: number;
      patch: Partial<
        Pick<Bookmark, "title" | "description" | "url" | "asset" | "statusId">
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
  /** `id`, like a tag's, lets a batch create a tag of the new type in the same save; it is generated when omitted. */
  | { type: "tag-type.create"; name: string; appearance: TagType["appearance"]; id?: string }
  /** `id` lets a batch link bookmarks to the tag before it exists; it is generated when omitted. */
  | { type: "tag.create"; name: string; typeId?: string; id?: string }
  | { type: "membership.set"; bookmarkId: string; tagId: string; linked: boolean }
  | {
      type: "tag.status";
      id: string;
      statusId: string;
      reviewedBookmarkRevisions?: Record<string, number>;
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
        bookmarkId: string;
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
  if (command.type === "bookmark.create") {
    if (typeof command.url !== "string" || !command.url.trim())
      throw new Error("A new bookmark needs an HTTP or HTTPS URL.");
    const url = urlKey(command.url.trim());
    for (const key of ["id", "title", "description", "statusId"] as const)
      if (command[key] !== undefined && typeof command[key] !== "string")
        throw new Error(`${key} must be text.`);
    const duplicate = w.bookmarks.find((b) => b.url && storedUrlKey(b.url) === storedUrlKey(url));
    if (duplicate) throw new DuplicateBookmarkError(duplicate.id);
    const id = command.id ?? crypto.randomUUID();
    if (!id.trim() || [...w.bookmarks, ...w.tags].some((r) => r.id === id))
      throw new Error("Choose a new bookmark ID.");
    const statusId = command.statusId ?? w.statuses.find((s) => s.label.toLowerCase() === "pending")?.id;
    if (!w.statuses.some((s) => s.id === statusId))
      throw new Error("Choose an existing status; this collection has no Pending default.");
    const tagIds = command.tagIds ?? [];
    if (!Array.isArray(tagIds) || new Set(tagIds).size !== tagIds.length || tagIds.some((id) => !w.tags.some((t) => t.id === id)))
      throw new Error("Choose unique existing groups.");
    const title = command.title?.trim();
    w.bookmarks.push({ id, title: title || url, url, description: command.description ?? "", statusId: statusId!, missingTitle: !title, revision: 0, createdAt: now, updatedAt: now });
    for (const tagId of tagIds) {
      w.memberships.push({ id: crypto.randomUUID(), bookmarkId: id, tagId });
      const tag = w.tags.find((t) => t.id === tagId)!;
      tag.revision++;
      tag.updatedAt = now;
    }
  } else if (command.type === "bookmark.patch" || command.type === "tag.patch") {
    const records = command.type === "bookmark.patch" ? w.bookmarks : w.tags;
    const record = records.find((r) => r.id === command.id);
    if (!record || record.revision !== command.expectedRecordRevision)
      throw new ConflictError();
    const allowed =
      command.type === "bookmark.patch"
        ? ["title", "description", "url", "asset", "statusId"]
        : ["name", "description", "url", "typeId", "statusId", "appearance"];
    if (
      !command.patch ||
      Object.keys(command.patch).some((key) => !allowed.includes(key))
    )
      throw new Error("Patch contains unsupported fields.");
    if (command.type === "bookmark.patch" && command.patch.title)
      (record as Bookmark).missingTitle = false;
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
  } else if (command.type === "tag-type.create") {
    const name = command.name.trim();
    if (!name) throw new Error("Tag type needs a name.");
    if (w.tagTypes.some((other) => other.name === name)) throw new Error("Choose a new tag type name.");
    const id = command.id ?? `type:${crypto.randomUUID()}`;
    if (w.tagTypes.some((other) => other.id === id)) throw new Error("Choose a new tag type ID.");
    w.tagTypes.push({ id, name, appearance: { ...command.appearance } });
  } else if (command.type === "tag.create") {
    const name = command.name.trim();
    if (
      !name ||
      w.tags.some((t) => t.name === name && t.typeId === command.typeId)
    )
      throw new Error("Choose a new tag name.");
    const id = command.id ?? crypto.randomUUID();
    if (!id.trim() || [...w.bookmarks, ...w.tags].some((r) => r.id === id))
      throw new Error("Choose a new tag ID.");
    w.tags.push({
      id,
      name,
      typeId: command.typeId,
      statusId: w.statuses[0].id,
      appearance: {},
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  } else if (command.type === "membership.set") {
    const bookmark = w.bookmarks.find((b) => b.id === command.bookmarkId),
      tag = w.tags.find((t) => t.id === command.tagId);
    if (!bookmark || !tag) throw new Error("Bookmark or tag no longer exists.");
    const exists = w.memberships.some(
      (m) => m.bookmarkId === bookmark.id && m.tagId === tag.id,
    );
    if (exists !== command.linked) {
      bookmark.revision++;
      bookmark.updatedAt = now;
      tag.revision++;
      tag.updatedAt = now;
    }
    if (!command.linked)
      w.memberships = w.memberships.filter(
        (m) => m.bookmarkId !== command.bookmarkId || m.tagId !== command.tagId,
      );
    if (command.linked && !exists)
      w.memberships.push({
        id: crypto.randomUUID(),
        bookmarkId: command.bookmarkId,
        tagId: command.tagId,
      });
  } else if (command.type === "tag.status") {
    const tag = w.tags.find((t) => t.id === command.id);
    if (!tag) throw new ConflictError("Tag no longer exists.");
    const linked = w.memberships
      .filter((m) => m.tagId === tag.id)
      .map((m) => w.bookmarks.find((b) => b.id === m.bookmarkId)!);
    if (command.reviewedBookmarkRevisions) {
      const reviewed = command.reviewedBookmarkRevisions;
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
      [...w.bookmarks, ...w.tags].find((record) => record.id === id),
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
      [...w.bookmarks, ...w.tags].find((record) => record.id === id),
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
      if (ids.has(assignment.bookmarkId))
        throw new Error("Each bookmark can receive one file per upload.");
      ids.add(assignment.bookmarkId);
      const bookmark = w.bookmarks.find((item) => item.id === assignment.bookmarkId);
      if (!bookmark || bookmark.revision !== assignment.expectedRecordRevision)
        throw new ConflictError();
      if (
        assignment.asset.source !== "local" ||
        !assignment.asset.blobId ||
        !assignment.asset.filename
      )
        throw new Error("Uploaded media needs a local file reference.");
      bookmark.asset = assignment.asset;
      bookmark.revision++;
      bookmark.updatedAt = now;
    }
  } else if (command.type === "status.remove") {
    if (
      command.id === command.replacementId ||
      !w.statuses.some((s) => s.id === command.replacementId)
    )
      throw new Error("Choose a different replacement status.");
    for (const record of [...w.bookmarks, ...w.tags])
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
