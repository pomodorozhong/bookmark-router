export type Outcome = "active" | "completed" | "discarded";
export type MediaKind = "image" | "video" | "audio";
export type TagStyle = "price-tag" | "rounded-tag" | "shipping-tag" | "hang-tag";
/** Which way a tag style's hole end points. */
export type Direction = "up" | "up-right" | "right" | "down-right" | "down" | "down-left" | "left" | "up-left";
export interface Appearance {
  color: string;
  /** A circle's width, or a tag style's longer side. */
  size: number;
  shape: "circle" | "rounded-square" | "diamond" | TagStyle;
  /** For tag styles; unset uses the style's own direction. */
  points?: Direction;
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
// Read-only context carried over from an import source, such as review hints.
export interface SourceNote {
  label: string;
  text: string;
}
/** Where a stored thumbnail came from; see docs/thumbnails.md for the order they're tried in. */
export type ThumbnailSource = "youtube" | "fxtwitter" | "github" | "cover" | "microlink" | "screenshot" | "favicon";
/**
 * A thumbnail found online and stored locally, or the time every lookup failed.
 * It sits beside the imported `asset`, never replacing it, and isn't an edit:
 * storing one changes no revision and adds no Undo entry.
 */
export type Thumbnail =
  | { blobId: string; source: ThumbnailSource; sourceUrl: string; capturedAt: string }
  | { failedAt: string };
export interface Bookmark extends RecordMeta {
  id: string;
  title: string;
  description: string;
  url?: string;
  asset?: Asset;
  thumbnail?: Thumbnail;
  statusId: string;
  importBatchId?: string;
  missingTitle?: boolean;
  notes?: SourceNote[];
  source?: { name: string; fields: Record<string, string> };
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
  bookmarkId: string;
  tagId: string;
}
export type Filter =
  | { op: "all" | "any"; rules: Filter[] }
  | { op: "not"; rule: Filter }
  | { op: "text"; value: string }
  /** "host" matches the hostname (without www.) or a subdomain of it exactly. */
  | { op: "url"; value: string; mode: "contains" | "domain" | "host" }
  | { op: "status"; ids: string[] }
  | { op: "tags"; ids: string[]; mode?: "any" | "all" }
  | { op: "tag-type"; ids: string[] }
  | { op: "tag-status"; ids: string[] }
  | { op: "asset"; present: boolean; kind?: MediaKind }
  | {
      op: "date";
      field: "createdAt" | "updatedAt";
      from?: string;
      to?: string;
    }
  | { op: "distance"; tagIds: string[]; hops: number }
  | { op: "missing"; field: "title" | "description" | "url" | "asset" }
  | { op: "no-tags" }
  /** A failed link check or a possible duplicate, noted at import. */
  | { op: "warning" }
  | { op: "batch"; id: string }
  | { op: "same-tag"; name?: string; typeId?: string; statusId?: string };
export interface SavedView {
  id: string;
  name: string;
  filter: Filter;
  sort: "title" | "createdAt" | "status";
  hiddenTagIds: string[];
}
export type CopyField =
  | "title"
  | "url"
  | "description"
  | "assetUrl"
  | "status"
  | "tags";
export interface CopyPreset {
  id: string;
  name: string;
  fields: CopyField[];
  separator: string;
  format: "plain" | "markdown";
  template?: string;
  scope: "all" | "current";
  sort: "title" | "createdAt" | "status";
}
export interface ImportBatch {
  id: string;
  source: string;
  createdAt: string;
  bookmarkIds: string[];
  beforeMerged: Bookmark[];
  afterRevisions: Record<string, number>;
  beforeMemberships?: Membership[];
  createdTagIds?: string[];
  createdTypeIds?: string[];
  createdStatusIds?: string[];
}
export interface StatusChange {
  id: string;
  createdAt: string;
  source: "tag" | "selection";
  targetIds: string[];
  statusId: string;
  before: Record<string, { statusId: string; revision: number }>;
  afterRevisions: Record<string, number>;
}
export interface Workspace {
  schemaVersion: 2;
  id: string;
  name: string;
  revision: number;
  bookmarks: Bookmark[];
  tags: Tag[];
  tagTypes: TagType[];
  statuses: Status[];
  memberships: Membership[];
  views: SavedView[];
  batches: ImportBatch[];
  settings: {
    extractorUrl?: string;
    statusHistory?: StatusChange[];
    copyPresets?: CopyPreset[];
  };
}
export interface Geometry {
  workspaceId: string;
  positions: Record<string, { x: number; y: number; pinned: boolean }>;
  viewport?: { zoom: number; x: number; y: number; anchor?: "center" };
}
export interface Backup {
  format: "bookmark-tag";
  version: 2;
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
    schemaVersion: 2,
    id: crypto.randomUUID(),
    name,
    revision: 0,
    bookmarks: [],
    tags: [],
    tagTypes: [],
    memberships: [],
    views: [],
    batches: [],
    settings: { statusHistory: [], copyPresets: [] },
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
/** A status as the app shows it: the stored "Pending" reads "To triage", like the header's tab. */
export function statusLabel(workspace: Workspace, id: string): string {
  if (id === "pending") return "To triage";
  return workspace.statuses.find((s) => s.id === id)?.label ?? id;
}
/** The statuses the editor offers, one per queue tab: other open statuses, such as "In progress", are left out. */
export function editorStatuses(workspace: Workspace): Status[] {
  if (!workspace.statuses.some((s) => s.id === "pending")) return workspace.statuses;
  return workspace.statuses.filter((s) => s.outcome !== "active" || s.id === "pending");
}
/** A status the editor leaves out shows, and saves, as To triage. */
export function editorStatusId(workspace: Workspace, id: string): string {
  return editorStatuses(workspace).some((s) => s.id === id) ? id : "pending";
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
const thumbnailSources: ThumbnailSource[] = ["youtube", "fxtwitter", "github", "cover", "microlink", "screenshot", "favicon"];
function fail(message: string): never {
  throw new Error(`Invalid workspace: ${message}`);
}
export function validateWorkspace(value: unknown): asserts value is Workspace {
  if (!value || typeof value !== "object") fail("expected an object");
  const w = value as Workspace;
  if (w.schemaVersion !== 2) fail("unsupported schema version");
  if (
    typeof w.id !== "string" ||
    !w.id ||
    typeof w.name !== "string" ||
    !Number.isInteger(w.revision) ||
    w.revision < 0
  )
    fail("invalid identity or revision");
  for (const key of [
    "bookmarks",
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
  const bookmarkIds = new Set(w.bookmarks.map((b) => b.id)),
    tagIds = new Set(w.tags.map((t) => t.id));
  if ([...bookmarkIds].some((id) => tagIds.has(id)))
    fail("bookmark and tag IDs must be globally unique");
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
      !["circle", "rounded-square", "diamond", "price-tag", "rounded-tag", "shipping-tag", "hang-tag"].includes(a.shape)
    )
      fail("unknown tag shape");
    if (
      a.points !== undefined &&
      !["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"].includes(a.points)
    )
      fail("unknown tag direction");
    if (a.color !== undefined && !/^#[\da-f]{6}$/i.test(a.color))
      fail("appearance color must be six-digit hex");
  };
  for (const t of w.tagTypes) {
    if (!t.name) fail("tag type needs a name");
    checkAppearance(t.appearance);
  }
  for (const record of [...w.bookmarks, ...w.tags]) {
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
  for (const b of w.bookmarks) {
    if (
      typeof b.title !== "string" ||
      !b.title ||
      typeof b.description !== "string"
    )
      fail("invalid bookmark fields");
    if (
      b.notes !== undefined &&
      (!Array.isArray(b.notes) ||
        b.notes.some(
          (n) => !n || typeof n.label !== "string" || typeof n.text !== "string",
        ))
    )
      fail("invalid bookmark notes");
    if (
      b.source !== undefined &&
      (!b.source ||
        typeof b.source.name !== "string" ||
        !b.source.fields ||
        typeof b.source.fields !== "object" ||
        Object.values(b.source.fields).some((v) => typeof v !== "string"))
    )
      fail("invalid bookmark source");
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
    if (b.thumbnail !== undefined) {
      const t = b.thumbnail as Partial<Record<string, unknown>>;
      if (!t || typeof t !== "object" || Array.isArray(t)) fail("invalid thumbnail");
      const stored = typeof t?.blobId === "string" && !!t.blobId && typeof t.source === "string"
        && thumbnailSources.includes(t.source as ThumbnailSource) && typeof t.sourceUrl === "string" && /^https?:\/\//.test(t.sourceUrl)
        && typeof t.capturedAt === "string" && Number.isFinite(Date.parse(t.capturedAt));
      const failed = t && !("blobId" in t) && typeof t.failedAt === "string" && Number.isFinite(Date.parse(t.failedAt));
      if (!stored && !failed) fail("invalid thumbnail");
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
    if (!bookmarkIds.has(edge.bookmarkId) || !tagIds.has(edge.tagId))
      fail("dangling membership");
    const pair = JSON.stringify([edge.bookmarkId, edge.tagId]);
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
    } else if (f.op === "url") {
      if (
        typeof f.value !== "string" ||
        !["contains", "domain", "host"].includes(f.mode)
      )
        fail("invalid URL filter");
    } else if (
      f.op === "status" ||
      f.op === "tags" ||
      f.op === "tag-type" ||
      f.op === "tag-status"
    ) {
      const referenceSet =
        f.op === "status" || f.op === "tag-status"
          ? statuses
          : f.op === "tags"
            ? tagIds
            : types;
      if (
        !Array.isArray(f.ids) ||
        f.ids.some((id) => !referenceSet.has(id)) ||
        (f.op === "tags" &&
          f.mode !== undefined &&
          !["any", "all"].includes(f.mode))
      )
        fail("unknown filter reference");
    } else if (f.op === "asset") {
      if (
        typeof f.present !== "boolean" ||
        (f.kind !== undefined &&
          !["image", "video", "audio"].includes(f.kind))
      )
        fail("invalid asset filter");
    } else if (f.op === "date") {
      if (
        !["createdAt", "updatedAt"].includes(f.field) ||
        (f.from !== undefined && !Number.isFinite(Date.parse(f.from))) ||
        (f.to !== undefined && !Number.isFinite(Date.parse(f.to)))
      )
        fail("invalid date filter");
      if (f.from && f.to && Date.parse(f.from) > Date.parse(f.to))
        fail("date filter range is reversed");
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
    } else if (f.op === "no-tags" || f.op === "warning") {
      return;
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
      !Array.isArray(batch.bookmarkIds) ||
      !Array.isArray(batch.beforeMerged) ||
      !batch.afterRevisions
    )
      fail("invalid import batch");
    if (batch.bookmarkIds.some((id) => !bookmarkIds.has(id)))
      fail("unknown imported bookmark");
  }
  if (!w.settings || typeof w.settings !== "object") fail("missing settings");
  if (w.settings.extractorUrl) urlKey(w.settings.extractorUrl);
  if (w.settings.copyPresets !== undefined) {
    if (!Array.isArray(w.settings.copyPresets))
      fail("copy presets must be an array");
    const presetIds = new Set<string>();
    const copyFields = new Set<CopyField>([
      "title",
      "url",
      "description",
      "assetUrl",
      "status",
      "tags",
    ]);
    for (const preset of w.settings.copyPresets) {
      if (
        !preset ||
        typeof preset.id !== "string" ||
        !preset.id ||
        presetIds.has(preset.id) ||
        typeof preset.name !== "string" ||
        !preset.name.trim() ||
        !Array.isArray(preset.fields) ||
        !preset.fields.length ||
        preset.fields.some((field) => !copyFields.has(field)) ||
        new Set(preset.fields).size !== preset.fields.length ||
        typeof preset.separator !== "string" ||
        !["plain", "markdown"].includes(preset.format) ||
        !["all", "current"].includes(preset.scope) ||
        !["title", "createdAt", "status"].includes(preset.sort) ||
        (preset.template !== undefined && typeof preset.template !== "string")
      )
        fail("invalid copy preset");
      presetIds.add(preset.id);
    }
  }
  if (w.settings.statusHistory !== undefined) {
    if (!Array.isArray(w.settings.statusHistory))
      fail("status history must be an array");
    for (const change of w.settings.statusHistory) {
      if (
        !change ||
        typeof change.id !== "string" ||
        !change.id ||
        !Number.isFinite(Date.parse(change.createdAt)) ||
        !["tag", "selection"].includes(change.source) ||
        !Array.isArray(change.targetIds) ||
        !change.targetIds.length ||
        change.targetIds.some((id) => !bookmarkIds.has(id) && !tagIds.has(id)) ||
        !statuses.has(change.statusId) ||
        !change.before ||
        !change.afterRevisions
      )
        fail("invalid status history entry");
      const beforeIds = Object.keys(change.before),
        afterIds = Object.keys(change.afterRevisions);
      if (
        beforeIds.length !== change.targetIds.length ||
        afterIds.length !== change.targetIds.length ||
        change.targetIds.some(
          (id) =>
            !Object.prototype.hasOwnProperty.call(change.before, id) ||
            !Object.prototype.hasOwnProperty.call(change.afterRevisions, id),
        )
      )
        fail("status history targets do not match revisions");
      for (const id of change.targetIds) {
        const before = change.before[id];
        if (
          !before ||
          !statuses.has(before.statusId) ||
          !Number.isInteger(before.revision) ||
          before.revision < 0 ||
          !Number.isInteger(change.afterRevisions[id]) ||
          change.afterRevisions[id] < before.revision
        )
          fail("invalid status history revision");
      }
    }
  }
}
