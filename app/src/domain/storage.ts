import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { commitImport, undoImport } from "./import-commands";
import type { ImportCommitCommand } from "./imports";
import { makeBackup, prepareRestore } from "./backup";
import type { Backup } from "./model";
import { ConflictError, applyCommand, type Command } from "./commands";
import { validateWorkspace, type Geometry, type Workspace } from "./model";
interface ProductDB extends DBSchema {
  workspaces: { key: string; value: Workspace };
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
    this.database = openDB<ProductDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore("workspaces", { keyPath: "id" });
        db.createObjectStore("geometry", { keyPath: "workspaceId" });
        db.createObjectStore("media", { keyPath: "id" });
      },
    });
  }
  async list() {
    return (await this.database).getAll("workspaces");
  }
  async get(id: string) {
    return (await this.database).get("workspaces", id);
  }
  async create(workspace: Workspace) {
    validateWorkspace(workspace);
    return (await this.database).add("workspaces", workspace);
  }
  async replace(workspace: Workspace, expectedRevision: number) {
    validateWorkspace(workspace);
    const tx = (await this.database).transaction("workspaces", "readwrite");
    const current = await tx.store.get(workspace.id);
    if (
      !current ||
      current.revision !== expectedRevision ||
      workspace.revision !== expectedRevision + 1
    ) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new ConflictError();
    }
    await tx.store.put(workspace);
    await tx.done;
  }
  async command(
    id: string,
    expectedRevision: number,
    command: Command,
  ): Promise<Workspace> {
    const tx = (await this.database).transaction("workspaces", "readwrite");
    const current = await tx.store.get(id);
    if (!current) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new ConflictError("Collection no longer exists.");
    }
    let next: Workspace;
    try {
      next = applyCommand(current, expectedRevision, command);
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
    await tx.store.put(next);
    await tx.done;
    return next;
  }
  async import(id: string, command: ImportCommitCommand) {
    return this.mutate(id, (w) => commitImport(w, command));
  }
  async undo(
    id: string,
    expectedRevision: number,
    batchId: string,
    keepChangedIds: string[],
  ) {
    return this.mutate(id, (w) =>
      undoImport(w, expectedRevision, batchId, keepChangedIds),
    );
  }
  private async mutate(
    id: string,
    work: (w: Workspace) => Workspace,
  ): Promise<Workspace> {
    const tx = (await this.database).transaction("workspaces", "readwrite");
    let next: Workspace;
    try {
      const current = await tx.store.get(id);
      if (!current) throw new ConflictError();
      next = work(current);
      await tx.store.put(next);
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
    return makeBackup(w, media, geometry);
  }
  async restore(backup: Backup) {
    const restored = prepareRestore(backup),
      tx = (await this.database).transaction(
        ["workspaces", "geometry", "media"],
        "readwrite",
      );
    try {
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
