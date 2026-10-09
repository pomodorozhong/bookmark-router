export type Outcome = "active" | "completed" | "discarded";
export type MediaKind = "image" | "video" | "audio";
export interface Appearance {
  color: string;
  size: number;
  shape: "circle" | "rounded-square" | "diamond";
  icon?: string;
}
export interface Status {
  id: string;
  label: string;
  color: string;
  outcome: Outcome;
}
export interface RecordMeta {
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Asset {
  kind: MediaKind;
  source: "remote" | "local";
  url?: string;
  blobId?: string;
  filename?: string;
}
export interface Bubble extends RecordMeta {
  id: string;
  title: string;
  description: string;
  url?: string;
  asset?: Asset;
  statusId: string;
  importBatchId?: string;
  missingTitle?: boolean;
  extraction?: {
    state:
      | "queued"
      | "running"
      | "partial"
      | "unavailable"
      | "failed"
      | "complete";
    sourceUrl: string;
    provenance?: string;
  };
}
export interface Tag extends RecordMeta {
  id: string;
  name: string;
  description?: string;
  url?: string;
  typeId?: string;
  statusId: string;
  appearance: Partial<Appearance>;
}
export interface TagType {
  id: string;
  name: string;
  appearance: Appearance;
}
export interface Membership {
  id: string;
  bubbleId: string;
  tagId: string;
}
export type Filter =
  | { op: "all" | "any"; rules: Filter[] }
  | { op: "not"; rule: Filter }
  | { op: "text"; value: string }
  | { op: "status"; ids: string[] }
  | { op: "tags"; ids: string[] }
  | { op: "distance"; tagIds: string[]; hops: number }
  | { op: "missing"; field: "title" | "description" | "url" | "asset" }
  | { op: "batch"; id: string }
  | { op: "same-tag"; name?: string; typeId?: string; statusId?: string };
export interface SavedView {
  id: string;
  name: string;
  filter: Filter;
  sort: "title" | "createdAt" | "status";
  hiddenTagIds: string[];
}
export interface ImportBatch {
  id: string;
  source: string;
  createdAt: string;
  bubbleIds: string[];
  beforeMerged: Bubble[];
  afterRevisions: Record<string, number>;
  beforeMemberships?: Membership[];
  createdTagIds?: string[];
  createdTypeIds?: string[];
  createdStatusIds?: string[];
}
export interface Workspace {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  bubbles: Bubble[];
  tags: Tag[];
  tagTypes: TagType[];
  statuses: Status[];
  memberships: Membership[];
  views: SavedView[];
  batches: ImportBatch[];
  settings: { extractorUrl?: string };
}
export interface Geometry {
  workspaceId: string;
  positions: Record<string, { x: number; y: number; pinned: boolean }>;
  viewport?: { zoom: number; x: number; y: number; anchor?: "center" };
}
export interface Backup {
  format: "bubble-tag";
  version: 1;
  workspace: Workspace;
  geometry?: Geometry;
  media: { id: string; filename: string; mime: string; base64: string }[];
}
export const defaultAppearance: Appearance = {
  color: "#0f766e",
  size: 64,
  shape: "circle",
};
export function emptyWorkspace(name = "My collection"): Workspace {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    revision: 0,
    bubbles: [],
    tags: [],
    tagTypes: [],
    memberships: [],
    views: [],
    batches: [],
    settings: {},
    statuses: [
      { id: "pending", label: "Pending", color: "#64748b", outcome: "active" },
      {
        id: "in-progress",
        label: "In progress",
        color: "#d97706",
        outcome: "active",
      },
      { id: "done", label: "Done", color: "#0f766e", outcome: "completed" },
      {
        id: "dropped",
        label: "Dropped",
        color: "#9f1239",
        outcome: "discarded",
      },
    ],
  };
}
export function urlKey(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an HTTP or HTTPS URL.");
  return url.href;
}
// Record URLs may be unfinished text. Only HTTP(S) values become navigable links.
export function isWebUrl(value: string): boolean {
  try {
    urlKey(value);
    return true;
  } catch {
    return false;
  }
}
export function storedUrlKey(value: string): string {
  try {
    return `web:${urlKey(value)}`;
  } catch {
    return `text:${value}`;
  }
}
export function appearanceFor(tag: Tag, workspace: Workspace): Appearance {
  return {
    ...defaultAppearance,
    ...workspace.tagTypes.find((t) => t.id === tag.typeId)?.appearance,
    ...tag.appearance,
  };
}
function fail(message: string): never {
  throw new Error(`Invalid workspace: ${message}`);
}
export function validateWorkspace(value: unknown): asserts value is Workspace {
  if (!value || typeof value !== "object") fail("expected an object");
  const w = value as Workspace;
  if (w.schemaVersion !== 1) fail("unsupported schema version");
  if (
    typeof w.id !== "string" ||
    !w.id ||
    typeof w.name !== "string" ||
    !Number.isInteger(w.revision) ||
    w.revision < 0
  )
    fail("invalid identity or revision");
  for (const key of [
    "bubbles",
    "tags",
    "tagTypes",
    "statuses",
    "memberships",
    "views",
    "batches",
  ] as const) {
    if (!Array.isArray(w[key])) fail(`${key} must be an array`);
    const seen = new Set<string>();
    for (const item of w[key]) {
      if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id))
        fail(`${key} contains missing or repeated IDs`);
      seen.add(item.id);
    }
  }
  const statuses = new Set(w.statuses.map((s) => s.id));
  const bubbleIds = new Set(w.bubbles.map((b) => b.id)),
    tagIds = new Set(w.tags.map((t) => t.id));
  if ([...bubbleIds].some((id) => tagIds.has(id)))
    fail("bubble and tag IDs must be globally unique");
  if (!statuses.size) fail("at least one status is required");
  for (const s of w.statuses)
    if (
      !s.label ||
      !["active", "completed", "discarded"].includes(s.outcome) ||
      typeof s.color !== "string"
    )
      fail("invalid status");
  const types = new Set(w.tagTypes.map((t) => t.id));
  const checkAppearance = (a: Partial<Appearance>) => {
    if (!a || typeof a !== "object") fail("appearance must be an object");
    if (
      a.size !== undefined &&
      (!Number.isFinite(a.size) || a.size < 20 || a.size > 160)
    )
      fail("tag size must be between 20 and 160");
    if (
      a.shape !== undefined &&
      !["circle", "rounded-square", "diamond"].includes(a.shape)
    )
      fail("unknown tag shape");
    if (a.color !== undefined && !/^#[\da-f]{6}$/i.test(a.color))
      fail("appearance color must be six-digit hex");
  };
  for (const t of w.tagTypes) {
    if (!t.name) fail("tag type needs a name");
    checkAppearance(t.appearance);
  }
  for (const record of [...w.bubbles, ...w.tags]) {
    if (!statuses.has(record.statusId)) fail("unknown assigned status");
    if (
      !Number.isInteger(record.revision) ||
      record.revision < 0 ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      !Number.isFinite(Date.parse(record.updatedAt))
    )
      fail("invalid record metadata");
    if (record.url !== undefined && typeof record.url !== "string")
      fail("URL must be text");
  }
  for (const b of w.bubbles) {
    if (
      typeof b.title !== "string" ||
      !b.title ||
      typeof b.description !== "string"
    )
      fail("invalid bubble fields");
    if (
      b.importBatchId &&
      !w.batches.some((batch) => batch.id === b.importBatchId)
    )
      fail("unknown import batch");
    if (b.asset) {
      if (!["image", "video", "audio"].includes(b.asset.kind))
        fail("unknown media kind");
      if (b.asset.source === "remote") {
        if (!b.asset.url) fail("remote media needs a URL");
        urlKey(b.asset.url);
      } else if (
        b.asset.source !== "local" ||
        !b.asset.blobId ||
        !b.asset.filename
      )
        fail("invalid local media");
    }
  }
  for (const t of w.tags) {
    if (
      typeof t.name !== "string" ||
      !t.name ||
      (t.typeId && !types.has(t.typeId))
    )
      fail("invalid tag");
    checkAppearance(t.appearance);
  }
  const pairs = new Set<string>();
  for (const edge of w.memberships) {
    if (!bubbleIds.has(edge.bubbleId) || !tagIds.has(edge.tagId))
      fail("dangling membership");
    const pair = JSON.stringify([edge.bubbleId, edge.tagId]);
    if (pairs.has(pair)) fail("repeated membership");
    pairs.add(pair);
  }
  function checkFilter(f: Filter, depth = 0): void {
    if (!f || typeof f !== "object" || depth > 30)
      fail("invalid or excessively nested filter");
    if (f.op === "all" || f.op === "any") {
      if (!Array.isArray(f.rules)) fail("filter group needs rules");
      f.rules.forEach((rule) => checkFilter(rule, depth + 1));
    } else if (f.op === "not") checkFilter(f.rule, depth + 1);
    else if (f.op === "text") {
      if (typeof f.value !== "string") fail("text filter needs a value");
    } else if (f.op === "status" || f.op === "tags") {
      if (
        !Array.isArray(f.ids) ||
        f.ids.some((id) => !(f.op === "status" ? statuses : tagIds).has(id))
      )
        fail("unknown filter reference");
    } else if (f.op === "distance") {
      if (
        !Array.isArray(f.tagIds) ||
        f.tagIds.some((id) => !tagIds.has(id)) ||
        !Number.isInteger(f.hops) ||
        f.hops < 0
      )
        fail("invalid distance filter");
    } else if (f.op === "missing") {
      if (!["title", "description", "url", "asset"].includes(f.field))
        fail("unknown missing-field filter");
    } else if (f.op === "batch") {
      if (!w.batches.some((b) => b.id === f.id)) fail("unknown filter batch");
    } else if (f.op === "same-tag") {
      if (
        (f.name !== undefined && typeof f.name !== "string") ||
        (f.typeId && !types.has(f.typeId)) ||
        (f.statusId && !statuses.has(f.statusId))
      )
        fail("invalid same-tag filter");
    } else fail("unknown filter operation");
  }
  for (const view of w.views) {
    if (
      !view.name ||
      !["title", "createdAt", "status"].includes(view.sort) ||
      !Array.isArray(view.hiddenTagIds) ||
      view.hiddenTagIds.some((id) => !tagIds.has(id))
    )
      fail("invalid saved view");
    checkFilter(view.filter);
  }
  for (const batch of w.batches) {
    if (
      typeof batch.source !== "string" ||
      !Number.isFinite(Date.parse(batch.createdAt)) ||
      !Array.isArray(batch.bubbleIds) ||
      !Array.isArray(batch.beforeMerged) ||
      !batch.afterRevisions
    )
      fail("invalid import batch");
    if (batch.bubbleIds.some((id) => !bubbleIds.has(id)))
      fail("unknown imported bubble");
  }
  if (!w.settings || typeof w.settings !== "object") fail("missing settings");
  if (w.settings.extractorUrl) urlKey(w.settings.extractorUrl);
}
