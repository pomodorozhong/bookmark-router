import type { Bubble, Status, Tag, Workspace } from "./model";

export type TriageTab = "todo" | "done" | "dropped" | "all";
export interface TriageFilter {
  text: string;
  hiddenTypeIds: string[];
  /** Off hides groups that no shown bookmark belongs to. */
  showEmptyGroups: boolean;
  /** Off hides bookmarks that are in no group of a shown type. */
  showUngrouped: boolean;
}
export const emptyTriageFilter: TriageFilter = { text: "", hiddenTypeIds: [], showEmptyGroups: true, showUngrouped: true };
type Point = readonly [number, number];

// Tabs follow status outcomes, so collections with their own statuses still work.
export function decisionStatuses(workspace: Workspace): { done?: Status; dropped?: Status } {
  return {
    done: workspace.statuses.find((s) => s.outcome === "completed"),
    dropped: workspace.statuses.find((s) => s.outcome === "discarded"),
  };
}
export function outcomeOf(bubble: Bubble, workspace: Workspace): Status["outcome"] {
  return workspace.statuses.find((s) => s.id === bubble.statusId)?.outcome ?? "active";
}
export function inTab(bubble: Bubble, workspace: Workspace, tab: TriageTab): boolean {
  const outcome = outcomeOf(bubble, workspace);
  return tab === "all" || (tab === "todo" ? outcome === "active" : tab === "done" ? outcome === "completed" : outcome === "discarded");
}

export function groupsOf(workspace: Workspace, bubbleId: string): Tag[] {
  const ids = new Set(workspace.memberships.filter((m) => m.bubbleId === bubbleId).map((m) => m.tagId));
  return workspace.tags.filter((t) => ids.has(t.id));
}

// Text matches a bookmark's title, URL, or description, or the name of a
// visible group it belongs to.
export function matchesFilter(bubble: Bubble, workspace: Workspace, filter: TriageFilter): boolean {
  const q = filter.text.trim().toLowerCase();
  if (!q) return true;
  if (`${bubble.title} ${bubble.url ?? ""} ${bubble.description}`.toLowerCase().includes(q)) return true;
  return groupsOf(workspace, bubble.id).some((t) => !filter.hiddenTypeIds.includes(t.typeId ?? "") && t.name.toLowerCase().includes(q));
}

// Whether a bookmark passes the filter: its text matches, and with showUngrouped
// off, it belongs to a group of a shown type.
function passesFilter(bubble: Bubble, workspace: Workspace, filter: TriageFilter): boolean {
  return matchesFilter(bubble, workspace, filter)
    && (filter.showUngrouped || groupsOf(workspace, bubble.id).some((t) => !filter.hiddenTypeIds.includes(t.typeId ?? "")));
}

// Bookmarks and groups the graph shows for a filter and queue tab. A group shows when its type
// is visible and it has a shown bookmark, or its name matches (or, with
// showEmptyGroups, it has no text filter to fail). The kept bookmarks always show, and
// their groups of a hidden type peek: they show, with their bookmarks that pass the
// text filter and tab, as peekTagIds.
export function graphVisibility(workspace: Workspace, filter: TriageFilter, tab: TriageTab = "all", keepIds: string[] = []) {
  const typeHidden = (t: Tag) => filter.hiddenTypeIds.includes(t.typeId ?? "");
  const tagsOf = new Map<string, string[]>();
  for (const m of workspace.memberships) tagsOf.set(m.bubbleId, [...(tagsOf.get(m.bubbleId) ?? []), m.tagId]);
  const kept = new Set(keepIds.flatMap((id) => tagsOf.get(id) ?? []));
  const peekTagIds = workspace.tags.filter((t) => typeHidden(t) && kept.has(t.id)).map((t) => t.id);
  const peeking = new Set(peekTagIds);
  const bubbleIds = workspace.bubbles
    .filter((b) => keepIds.includes(b.id) || (inTab(b, workspace, tab) && (passesFilter(b, workspace, filter)
      || ((tagsOf.get(b.id) ?? []).some((id) => peeking.has(id)) && matchesFilter(b, workspace, filter)))))
    .map((b) => b.id);
  const shown = new Set(bubbleIds);
  const q = filter.text.trim().toLowerCase();
  const withShown = new Set(workspace.memberships.filter((m) => shown.has(m.bubbleId)).map((m) => m.tagId));
  const hiddenTagIds = workspace.tags
    .filter((t) => !peeking.has(t.id) && (typeHidden(t)
      || (!filter.showEmptyGroups && !withShown.has(t.id))
      || (q && !t.name.toLowerCase().includes(q) && !withShown.has(t.id))))
    .map((t) => t.id);
  return { bubbleIds, hiddenTagIds, peekTagIds };
}

// A box selection is ordered clockwise from 12 o'clock around `center`, or its own
// center (screen coordinates, y down), nearer first on ties, so the queue sweeps around the graph.
export function clockwise<T extends { id: string }>(items: T[], positionOf: (id: string) => Point | undefined, center?: Point): T[] {
  const placed = items.map((item) => ({ item, at: positionOf(item.id) }));
  const known = placed.filter((p) => p.at);
  if (!known.length) return items;
  const [cx, cy] = center ?? [
    known.reduce((sum, p) => sum + p.at![0], 0) / known.length,
    known.reduce((sum, p) => sum + p.at![1], 0) / known.length,
  ];
  const angle = (at: Point) => (Math.atan2(at[0] - cx, cy - at[1]) + 2 * Math.PI) % (2 * Math.PI);
  const distance = (at: Point) => Math.hypot(at[0] - cx, at[1] - cy);
  return [...known.sort((a, b) => angle(a.at!) - angle(b.at!) || distance(a.at!) - distance(b.at!)), ...placed.filter((p) => !p.at)].map((p) => p.item);
}

export function triageQueue(
  workspace: Workspace,
  options: { tab: TriageTab; filter: TriageFilter; selection?: ReadonlySet<string>; positionOf?: (id: string) => Point | undefined },
): Bubble[] {
  const list = workspace.bubbles.filter((b) =>
    (!options.selection || options.selection.has(b.id)) && passesFilter(b, workspace, options.filter) && inTab(b, workspace, options.tab));
  return options.selection && options.positionOf ? clockwise(list, options.positionOf) : list;
}

// Bookmarks sharing at least one group with `id`, with the shared group IDs.
export function relatedOf(workspace: Workspace, id: string): Map<string, string[]> {
  const groups = new Set(workspace.memberships.filter((m) => m.bubbleId === id).map((m) => m.tagId));
  const related = new Map<string, string[]>();
  for (const m of workspace.memberships)
    if (m.bubbleId !== id && groups.has(m.tagId)) related.set(m.bubbleId, [...(related.get(m.bubbleId) ?? []), m.tagId]);
  return related;
}

// The import reason for a group, when the converted data recorded one.
export function reasonFor(bubble: Bubble, tag: Tag, workspace: Workspace): string | undefined {
  const typeName = workspace.tagTypes.find((t) => t.id === tag.typeId)?.name;
  return bubble.notes?.find((n) =>
    typeName === "Topic"
      ? n.label === "Why this topic" && n.text.includes(`"${tag.name}"`)
      : n.label === `Why ${tag.name.split(" ")[0]}`)?.text;
}

export const copyFields = ["title", "url", "domain", "description", "status", "groups", "issues", "topics", "n"] as const;
export const copyPresets: Array<{ name: string; template: string; separator: string }> = [
  { name: "Markdown list", template: "- [{title}]({url})", separator: "\n" },
  { name: "Title + link", template: "{title}\n{url}", separator: "\n\n" },
  { name: "Links only", template: "{url}", separator: "\n" },
  { name: "Titles only", template: "{title}", separator: "\n" },
  { name: "With groups", template: "- [{title}]({url}) — {groups}", separator: "\n" },
];
export function domainOf(url?: string): string {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return url ?? "";
  }
}
// Fills `{field}` placeholders for each bookmark; unknown placeholders stay as typed.
export function formatCopy(bubbles: Bubble[], workspace: Workspace, template: string, separator: string): string {
  const topicType = workspace.tagTypes.find((t) => t.name === "Topic")?.id;
  return bubbles.map((b, i) => {
    const groups = groupsOf(workspace, b.id);
    const values: Record<string, string> = {
      title: b.title,
      url: b.url ?? "",
      domain: domainOf(b.url),
      description: b.description.replace(/\s+/g, " ").trim(),
      status: workspace.statuses.find((s) => s.id === b.statusId)?.label ?? "",
      groups: groups.map((t) => t.name).join(", "),
      issues: groups.filter((t) => t.typeId !== topicType).map((t) => t.name).join(", "),
      topics: groups.filter((t) => t.typeId === topicType).map((t) => t.name).join(", "),
      n: String(i + 1),
    };
    return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  }).join(separator);
}
