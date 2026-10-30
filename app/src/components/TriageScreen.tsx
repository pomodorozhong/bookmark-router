import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Dialog, DialogHeader } from "./Dialog";
import { resetSearchAndState, type ViewSettings } from "../domain/saved-views";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { ConnectionsCanvas } from "./ConnectionsCanvas";
import { ConnectionsControls } from "./ConnectionsControls";
import { connectionGraph, rankConnections, splitOffCount, type ConnectionGraph } from "../domain/connections";
import { graphLayout, withGraphLayout, type GraphView } from "../domain/geometry";
import { CopyDialog, type CopyDialogScope, type CopyGroup, type CopyScope } from "./CopyDialog";
import { StateHeading } from "./StateHeading";
import { RecordEditor } from "./RecordEditor";
import { TagView } from "./TagView";
import { DetailBar } from "./DetailBar";
import { uncovered, type Covered } from "./graph-placement";
import { FilterBar } from "./FilterBar";
import { HighlightBar, HighlightMenu } from "./HighlightControl";
import { Cover, type LoadMedia } from "./Cover";
import { ThumbnailFinder } from "./ThumbnailFinder";
import type { FindBookmarkThumbnail } from "../use-thumbnails";
import { Icon, IconButton, Kbd } from "./Icon";
import type { Command } from "../domain/commands";
import type { CopyContext } from "../copy-settings";
import { importTypeId } from "../domain/agent-review";
import { highlightedBookmarks, liveHighlight, noHighlight, readHighlightFade, writeHighlightFade, type Highlight } from "../domain/highlight";
import { isWebUrl, statusLabel, type Bookmark, type Geometry, type GraphLayout, type Workspace } from "../domain/model";
import {
  decisionStatuses,
  domainOf,
  emptyTriageFilter,
  graphVisibility,
  groupByState,
  groupsOf,
  inTab,
  outcomeOf,
  reasonFor,
  relatedOf,
  stateLabels,
  triageQueue,
  clockwise,
  type TriageFilter,
  type TriageTab,
} from "../domain/triage";

const relatedListLimit = 12;
// At this width and below the bookmark card becomes a bottom sheet and the queue strip sits under the header.
const sharedPanelQuery = "(max-width: 820px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** The main collection screen: triage bookmarks into groups beside the force-directed graph. */
export function TriageScreen({ workspace, geometry, onGeometry, save, loadMedia, toast, notify, highlightRequest, onEdit, onImport, onTagTypes, onError, headerStart, headerEnd, onCopyContext, onThumbnail }: {
  onCopyContext: (context: CopyContext | undefined) => void;
  /** Stores what a thumbnail lookup found for a bookmark, or that it failed. */
  onThumbnail: FindBookmarkThumbnail;
  /** Opens the tag type manager. */
  onTagTypes: () => void;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  workspace: Workspace;
  geometry?: Geometry;
  onGeometry: (geometry: Geometry) => void;
  save: (command: Command | Command[], label?: string) => Promise<void>;
  loadMedia: LoadMedia;
  /** The app's message toast, shown over the graph. */
  toast: ReactNode;
  notify: (text: string, undo?: () => void) => void;
  /** Highlights this tag in place of the current highlight, such as an agent batch's tag after Apply. */
  highlightRequest?: { tagId: string; seq: number };
  onEdit: (id: string) => void;
  onImport: () => void;
  onError: (message: string) => void;
}) {
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [view, setView] = useState<"tags" | "connections">("tags");
  const [graphReady, setGraphReady] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [networkMode, setNetworkMode] = useState<"normal" | "preview">("normal");
  // Pointing at Done or Drop previews the split; leaving restores the mode it replaced.
  const hoverPreview = useRef(false);
  const [contextTag, setContextTag] = useState<string>();
  const [advanceRevision, setAdvanceRevision] = useState<number>();
  const geometryRef = useRef(geometry); geometryRef.current = geometry;
  function saveLayout(which: GraphView, layout: GraphLayout) {
    const next = withGraphLayout(geometryRef.current, workspace.id, which, layout);
    geometryRef.current = next;
    onGeometry(next);
  }
  const [tab, setTab] = useState<TriageTab>("todo");
  const [filter, setFilter] = useState<TriageFilter>(emptyTriageFilter);
  // The box selection, in the clockwise order captured when it was drawn.
  const [selection, setSelection] = useState<string[]>();
  // The tag whose bookmarks make up the selection, when it came from clicking a tag.
  const [selectionTagId, setSelectionTagId] = useState<string>();
  // The tag shown in the detail panel after a tag is clicked in the graph or the panel, read or edited;
  // `back` when it was opened from the current bookmark's Tags list, which it then offers to return to.
  const [tagPanel, setTagPanel] = useState<{ id: string; editing: boolean; back?: boolean }>();
  const [currentId, setCurrentId] = useState<string>();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  // The queue strip, or only its count when hidden (Q).
  const [queueOpen, setQueueOpen] = useState(true);
  const shared = useMediaQuery(sharedPanelQuery);
  const [groupQuery, setGroupQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // The filter bar's More menu, holding Empty groups and Ungrouped bookmarks.
  const [menuIndex, setMenuIndex] = useState(0);
  const [copyScope, setCopyScope] = useState<CopyDialogScope>();
  const [copyGroup, setCopyGroup] = useState<CopyGroup>();
  const [busy, setBusy] = useState(false);
  const frameToken = useRef(0);
  const [frameRequest, setFrameRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const filterInput = useRef<HTMLInputElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // The header's height places the graph tools, card and phone strip below it, however its rows wrap.
  const [headerHeight, setHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  // On phones the card is a bottom sheet that shrinks when nothing is picked; the map's bottom tools sit on its edge.
  const [panelHeight, setPanelHeight] = useState<number>();
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setPanelHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  // The progress line wraps on narrow desktops; the map legend above it sits on its measured height.
  const progressRef = useRef<HTMLElement>(null);
  const [progressHeight, setProgressHeight] = useState<number>();
  useLayoutEffect(() => {
    const progress = progressRef.current;
    if (!progress) return;
    const observer = new ResizeObserver(() => setProgressHeight(progress.offsetHeight));
    observer.observe(progress);
    return () => observer.disconnect();
  }, []);
  // The graph fills the screen under floating controls; framing centres in the part they leave uncovered.
  const covered = (): Covered => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return uncovered;
    const below = (el: Element | null) => el ? Math.max(0, el.getBoundingClientRect().bottom - stage.top) : 0;
    const above = (el: Element | null) => el ? Math.max(0, stage.bottom - el.getBoundingClientRect().top) : 0;
    const panel = panelRef.current?.getBoundingClientRect();
    return {
      left: 0,
      right: !shared && panel?.width ? Math.max(0, stage.right - panel.left) : 0,
      top: Math.max(below(headerRef.current), below(toolsRef.current), shared ? below(queueRef.current) : 0),
      bottom: shared ? above(panelRef.current) : above(queueRef.current),
    };
  };
  const groupInput = useRef<HTMLInputElement>(null);

  const selectionTag = selection && workspace.tags.find((t) => t.id === selectionTagId);
  const panelTag = tagPanel && workspace.tags.find((t) => t.id === tagPanel.id);
  const selectionSet = useMemo(() => (selection ? new Set(selection) : undefined), [selection]);
  const connections = useMemo<ConnectionGraph>(() => view === "connections"
    ? connectionGraph(workspace, { tab, filter, selection: selectionSet })
    : { bookmarks: [], neighbors: new Map(), edges: [], members: new Map(), components: [] }, [workspace, tab, filter, selectionSet, view]);
  const candidates = useMemo(() => view === "connections" ? rankConnections(connections) : [], [connections, view]);
  const ranking = useMemo(() => tab === "todo" ? candidates : [], [candidates, tab]);
  const splitImpacts = useMemo(() => new Map(candidates.map((c) => [c.id, splitOffCount(c)])), [candidates]);
  const queue = useMemo(() => {
    if (view === "connections" && tab === "todo") {
      const byId = new Map(connections.bookmarks.map((b) => [b.id, b]));
      return ranking.map((c) => byId.get(c.id)!);
    }
    const list = triageQueue(workspace, { tab, filter, selection: selectionSet });
    if (!selection) return list;
    const order = new Map(selection.map((id, i) => [id, i]));
    return list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [workspace, tab, filter, selection, selectionSet, view, connections, ranking]);
  // Nothing is current until a bookmark is picked, so the whole graph shows unfaded.
  const current = workspace.bookmarks.find((b) => b.id === currentId);
  const candidate = ranking.find((c) => c.id === current?.id);
  useEffect(() => { setNetworkMode("normal"); }, [current?.id, connections, view]);
  useEffect(() => { if (contextTag && !connections.members.has(contextTag)) setContextTag(undefined); }, [connections, contextTag]);
  // Wait for a successful save and the committed collection before choosing a new recommendation.
  useEffect(() => {
    if (advanceRevision === undefined || workspace.revision <= advanceRevision) return;
    if (view === "connections" && tab === "todo") show(ranking[0]?.id);
    setAdvanceRevision(undefined);
  }, [advanceRevision, workspace.revision, ranking, view, tab]);
  // Publish only committed UI state; clear it when the collection screen unmounts.
  useLayoutEffect(() => {
    onCopyContext({ collectionId: workspace.id, selection, list: queue.map((b) => b.id), current: current?.id });
    return () => onCopyContext(undefined);
  }, [workspace.id, selection, queue, current?.id, onCopyContext]);
  const groups = current ? groupsOf(workspace, current.id) : [];
  const related = useMemo(() => {
    if (!current) return [];
    return [...relatedOf(workspace, current.id)].sort((a, b) => b[1].length - a[1].length);
  }, [workspace, current]);
  // Related bookmarks by state, keeping the shared-tag order inside each group; only the first few show.
  const relatedGroups = useMemo(() => {
    const byId = new Map(workspace.bookmarks.map((b) => [b.id, b]));
    let left = relatedListLimit;
    return groupByState(related.map(([id]) => byId.get(id)!), workspace).map((group) => {
      const shown = group.bookmarks.slice(0, Math.max(0, left));
      left -= shown.length;
      return { ...group, shown };
    });
  }, [workspace, related]);
  const relatedVia = new Map(related);
  const visibility = useMemo(() => view === "connections"
    ? { bookmarkIds: connections.bookmarks.map((b) => b.id), hiddenTagIds: [], peekTagIds: [] }
    : graphVisibility(workspace, filter, tab), [workspace, filter, tab, view, connections]);
  // The tag highlight marks bookmarks without changing the filters, the tab, or what the graph shows.
  const [highlightChoice, setHighlight] = useState<Highlight>(noHighlight);
  useEffect(() => { if (highlightRequest) setHighlight({ tagIds: [highlightRequest.tagId], mode: "any" }); }, [highlightRequest]);
  const [highlightPicker, setHighlightPicker] = useState(false);
  const [fadeRest, setFadeRest] = useState(readHighlightFade);
  const highlight = useMemo(() => liveHighlight(workspace, highlightChoice), [workspace, highlightChoice]);
  const highlightIds = useMemo(() => highlightedBookmarks(workspace, highlight), [workspace, highlight]);
  const highlightShown = useMemo(() => {
    const shown = visibility.bookmarkIds ? visibility.bookmarkIds.filter((id) => highlightIds.has(id)).length : highlightIds.size;
    return { shown, hidden: highlightIds.size - shown };
  }, [visibility.bookmarkIds, highlightIds]);
  const { done, dropped } = decisionStatuses(workspace);
  const counts = useMemo(() => ({
    todo: workspace.bookmarks.filter((b) => inTab(b, workspace, "todo")).length,
    done: workspace.bookmarks.filter((b) => inTab(b, workspace, "done")).length,
    dropped: workspace.bookmarks.filter((b) => inTab(b, workspace, "dropped")).length,
  }), [workspace]);
  const options = useMemo(() => {
    const linked = new Set(groups.map((g) => g.id));
    const q = groupQuery.trim().toLowerCase();
    return workspace.tags.filter((t) => !linked.has(t.id) && t.name.toLowerCase().includes(q));
  }, [workspace.tags, groups, groupQuery]);
  const typeName = (id?: string) => workspace.tagTypes.find((t) => t.id === id)?.name ?? "Tag";
  const typeColor = (id?: string) => workspace.tagTypes.find((t) => t.id === id)?.appearance.color ?? "#0f766e";

  // Reset per-collection state when switching collections.
  useEffect(() => { setSelection(undefined); setCurrentId(undefined); setFilter(emptyTriageFilter); setTab("todo"); }, [workspace.id]);
  // Batch tags would add a hub per batch, so the graph hides their Import type by default, including when a batch first creates it.
  const hasImportType = workspace.tagTypes.some((t) => t.id === importTypeId);
  useEffect(() => {
    if (hasImportType) setFilter((f) => f.hiddenTypeIds.includes(importTypeId) ? f : { ...f, hiddenTypeIds: [...f.hiddenTypeIds, importTypeId] });
  }, [workspace.id, hasImportType]);
  // Frame the current bookmark with its groups after navigation, not after box selection.
  useEffect(() => {
    if (!frameRequest || !current) return;
    if (view === "connections" && !connections.neighbors.has(current.id)) return;
    if (!visibility.bookmarkIds.includes(current.id)) return;
    graphRef.current?.frame([current.id, ...groups.filter((g) => !visibility.hiddenTagIds.includes(g.id)).map((g) => g.id)]);
  }, [frameRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function show(id: string | undefined, frame = true) {
    setNetworkMode("normal");
    setCurrentId(id);
    setTagPanel(undefined);
    setGroupQuery("");
    setMenuOpen(false);
    if (frame) setFrameRequest(++frameToken.current);
  }
  // Moving past either end of the queue wraps around to the other.
  function move(step: number) {
    if (!queue.length) return;
    const i = queue.findIndex((b) => b.id === current?.id);
    show(queue[i === -1 ? (step > 0 ? 0 : queue.length - 1) : (i + step + queue.length) % queue.length].id);
  }
  // The bookmark after this one in the queue as it was before a decision.
  const nextAfter = (id: string) => {
    const i = queue.findIndex((b) => b.id === id);
    return (queue[i + 1] ?? queue[i - 1])?.id;
  };

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (e) { onError(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  }
  function decide(kind: "done" | "dropped") {
    const status = kind === "done" ? done : dropped;
    if (!current || !status) return;
    const bookmark = current, next = nextAfter(bookmark.id), revision = workspace.revision;
    const advanceToBest = view === "connections" && tab === "todo";
    void run(async () => {
      await save({ type: "bookmark.patch", id: bookmark.id, expectedRecordRevision: bookmark.revision, patch: { statusId: status.id } },
        `${kind === "done" ? "Done" : "Drop"}: ${bookmark.title}`);
      if (advanceToBest) setAdvanceRevision(revision);
      else show(next);
    });
  }
  function deselect() {
    if (!current || !selection?.includes(current.id)) return;
    const id = current.id, before = selection, next = nextAfter(id);
    const remaining = selection.filter((s) => s !== id);
    setSelection(remaining.length ? remaining : undefined);
    show(next);
    notify(`Deselected: ${current.title}`, () => { setSelection(before); show(id); });
  }
  function link(tagId: string, linked: boolean) {
    if (!current) return;
    const tag = workspace.tags.find((t) => t.id === tagId);
    void run(async () => {
      await save({ type: "membership.set", bookmarkId: current.id, tagId, linked }, `${linked ? "Add to" : "Remove from"} ${tag?.name ?? "tag"}`);
      setGroupQuery("");
      setFrameRequest(++frameToken.current);
    });
  }
  function boxSelect(ids: string[], adding: boolean, tagId?: string) {
    setSelectionTagId(tagId);
    const base = adding ? selection ?? [] : [];
    const merged = [...new Set([...base, ...ids])];
    if (!merged.length) { setSelection(undefined); return; }
    // A clicked group's bookmarks go around the group itself.
    const positionOf = (id: string) => graphRef.current?.positionOf(id);
    const ordered = clockwise(merged.map((id) => ({ id })), positionOf, tagId ? positionOf(tagId) : undefined).map((b) => b.id);
    setSelection(ordered);
    if (!ordered.includes(current?.id ?? "")) show(ordered.find((id) => {
      const b = workspace.bookmarks.find((x) => x.id === id);
      return b && inTab(b, workspace, tab);
    }), false);
  }
  // A filter change keeps the current bookmark unless it no longer matches.
  function changeFilter(next: TriageFilter) {
    setFilter(next);
    if (current && !triageQueue(workspace, { tab, filter: next, selection: selectionSet }).some((b) => b.id === current.id))
      show(undefined, false);
  }
  // A new tab hides groups left empty by it and lays the graph out afresh.
  function changeTab(next: TriageTab) {
    setTab(next);
    show(undefined, false);
    if (filter.showEmptyGroups) setFilter({ ...filter, showEmptyGroups: false });
    setResetRequest((n) => n + 1);
  }
  // Runs after the graph has applied the new tab's visibility (child effects run first).
  useEffect(() => { if (resetRequest && view === "tags") graphRef.current?.resetPositions(); }, [resetRequest]);
  function toggleQueue() { setQueueOpen((v) => !v); }
  function changeView(next: "tags" | "connections") { setView(next); setContextTag(undefined); setNetworkMode("normal"); setTagPanel(undefined); }
  function startHoverPreview() {
    if (view !== "connections" || tab !== "todo" || !candidate || networkMode !== "normal") return;
    hoverPreview.current = true; setNetworkMode("preview");
  }
  function endHoverPreview() {
    if (!hoverPreview.current) return;
    hoverPreview.current = false; setNetworkMode("normal");
  }
  function openCopy(scope?: CopyScope) {
    setCopyGroup(undefined);
    setCopyScope(scope ?? (selection ? "selection" : "list"));
  }
  function openCopyGroup(label: string, bookmarks: Bookmark[]) {
    setCopyGroup({ label, bookmarks });
    setCopyScope("group");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (e.key === "/") { e.preventDefault(); groupInput.current?.focus(); }
      else if (key === "f") { e.preventDefault(); filterInput.current?.focus(); }
      else if (e.key === "ArrowDown" || key === "j") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp" || key === "k") { e.preventDefault(); move(-1); }
      else if (key === "q") toggleQueue();
      else if (key === "c") openCopy();
      else if (key === "o" && current?.url && isWebUrl(current.url)) window.open(current.url, "_blank", "noopener,noreferrer");
      else if (e.key === "Escape" && networkMode !== "normal") setNetworkMode("normal");
      else if (e.key === "Escape" && contextTag) setContextTag(undefined);
      else if (e.key === "Escape" && tagPanel) setTagPanel(tagPanel.editing ? { ...tagPanel, editing: false } : undefined);
      else if (e.key === "Escape" && selection) setSelection(undefined);
      else if (e.key === "Escape" && current) show(undefined, false);
      else if (key === "d") decide("done");
      else if (key === "x") decide("dropped");
      else if (key === "s") deselect();
      else return;
      // Keep a shortcut's letter out of anything it focuses, such as the copy template.
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const position = current ? queue.findIndex((b) => b.id === current.id) : -1;
  const total = workspace.bookmarks.length || 1;
  const progressText = `${counts.done} done · ${counts.dropped} dropped · ${counts.todo} to triage`;
  const settings: ViewSettings = { filter, tab, highlight, fadeRest, view, showTags, contextTag };
  function applySettings(next: ViewSettings) {
    setFilter(next.filter); setTab(next.tab); setHighlight(next.highlight); setFadeRest(next.fadeRest);
    writeHighlightFade(next.fadeRest); setView(next.view); setShowTags(next.showTags); setContextTag(next.contextTag);
    setSelection(undefined); setNetworkMode("normal");
    if (current && !triageQueue(workspace, { tab: next.tab, filter: next.filter }).some((b) => b.id === current.id)) show(undefined, false);
  }
  function resetSearchState() {
    const next = resetSearchAndState(settings);
    setFilter(next.filter); setTab(next.tab); setNetworkMode("normal");
    if (current && !triageQueue(workspace, { tab: next.tab, filter: next.filter, selection: selectionSet }).some((b) => b.id === current.id)) show(undefined, false);
  }
  // Arrangement controls sit directly in the graph tools: tag presentation toggles, then layout actions.
  const contextTagRecord = contextTag ? workspace.tags.find((t) => t.id === contextTag) : undefined;
  const layoutControls = <>
    {view === "connections"
      ? <button className="tool-toggle" aria-pressed={showTags} title="Show tags as nodes" onClick={() => { setNetworkMode("normal"); setShowTags(!showTags); }}><Icon name="tag" size={14} /><span className="tool-label">Tag nodes</span></button>
      : <button className="tool-toggle" aria-pressed={filter.showEmptyGroups} title="Show tags with no shown bookmarks" onClick={() => changeFilter({ ...filter, showEmptyGroups: !filter.showEmptyGroups })}><Icon name="tag" size={14} /><span className="tool-label">Empty tags</span></button>}
    <button className="tool-action" aria-label={view === "connections" ? "Re-layout connections" : "Re-layout"} title={networkMode !== "normal" ? "Exit Preview to re-layout" : "Re-layout"} disabled={!graphReady || networkMode !== "normal"} onClick={() => graphRef.current?.relayout()}><Icon name="layout" size={14} /><span className="tool-label">Re-layout</span></button>
    {view === "tags" && <button className="tool-action" aria-label="Reset positions" title="Reset positions and clear pins" disabled={!graphReady} onClick={() => setConfirmReset(true)}><Icon name="refresh" size={14} /><span className="tool-label">Reset…</span></button>}
  </>;
  const contextChip = contextTagRecord && <span className="tool-context" title={`Highlighting ${contextTagRecord.name}`}>
    <button className="tool-context-name" onClick={() => setTagPanel({ id: contextTagRecord.id, editing: false })} title="Read tag">{contextTagRecord.name}</button>
    <button className="tool-context-clear" aria-label="Clear tag context" onClick={() => setContextTag(undefined)}><Icon name="close" size={12} /></button>
  </span>;
  const viewSwitch = <div className="segmented view-switch" role="group" aria-label="Graph view">
    <button className={view === "tags" ? "active" : ""} aria-pressed={view === "tags"} onClick={() => changeView("tags")}>Tags</button>
    <button className={view === "connections" ? "active" : ""} aria-pressed={view === "connections"} onClick={() => changeView("connections")}>Connections</button>
  </div>;
  return (
    <div className={`triage map-canvas ${view === "connections" ? "connections-view" : ""} ${queueOpen ? "queue-open" : "queue-minimized"} ${current || panelTag ? "has-current" : ""}`}
      style={{ "--header-height": `${headerHeight}px`, ...(panelHeight !== undefined && { "--panel-height": `${panelHeight}px` }), ...(progressHeight !== undefined && { "--progress-height": `${progressHeight}px` }) } as CSSProperties}>
      <header ref={headerRef} className="triage-header">
        <div className="header-start float">{headerStart}</div>
        <div className="scope-column float">
          <div className="scope-bar">
            <select className="bookmark-state" aria-label="Bookmark state" value={tab} onChange={(e) => changeTab(e.target.value as TriageTab)}>
              <option value="todo">To triage {counts.todo}</option><option value="done">Done {counts.done}</option><option value="dropped">Dropped {counts.dropped}</option><option value="all">All {workspace.bookmarks.length}</option>
            </select>
            <label className={`filter-search filter-box global-search ${filter.text.trim() ? "searching" : ""}`}>
              <Icon name="search" size={15} /><input ref={filterInput} type="search" aria-label="Search bookmarks and tags" placeholder="Search bookmarks and tags" title="Search (F)" value={filter.text}
                onChange={(e) => changeFilter({ ...filter, text: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); changeFilter({ ...filter, text: "" }); e.currentTarget.blur(); } }} />
              {filter.text ? <button aria-label="Clear search" onClick={() => changeFilter({ ...filter, text: "" })}><Icon name="close" size={12} /></button> : <Kbd>F</Kbd>}
            </label>
          </div>
          <FilterBar workspace={workspace} filter={filter} tab={tab} onChange={changeFilter} save={save} settings={settings} onTagTypes={onTagTypes}
            onLoad={(next) => { applySettings(next); notify("Loaded bookmark and tag settings", () => applySettings(settings)); }}
            onReset={resetSearchState} phone={shared} highlightCount={highlight.tagIds.length} onHighlight={() => setHighlightPicker(true)}
            highlight={(back) => <HighlightMenu workspace={workspace} highlight={highlight} open={highlightPicker} onBack={back} onOpen={setHighlightPicker} onChange={setHighlight}
              activeDetails={<HighlightBar workspace={workspace} highlight={highlight} shown={highlightShown.shown} hidden={highlightShown.hidden} fade={fadeRest} onChange={setHighlight} onFade={(fade) => { setFadeRest(fade); writeHighlightFade(fade); }} />} />} />
        </div>
        <div className="header-end float">{headerEnd}</div>
      </header>
      <div className="triage-body">
        <nav ref={queueRef} className="triage-queue float" aria-label="Bookmarks to triage">
          {/* The strip's label: its count, Copy, and the selection it shows. */}
          <div className={`queue-bar ${selection ? "selection" : ""}`} role={selection ? "status" : undefined}>
            <button className="queue-toggle" aria-label="Queue" aria-expanded={queueOpen} onClick={toggleQueue}
              title={queueOpen ? "Hide the queue (Q)" : "Show the queue (Q)"}>
              <span className="queue-bar-label">{selection ? (selectionTag ? <>in <span title={selectionTag.name}>{selectionTag.name}</span></> : "Selected") : ranking.length ? "Next up" : tab === "all" ? "All" : stateLabels[tab]}</span>
              <span className="queue-count">{selection ? selection.length : queue.length}</span>
              <Kbd>Q</Kbd>
            </button>
            <span className="queue-bar-actions">
              {selection
                ? <><button onClick={() => openCopy("selection")}><Icon name="copy" size={13} /> Copy…<Kbd>C</Kbd></button>
                    <button onClick={() => setSelection(undefined)} title="Clear selection (Esc)">Clear<Kbd>Esc</Kbd></button></>
                : <button onClick={() => openCopy("list")} disabled={!queue.length}><Icon name="copy" size={13} /> Copy…<Kbd>C</Kbd></button>}
            </span>
          </div>
          <div className="queue-list">
          {queue.map((b, index) => {
            const warn = b.notes?.some((n) => /^(Link check|Possible duplicate)/.test(n.label));
            const decided = outcomeOf(b, workspace) !== "active";
            return (
              <button key={b.id} className={`queue-item ${b.id === current?.id ? "current" : ""}`} aria-current={b.id === current?.id}
                aria-label={ranking.length ? `${index + 1}. ${b.title}${index === 0 ? ", Best next" : ""}` : undefined}
                title={b.title} onClick={() => show(b.id)}>
                {/* The slot is kept without an image so titles line up. */}
                <span className="queue-thumb"><Cover bookmark={b} load={loadMedia} className="" letterTile />{ranking.length > 0 && <span className="queue-rank" aria-hidden="true">{index + 1}</span>}</span>
                <span className="queue-text">
                <span className="queue-title">{b.title}</span>
                <span className="queue-meta">
                  {warn && <i className="warn-dot" title="Has a warning" />}
                  {ranking[index]
                    ? <span className="queue-impact">{ranking[index].separation ? <>{ranking[index].before} → <SplitSizes pieces={ranking[index].pieces} /></> : `${ranking[index].degree} connections`}</span>
                    : <span className="queue-domain">{domainOf(b.url) || "No URL"}</span>}
                  {decided && <span className="queue-status">{statusLabel(workspace, b.statusId)}</span>}
                </span>
                </span>
              </button>
            );
          })}
          {!queue.length && <p className="queue-empty">{workspace.bookmarks.length ? "Nothing here. Try another state or clear the filter." : "No bookmarks yet."}</p>}
          </div>
        </nav>
        <div ref={stageRef} className="triage-stage">
          <div ref={toolsRef} className="triage-tools float">
            {viewSwitch}
            <ConnectionsControls view={view} layout={layoutControls} trailing={contextChip}
              candidate={candidate} todo={tab === "todo"} canRecommend={Boolean(ranking.length) && !busy} atBest={Boolean(current) && current?.id === ranking[0]?.id} mode={networkMode}
              onBest={() => show(ranking[0]?.id)} onTodo={() => changeTab("todo")}
              onPreview={(on) => { hoverPreview.current = false; setNetworkMode(on ? "preview" : "normal"); }} />
          </div>
          <div className="triage-graph">
          {toast}
          {view === "connections" ? <>
            <ConnectionsCanvas ref={graphRef} workspace={workspace} model={connections} ranking={ranking} impacts={splitImpacts}
              selected={current && connections.neighbors.has(current.id) ? current.id : undefined}
              showTags={showTags} contextTag={contextTag} preview={networkMode === "preview" ? candidate : undefined}
              geometry={graphLayout(geometry, showTags ? "connections-tags" : "connections")}
              onGeometry={(layout) => saveLayout(showTags ? "connections-tags" : "connections", layout)}
              onSelect={(id) => show(id, false)}
              onTag={setContextTag} onBoxSelect={boxSelect} onPinsChanged={setPinnedIds} boxSelection={selectionSet}
              highlightIds={highlightIds} fadeRest={fadeRest} covered={covered} onReady={setGraphReady} onClearSearch={() => changeFilter({ ...emptyTriageFilter, hiddenTypeIds: hasImportType ? [importTypeId] : [] })} onImport={onImport} />
          </> : <GraphCanvas
            ref={graphRef}
            covered={covered}
            workspace={workspace}
            selected={current?.id}
            onSelect={(id) => {
              // Tapping empty space clears the current bookmark.
              if (!id) show(undefined, false);
              else if (workspace.bookmarks.some((b) => b.id === id)) show(id);
              else {
                boxSelect(workspace.memberships.filter((m) => m.tagId === id).map((m) => m.bookmarkId), false, id);
                setTagPanel({ id, editing: false });
              }
            }}
            query=""
            matchingBookmarkIds={visibility.bookmarkIds}
            filtering={Boolean(filter.text.trim())}
            hiddenTagIds={visibility.hiddenTagIds}
            peekTagIds={visibility.peekTagIds}
            boxSelection={selectionSet}
            highlightIds={highlightIds}
            fadeRest={fadeRest}
            onCenter={current && visibility.bookmarkIds.includes(current.id) ? () => graphRef.current?.frame([current.id, ...groups.filter((g) => !visibility.hiddenTagIds.includes(g.id)).map((g) => g.id)]) : undefined}
            summary={`${visibility.bookmarkIds.length} bookmarks`}
            onReady={setGraphReady}
            onBoxSelect={boxSelect}
            geometry={geometry}
            onGeometry={(layout) => saveLayout("tags", layout)}
            onImport={onImport}
            onClearSearch={() => changeFilter({ ...emptyTriageFilter, hiddenTypeIds: hasImportType ? [importTypeId] : [] })}
            onPinsChanged={setPinnedIds}
            loadMedia={loadMedia}
          />}
          </div>
        </div>
        <aside ref={panelRef} className="triage-panel float" aria-label="Current bookmark">
          {panelTag ? (
            tagPanel!.editing
              ? <div className="triage-detail">
                  <RecordEditor key={panelTag.id} inline workspace={workspace} id={panelTag.id} onSave={(c) => save(c)} onNewType={onTagTypes}
                    onClose={() => setTagPanel({ ...tagPanel!, editing: false })} />
                </div>
              : <TagView tag={panelTag} workspace={workspace} order={selectionTagId === panelTag.id ? selection : undefined} loadMedia={loadMedia} onOpen={(id) => show(id)}
                    onCopy={() => openCopy("selection")} onCopyGroup={openCopyGroup} onEdit={() => setTagPanel({ ...tagPanel!, editing: true })}
                    start={<>{tagPanel!.back && current && (
                      <button className="text-button tag-back" onClick={() => setTagPanel(undefined)}><Icon name="chevron-left" size={14} /> Back<span className="tag-back-rest"> to the bookmark</span></button>
                    )}</>}
                    pin={<PinButton disabled={!graphReady} pinned={pinnedIds.includes(panelTag.id)} onToggle={(on) => graphRef.current?.setPinned(panelTag.id, on)} />} onClose={() => setTagPanel(undefined)} />
          ) : current ? (
            <>
              <DetailBar
                start={<>
                  <IconButton label="Previous in the queue (K)" icon="chevron-left" size={16} shortcut="K" onClick={() => move(-1)} />
                  <IconButton label="Next in the queue (J)" icon="chevron-right" size={16} shortcut="J" onClick={() => move(1)} />
                  {position >= 0 && <span className="detail-position">{position + 1} of {queue.length}</span>}
                </>}
                closeLabel="Clear current bookmark (Esc)" closeShortcut="Esc" onClose={() => show(undefined, false)}>
                <IconButton label="Copy" icon="copy" size={16} onClick={() => openCopy("current")} />
                <IconButton label="Edit" icon="edit" size={16} onClick={() => onEdit(current.id)} />
                <PinButton disabled={!graphReady} pinned={pinnedIds.includes(current.id)} onToggle={(on) => graphRef.current?.setPinned(current.id, on)} />
              </DetailBar>
              <div className="triage-detail">
                <div className="triage-top">
                  <div className="triage-heading">
                    <div className="detail-link">
                      {current.url && isWebUrl(current.url)
                        ? <><a href={current.url} target="_blank" rel="noreferrer" title={`${current.url} (O)`}><span>{domainOf(current.url)}</span> <Icon name="external" size={13} /></a><Kbd>O</Kbd></>
                        : current.url ? <span className="detail-link-warning" title={current.url}><strong>Not a link</strong> {current.url}</span> : <span className="subtle">No URL</span>}
                    </div>
                    <h2>{current.title}</h2>
                  </div>
                </div>
                {candidate && tab === "todo" && view === "connections" && <p className="split-impact">
                  {candidate.separation
                    ? <>Finishing it splits its <strong>{candidate.before}</strong>-bookmark cluster into <SplitSizes pieces={candidate.pieces} />.</>
                    : candidate.degree ? <>Finishing it leaves its <strong>{candidate.before}</strong>-bookmark cluster in one piece; it has <strong>{candidate.degree}</strong> direct connections.</>
                    : "Not connected to another bookmark in this view."}
                  {candidate.separation > 0 && <small>{candidate.separation} pairs of remaining bookmarks become separated · {candidate.degree} direct connections</small>}
                </p>}
                {highlightIds.has(current.id) && <p className="highlight-note">
                  Highlighted: tagged {highlight.tagIds.filter((id) => workspace.memberships.some((m) => m.bookmarkId === current.id && m.tagId === id)).map((id) => `“${workspace.tags.find((t) => t.id === id)!.name}”`).join(" and ")}.
                </p>}
                <ThumbnailFinder key={current.id} bookmark={current} cover={<Cover bookmark={current} load={loadMedia} letterTile />} onFind={onThumbnail} />
                <p className="triage-desc">{current.description || <span className="subtle">No description.</span>}</p>
                {current.source?.fields.tags && (
                  <div className="triage-raindrop">Raindrop {current.source.fields.tags.split(",").map((t) => t.trim()).filter((t) => t && t !== "indie-dev").map((t) => <span key={t} className="chip">{t}</span>)}</div>
                )}
                {current.notes?.filter((n) => /^(Link check|Possible duplicate)/.test(n.label)).map((n, i) => (
                  <div key={i} className="triage-warning"><strong>{n.label}</strong>{n.text}</div>
                ))}
                <section className="triage-section">
                  <h3>Tags ({groups.length})</h3>
                  <div className="triage-groups">
                    {groups.map((t) => {
                      const why = reasonFor(current, t, workspace);
                      const peek = visibility.peekTagIds.includes(t.id);
                      return (
                        <div key={t.id} className={`triage-group ${peek ? "peek" : ""}`}>
                          <i className="swatch" style={{ background: typeColor(t.typeId) }} />
                          <div>
                            <button className="group-name" title={`Open ${t.name}`} onClick={() => setTagPanel({ id: t.id, editing: false, back: true })}>{t.name}</button><span className="group-type" title={peek ? `${typeName(t.typeId)} is hidden in the filter` : undefined}>{typeName(t.typeId)}{peek && " · hidden"}</span>
                            {why && <p className="group-why">{why}</p>}
                          </div>
                          <IconButton label={`Remove tag ${t.name}`} icon="close" size={14} disabled={busy} onClick={() => link(t.id, false)} />
                        </div>
                      );
                    })}
                    {!groups.length && <p className="subtle">No tags yet.</p>}
                  </div>
                  <div className="group-add">
                    <input ref={groupInput} placeholder="Add a tag…" title="Add a tag (/)" value={groupQuery} aria-label="Add a tag"
                      aria-expanded={menuOpen} aria-controls="group-options" role="combobox" autoComplete="off"
                      onFocus={() => { setMenuOpen(true); setMenuIndex(0); }}
                      onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
                      onChange={(e) => { setGroupQuery(e.target.value); setMenuOpen(true); setMenuIndex(0); }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => Math.max(0, Math.min(options.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))); }
                        else if (e.key === "Enter" && options[menuIndex]) { e.preventDefault(); link(options[menuIndex].id, true); }
                        else if (e.key === "Escape") { setGroupQuery(""); setMenuOpen(false); e.currentTarget.blur(); }
                      }} />
                    <Kbd>/</Kbd>
                    {menuOpen && (
                      <div className="group-menu" id="group-options" role="listbox">
                        {workspace.tagTypes.map((type) => {
                          const list = options.filter((t) => t.typeId === type.id);
                          return list.length ? (
                            <div key={type.id}>
                              <div className="group-menu-label">{type.name}</div>
                              {list.map((t) => (
                                <button key={t.id} role="option" aria-selected={options[menuIndex]?.id === t.id} className={options[menuIndex]?.id === t.id ? "highlighted" : ""}
                                  onMouseDown={(e) => e.preventDefault()} onClick={() => link(t.id, true)}>
                                  <i className="swatch" style={{ background: type.appearance.color }} />{t.name}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })}
                        {options.filter((t) => !workspace.tagTypes.some((type) => type.id === t.typeId)).map((t) => (
                          <button key={t.id} role="option" aria-selected={options[menuIndex]?.id === t.id} className={options[menuIndex]?.id === t.id ? "highlighted" : ""}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => link(t.id, true)}>{t.name}</button>
                        ))}
                        {!options.length && <div className="group-menu-label">No match</div>}
                      </div>
                    )}
                  </div>
                </section>
                <section className="triage-section">
                  <h3>Related bookmarks ({related.length})</h3>
                  <div className="triage-related">
                    {relatedGroups.map((group) => (
                      <Fragment key={group.tab}>
                        <StateHeading tab={group.tab} count={group.bookmarks.length} onCopy={() => openCopyGroup(`Related · ${stateLabels[group.tab]}`, group.bookmarks)} />
                        {group.shown.map((b) => {
                          const via = relatedVia.get(b.id)!;
                          const viaTag = workspace.tags.find((t) => t.id === via[0]);
                          return (
                            <button key={b.id} onClick={() => show(b.id)}>
                              <span className="related-title">{b.title}</span>
                              {/* With one tag every related bookmark comes through it, so naming it adds nothing. */}
                              {groups.length > 1 && <span className="related-via" title={`Shared tags: ${via.map((id) => workspace.tags.find((t) => t.id === id)?.name).join(", ")}`}>
                                via {viaTag?.name}{via.length > 1 ? ` +${via.length - 1}` : ""}
                              </span>}
                            </button>
                          );
                        })}
                      </Fragment>
                    ))}
                    {!related.length && <p className="subtle">Shares no tag with another bookmark.</p>}
                    {related.length > relatedListLimit && <p className="subtle">and {related.length - relatedListLimit} more related bookmarks</p>}
                  </div>
                </section>
              </div>
              <div className="triage-decisions">
                <button className="primary" disabled={busy || !done} onClick={() => { endHoverPreview(); decide("done"); }}
                  onPointerEnter={startHoverPreview} onPointerLeave={endHoverPreview} onFocus={startHoverPreview} onBlur={endHoverPreview}>Done<Kbd>D</Kbd></button>
                <button disabled={busy || !dropped} onClick={() => { endHoverPreview(); decide("dropped"); }}
                  onPointerEnter={startHoverPreview} onPointerLeave={endHoverPreview} onFocus={startHoverPreview} onBlur={endHoverPreview}>Drop<Kbd>X</Kbd></button>
                {/* Deselect only applies inside a box selection, so it only shows then. */}
                {selection && <button disabled={!selection.includes(current.id)} title="Take it out of the box selection" onClick={deselect}>Deselect<Kbd>S</Kbd></button>}
              </div>
            </>
          ) : (
            <div className="triage-empty">
              <h2>{!workspace.bookmarks.length ? "No bookmarks yet" : queue.length ? "No bookmark picked" : "Nothing to triage here"}</h2>
              <p className="subtle">{!workspace.bookmarks.length ? "Import bookmarks to start." : queue.length ? "Pick one from the queue or the graph, or press J to start at the top." : "Pick another tab, clear the filter, or draw a box on the graph."}</p>
              {!workspace.bookmarks.length && <button className="primary" onClick={onImport}>Open Import</button>}
            </div>
          )}
        </aside>
      </div>
      <footer ref={progressRef} className="collection-progress" aria-label="Collection progress">
        <span>{counts.done + counts.dropped}/{workspace.bookmarks.length} processed · {workspace.bookmarks.length ? Math.round(((counts.done + counts.dropped) / total) * 100) : 0}%</span>
        <div className="triage-bar" aria-hidden="true"><span style={{ width: `${counts.done / total * 100}%`, background: "var(--color-accent)" }} /><span style={{ width: `${counts.dropped / total * 100}%`, background: "var(--color-ink-faint)" }} /></div><span>{progressText}</span>
      </footer>
      {confirmReset && <Dialog labelledBy="reset-title" className="prompt-modal" onClose={() => setConfirmReset(false)}>
        <DialogHeader id="reset-title" label="Graph" title="Reset positions?" onClose={() => setConfirmReset(false)} /><p>Every bookmark and tag goes back to an automatic place, and all pins are cleared.</p>
        <footer><button onClick={() => setConfirmReset(false)}>Cancel</button><button className="danger" onClick={() => { setConfirmReset(false); graphRef.current?.resetPositions({ clearPins: true }); }}>Reset positions</button></footer>
      </Dialog>}
      {copyScope && (
        <CopyDialog
          workspace={workspace}
          initialScope={copyScope}
          group={copyGroup}
          scopes={{
            selection: selection ? selection.map((id) => workspace.bookmarks.find((b) => b.id === id)).filter((b): b is Bookmark => !!b) : undefined,
            list: queue,
            current: current ? [current] : undefined,
          }}
          onClose={() => setCopyScope(undefined)}
          onCopied={(n) => { setCopyScope(undefined); notify(`Copied ${n} bookmark${n === 1 ? "" : "s"}`); }}
        />
      )}
    </div>
  );
}

/** Cluster sizes after processing: the largest piece stays together, the rest split off. */
function SplitSizes({ pieces }: { pieces: string[][] }) {
  return <span className="split-sizes">{pieces.map((piece, i) => <Fragment key={piece[0]}>{i > 0 && " + "}<b className={i ? "split-off" : "split-keep"}>{piece.length}</b></Fragment>)}</span>;
}

/** Pins a node where it sits in the graph, so layouts leave it there. */
function PinButton({ pinned, disabled, onToggle }: { pinned: boolean; disabled?: boolean; onToggle: (pinned: boolean) => void }) {
  return <IconButton disabled={disabled} label={pinned ? "Unpin" : "Pin"} icon="pin" size={16} aria-pressed={pinned}
    title={pinned ? "Unpin: let the layout move it again" : "Pin: keep it where it is in the graph"} onClick={() => onToggle(!pinned)} />;
}
