import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { CopyDialog, type CopyScope } from "./CopyDialog";
import { Icon, IconButton } from "./Icon";
import type { Command } from "../domain/commands";
import { isWebUrl, type Asset, type Bubble, type Geometry, type Workspace } from "../domain/model";
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

type LoadMedia = (id: string) => Promise<{ blob: Blob } | undefined>;
const relatedListLimit = 12;

function Cover({ asset, load }: { asset?: Asset; load: LoadMedia }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined, canceled = false;
    setSrc(undefined);
    if (asset?.kind !== "image") return;
    if (asset.source === "remote") setSrc(asset.url);
    else void load(asset.blobId!).then((m) => {
      if (m && !canceled) setSrc(objectUrl = URL.createObjectURL(m.blob));
    });
    return () => { canceled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset, load]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  // Hidden until loaded, so a slow or blocked cover never leaves an empty frame.
  return src ? <img className="triage-cover" src={src} alt="" hidden={!loaded} onLoad={() => setLoaded(true)} onError={() => setSrc(undefined)} /> : null;
}

/** The main collection screen: triage bookmarks into groups beside the force-directed graph. */
export function TriageScreen({ workspace, geometry, onGeometry, save, loadMedia, feedback, onEdit, onImport, onError, headerStart, headerEnd }: {
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  workspace: Workspace;
  geometry?: Geometry;
  onGeometry: (geometry: Geometry) => void;
  save: (command: Command | Command[], label?: string) => Promise<void>;
  loadMedia: LoadMedia;
  feedback: ReactNode;
  onEdit: (id: string) => void;
  onImport: () => void;
  onError: (message: string) => void;
}) {
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [tab, setTab] = useState<TriageTab>("todo");
  const [filter, setFilter] = useState<TriageFilter>(emptyTriageFilter);
  // The box selection, in the clockwise order captured when it was drawn.
  const [selection, setSelection] = useState<string[]>();
  const [currentId, setCurrentId] = useState<string>();
  const [queueOpen, setQueueOpen] = useState(() => window.innerWidth > 1000);
  const [groupQuery, setGroupQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [copyScope, setCopyScope] = useState<CopyScope>();
  const [toast, setToast] = useState<{ text: string; undo?: () => void }>();
  const [busy, setBusy] = useState(false);
  const frameToken = useRef(0);
  const [frameRequest, setFrameRequest] = useState(0);
  const filterInput = useRef<HTMLInputElement>(null);
  const groupInput = useRef<HTMLInputElement>(null);

  const selectionSet = useMemo(() => (selection ? new Set(selection) : undefined), [selection]);
  const queue = useMemo(() => {
    const list = triageQueue(workspace, { tab, filter, selection: selectionSet });
    if (!selection) return list;
    const order = new Map(selection.map((id, i) => [id, i]));
    return list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [workspace, tab, filter, selection, selectionSet]);
  const current = workspace.bubbles.find((b) => b.id === currentId && queue.some((q) => q.id === b.id))
    ?? workspace.bubbles.find((b) => b.id === currentId) ?? queue[0];
  const groups = current ? groupsOf(workspace, current.id) : [];
  const related = useMemo(() => (current ? [...relatedOf(workspace, current.id)].sort((a, b) => b[1].length - a[1].length) : []), [workspace, current]);
  const visibility = useMemo(() => graphVisibility(workspace, filter, current ? [current.id] : []), [workspace, filter, current]);
  const { done, dropped } = decisionStatuses(workspace);
  const counts = useMemo(() => ({
    todo: workspace.bubbles.filter((b) => inTab(b, workspace, "todo")).length,
    done: workspace.bubbles.filter((b) => inTab(b, workspace, "done")).length,
    dropped: workspace.bubbles.filter((b) => inTab(b, workspace, "dropped")).length,
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
    setGroupQuery("");
    setMenuOpen(false);
    if (frame) setFrameRequest(++frameToken.current);
  }
  function move(step: number) {
    const i = queue.findIndex((b) => b.id === current?.id);
    show(queue[Math.max(0, Math.min(queue.length - 1, i + step))]?.id);
  }
  // The bookmark after this one in the queue as it was before a decision.
  const nextAfter = (id: string) => {
    const i = queue.findIndex((b) => b.id === id);
    return (queue[i + 1] ?? queue[i - 1])?.id;
  };
  function notify(text: string, undo?: () => void) {
    setToast({ text, undo });
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (e) { onError(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  }
  function decide(kind: "done" | "dropped") {
    const status = kind === "done" ? done : dropped;
    if (!current || !status) return;
    const bubble = current, next = nextAfter(bubble.id);
    void run(async () => {
      await save({ type: "bubble.patch", id: bubble.id, expectedRecordRevision: bubble.revision, patch: { statusId: status.id } },
        `${kind === "done" ? "Done" : "Drop"}: ${bubble.title}`);
      show(next);
      notify(`${status.label}: ${bubble.title}`);
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
      await save({ type: "membership.set", bubbleId: current.id, tagId, linked }, `${linked ? "Add to" : "Remove from"} ${tag?.name ?? "group"}`);
      setGroupQuery("");
      setFrameRequest(++frameToken.current);
    });
  }
  function boxSelect(ids: string[], adding: boolean) {
    const base = adding ? selection ?? [] : [];
    const merged = [...new Set([...base, ...ids])];
    if (!merged.length) { setSelection(undefined); return; }
    const ordered = clockwise(merged.map((id) => ({ id })), (id) => graphRef.current?.positionOf(id)).map((b) => b.id);
    setSelection(ordered);
    if (!ordered.includes(current?.id ?? "")) show(ordered.find((id) => {
      const b = workspace.bubbles.find((x) => x.id === id);
      return b && inTab(b, workspace, tab);
    }), false);
  }
  // A filter change keeps the current bookmark unless it no longer matches.
  function changeFilter(next: TriageFilter) {
    setFilter(next);
    if (current && !triageQueue(workspace, { tab, filter: next, selection: selectionSet }).some((b) => b.id === current.id))
      show(undefined, false);
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
      else if (key === "q") setQueueOpen((v) => !v);
      else if (key === "c") openCopy();
      else if (e.key === "Escape" && selection) setSelection(undefined);
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

  const filtering = Boolean(filter.text.trim() || filter.hiddenTypeIds.length || !filter.showDecided);
  const total = workspace.bubbles.length || 1;
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
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); show(undefined, false); }}>{label}</button>
          ))}
        </div>
        {headerEnd}
      </header>
      <div className="triage-body">
        <nav className="triage-queue" aria-label="Bookmarks to triage">
          {selection ? (
            <div className="queue-bar selection" role="status">
              <span><strong>{selection.length}</strong> selected{queue.length !== selection.length ? ` · ${queue.length} here` : ""}</span>
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
                <span className="queue-title">{b.title}</span>
                <span className="queue-meta">
                  {warn && <i className="warn-dot" title="Has a warning" />}
                  <span className="queue-domain">{domainOf(b.url) || "No URL"}</span>
                  {decided && <span className="queue-status">{workspace.statuses.find((s) => s.id === b.statusId)?.label}</span>}
                  <span className="queue-groups" title="Groups">{workspace.memberships.filter((m) => m.bubbleId === b.id).length}</span>
                </span>
              </button>
            );
          })}
          {!queue.length && <p className="queue-empty">{workspace.bubbles.length ? "Nothing here. Try another tab or clear the filter." : "No bookmarks yet."}</p>}
        </nav>
        <div className="triage-stage">
          <div className="triage-tools">
            <button onClick={() => setQueueOpen((v) => !v)} aria-pressed={queueOpen} title="Show or hide the queue (Q)"><Icon name="list" size={17} strokeWidth={2} /> Queue</button>
            <button onClick={() => graphRef.current?.fitAll()} title="Zoom out to every bookmark"><Icon name="fit" size={17} strokeWidth={2} /> Whole collection</button>
            <button onClick={() => current && graphRef.current?.frame([current.id, ...groups.map((g) => g.id)])} disabled={!current} title="Center on the current bookmark"><Icon name="scope" size={17} strokeWidth={2} /> Current</button>
            <div className={`triage-filter ${filtering ? "active" : ""}`}>
              <Icon name="filter" size={15} />
              <input ref={filterInput} type="search" aria-label="Filter bookmarks and groups" placeholder="Filter bookmarks and groups… (F)" value={filter.text}
                onChange={(e) => changeFilter({ ...filter, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") { changeFilter({ ...filter, text: "" }); e.currentTarget.blur(); } }} />
              {workspace.tagTypes.map((type) => (
                <label key={type.id} className="type-toggle">
                  <input type="checkbox" checked={!filter.hiddenTypeIds.includes(type.id)}
                    onChange={(e) => changeFilter({ ...filter, hiddenTypeIds: e.target.checked ? filter.hiddenTypeIds.filter((id) => id !== type.id) : [...filter.hiddenTypeIds, type.id] })} />
                  <i className="swatch" style={{ background: type.appearance.color }} />{type.name}
                </label>
              ))}
              <label className="type-toggle">
                <input type="checkbox" checked={filter.showDecided} onChange={(e) => changeFilter({ ...filter, showDecided: e.target.checked })} />
                Decided
              </label>
              {filtering && <span className="filter-count">{visibility.bubbleIds.length} shown</span>}
            </div>
          </div>
          <GraphCanvas
            ref={graphRef}
            workspace={workspace}
            selected={current?.id}
            onSelect={(id) => {
              if (workspace.bubbles.some((b) => b.id === id)) show(id);
              else onEdit(id);
            }}
            query=""
            matchingBubbleIds={visibility.bubbleIds}
            filtering={Boolean(filter.text.trim())}
            hiddenTagIds={visibility.hiddenTagIds}
            boxSelection={selectionSet}
            onBoxSelect={boxSelect}
            geometry={geometry}
            onGeometry={onGeometry}
            onImport={onImport}
            onClearSearch={() => changeFilter(emptyTriageFilter)}
            onPinsChanged={() => {}}
            loadMedia={loadMedia}
            feedback={feedback}
          />
        </div>
        <aside className="triage-panel" aria-label="Current bookmark">
          {current ? (
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
                      return (
                        <div key={t.id} className="triage-group">
                          <i className="swatch" style={{ background: typeColor(t.typeId) }} />
                          <div>
                            <span className="group-name">{t.name}</span><span className="group-type">{typeName(t.typeId)}</span>
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
                      const b = workspace.bubbles.find((x) => x.id === id) as Bubble;
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
              <h2>{workspace.bubbles.length ? "Nothing to triage here" : "No bookmarks yet"}</h2>
              <p className="subtle">{workspace.bubbles.length ? "Pick another tab, clear the filter, or draw a box on the graph." : "Import bookmarks to start."}</p>
              {!workspace.bubbles.length && <button className="primary" onClick={onImport}>Open Import</button>}
            </div>
          )}
        </aside>
      </div>
      {toast && (
        <div className="triage-toast" role="status">
          {toast.text}
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(undefined); }}>Undo</button>}
        </div>
      )}
      {copyScope && (
        <CopyDialog
          workspace={workspace}
          initialScope={copyScope}
          scopes={{
            selection: selection ? selection.map((id) => workspace.bubbles.find((b) => b.id === id)).filter((b): b is Bubble => !!b) : undefined,
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
