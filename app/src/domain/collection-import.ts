import { ConflictError } from "./commands";
import { commitImport } from "./import-commands";
import { candidateFrom, markDuplicates, type ImportCommitCommand } from "./imports";
import { emptyWorkspace, isWebUrl, validateWorkspace, type Workspace } from "./model";

export interface CollectionImportTag {
  /** Names the tag inside this import only; bookmarks link to it through `tagRefs`. */
  ref: string;
  name: string;
}
export interface CollectionImportBookmark {
  url: string;
  title?: string;
  description?: string;
  tagRefs?: string[];
  asset?: { kind: "image"; source: "remote"; url: string };
}
/** A complete import that creates a new collection: its name, its tags, and its bookmarks. */
export interface CollectionImportInput {
  name: string;
  /** Recorded in the collection's import history. */
  source: string;
  tags: CollectionImportTag[];
  bookmarks: CollectionImportBookmark[];
}
export interface StagedCollectionImport {
  input: CollectionImportInput;
  /** Every ID the build handed out, in order; applying replays them. */
  ids: string[];
  createdAt: string;
  /** The complete collection as Apply will save it. */
  collection: Workspace;
  /** The same collection before the import, which Undo restores. */
  empty: Workspace;
  tagIds: Record<string, string>;
  /** In input order. */
  bookmarkIds: string[];
  batchId: string;
}
export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
}

function build(input: CollectionImportInput, newId: () => string, now: string) {
  const name = input.name.trim();
  if (!name) throw new ImportInputError("Name the new collection.");
  if (!input.bookmarks.length) throw new ImportInputError("Include at least one bookmark.");
  const refs = new Map<string, string>(), names = new Set<string>();
  for (const tag of input.tags) {
    const tagName = tag.name.trim();
    if (!tag.ref.trim() || !tagName) throw new ImportInputError("Every tag needs a reference and a name.");
    if (refs.has(tag.ref)) throw new ImportInputError(`Tag reference “${tag.ref}” is used more than once.`);
    if (names.has(tagName.toLowerCase())) throw new ImportInputError(`Tag “${tagName}” is declared more than once.`);
    refs.set(tag.ref, tagName);
    names.add(tagName.toLowerCase());
  }
  const candidates = input.bookmarks.map((bookmark, i) => {
    const row = i + 1, tagRefs = bookmark.tagRefs ?? [];
    if (new Set(tagRefs).size !== tagRefs.length) throw new ImportInputError(`Bookmark ${row} links to the same tag more than once.`);
    const unknown = tagRefs.find((ref) => !refs.has(ref));
    if (unknown !== undefined) throw new ImportInputError(`Bookmark ${row} links to unknown tag reference “${unknown}”.`);
    const asset = bookmark.asset;
    if (asset && (asset.kind !== "image" || asset.source !== "remote" || !isWebUrl(asset.url.trim())))
      throw new ImportInputError(`Bookmark ${row}: the image must be a remote image with an HTTP or HTTPS URL.`);
    const candidate = candidateFrom(row, {
      title: bookmark.title ?? "",
      description: bookmark.description ?? "",
      url: bookmark.url,
      mediaUrl: asset?.url ?? "",
      status: "Pending",
      tags: tagRefs.map((ref) => refs.get(ref)!),
      tagType: "",
    });
    if (!candidate.url || candidate.urlWarning) throw new ImportInputError(`Bookmark ${row} needs an HTTP or HTTPS URL.`);
    if (asset) candidate.mediaKind = "image";
    return candidate;
  });
  const empty: Workspace = { ...emptyWorkspace(name), id: newId() };
  markDuplicates(candidates, empty);
  const repeated = candidates.find((c) => c.duplicate);
  if (repeated) throw new ImportInputError(`Bookmark ${repeated.row} repeats the URL of bookmark ${repeated.duplicate!.row}.`);
  const command: ImportCommitCommand = {
    type: "import.commit",
    expectedRevision: empty.revision,
    preview: { candidates, workspaceRevision: empty.revision, newTags: [...refs.values()], unknownStatuses: [], unknownTypes: [] },
    decisions: candidates.map((c) => ({ row: c.row, action: "keep" })),
    statusMapping: {},
    typeMapping: {},
    source: input.source,
  };
  const collection = commitImport(empty, command, { newId, now });
  const batch = collection.batches.at(-1)!;
  // The import workflow only creates tags its bookmarks use; declared tags without bookmarks are created empty.
  for (const tagName of refs.values()) {
    if (collection.tags.some((t) => t.name === tagName)) continue;
    const tag = { id: newId(), name: tagName, appearance: {}, statusId: collection.statuses[0].id, revision: 0, createdAt: now, updatedAt: now };
    collection.tags.push(tag);
    batch.createdTagIds!.push(tag.id);
  }
  validateWorkspace(collection);
  const tagIds = Object.fromEntries([...refs].map(([ref, tagName]) => [ref, collection.tags.find((t) => t.name === tagName)!.id]));
  return { collection, empty, tagIds, bookmarkIds: batch.bookmarkIds, batchId: batch.id };
}

/** Validates a complete import and builds the collection it would create, assigning every ID once. Writes nothing. */
export function stageCollectionImport(input: CollectionImportInput): StagedCollectionImport {
  const ids: string[] = [], createdAt = new Date().toISOString();
  const built = build(structuredClone(input), () => {
    const id = crypto.randomUUID();
    ids.push(id);
    return id;
  }, createdAt);
  return { input: structuredClone(input), ids, createdAt, ...built };
}

/** Rebuilds a staged import with its recorded IDs and checks the result is still the collection that was staged. */
export function revalidateCollectionImport(staged: StagedCollectionImport): Pick<StagedCollectionImport, "collection" | "empty"> {
  let next = 0;
  const built = build(structuredClone(staged.input), () => {
    if (next >= staged.ids.length) throw new ConflictError("The staged import no longer matches its preview.");
    return staged.ids[next++];
  }, staged.createdAt);
  if (next !== staged.ids.length || JSON.stringify(built.collection) !== JSON.stringify(staged.collection))
    throw new ConflictError("The staged import no longer matches its preview.");
  return built;
}

export function collectionImportLabel(staged: StagedCollectionImport) {
  const count = staged.bookmarkIds.length;
  return `Import ${count} ${count === 1 ? "bookmark" : "bookmarks"}`;
}
