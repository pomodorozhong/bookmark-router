import { hostOf, matchesFilter as engineMatches } from "./filters";
import type { Bookmark, Filter, Status, Tag, Workspace } from "./model";

export type TriageTab = "todo" | "done" | "dropped" | "all";
export interface TriageFilter {
  text: string;
  hiddenTypeIds: string[];
  /** Off hides groups that no shown bookmark belongs to. */
  showEmptyGroups: boolean;
  /** Off hides bookmarks that are in no group of a shown type. */
  showUngrouped: boolean;
  /** Filter chips; all must match. */
  rules: Rule[];
}
export const emptyTriageFilter: TriageFilter = { text: "", hiddenTypeIds: [], showEmptyGroups: true, showUngrouped: true, rules: [] };

// A filter chip: a bookmark matches when any of its values does, or, with `not`, when none does.
export type RuleKind = "status" | "group" | "domain" | "has" | "import" | "added";
export interface Rule { kind: RuleKind; values: string[]; not: boolean }
export const ruleKinds: Array<{ kind: RuleKind; label: string }> = [
  { kind: "status", label: "Status" }, { kind: "group", label: "Group" }, { kind: "domain", label: "Domain" },
  { kind: "has", label: "Has" }, { kind: "import", label: "Import" }, { kind: "added", label: "Added" },
];
const hasValues = ["image", "description", "warning", "no group"] as const;

// "Added" values are local calendar months, "YYYY-MM".
const monthOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(new Date(y, m, 1).getTime() - 1).toISOString() };
}

/** The values a chip of this kind can pick, with their labels. */
export function ruleOptions(workspace: Workspace, kind: RuleKind): Array<{ value: string; label: string }> {
  if (kind === "status") return workspace.statuses.map((s) => ({ value: s.id, label: s.label }));
  if (kind === "group") return workspace.tags.map((t) => ({ value: t.id, label: t.name }));
  if (kind === "has") return hasValues.map((v) => ({ value: v, label: v }));
  if (kind === "import") return workspace.batches.map((b) => ({ value: b.id, label: `${b.source} · ${new Date(b.createdAt).toLocaleDateString()}` }));
  if (kind === "domain") {
    const counts = new Map<string, number>();
    for (const b of workspace.bookmarks) { const h = hostOf(b.url); if (h) counts.set(h, (counts.get(h) ?? 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h]) => ({ value: h, label: h }));
  }
  const months = [...new Set(workspace.bookmarks.map((b) => monthOf(b.createdAt)))].sort().reverse();
  return months.map((m) => ({ value: m, label: new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long" }) }));
}

function leaf(kind: RuleKind, value: string): Filter {
  if (kind === "domain") return { op: "url", value, mode: "host" };
  if (kind === "import") return { op: "batch", id: value };
  if (kind === "added") return { op: "date", field: "createdAt", ...monthRange(value) };
  if (value === "image") return { op: "asset", present: true, kind: "image" };
  if (value === "description") return { op: "not", rule: { op: "missing", field: "description" } };
  return value === "warning" ? { op: "warning" } : { op: "no-tags" };
}
/** The chips and search text as one filter for the filter engine, which saved views store. */
export function compileRules(rules: Rule[], text = ""): Filter {
  return {
    op: "all",
    rules: [
      ...rules.filter((r) => r.values.length).map((r): Filter => {
        const one: Filter = r.kind === "status" ? { op: "status", ids: r.values }
          : r.kind === "group" ? { op: "tags", ids: r.values, mode: "any" }
          : r.values.length === 1 ? leaf(r.kind, r.values[0]) : { op: "any", rules: r.values.map((v) => leaf(r.kind, v)) };
        return r.not ? { op: "not", rule: one } : one;
      }),
      ...(text.trim() ? [{ op: "text" as const, value: text.trim() }] : []),
    ],
  };
}
function readLeaf(f: Filter): { kind: RuleKind; values: string[] } | undefined {
  if (f.op === "status") return { kind: "status", values: f.ids };
  if (f.op === "tags" && f.mode !== "all") return { kind: "group", values: f.ids };
  if (f.op === "url" && f.mode === "host") return { kind: "domain", values: [f.value] };
  if (f.op === "batch") return { kind: "import", values: [f.id] };
  if (f.op === "date" && f.field === "createdAt" && f.from) return { kind: "added", values: [monthOf(f.from)] };
  if (f.op === "asset" && f.present && f.kind === "image") return { kind: "has", values: ["image"] };
  if (f.op === "not" && f.rule.op === "missing" && f.rule.field === "description") return { kind: "has", values: ["description"] };
  if (f.op === "warning") return { kind: "has", values: ["warning"] };
  if (f.op === "no-tags") return { kind: "has", values: ["no group"] };
  if (f.op === "any") {
    const parts = f.rules.map(readLeaf);
    if (parts.length && parts.every((p) => p && p.kind === parts[0]!.kind)) return { kind: parts[0]!.kind, values: parts.flatMap((p) => p!.values) };
  }
  return undefined;
}
/** Chips and search text back from a saved view's filter, or undefined if it is not one the chips can show. */
export function readRules(filter: Filter): { rules: Rule[]; text: string } | undefined {
  if (filter.op !== "all") return undefined;
  const rules: Rule[] = [];
  let text = "";
  for (const f of filter.rules) {
    if (f.op === "text") { text = f.value; continue; }
    const not = f.op === "not" && !(f.rule.op === "missing");
    const part = readLeaf(not && f.op === "not" ? f.rule : f);
    if (!part) return undefined;
    rules.push({ ...part, not });
  }
  return { rules, text };
}
type Point = readonly [number, number];

// Tabs follow status outcomes, so collections with their own statuses still work.
export function decisionStatuses(workspace: Workspace): { done?: Status; dropped?: Status } {
  return {
    done: workspace.statuses.find((s) => s.outcome === "completed"),
    dropped: workspace.statuses.find((s) => s.outcome === "discarded"),
  };
}
export function outcomeOf(bookmark: Bookmark, workspace: Workspace): Status["outcome"] {
  return workspace.statuses.find((s) => s.id === bookmark.statusId)?.outcome ?? "active";
}
export function inTab(bookmark: Bookmark, workspace: Workspace, tab: TriageTab): boolean {
  const outcome = outcomeOf(bookmark, workspace);
  return tab === "all" || (tab === "todo" ? outcome === "active" : tab === "done" ? outcome === "completed" : outcome === "discarded");
}

export function groupsOf(workspace: Workspace, bookmarkId: string): Tag[] {
  const ids = new Set(workspace.memberships.filter((m) => m.bookmarkId === bookmarkId).map((m) => m.tagId));
  return workspace.tags.filter((t) => ids.has(t.id));
}

// Text matches a bookmark's title, URL, or description, or the name of a
// visible group it belongs to.
export function matchesFilter(bookmark: Bookmark, workspace: Workspace, filter: TriageFilter): boolean {
  const q = filter.text.trim().toLowerCase();
  if (!q) return true;
  if (`${bookmark.title} ${bookmark.url ?? ""} ${bookmark.description}`.toLowerCase().includes(q)) return true;
  return groupsOf(workspace, bookmark.id).some((t) => !filter.hiddenTypeIds.includes(t.typeId ?? "") && t.name.toLowerCase().includes(q));
}

const matchesRules = (bookmark: Bookmark, workspace: Workspace, filter: TriageFilter) =>
  !filter.rules.length || engineMatches(compileRules(filter.rules), bookmark, workspace);

// Whether a bookmark passes the filter: its text matches, its chips match, and with
// showUngrouped off, it belongs to a group of a shown type.
function passesFilter(bookmark: Bookmark, workspace: Workspace, filter: TriageFilter): boolean {
  return matchesFilter(bookmark, workspace, filter) && matchesRules(bookmark, workspace, filter)
    && (filter.showUngrouped || groupsOf(workspace, bookmark.id).some((t) => !filter.hiddenTypeIds.includes(t.typeId ?? "")));
}

/** For a chip's menu: how many bookmarks in the tab each value would leave, with the other chips applied. */
export function ruleValueCounts(workspace: Workspace, filter: TriageFilter, tab: TriageTab, index: number): Map<string, number> {
  const rule = filter.rules[index];
  const others = { ...filter, rules: filter.rules.filter((_, i) => i !== index) };
  const base = workspace.bookmarks.filter((b) => inTab(b, workspace, tab) && passesFilter(b, workspace, others));
  const counts = new Map<string, number>();
  for (const { value } of ruleOptions(workspace, rule.kind)) {
    const f = compileRules([{ kind: rule.kind, values: [value], not: false }]);
    counts.set(value, base.filter((b) => engineMatches(f, b, workspace)).length);
  }
  return counts;
}

// Bookmarks and groups the graph shows for a filter and queue tab. A group shows when its type
// is visible and it has a shown bookmark, or its name matches (or, with
// showEmptyGroups, it has no text filter to fail). The kept bookmarks always show, and
// their groups of a hidden type peek: they show, with their bookmarks that pass the
// text filter, chips, and tab, as peekTagIds.
export function graphVisibility(workspace: Workspace, filter: TriageFilter, tab: TriageTab = "all", keepIds: string[] = []) {
  const typeHidden = (t: Tag) => filter.hiddenTypeIds.includes(t.typeId ?? "");
  const tagsOf = new Map<string, string[]>();
  for (const m of workspace.memberships) tagsOf.set(m.bookmarkId, [...(tagsOf.get(m.bookmarkId) ?? []), m.tagId]);
  const kept = new Set(keepIds.flatMap((id) => tagsOf.get(id) ?? []));
  const peekTagIds = workspace.tags.filter((t) => typeHidden(t) && kept.has(t.id)).map((t) => t.id);
  const peeking = new Set(peekTagIds);
  const bookmarkIds = workspace.bookmarks
    .filter((b) => keepIds.includes(b.id) || (inTab(b, workspace, tab) && (passesFilter(b, workspace, filter)
      || ((tagsOf.get(b.id) ?? []).some((id) => peeking.has(id)) && matchesFilter(b, workspace, filter) && matchesRules(b, workspace, filter)))))
    .map((b) => b.id);
  const shown = new Set(bookmarkIds);
  const q = filter.text.trim().toLowerCase();
  const withShown = new Set(workspace.memberships.filter((m) => shown.has(m.bookmarkId)).map((m) => m.tagId));
  const hiddenTagIds = workspace.tags
    .filter((t) => !peeking.has(t.id) && (typeHidden(t)
      || (!filter.showEmptyGroups && !withShown.has(t.id))
      || (q && !t.name.toLowerCase().includes(q) && !withShown.has(t.id))))
    .map((t) => t.id);
  return { bookmarkIds, hiddenTagIds, peekTagIds };
}

// A box selection is ordered clockwise around `center`, or its own center (screen
// coordinates, y down), nearer first on ties, so the queue sweeps around the graph. It
// starts at 12 o'clock, or, when the items leave more than a quarter of the ring empty,
// at the clockwise edge of that gap, so the order runs along the cluster from one end.
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
  const sorted = known.sort((a, b) => angle(a.at!) - angle(b.at!) || distance(a.at!) - distance(b.at!));
  const angles = sorted.map((p) => angle(p.at!));
  let start = 0, widest = 0;
  for (const [i, a] of angles.entries()) {
    const gap = i ? a - angles[i - 1] : a + 2 * Math.PI - angles[angles.length - 1];
    if (gap > widest) [widest, start] = [gap, i];
  }
  if (widest <= Math.PI / 2) start = 0;
  return [...sorted.slice(start), ...sorted.slice(0, start), ...placed.filter((p) => !p.at)].map((p) => p.item);
}

export function triageQueue(
  workspace: Workspace,
  options: { tab: TriageTab; filter: TriageFilter; selection?: ReadonlySet<string>; positionOf?: (id: string) => Point | undefined },
): Bookmark[] {
  const list = workspace.bookmarks.filter((b) =>
    (!options.selection || options.selection.has(b.id)) && passesFilter(b, workspace, options.filter) && inTab(b, workspace, options.tab));
  return options.selection && options.positionOf ? clockwise(list, options.positionOf) : list;
}

// Bookmarks sharing at least one group with `id`, with the shared group IDs.
export function relatedOf(workspace: Workspace, id: string): Map<string, string[]> {
  const groups = new Set(workspace.memberships.filter((m) => m.bookmarkId === id).map((m) => m.tagId));
  const related = new Map<string, string[]>();
  for (const m of workspace.memberships)
    if (m.bookmarkId !== id && groups.has(m.tagId)) related.set(m.bookmarkId, [...(related.get(m.bookmarkId) ?? []), m.tagId]);
  return related;
}

// The import reason for a group, when the converted data recorded one.
export function reasonFor(bookmark: Bookmark, tag: Tag, workspace: Workspace): string | undefined {
  const typeName = workspace.tagTypes.find((t) => t.id === tag.typeId)?.name;
  return bookmark.notes?.find((n) =>
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
  { name: "With tags", template: "- [{title}]({url}) — {groups}", separator: "\n" },
];
export function domainOf(url?: string): string {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return url ?? "";
  }
}
// Fills `{field}` placeholders for each bookmark; unknown placeholders stay as typed.
export function formatCopy(bookmarks: Bookmark[], workspace: Workspace, template: string, separator: string): string {
  const topicType = workspace.tagTypes.find((t) => t.name === "Topic")?.id;
  return bookmarks.map((b, i) => {
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
