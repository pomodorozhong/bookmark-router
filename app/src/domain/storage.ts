import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { commitImport, undoImport } from "./import-commands";
import type { ImportCommitCommand } from "./imports";
import { makeBackup, prepareRestore } from "./backup";
import type { Backup } from "./model";
import { ConflictError, applyCommand, type Command } from "./commands";
import { commandLabel, restoreUndoSnapshot, type UndoEntry } from "./undo";
import {
  validateWorkspace,
  type Asset,
  type Geometry,
  type Workspace,
} from "./model";
// Local history belongs to the stored collection, not its portable content schema.
type StoredWorkspace = Workspace & { _undoHistory?: UndoEntry[] };
function collectionContent(stored: StoredWorkspace): Workspace {
  const { _undoHistory, ...workspace } = stored;
  return workspace;
}
function addUndo(entries: UndoEntry[], current: Workspace, next: Workspace, label: string): UndoEntry[] {
  const chain = entries.at(-1)?.revision === current.revision ? entries : [];
  return [...chain, { id: crypto.randomUUID(), label, revision: next.revision, before: current }].slice(-50);
}
interface ProductDB extends DBSchema {
  workspaces: { key: string; value: StoredWorkspace };
  geometry: { key: string; value: Geometry };
  media: {
    key: string;
    value: {
      id: string;
      workspaceId: string;
      filename: string;
      mime: string;
      blob: Blob;
    };
  };
}
export class WorkspaceStore {
  private database: Promise<IDBPDatabase<ProductDB>>;
  constructor(name = "bubble-tag-v1") {
    this.database = openDB<ProductDB>(name, undefined, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("workspaces")) db.createObjectStore("workspaces", { keyPath: "id" });
        if (!db.objectStoreNames.contains("geometry")) db.createObjectStore("geometry", { keyPath: "workspaceId" });
        if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
      },
      blocking: () => { void this.database.then((db) => db.close()); },
    });
  }
  async list() {
    return (await (await this.database).getAll("workspaces")).map(collectionContent);
  }
  async get(id: string) {
    const stored = await (await this.database).get("workspaces", id);
    return stored ? collectionContent(stored) : undefined;
  }
  async create(workspace: Workspace) {
    validateWorkspace(workspace);
    return (await this.database).add("workspaces", collectionContent(workspace));
  }
  async replace(workspace: Workspace, expectedRevision: number) {
    validateWorkspace(workspace);
    await this.mutate(workspace.id, (current) => {
      if (current.revision !== expectedRevision || workspace.revision !== expectedRevision + 1) throw new ConflictError();
      return collectionContent(workspace);
    }, "Update collection");
  }
  async command(
    id: string,
    expectedRevision: number,
    command: Command | Command[],
    label?: string,
  ): Promise<Workspace> {
    const commands = Array.isArray(command) ? command : [command];
    if (!commands.length) throw new Error("No changes to save.");
    return this.mutate(id, (current) => {
      if (current.revision !== expectedRevision) throw new ConflictError();
      return commands.reduce((next, item) => applyCommand(next, next.revision, item), current);
    }, label ?? commandLabel(commands[0]));
  }
  async import(id: string, command: ImportCommitCommand) {
    return this.mutate(id, (w) => commitImport(w, command), "Import bubbles");
  }
  async undo(
    id: string,
    expectedRevision: number,
    batchId: string,
    keepChangedIds: string[],
  ) {
    return this.mutate(id, (w) =>
      undoImport(w, expectedRevision, batchId, keepChangedIds), "Undo import",
    );
  }
  private async mutate(
    id: string,
    work: (w: Workspace) => Workspace,
    label: string,
  ): Promise<Workspace> {
    const tx = (await this.database).transaction("workspaces", "readwrite");
    let next: Workspace;
    try {
      const stored = await tx.store.get(id);
      if (!stored) throw new ConflictError();
      const current = collectionContent(stored);
      next = work(current);
      await tx.store.put({ ...next, _undoHistory: addUndo(stored._undoHistory ?? [], current, next, label) });
      await tx.done;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw e;
    }
    return next;
  }
  async nextUndo(id: string) {
    const stored = await (await this.database).get("workspaces", id);
    const entry = stored?._undoHistory?.at(-1);
    if (entry?.revision !== stored?.revision) return undefined;
    return entry ? { id: entry.id, label: entry.label, revision: entry.revision } : undefined;
  }
  async undoLast(id: string, expectedRevision: number, entryId: string) {
    const tx = (await this.database).transaction("workspaces", "readwrite");
    try {
      const stored = await tx.store.get(id);
      const entries = stored?._undoHistory ?? [];
      const entry = entries.at(-1);
      if (!stored || !entry || stored.revision !== expectedRevision || entry.revision !== stored.revision || entry.id !== entryId)
        throw new ConflictError("The collection changed. Review the latest undo action and try again.");
      const current = collectionContent(stored);
      const next = restoreUndoSnapshot(entry.before, current);
      validateWorkspace(next);
      entries.pop();
      const previous = entries.at(-1);
      if (previous) previous.revision = next.revision;
      await tx.store.put({ ...next, _undoHistory: entries });
      await tx.done;
      return next;
    } catch (error) {
      try { tx.abort(); } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async backup(id: string) {
    const tx = (await this.database).transaction(
      ["workspaces", "geometry", "media"],
      "readonly",
    );
    const w = await tx.objectStore("workspaces").get(id);
    if (!w) throw new Error("Collection not found.");
    const geometry = await tx.objectStore("geometry").get(id),
      media = (await tx.objectStore("media").getAll()).filter(
        (m) => m.workspaceId === id,
      );
    await tx.done;
    return makeBackup(collectionContent(w), media, geometry);
  }
  async restore(backup: Backup) {
    const restored = prepareRestore(backup),
      tx = (await this.database).transaction(
        ["workspaces", "geometry", "media"],
        "readwrite",
      );
    try {
      restored.workspace = collectionContent(restored.workspace);
      await tx.objectStore("workspaces").add(restored.workspace);
      if (restored.geometry)
        await tx.objectStore("geometry").add(restored.geometry);
      for (const media of restored.media)
        await tx.objectStore("media").add(media);
      await tx.done;
      return restored.workspace;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async media(id: string) {
    return (await this.database).get("media", id);
  }
  async attachMedia(
    id: string,
    expectedRevision: number,
    assignments: Array<{
      bubbleId: string;
      expectedRecordRevision: number;
      asset: Asset;
    }>,
    files: Array<{ id: string; filename: string; mime: string; blob: Blob }>,
  ) {
    const tx = (await this.database).transaction(
      ["workspaces", "media"],
      "readwrite",
    );
    try {
      const stored = await tx.objectStore("workspaces").get(id);
      if (!stored) throw new ConflictError("Collection no longer exists.");
      const current = collectionContent(stored);
      const next = applyCommand(current, expectedRevision, {
        type: "media.attach",
        assignments,
      });
      for (const file of files)
        await tx.objectStore("media").put({ ...file, workspaceId: id });
      await tx.objectStore("workspaces").put({ ...next, _undoHistory: addUndo(stored._undoHistory ?? [], current, next, "Attach media") });
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async saveGeometry(geometry: Geometry) {
    return (await this.database).put("geometry", geometry);
  }
  async getGeometry(id: string) {
    return (await this.database).get("geometry", id);
  }
  async close() {
    (await this.database).close();
  }
}
