import { ConflictError, applyCommand, type Command } from './commands';
import { validateWorkspace, type Geometry, type Workspace } from './model';
interface ProductDB extends DBSchema {
  workspaces: { key: string; value: Workspace };
  geometry: { key: string; value: Geometry };
  media: { key: string; value: { id: string; workspaceId: string; filename: string; mime: string; blob: Blob } };
}
export class WorkspaceStore {
  private database: Promise<IDBPDatabase<ProductDB>>;
  constructor(name = 'bubble-tag-v1') {
    this.database = openDB<ProductDB>(name, 1, { upgrade(db) { db.createObjectStore('workspaces', { keyPath: 'id' }); db.createObjectStore('geometry', { keyPath: 'workspaceId' }); db.createObjectStore('media', { keyPath: 'id' }); } });
  }
  async list() { return (await this.database).getAll('workspaces'); }
  async get(id: string) { return (await this.database).get('workspaces', id); }
  async create(workspace: Workspace) { validateWorkspace(workspace); return (await this.database).add('workspaces', workspace); }
  async replace(workspace: Workspace, expectedRevision: number) {
    validateWorkspace(workspace);
    const tx = (await this.database).transaction('workspaces', 'readwrite');
    const current = await tx.store.get(workspace.id);
    if (!current || current.revision !== expectedRevision || workspace.revision !== expectedRevision + 1) { tx.abort(); await tx.done.catch(() => {}); throw new ConflictError(); }
    await tx.store.put(workspace); await tx.done;
  }
  async command(id: string, expectedRevision: number, command: Command): Promise<Workspace> {
    const tx = (await this.database).transaction('workspaces', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) { tx.abort(); await tx.done.catch(() => {}); throw new ConflictError('Collection no longer exists.'); }
    let next: Workspace;
    try { next = applyCommand(current, expectedRevision, command); } catch (e) { tx.abort(); await tx.done.catch(() => {}); throw e; }
    await tx.store.put(next); await tx.done; return next;
  }
  async saveGeometry(geometry: Geometry) { return (await this.database).put('geometry', geometry); }
  async getGeometry(id: string) { return (await this.database).get('geometry', id); }
  async close() { (await this.database).close(); }
}
