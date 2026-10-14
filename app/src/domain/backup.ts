import { parseImport } from "./imports";
import type { Backup, Geometry, Workspace } from "./model";
export interface MediaRecord {
  id: string;
  workspaceId: string;
  filename: string;
  mime: string;
  blob: Blob;
}
export async function makeBackup(
  workspace: Workspace,
  media: MediaRecord[],
  geometry?: Geometry,
): Promise<Backup> {
  const embedded = await Promise.all(
    media.map(async (m) => {
      const bytes = new Uint8Array(await m.blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return {
        id: m.id,
        filename: m.filename,
        mime: m.mime,
        base64: btoa(binary),
      };
    }),
  );
  const backup: Backup = {
    format: "bookmark-tag",
    version: 2,
    workspace: structuredClone(workspace),
    geometry,
    media: embedded,
  };
  parseImport(JSON.stringify(backup), "json");
  return backup;
}
export function prepareRestore(backup: Backup): {
  workspace: Workspace;
  geometry?: Geometry;
  media: MediaRecord[];
} {
  parseImport(JSON.stringify(backup), "json");
  const workspace = structuredClone(backup.workspace);
  workspace.id = crypto.randomUUID();
  workspace.name += " (restored)";
  workspace.revision = 0;
  const remap = new Map(backup.media.map((m) => [m.id, crypto.randomUUID()]));
  const media = backup.media.map((m) => ({
    id: remap.get(m.id)!,
    workspaceId: workspace.id,
    filename: m.filename,
    mime: m.mime,
    blob: new Blob([Uint8Array.from(atob(m.base64), (c) => c.charCodeAt(0))], {
      type: m.mime,
    }),
  }));
  for (const b of [
    ...workspace.bookmarks,
    ...workspace.batches.flatMap((batch) => batch.beforeMerged),
  ]) {
    if (b.asset?.source === "local")
      b.asset.blobId = remap.get(b.asset.blobId!)!;
    if (b.thumbnail && "blobId" in b.thumbnail)
      b.thumbnail.blobId = remap.get(b.thumbnail.blobId)!;
  }
  return {
    workspace,
    media,
    geometry: backup.geometry
      ? { ...structuredClone(backup.geometry), workspaceId: workspace.id }
      : undefined,
  };
}
