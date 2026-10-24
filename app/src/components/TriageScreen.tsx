import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { CopyDialog, type CopyScope } from "./CopyDialog";
import { RecordEditor } from "./RecordEditor";
import { TagView } from "./TagView";
import { DetailBar } from "./DetailBar";
import { FilterBar } from "./FilterBar";
import { Cover, type LoadMedia } from "./Cover";
import { ThumbnailFinder } from "./ThumbnailFinder";
import type { FindBookmarkThumbnail } from "../use-thumbnails";
import { Icon, IconButton } from "./Icon";
import type { Command } from "../domain/commands";
import type { CopyContext } from "../copy-settings";
import { isWebUrl, statusLabel, type Bookmark, type Geometry, type Workspace } from "../domain/model";
import {
  decisionStatuses,
  domainOf,
  emptyTriageFilter,
  graphVisibility,
  groupsOf,
  inTab,
  outcomeOf,
  reasonFor,
  relatedOf,
  triageQueue,
  clockwise,
  type TriageFilter,
  type TriageTab,
} from "../domain/triage";

const relatedListLimit = 12;
// At this width and below the queue and the panel share the area under the graph, as two tabs.
const sharedPanelQuery = "(max-width: 820px)";
// Up to this width an expanded queue floats over the graph as a drawer; above it, the queue is a column.
const queueDrawerQuery = "(max-width: 1280px)";

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
export function TriageScreen({ workspace, geometry, onGeometry, save, loadMedia, toast, notify, onEdit, onImport, onTagTypes, onError, headerStart, headerEnd, onCopyContext, onThumbnail }: {
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
  onEdit: (id: string) => void;
  onImport: () => void;
  onError: (message: string) => void;
}) {
  const graphRef = useRef<GraphCanvasHandle>(null);
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
  // Above 820 px: the full queue list, or only its thumbnails when false.
  const [queueOpen, setQueueOpen] = useState(() => !matchMedia(queueDrawerQuery).matches);
  // At 820 px and below: which tab the area under the graph shows.
  const [panelTab, setPanelTab] = useState<"queue" | "detail">("detail");
  const shared = useMediaQuery(sharedPanelQuery);
  const drawer = useMediaQuery(queueDrawerQuery) && !shared && queueOpen;
  const [groupQuery, setGroupQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // The filter bar's More menu, holding Empty groups and Ungrouped bookmarks.
  const [menuIndex, setMenuIndex] = useState(0);
  const [copyScope, setCopyScope] = useState<CopyScope>();
  const [busy, setBusy] = useState(false);
  const frameToken = useRef(0);
  const [frameRequest, setFrameRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const filterInput = useRef<HTMLInputElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  // The width of graph an open queue drawer covers (the graph's stage follows the queue), so picking a bookmark centres it beside the drawer.
  const drawerCover = () => drawer ? (queueRef.current?.getBoundingClientRect().right ?? 0) - (queueRef.current?.nextElementSibling?.getBoundingClientRect().left ?? 0) : 0;
  const groupInput = useRef<HTMLInputElement>(null);

  const selectionTag = selection && workspace.tags.find((t) => t.id === selectionTagId);
  const panelTag = tagPanel && workspace.tags.find((t) => t.id === tagPanel.id);
  const selectionSet = useMemo(() => (selection ? new Set(selection) : undefined), [selection]);
  const queue = useMemo(() => {
    const list = triageQueue(workspace, { tab, filter, selection: selectionSet });
    if (!selection) return list;
    const order = new Map(selection.map((id, i) => [id, i]));
    return list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [workspace, tab, filter, selection, selectionSet]);
  // Nothing is current until a bookmark is picked, so the whole graph shows unfaded.
  const current = workspace.bookmarks.find((b) => b.id === currentId);
  // Publish only committed UI state; clear it when the collection screen unmounts.
  useLayoutEffect(() => {
    onCopyContext({ collectionId: workspace.id, selection, list: queue.map((b) => b.id), current: current?.id });
    return () => onCopyContext(undefined);
  }, [workspace.id, selection, queue, current?.id, onCopyContext]);
  const groups = current ? groupsOf(workspace, current.id) : [];
  const related = useMemo(() => (current ? [...relatedOf(workspace, current.id)].sort((a, b) => b[1].length - a[1].length) : []), [workspace, current]);
  const visibility = useMemo(() => graphVisibility(workspace, filter, tab, current ? [current.id] : []), [workspace, filter, tab, current]);
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
  // Frame the current bookmark with its groups after navigation, not after box selection.
  useEffect(() => {
    if (!frameRequest || !current) return;
    graphRef.current?.frame([current.id, ...groups.map((g) => g.id)]);
  }, [frameRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function show(id: string | undefined, frame = true) {
    setCurrentId(id);
    setTagPanel(undefined);
    setPanelTab(id ? "detail" : "queue");
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
    const bookmark = current, next = nextAfter(bookmark.id);
    void run(async () => {
      await save({ type: "bookmark.patch", id: bookmark.id, expectedRecordRevision: bookmark.revision, patch: { statusId: status.id } },
        `${kind === "done" ? "Done" : "Drop"}: ${bookmark.title}`);
      show(next);
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
  useEffect(() => { if (resetRequest) graphRef.current?.resetPositions(); }, [resetRequest]);
  function toggleQueue() {
    if (shared) setPanelTab((t) => (t === "queue" ? "detail" : "queue"));
    else setQueueOpen((v) => !v);
  }
  function openCopy(scope?: CopyScope) {
    setCopyScope(scope ?? (selection ? "selection" : "list"));
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
      else if (e.key === "Escape" && drawer) setQueueOpen(false);
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
  // In the phone layout the panel's bar starts with the Queue button, in place of tabs.
  const sheetQueue = (
    <button className="queue-toggle sheet-queue" aria-label="Queue" aria-expanded={false} title="Show the queue (Q)" onClick={toggleQueue}>
      <Icon name="list" size={16} strokeWidth={2} /><span className="queue-count">{queue.length}</span>
    </button>
  );
  const total = workspace.bookmarks.length || 1;
  const progressText = `${counts.done} done · ${counts.dropped} dropped · ${counts.todo} to triage`;
  return (
    <div className={`triage ${queueOpen ? "queue-open" : "queue-minimized"} ${panelTab === "queue" ? "panel-queue" : ""} ${current || panelTag ? "has-current" : ""}`}>
      <header className="triage-header">
        {headerStart}
        <div className="triage-progress" aria-label="Triage progress" title={progressText}>
          <div className="triage-bar" aria-hidden="true">
            <span style={{ width: `${(counts.done / total) * 100}%`, background: "var(--color-accent)" }} />
            <span style={{ width: `${(counts.dropped / total) * 100}%`, background: "var(--color-ink-faint)" }} />
          </div>
          <span className="triage-progress-text">{progressText}</span>
          <span className="triage-percent">{Math.round(((counts.done + counts.dropped) / total) * 100)}%</span>
        </div>
        <div className="segmented" role="tablist" aria-label="Queue">
          {([["todo", `To triage ${counts.todo}`], ["done", `Done ${counts.done}`], ["dropped", `Dropped ${counts.dropped}`], ["all", "All"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => changeTab(key)}>{label}</button>
          ))}
        </div>
        {headerEnd}
      </header>
      <div className="triage-body">
        <nav ref={queueRef} className="triage-queue" aria-label="Bookmarks to triage">
          {/* The Queue control heads the queue itself: the rail's top cell, or the start of the full list's bar. */}
          <div className={`queue-bar ${selection ? "selection" : ""}`} role={selection ? "status" : undefined}>
            <button className="queue-toggle" aria-label="Queue" aria-expanded={shared ? panelTab === "queue" : queueOpen} onClick={toggleQueue}
              title={shared ? "Back to the bookmark" : queueOpen ? "Show only thumbnails (Q)" : "Show the full queue (Q)"}>
              <Icon name="list" size={16} strokeWidth={2} />
              <span className="queue-count">{selection ? selection.length : queue.length}</span>
              <span className={`queue-bar-label ${selectionTag ? "full" : ""}`}>
                {selection ? <>{selectionTag ? <>in <span title={selectionTag.name}>{selectionTag.name}</span></> : "selected"}{queue.length !== selection.length ? ` · ${queue.length} here` : ""}</> : "in this list"}
              </span>
              <Icon className="queue-chevron" name="chevron-left" size={14} />
            </button>
            <span className="queue-bar-actions">
              {selection
                ? <><button onClick={() => openCopy("selection")}><Icon name="copy" size={13} /> Copy…</button>
                    <button onClick={() => setSelection(undefined)} title="Clear selection (Esc)">Clear</button></>
                : <button onClick={() => openCopy("list")} disabled={!queue.length}><Icon name="copy" size={13} /> Copy…</button>}
            </span>
          </div>
          {queue.map((b) => {
            const warn = b.notes?.some((n) => /^(Link check|Possible duplicate)/.test(n.label));
            const decided = outcomeOf(b, workspace) !== "active";
            const tagCount = workspace.memberships.filter((m) => m.bookmarkId === b.id).length;
            return (
              <button key={b.id} className={`queue-item ${b.id === current?.id ? "current" : ""}`} aria-current={b.id === current?.id} title={!shared && !queueOpen ? b.title : undefined} onClick={() => show(b.id)}>
                {/* The slot is kept without an image so titles line up. */}
                <span className="queue-thumb"><Cover bookmark={b} load={loadMedia} className="" letterTile /></span>
                <span className="queue-text">
                <span className="queue-title">{b.title}</span>
                <span className="queue-meta">
                  {warn && <i className="warn-dot" title="Has a warning" />}
                  <span className="queue-domain">{domainOf(b.url) || "No URL"}</span>
                  {decided && <span className="queue-status">{statusLabel(workspace, b.statusId)}</span>}
                  <span className="queue-groups" title={`${tagCount} ${tagCount === 1 ? "tag" : "tags"}`}>{tagCount}</span>
                </span>
                </span>
              </button>
            );
          })}
          {!queue.length && <p className="queue-empty">{workspace.bookmarks.length ? "Nothing here. Try another tab or clear the filter." : "No bookmarks yet."}</p>}
        </nav>
        <div className="triage-stage">
          <div className="triage-tools">
            <FilterBar workspace={workspace} filter={filter} tab={tab} searchRef={filterInput} compact={shared} onChange={changeFilter} save={(c, label) => save(c, label)} />
          </div>
          {toast}
          <GraphCanvas
            ref={graphRef}
            coveredLeft={drawerCover}
            workspace={workspace}
            selected={current?.id}
            onSelect={(id) => {
              // Tapping the graph puts a queue drawer away; tapping empty space does nothing else.
              if (drawer) { setQueueOpen(false); if (!id) return; }
              if (!id) show(undefined, false);
              else if (workspace.bookmarks.some((b) => b.id === id)) show(id);
              else {
                boxSelect(workspace.memberships.filter((m) => m.tagId === id).map((m) => m.bookmarkId), false, id);
                setTagPanel({ id, editing: false });
                setPanelTab("detail");
              }
            }}
            query=""
            matchingBookmarkIds={visibility.bookmarkIds}
            filtering={Boolean(filter.text.trim())}
            hiddenTagIds={visibility.hiddenTagIds}
            peekTagIds={visibility.peekTagIds}
            boxSelection={selectionSet}
            onCenter={current ? () => graphRef.current?.frame([current.id, ...groups.map((g) => g.id)]) : undefined}
            compact={shared}
            onBoxSelect={boxSelect}
            geometry={geometry}
            onGeometry={onGeometry}
            onImport={onImport}
            onClearSearch={() => changeFilter(emptyTriageFilter)}
            onPinsChanged={setPinnedIds}
            loadMedia={loadMedia}
          />
        </div>
        <aside className="triage-panel" aria-label="Current bookmark">
          {panelTag ? (
            tagPanel!.editing
              ? <div className="triage-detail">
                  <RecordEditor key={panelTag.id} inline workspace={workspace} id={panelTag.id} onSave={(c) => save(c)} onNewType={onTagTypes}
                    onClose={() => setTagPanel({ ...tagPanel!, editing: false })} />
                </div>
              : <TagView tag={panelTag} workspace={workspace} order={selectionTagId === panelTag.id ? selection : undefined} loadMedia={loadMedia} onOpen={(id) => show(id)}
                    onCopy={() => openCopy("selection")} onEdit={() => setTagPanel({ ...tagPanel!, editing: true })}
                    start={<>{sheetQueue}{tagPanel!.back && current && (
                      <button className="text-button tag-back" onClick={() => setTagPanel(undefined)}><Icon name="chevron-left" size={14} /> Back<span className="tag-back-rest"> to the bookmark</span></button>
                    )}</>}
                    pin={<PinButton pinned={pinnedIds.includes(panelTag.id)} onToggle={(on) => graphRef.current?.setPinned(panelTag.id, on)} />} onClose={() => setTagPanel(undefined)} />
          ) : current ? (
            <>
              <DetailBar
                start={<>
                  {sheetQueue}
                  <IconButton label="Previous in the queue (K)" icon="chevron-left" size={16} onClick={() => move(-1)} />
                  <IconButton label="Next in the queue (J)" icon="chevron-right" size={16} onClick={() => move(1)} />
                  {position >= 0 && <span className="detail-position">{position + 1} of {queue.length}</span>}
                </>}
                closeLabel="Clear current bookmark (Esc)" onClose={() => show(undefined, false)}>
                <IconButton label="Copy" icon="copy" size={16} onClick={() => openCopy("current")} />
                <IconButton label="Edit" icon="edit" size={16} onClick={() => onEdit(current.id)} />
                <PinButton pinned={pinnedIds.includes(current.id)} onToggle={(on) => graphRef.current?.setPinned(current.id, on)} />
              </DetailBar>
              <div className="triage-detail">
                <div className="triage-top">
                  <div className="triage-heading">
                    <div className="detail-link">
                      {current.url && isWebUrl(current.url)
                        ? <a href={current.url} target="_blank" rel="noreferrer" title={current.url}><span>{domainOf(current.url)}</span> <Icon name="external" size={13} /></a>
                        : current.url ? <span className="detail-link-warning" title={current.url}><strong>Not a link</strong> {current.url}</span> : <span className="subtle">No URL</span>}
                    </div>
                    <h2>{current.title}</h2>
                  </div>
                </div>
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
                            <button className="group-name" title={`Open ${t.name}`} onClick={() => { setTagPanel({ id: t.id, editing: false, back: true }); setPanelTab("detail"); }}>{t.name}</button><span className="group-type" title={peek ? `${typeName(t.typeId)} is hidden in the filter` : undefined}>{typeName(t.typeId)}{peek && " · hidden"}</span>
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
                    {related.slice(0, relatedListLimit).map(([id, via]) => {
                      const b = workspace.bookmarks.find((x) => x.id === id) as Bookmark;
                      const viaTag = workspace.tags.find((t) => t.id === via[0]);
                      return (
                        <button key={id} onClick={() => show(id)}>
                          <span className="related-title">{b.title}</span>
                          {/* With one tag every related bookmark comes through it, so naming it adds nothing. */}
                          {groups.length > 1 && <span className="related-via">via {viaTag?.name}{via.length > 1 ? ` +${via.length - 1}` : ""}</span>}
                        </button>
                      );
                    })}
                    {!related.length && <p className="subtle">Shares no tag with another bookmark.</p>}
                    {related.length > relatedListLimit && <p className="subtle">and {related.length - relatedListLimit} more, highlighted in the graph</p>}
                  </div>
                </section>
              </div>
              <div className="triage-decisions">
                <button className="primary" disabled={busy || !done} onClick={() => decide("done")}>Done<small aria-hidden="true">D</small></button>
                <button disabled={busy || !dropped} onClick={() => decide("dropped")}>Drop<small aria-hidden="true">X</small></button>
                {/* Deselect only applies inside a box selection, so it only shows then. */}
                {selection && <button disabled={!selection.includes(current.id)} title="Take it out of the box selection" onClick={deselect}>Deselect<small aria-hidden="true">S</small></button>}
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
      {copyScope && (
        <CopyDialog
          workspace={workspace}
          initialScope={copyScope}
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

/** Pins a node where it sits in the graph, so layouts leave it there. */
function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: (pinned: boolean) => void }) {
  return <IconButton label={pinned ? "Unpin" : "Pin"} icon="pin" size={16} aria-pressed={pinned}
    title={pinned ? "Unpin: let the layout move it again" : "Pin: keep it where it is in the graph"} onClick={() => onToggle(!pinned)} />;
}
