import {
  validateWorkspace,
  type Bubble,
  type Tag,
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
  | { type: "tag.create"; name: string; typeId?: string }
  | { type: "membership.set"; bubbleId: string; tagId: string; linked: boolean }
  | {
      type: "tag.status";
      id: string;
      statusId: string;
      reviewedBubbleRevisions?: Record<string, number>;
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
  }
  w.revision++;
  validateWorkspace(w);
  return w;
}
