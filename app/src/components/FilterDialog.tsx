import { useMemo, useState } from "react";
import type { Filter, SavedView, Workspace } from "../domain/model";
import { distanceMatches, filterBubbles, filterSummary, pathSummary } from "../domain/filters";
import { Dialog } from "./Dialog";
import { FilterBuilder } from "./FilterBuilder";
import { Icon, IconButton } from "./Icon";

const emptyFilter: Filter = { op: "all", rules: [] };

function distanceFilters(filter: Filter): Array<Extract<Filter, { op: "distance" }>> {
  if (filter.op === "distance") return [filter];
  if (filter.op === "not") return distanceFilters(filter.rule);
  if (filter.op === "all" || filter.op === "any") return filter.rules.flatMap(distanceFilters);
  return [];
}

export function FilterDialog({
  workspace,
  initialFilter,
  initialHiddenTagIds,
  initialSort,
  initialViewId,
  onApply,
  onSaveView,
  onDeleteView,
  onClose,
}: {
  workspace: Workspace;
  initialFilter: Filter;
  initialHiddenTagIds: string[];
  initialSort: SavedView["sort"];
  initialViewId?: string;
  onApply: (filter: Filter, hiddenTagIds: string[], sort: SavedView["sort"], viewId?: string) => void;
  onSaveView: (view: SavedView) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>(structuredClone(initialFilter));
  const [hiddenTagIds, setHiddenTagIds] = useState(initialHiddenTagIds);
  const [sort, setSort] = useState<SavedView["sort"]>(initialSort);
  const [viewId, setViewId] = useState(initialViewId ?? "");
  const [viewName, setViewName] = useState(
    workspace.views.find((view) => view.id === initialViewId)?.name ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const distances = useMemo(() => distanceFilters(filter), [filter]);
  const matchCount = useMemo(() => filterBubbles(workspace, filter).length, [workspace, filter]);

  function loadView(id: string) {
    const view = workspace.views.find((item) => item.id === id);
    setViewId(id);
    if (!view) {
      setViewName("");
      setFilter(emptyFilter);
      setHiddenTagIds([]);
      setSort("title");
      return;
    }
    setViewName(view.name);
    setFilter(structuredClone(view.filter));
    setHiddenTagIds([...view.hiddenTagIds]);
    setSort(view.sort);
  }

  async function saveView() {
    if (busy || !viewName.trim()) return;
    setBusy(true);
    setError("");
    const view: SavedView = {
      id: viewId || crypto.randomUUID(),
      name: viewName.trim(),
      filter,
      hiddenTagIds,
      sort,
    };
    try {
      await onSaveView(view);
      setViewId(view.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteView() {
    if (!viewId || busy) return;
    setBusy(true);
    setError("");
    try {
      await onDeleteView(viewId);
      loadView("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy="filter-title" onClose={() => { if (!busy) onClose(); }} className="filter-dialog">
      <div className="modal-heading">
        <div>
          <div className="eyebrow">COLLECTION FILTERS</div>
          <h2 id="filter-title">Build a saved view</h2>
        </div>
        <IconButton label="Close filters" icon="close" size={17} disabled={busy} onClick={onClose} />
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="saved-view-row">
        <label>
          Saved view
          <select aria-label="Saved view" value={viewId} onChange={(event) => loadView(event.target.value)}>
            <option value="">Unsaved filter</option>
            {workspace.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
        </label>
        <label>
          View name
          <input aria-label="View name" value={viewName} placeholder="e.g. Ready to publish" onChange={(event) => setViewName(event.target.value)} />
        </label>
      </div>
      <div className="filter-summary"><Icon name="filter" size={15} /> <span>{filterSummary(filter, workspace)}</span><strong>{matchCount} matching bubble{matchCount === 1 ? "" : "s"}</strong></div>
      <FilterBuilder filter={filter} workspace={workspace} onChange={setFilter} />
      {distances.length > 0 && (
        <section className="distance-preview">
          <div className="section-heading"><div><h3>Distance examples</h3><p className="subtle">Distances use the full graph, including hidden tags.</p></div></div>
          {distances.map((distance, index) => {
            const matches = distanceMatches(workspace, distance.tagIds);
            const examples = [...matches.entries()].filter(([, value]) => value.distance <= distance.hops).slice(0, 3);
            return <div key={index} className="distance-example"><strong>Within {distance.hops} hop{distance.hops === 1 ? "" : "s"}</strong>{examples.length ? examples.map(([id, value]) => <span key={id}>{pathSummary(value.path, workspace)} ({value.distance})</span>) : <span className="subtle">No matching bubbles yet.</span>}</div>;
          })}
        </section>
      )}
      <section className="filter-display-options">
        <div className="section-heading"><div><h3>Display</h3><p className="subtle">Hiding a tag never removes its bubbles from matching results.</p></div></div>
        <label>Sort bubbles
          <select value={sort} onChange={(event) => setSort(event.target.value as SavedView["sort"])}>
            <option value="title">Title</option><option value="createdAt">Created</option><option value="status">Status</option>
          </select>
        </label>
        <div className="hidden-tag-options"><strong>Hidden tags</strong>{workspace.tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={hiddenTagIds.includes(tag.id)} onChange={(event) => setHiddenTagIds(event.target.checked ? [...hiddenTagIds, tag.id] : hiddenTagIds.filter((id) => id !== tag.id))} />{tag.name}</label>)}</div>
      </section>
      <footer>
        {viewId && <button disabled={busy} onClick={() => void deleteView()}>Delete view</button>}
        <button disabled={busy} onClick={onClose}>Cancel</button>
        <button disabled={busy || !viewName.trim()} onClick={() => void saveView()}>{busy ? "Saving…" : viewId ? "Update view" : "Save view"}</button>
        <button className="primary" disabled={busy} onClick={() => { onApply(filter, hiddenTagIds, sort, viewId || undefined); onClose(); }}><Icon name="check" size={15} /> Apply view</button>
      </footer>
    </Dialog>
  );
}
