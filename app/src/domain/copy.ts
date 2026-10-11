import {
  isWebUrl,
  type Bookmark,
  type CopyField,
  type CopyPreset,
  type Workspace,
} from "./model";

export interface CopyOptions {
  fields: CopyField[];
  separator: string;
  format: "plain" | "markdown";
  template?: string;
  sort: "title" | "createdAt" | "status";
}

function fieldValue(field: CopyField, bookmark: Bookmark, workspace: Workspace): string {
  if (field === "title") return bookmark.title;
  if (field === "url") return bookmark.url ?? "";
  if (field === "description") return bookmark.description;
  if (field === "assetUrl")
    return bookmark.asset?.source === "remote"
      ? bookmark.asset.url ?? ""
      : bookmark.asset?.filename ?? "";
  if (field === "status")
    return workspace.statuses.find((status) => status.id === bookmark.statusId)?.label ?? "";
  return workspace.memberships
    .filter((membership) => membership.bookmarkId === bookmark.id)
    .map((membership) => workspace.tags.find((tag) => tag.id === membership.tagId)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

const labels: Record<CopyField, string> = {
  title: "Title",
  url: "URL",
  description: "Description",
  assetUrl: "Asset",
  status: "Status",
  tags: "Tags",
};

function markdownValue(field: CopyField, value: string): string {
  if (!value) return "";
  if ((field === "url" || field === "assetUrl") && isWebUrl(value))
    return `[${value}](${value})`;
  return value;
}

export function sortBookmarks(
  bookmarks: Bookmark[],
  workspace: Workspace,
  sort: CopyOptions["sort"],
): Bookmark[] {
  return [...bookmarks].sort((left, right) => {
    if (sort === "createdAt") return left.createdAt.localeCompare(right.createdAt);
    if (sort === "status") {
      const leftStatus = workspace.statuses.find((status) => status.id === left.statusId)?.label ?? "";
      const rightStatus = workspace.statuses.find((status) => status.id === right.statusId)?.label ?? "";
      return leftStatus.localeCompare(rightStatus) || left.title.localeCompare(right.title);
    }
    return left.title.localeCompare(right.title);
  });
}

export function composeCopy(
  bookmarks: Bookmark[],
  workspace: Workspace,
  options: CopyOptions,
): string {
  const fields = [...new Set(options.fields)];
  const sorted = sortBookmarks(bookmarks, workspace, options.sort);
  return sorted
    .map((bookmark) => {
      const rawValues = Object.fromEntries(
        fields.map((field) => {
          const raw = fieldValue(field, bookmark, workspace);
          return [field, raw];
        }),
      ) as Partial<Record<CopyField, string>>;
      if (options.template?.trim()) {
        return options.template
          .replace(/\{\{\s*(title|url|description|assetUrl|status|tags)\s*\}\}/g, (_, field: CopyField) => rawValues[field] ?? "")
          .split("\n")
          .filter((line, index, lines) => line.trim() || (index > 0 && lines[index - 1].trim()))
          .join("\n")
          .trim();
      }
      const values = Object.fromEntries(
        fields.map((field) => [
          field,
          options.format === "markdown"
            ? markdownValue(field, rawValues[field] ?? "")
            : rawValues[field] ?? "",
        ]),
      ) as Partial<Record<CopyField, string>>;
      return fields
        .map((field) => {
          const value = values[field] ?? "";
          return options.format === "markdown" ? `${labels[field]}: ${value}` : value;
        })
        .filter(Boolean)
        .join(options.separator);
    })
    .filter(Boolean)
    .join("\n\n");
}

export const defaultCopyOptions: CopyOptions = {
  fields: ["title", "url", "description", "status", "tags"],
  separator: "\n",
  format: "plain",
  sort: "title",
};

export const builtInCopyPresets: CopyPreset[] = [
  {
    id: "builtin-default",
    name: "Default",
    fields: defaultCopyOptions.fields,
    separator: defaultCopyOptions.separator,
    format: defaultCopyOptions.format,
    scope: "all",
    sort: defaultCopyOptions.sort,
  },
  {
    id: "builtin-link-only",
    name: "Link only",
    fields: ["url"],
    separator: "\n",
    format: "plain",
    scope: "all",
    sort: "title",
  },
  {
    id: "builtin-title-only",
    name: "Title only",
    fields: ["title"],
    separator: "\n",
    format: "plain",
    scope: "all",
    sort: "title",
  },
  {
    id: "builtin-title-and-link",
    name: "Title + link",
    fields: ["title", "url"],
    separator: "\n",
    format: "plain",
    scope: "all",
    sort: "title",
  },
  {
    id: "builtin-markdown-links",
    name: "Markdown links",
    fields: ["title", "url"],
    separator: "\n",
    format: "markdown",
    template: "[{{title}}]({{url}})",
    scope: "all",
    sort: "title",
  },
];
