import type { Workspace } from "./model";

/** Tags whose bookmarks stand out in the graph. It changes nothing in the collection and lasts for the tab's session. */
export interface Highlight {
  tagIds: string[];
  /** With several tags: bookmarks with any of them, or only those with all of them. */
  mode: "any" | "all";
}
export const noHighlight: Highlight = { tagIds: [], mode: "any" };

/** The highlight without tags that no longer exist. */
export function liveHighlight(workspace: Workspace, highlight: Highlight): Highlight {
  const tagIds = highlight.tagIds.filter((id) => workspace.tags.some((t) => t.id === id));
  return tagIds.length === highlight.tagIds.length ? highlight : { ...highlight, tagIds };
}

/** IDs of the bookmarks the highlight matches. */
export function highlightedBookmarks(workspace: Workspace, highlight: Highlight): Set<string> {
  const { tagIds, mode } = liveHighlight(workspace, highlight);
  if (!tagIds.length) return new Set();
  const tagsOf = new Map<string, Set<string>>();
  for (const m of workspace.memberships) {
    if (!tagIds.includes(m.tagId)) continue;
    const tags = tagsOf.get(m.bookmarkId) ?? new Set<string>();
    tags.add(m.tagId);
    tagsOf.set(m.bookmarkId, tags);
  }
  return new Set([...tagsOf].filter(([, tags]) => mode === "any" || tags.size === tagIds.length).map(([id]) => id));
}

// Fading the other bookmarks is a device preference, like the copy and thumbnail settings.
const fadeKey = "bookmark-tag-highlight-fade";
export function readHighlightFade(): boolean {
  try { return localStorage.getItem(fadeKey) === "true"; } catch { return false; }
}
export function writeHighlightFade(fade: boolean) {
  try { localStorage.setItem(fadeKey, String(fade)); } catch { /* the choice lasts until reload */ }
}
