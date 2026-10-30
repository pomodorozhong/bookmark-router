import type { SavedView } from "./model";
import type { Highlight } from "./highlight";
import { compileRules, readRules, type TriageFilter, type TriageTab } from "./triage";

export interface ViewSettings {
  filter: TriageFilter;
  tab: TriageTab;
  highlight: Highlight;
  fadeRest: boolean;
  view: "tags" | "connections";
  showTags: boolean;
  contextTag?: string;
}

export function saveView(name: string, current: ViewSettings): SavedView {
  const { filter, tab, highlight, fadeRest, view, showTags, contextTag } = current;
  return structuredClone({ id: crypto.randomUUID(), name, sort: "title", filter: compileRules(filter.rules, filter.text),
    hiddenTagIds: filter.hiddenTagIds,
    graph: { tab, hiddenTypeIds: filter.hiddenTypeIds, hiddenBookmarkTagIds: filter.hiddenBookmarkTagIds,
      showEmptyGroups: filter.showEmptyGroups, showUngrouped: filter.showUngrouped,
      highlight: { ...highlight, fade: fadeRest }, view, showTags, contextTag } });
}

/** Legacy views restore their filter and individual tag hiding, preserving every absent setting. */
export function loadView(saved: SavedView, current: ViewSettings): ViewSettings | undefined {
  const read = readRules(saved.filter);
  if (!read) return undefined;
  const g = saved.graph;
  return structuredClone({ ...current,
    filter: { ...current.filter, ...read, hiddenTagIds: saved.hiddenTagIds,
      ...(g ? { hiddenTypeIds: g.hiddenTypeIds, hiddenBookmarkTagIds: g.hiddenBookmarkTagIds,
        showEmptyGroups: g.showEmptyGroups, showUngrouped: g.showUngrouped } : {}) },
    ...(g ? { tab: g.tab, highlight: { tagIds: g.highlight.tagIds, mode: g.highlight.mode }, fadeRest: g.highlight.fade,
      view: g.view, showTags: g.showTags, contextTag: g.contextTag } : {}) });
}

/** Reset has deliberately narrower ownership than Saved. */
export function resetSearchAndState(current: ViewSettings): ViewSettings {
  return { ...current, tab: "todo", filter: { ...current.filter, text: "" } };
}
