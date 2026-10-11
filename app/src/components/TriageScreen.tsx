import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { CopyDialog, type CopyScope } from "./CopyDialog";
import { RecordEditor } from "./RecordEditor";
import { TagView } from "./TagView";
import { FilterChips } from "./FilterChips";
import { Cover, type LoadMedia } from "./Cover";
import { Icon, IconButton } from "./Icon";
import type { Command } from "../domain/commands";
import { isWebUrl, type Bookmark, type Geometry, type Workspace } from "../domain/model";
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

/** The main collection screen: triage bookmarks into groups beside the force-directed graph. */
export function TriageScreen({ workspace, geometry, onGeometry, save, loadMedia, toast, notify, onEdit, onImport, onTagTypes, onError, headerStart, headerEnd }: {
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
  // The tag shown in the detail panel after a tag is clicked in the graph, read or edited.
  const [tagPanel, setTagPanel] = useState<{ id: string; editing: boolean }>();
  const [currentId, setCurrentId] = useState<string>();
  const [queueOpen, setQueueOpen] = useState(() => window.innerWidth > 1000);
  const [groupQuery, setGroupQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // The filter bar's More menu, holding Empty groups and Ungrouped bookmarks.
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [copyScope, setCopyScope] = useState<CopyScope>();
  const [busy, setBusy] = useState(false);
  const frameToken = useRef(0);
  const [frameRequest, setFrameRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const filterInput = useRef<HTMLInputElement>(null);
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
      await save({ type: "membership.set", bookmarkId: current.id, tagId, linked }, `${linked ? "Add to" : "Remove from"} ${tag?.name ?? "group"}`);
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
      else if (key === "q") setQueueOpen((v) => !v);
      else if (key === "c") openCopy();
      else if (e.key === "Escape" && moreOpen) setMoreOpen(false);
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
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest(".filter-more")) setMoreOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  const filtering = Boolean(filter.text.trim() || filter.hiddenTypeIds.length || !filter.showEmptyGroups || !filter.showUngrouped || filter.rules.length);
  const total = workspace.bookmarks.length || 1;
  return (
    <div className={`triage ${queueOpen ? "" : "queue-closed"}`}>
      <header className="triage-header">
        {headerStart}
        <div className="triage-progress" aria-label="Triage progress">
          <div className="triage-bar" aria-hidden="true">
            <span style={{ width: `${(counts.done / total) * 100}%`, background: "var(--teal)" }} />
            <span style={{ width: `${(counts.dropped / total) * 100}%`, background: "#9fb1a9" }} />
          </div>
          <span>{counts.done} done · {counts.dropped} dropped · {counts.todo} to triage</span>
        </div>
        <div className="segmented" role="tablist" aria-label="Queue">
          {([["todo", `To triage ${counts.todo}`], ["done", `Done ${counts.done}`], ["dropped", `Dropped ${counts.dropped}`], ["all", "All"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => changeTab(key)}>{label}</button>
          ))}
        </div>
        {headerEnd}
      </header>
      <div className="triage-body">
        <nav className="triage-queue" aria-label="Bookmarks to triage">
          {selection ? (
            <div className="queue-bar selection" role="status">
              <span className={`queue-bar-label ${selectionTag ? "full" : ""}`}><strong>{selection.length}</strong> {selectionTag ? <>in <span title={selectionTag.name}>{selectionTag.name}</span></> : "selected"}{queue.length !== selection.length ? ` · ${queue.length} here` : ""}</span>
              <span className="queue-bar-actions">
                <button onClick={() => openCopy("selection")}><Icon name="copy" size={13} /> Copy…</button>
                <button onClick={() => setSelection(undefined)} title="Clear selection (Esc)">Clear</button>
              </span>
            </div>
          ) : (
            <div className="queue-bar">
              <span>{queue.length} in this list</span>
              <button onClick={() => openCopy("list")} disabled={!queue.length}><Icon name="copy" size={13} /> Copy…</button>
            </div>
          )}
          {queue.map((b) => {
            const warn = b.notes?.some((n) => /^(Link check|Possible duplicate)/.test(n.label));
            const decided = outcomeOf(b, workspace) !== "active";
            return (
              <button key={b.id} className={`queue-item ${b.id === current?.id ? "current" : ""}`} aria-current={b.id === current?.id} onClick={() => show(b.id)}>
                {/* The slot is kept without an image so titles line up. */}
                <span className="queue-thumb"><Cover asset={b.asset} load={loadMedia} className="" /></span>
                <span className="queue-text">
                <span className="queue-title">{b.title}</span>
                <span className="queue-meta">
                  {warn && <i className="warn-dot" title="Has a warning" />}
                  <span className="queue-domain">{domainOf(b.url) || "No URL"}</span>
                  {decided && <span className="queue-status">{workspace.statuses.find((s) => s.id === b.statusId)?.label}</span>}
                  <span className="queue-groups" title="Groups">{workspace.memberships.filter((m) => m.bookmarkId === b.id).length}</span>
                </span>
                </span>
              </button>
            );
          })}
          {!queue.length && <p className="queue-empty">{workspace.bookmarks.length ? "Nothing here. Try another tab or clear the filter." : "No bookmarks yet."}</p>}
        </nav>
        <div className="triage-stage">
          <div className="triage-tools">
            <button onClick={() => setQueueOpen((v) => !v)} aria-pressed={queueOpen} title="Show or hide the queue (Q)"><Icon name="list" size={17} strokeWidth={2} /> Queue</button>
            <div className={`triage-filter ${filtering ? "active" : ""}`}>
              <Icon name="filter" size={15} />
              <input ref={filterInput} type="search" aria-label="Filter bookmarks and groups" placeholder="Filter… (F)" value={filter.text}
                onChange={(e) => changeFilter({ ...filter, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") { changeFilter({ ...filter, text: "" }); e.currentTarget.blur(); } }} />
              {workspace.tagTypes.map((type) => (
                <label key={type.id} className="type-toggle">
                  <input type="checkbox" checked={!filter.hiddenTypeIds.includes(type.id)}
                    onChange={(e) => changeFilter({ ...filter, hiddenTypeIds: e.target.checked ? filter.hiddenTypeIds.filter((id) => id !== type.id) : [...filter.hiddenTypeIds, type.id] })} />
                  <i className="swatch" style={{ background: type.appearance.color }} />{type.name}
                </label>
              ))}
              <span className="filter-more">
                <button className="filter-more-button" aria-label="More filters" aria-expanded={moreOpen} aria-haspopup="dialog"
                  title={filter.showEmptyGroups && filter.showUngrouped ? "More filters" : "More filters (some hidden)"} onClick={() => setMoreOpen((v) => !v)}>
                  <Icon name="menu" size={16} />
                  {!(filter.showEmptyGroups && filter.showUngrouped) && <i className="filter-more-dot" />}
                </button>
                {moreOpen && (
                  <div className="filter-more-popover" role="dialog" aria-label="More filters">
                    <h4>Show</h4>
                    <label className="filter-check">
                      <input type="checkbox" checked={filter.showEmptyGroups} onChange={(e) => changeFilter({ ...filter, showEmptyGroups: e.target.checked })} />
                      <span>Empty groups</span><small>Groups no shown bookmark belongs to</small>
                    </label>
                    <label className="filter-check">
                      <input type="checkbox" checked={filter.showUngrouped} onChange={(e) => changeFilter({ ...filter, showUngrouped: e.target.checked })} />
                      <span>Ungrouped bookmarks</span><small>Bookmarks in no shown group</small>
                    </label>
                  </div>
                )}
              </span>
              <FilterChips workspace={workspace} filter={filter} tab={tab} onChange={changeFilter} save={(c, label) => save(c, label)} />
            </div>
          </div>
          {toast}
          <GraphCanvas
            ref={graphRef}
            workspace={workspace}
            selected={current?.id}
            onSelect={(id) => {
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
            tools={<IconButton label="Center on the current bookmark" icon="scope" disabled={!current} onClick={() => current && graphRef.current?.frame([current.id, ...groups.map((g) => g.id)])} />}
            onBoxSelect={boxSelect}
            geometry={geometry}
            onGeometry={onGeometry}
            onImport={onImport}
            onClearSearch={() => changeFilter(emptyTriageFilter)}
            onPinsChanged={() => {}}
            loadMedia={loadMedia}
          />
        </div>
        <aside className="triage-panel" aria-label="Current bookmark">
          {panelTag ? (
            <div className="triage-detail">
              {tagPanel!.editing
                ? <RecordEditor key={panelTag.id} inline workspace={workspace} id={panelTag.id} onSave={(c) => save(c)} onNewType={onTagTypes}
                    onClose={() => setTagPanel({ id: panelTag.id, editing: false })} />
                : <TagView tag={panelTag} workspace={workspace} order={selectionTagId === panelTag.id ? selection : undefined} loadMedia={loadMedia} onOpen={(id) => show(id)}
                    onCopy={() => openCopy("selection")} onEdit={() => setTagPanel({ id: panelTag.id, editing: true })} onClose={() => setTagPanel(undefined)} />}
            </div>
          ) : current ? (
            <>
              <div className="triage-detail">
                <div className="triage-top">
                  <div>
                    <h2>{current.title}</h2>
                    <div className="triage-links">
                      {current.url && isWebUrl(current.url)
                        ? <a href={current.url} target="_blank" rel="noreferrer">{domainOf(current.url)} <Icon name="external" size={13} /></a>
                        : current.url ? <span className="url-warning">{current.url}<span className="url-warning-label">Not a link</span></span> : <span className="subtle">No URL</span>}
                      <button className="text-button" onClick={() => openCopy("current")}><Icon name="copy" size={13} /> Copy</button>
                      <button className="text-button" onClick={() => onEdit(current.id)}><Icon name="edit" size={13} /> Edit</button>
                    </div>
                  </div>
                  <Cover asset={current.asset} load={loadMedia} />
                  <IconButton className="triage-close" label="Clear current bookmark (Esc)" icon="close" size={15} onClick={() => show(undefined, false)} />
                </div>
                <p className="triage-desc">{current.description || <span className="subtle">No description.</span>}</p>
                {current.source?.fields.tags && (
                  <div className="triage-raindrop">Raindrop {current.source.fields.tags.split(",").map((t) => t.trim()).filter((t) => t && t !== "indie-dev").map((t) => <span key={t} className="chip">{t}</span>)}</div>
                )}
                {current.notes?.filter((n) => /^(Link check|Possible duplicate)/.test(n.label)).map((n, i) => (
                  <div key={i} className="triage-warning"><strong>{n.label}</strong>{n.text}</div>
                ))}
                <section className="triage-section">
                  <h3>Groups ({groups.length})</h3>
                  <div className="triage-groups">
                    {groups.map((t) => {
                      const why = reasonFor(current, t, workspace);
                      const peek = visibility.peekTagIds.includes(t.id);
                      return (
                        <div key={t.id} className={`triage-group ${peek ? "peek" : ""}`}>
                          <i className="swatch" style={{ background: typeColor(t.typeId) }} />
                          <div>
                            <span className="group-name">{t.name}</span><span className="group-type" title={peek ? `${typeName(t.typeId)} is hidden in the filter` : undefined}>{typeName(t.typeId)}{peek && " · hidden"}</span>
                            {why && <p className="group-why">{why}</p>}
                          </div>
                          <IconButton label={`Remove from ${t.name}`} icon="close" size={14} disabled={busy} onClick={() => link(t.id, false)} />
                        </div>
                      );
                    })}
                    {!groups.length && <p className="subtle">Not in any group yet.</p>}
                  </div>
                  <div className="group-add">
                    <input ref={groupInput} placeholder="Add to an issue or topic… (/)" value={groupQuery} aria-label="Add to a group"
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
                          <span className="related-via">via {viaTag?.name}{via.length > 1 ? ` +${via.length - 1}` : ""}</span>
                        </button>
                      );
                    })}
                    {!related.length && <p className="subtle">Shares no group with another bookmark.</p>}
                    {related.length > relatedListLimit && <p className="subtle">and {related.length - relatedListLimit} more, highlighted in the graph</p>}
                  </div>
                </section>
              </div>
              <div className="triage-decisions">
                <button className="primary" disabled={busy || !done} onClick={() => decide("done")}>Done<small>D</small></button>
                <button disabled={busy || !dropped} onClick={() => decide("dropped")}>Drop<small>X</small></button>
                <button disabled={!selection?.includes(current.id)} title={selection ? undefined : "Only for bookmarks in a box selection"} onClick={deselect}>Deselect<small>S</small></button>
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
