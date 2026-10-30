import Papa from "papaparse";
import { validateGraphLayout } from "./geometry";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import {
  urlKey,
  isWebUrl,
  storedUrlKey,
  validateWorkspace,
  type Workspace,
  type Backup,
  type MediaKind,
} from "./model";
export type Format = "auto" | "urls" | "csv" | "tsv" | "html" | "json";
export type Field =
  | "title"
  | "description"
  | "url"
  | "mediaUrl"
  | "status"
  | "tags"
  | "tagType";
export const fields: Field[] = [
  "title",
  "description",
  "url",
  "mediaUrl",
  "status",
  "tags",
  "tagType",
];
export type Mapping = Record<Field, string>;
export interface SourceRow {
  row: number;
  values: Record<string, string>;
  errors: string[];
}
export interface ParsedImport {
  format: Exclude<Format, "auto">;
  headers: string[];
  rows: SourceRow[];
  restore?: Backup;
}
export interface Candidate {
  row: number;
  title: string;
  missingTitle: boolean;
  description: string;
  url?: string;
  mediaUrl?: string;
  /** Set when the source states the media kind; otherwise it's read from the URL's extension. */
  mediaKind?: MediaKind;
  urlWarning?: string;
  status: string;
  tags: string[];
  tagType?: string;
  errors: string[];
  duplicate?: {
    kind: "workspace" | "import";
    title: string;
    id?: string;
    row?: number;
  };
  repeatedRow?: number;
}
export interface Preview {
  candidates: Candidate[];
  workspaceRevision: number;
  newTags: string[];
  unknownStatuses: string[];
  unknownTypes: string[];
}
export function detectFormat(
  text: string,
  filename = "",
): Exclude<Format, "auto"> {
  if (/\.json$/i.test(filename) || /^\s*[\[{]/.test(text)) return "json";
  if (/\.html?$/i.test(filename) || /<\s*(?:!DOCTYPE|DL|DT|A)\b/i.test(text))
    return "html";
  if (/\.tsv$/i.test(filename) || text.split(/\r?\n/)[0]?.includes("\t"))
    return "tsv";
  if (
    /\.csv$/i.test(filename) ||
    (/[,;]/.test(text.split(/\r?\n/)[0] ?? "") &&
      !/^\s*https?:\/\//i.test(text))
  )
    return "csv";
  return "urls";
}
export function parseImport(
  text: string,
  format: Format = "auto",
  filename = "",
): ParsedImport {
  const resolved = format === "auto" ? detectFormat(text, filename) : format;
  if (!text.trim()) throw new Error("Paste data or select a file first.");
  if (resolved === "urls")
    return {
      format: resolved,
      headers: ["url"],
      rows: text
        .split(/\r?\n/)
        .flatMap((line, i) =>
          line.trim()
            ? [{ row: i + 1, values: { url: line.trim() }, errors: [] }]
            : [],
        ),
    };
  if (resolved === "csv" || resolved === "tsv") {
    const parsed = Papa.parse<string[]>(text, {
      delimiter: resolved === "tsv" ? "\t" : "",
      skipEmptyLines: false,
    });
    const headers = (parsed.data[0] ?? []).map(
      (s, i) => s.replace(/^\uFEFF/, "").trim() || `Column ${i + 1}`,
    );
    if (new Set(headers).size !== headers.length)
      throw new Error(
        "Column names must be unique. Rename repeated headers before importing.",
      );
    const rows: SourceRow[] = [];
    let line = 2;
    for (let i = 1; i < parsed.data.length; i++) {
      const cells = parsed.data[i];
      if (cells.some((c) => c.trim()))
        rows.push({
          row: line,
          values: Object.fromEntries(
            headers.map((h, j) => [h, cells[j] ?? ""]),
          ),
          errors: [
            ...(cells.length !== headers.length
              ? [`Expected ${headers.length} columns; found ${cells.length}.`]
              : []),
            ...parsed.errors.filter((e) => e.row === i).map((e) => e.message),
          ],
        });
      line +=
        1 +
        cells.reduce(
          (count, cell) => count + (cell.match(/\n/g)?.length ?? 0),
          0,
        );
    }
    return { format: resolved, headers, rows };
  }
  if (resolved === "html") {
    const rows: SourceRow[] = [];
    type Node = DefaultTreeAdapterMap["node"];
    const textOf = (node: Node): string =>
      "value" in node
        ? node.value
        : "childNodes" in node
          ? node.childNodes.map(textOf).join("")
          : "";
    let recent: SourceRow | undefined;
    function visit(node: Node, folders: string[]) {
      if (!("childNodes" in node)) return;
      let folder: string | undefined;
      for (const child of node.childNodes) {
        if ("tagName" in child && child.tagName === "h3") {
          folder = textOf(child).trim();
          continue;
        }
        if ("tagName" in child && child.tagName === "a") {
          const attrs = Object.fromEntries(
            child.attrs.map((a) => [a.name, a.value]),
          );
          recent = {
            row: child.sourceCodeLocation?.startLine ?? rows.length + 1,
            values: {
              title: textOf(child).trim(),
              url: attrs.href ?? "",
              description: "",
              tags: [...folders, ...(attrs.tags?.split(",") ?? [])].join("|"),
            },
            errors: [],
          };
          rows.push(recent);
        } else if ("tagName" in child && child.tagName === "dd") {
          if (recent) recent.values.description = textOf(child).trim();
        } else
          visit(
            child,
            "tagName" in child && child.tagName === "dl" && folder
              ? [...folders, folder]
              : folders,
          );
        // Netscape files often wrap folder headers and nested lists in a DT.
        if ("tagName" in child && child.tagName === "dt") {
          const heading = child.childNodes.find(
            (n) => "tagName" in n && n.tagName === "h3",
          );
          if (heading) folder = textOf(heading).trim();
        }
      }
    }
    visit(parse(text, { sourceCodeLocationInfo: true }), []);
    if (!rows.length)
      throw new Error("No bookmark links found in this HTML file.");
    return {
      format: resolved,
      headers: ["title", "url", "description", "tags"],
      rows,
    };
  }
  const backup = JSON.parse(text) as Backup;
  if (
    backup.format !== "bookmark-tag" ||
    backup.version !== 2 ||
    !Array.isArray(backup.media)
  )
    throw new Error(
      "Use a versioned Bookmark & Tag JSON backup. Prototype JSON is not supported; for an older Bubble & Tag backup, run npm run upgrade-backup first.",
    );
  validateWorkspace(backup.workspace);
  const mediaIds = new Set<string>();
  for (const media of backup.media) {
    if (
      !media ||
      typeof media.id !== "string" ||
      !media.id ||
      mediaIds.has(media.id) ||
      typeof media.filename !== "string" ||
      typeof media.mime !== "string" ||
      typeof media.base64 !== "string"
    )
      throw new Error("Invalid or repeated media entries in backup.");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        media.base64,
      )
    )
      throw new Error("Invalid media encoding.");
    mediaIds.add(media.id);
  }
  for (const bookmark of [
    ...backup.workspace.bookmarks,
    ...backup.workspace.batches.flatMap((b) => b.beforeMerged),
  ]) {
    if (bookmark.asset?.source === "local" && !mediaIds.has(bookmark.asset.blobId!))
      throw new Error(`Backup is missing local media for “${bookmark.title}”.`);
    if (bookmark.thumbnail && "blobId" in bookmark.thumbnail && !mediaIds.has(bookmark.thumbnail.blobId))
      throw new Error(`Backup is missing the thumbnail for “${bookmark.title}”.`);
  }
  if (backup.geometry) {
    if (
      backup.geometry.workspaceId !== backup.workspace.id ||
      !backup.geometry.positions
    )
      throw new Error("Invalid backup geometry.");
    validateGraphLayout(backup.geometry);
    const connections = backup.geometry.connections;
    if (connections !== undefined) {
      if (!connections || typeof connections !== "object" || Array.isArray(connections)) throw new Error("Invalid connection geometry.");
      for (const layout of [connections.direct, connections.tags])
        if (layout !== undefined) validateGraphLayout(layout);
    }
  }
  return {
    format: resolved,
    restore: backup,
    headers: fields,
    rows: backup.workspace.bookmarks.map((b, i) => ({
      row: i + 1,
      values: {
        title: b.title,
        description: b.description,
        url: b.url ?? "",
        mediaUrl: b.asset?.source === "remote" ? (b.asset.url ?? "") : "",
        status: backup.workspace.statuses.find((s) => s.id === b.statusId)!
          .label,
        tags: backup.workspace.memberships
          .filter((m) => m.bookmarkId === b.id)
          .map((m) => backup.workspace.tags.find((t) => t.id === m.tagId)!.name)
          .join("|"),
        tagType: "",
      },
      errors: [],
    })),
  };
}
export function guessMapping(headers: string[]): Mapping {
  const aliases: Record<Field, string[]> = {
    title: ["title", "name"],
    description: ["description", "note", "notes", "excerpt"],
    url: ["url", "link", "href"],
    mediaUrl: ["mediaurl", "media url", "asset", "image"],
    status: ["status", "action status"],
    tags: ["tags", "tag", "folder", "category"],
    tagType: ["tagtype", "tag type", "type"],
  };
  return Object.fromEntries(
    fields.map((f) => [
      f,
      headers.find((h) => aliases[f].includes(h.toLowerCase())) ?? "",
    ]),
  ) as Mapping;
}
export type CandidateFields = Record<Exclude<Field, "tags">, string> & { tags: string[] };
/** One record's cleanup, shared by every import path: trimmed fields, the title fallback, and URL checks. */
export function candidateFrom(row: number, fields: CandidateFields, errors: string[] = []): Candidate {
  const url = fields.url.trim(),
    mediaUrl = fields.mediaUrl.trim(),
    suppliedTitle = fields.title.trim();
  const candidate: Candidate = {
    row,
    title: suppliedTitle || url || "Untitled",
    missingTitle: !suppliedTitle,
    description: fields.description.trim(),
    url: url || undefined,
    mediaUrl: mediaUrl || undefined,
    status: fields.status.trim(),
    tags: [...new Set(fields.tags.map((t) => t.trim()).filter(Boolean))],
    tagType: fields.tagType.trim() || undefined,
    errors: [...errors],
  };
  if (url && !isWebUrl(url))
    candidate.urlWarning = "Unrecognized URL · saved as text, not a link";
  if (mediaUrl && !isWebUrl(mediaUrl))
    candidate.errors.push("Media URL must be an HTTP or HTTPS link.");
  return candidate;
}
/** Marks each valid candidate whose URL matches a bookmark in the collection or an earlier candidate. */
export function markDuplicates(candidates: Candidate[], w: Workspace) {
  const seenUrls = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.url || candidate.errors.length) continue;
    const key = storedUrlKey(candidate.url),
      existing = w.bookmarks.find((b) => b.url && storedUrlKey(b.url) === key),
      earlier = seenUrls.get(key);
    if (existing)
      candidate.duplicate = {
        kind: "workspace",
        title: existing.title,
        id: existing.id,
      };
    else if (earlier)
      candidate.duplicate = {
        kind: "import",
        title: earlier.title,
        row: earlier.row,
      };
    if (!earlier) seenUrls.set(key, candidate);
  }
}
export function previewImport(
  parsed: ParsedImport,
  mapping: Mapping,
  w: Workspace,
  options: { delimiter: string; commonTags: string; initialStatus: string },
): Preview {
  const signatures = new Map<string, number>();
  const candidates = parsed.rows.map((row) => {
    const get = (f: Field) => (row.values[mapping[f]] ?? "").trim();
    const candidate = candidateFrom(row.row, {
      title: get("title"),
      description: get("description"),
      url: get("url"),
      mediaUrl: get("mediaUrl"),
      status: get("status") || options.initialStatus,
      tags: [get("tags"), options.commonTags].flatMap((v) =>
        v ? v.split(options.delimiter || "|") : [],
      ),
      tagType: get("tagType"),
    }, row.errors);
    const signature = JSON.stringify(row.values);
    if (signatures.has(signature))
      candidate.repeatedRow = signatures.get(signature);
    else signatures.set(signature, row.row);
    return candidate;
  });
  markDuplicates(candidates, w);
  const valid = candidates.filter((c) => !c.errors.length);
  return {
    candidates,
    workspaceRevision: w.revision,
    newTags: [...new Set(valid.flatMap((c) => c.tags))].filter(
      (name) => !w.tags.some((t) => t.name === name),
    ),
    unknownStatuses: [...new Set(valid.map((c) => c.status))].filter(
      (label) => !w.statuses.some((s) => s.label === label),
    ),
    unknownTypes: [
      ...new Set(valid.flatMap((c) => (c.tagType ? [c.tagType] : []))),
    ].filter((name) => !w.tagTypes.some((t) => t.name === name)),
  };
}
export interface ImportDecision {
  row: number;
  action: "skip" | "keep" | "merge";
  targetId?: string;
  targetRow?: number;
}
export interface ImportCommitCommand {
  type: "import.commit";
  expectedRevision: number;
  preview: Preview;
  decisions: ImportDecision[];
  statusMapping: Record<string, string>;
  typeMapping: Record<string, string>;
  source: string;
}
// Checkpoint A reviews these interfaces before commit/undo UI implementation.
