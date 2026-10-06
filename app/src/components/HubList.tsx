import { useState } from "react";
import { Eye, EyeOff, Highlighter, X } from "lucide-react";
import type { Node } from "../data/graph";
const names = {
  topic: "Topics",
  issue: "Existing issues",
  proposal: "Proposals",
};
export function HubList({
  hubs,
  shown,
  highlighted,
  selected,
  toggleVisible,
  toggleHighlight,
  toggleSelection,
  close,
}: {
  hubs: Node[];
  shown: Set<string>;
  highlighted: string[];
  selected: string[];
  toggleVisible: (id: string) => void;
  toggleHighlight: (id: string) => void;
  toggleSelection: (id: string) => void;
  close: () => void;
}) {
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [group, setGroup] = useState("type"),
    [visibility, setVisibility] = useState("all");
  const filtered = hubs
    .filter(
      (n) =>
        (kind === "all" || n.kind === kind) &&
        n.label.toLowerCase().includes(search.trim().toLowerCase()) &&
        (visibility === "all" ||
          (visibility === "shown" ? shown.has(n.id) : !shown.has(n.id))),
    )
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  const groups =
    group === "type"
      ? Object.entries(names).map(([type, label]) => ({
          label,
          nodes: filtered.filter((n) => n.kind === type),
        }))
      : [{ label: "All hubs", nodes: filtered }];
  return (
    <aside
      aria-labelledby="hub-list-title"
      className="filter-drawer w-80 max-w-[calc(100vw-5rem)] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <h2 id="hub-list-title" className="font-semibold">
          Hub list
        </h2>
        <button
          className="!p-0 text-slate-400"
          aria-label="Close hub list"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <label className="mt-3 block text-xs text-slate-500">
        Filter hubs
        <input
          aria-label="Filter hubs"
          placeholder="Search hub titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">
          Hub type
          <select
            aria-label="Hub type filter"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All types</option>
            {Object.entries(names).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Group by
          <select
            aria-label="Group hubs by"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="type">Hub type</option>
            <option value="none">No grouping</option>
          </select>
        </label>
        <label className="col-span-2 text-xs text-slate-500">
          Visibility
          <select
            aria-label="Hub visibility filter"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="all">All hubs</option>
            <option value="shown">Shown</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {filtered.length} hubs · Click a row to select a hub; click it again to
        clear selection. Selected hubs are pinned temporarily.
      </p>
      {groups
        .filter((g) => g.nodes.length)
        .map((g) => (
          <section key={g.label} className="mt-4">
            <h3 className="eyebrow mb-2">
              {g.label} · {g.nodes.length}
            </h3>
            <ul className="divide-y divide-slate-100">
              {g.nodes.map((n) => {
                const isSelected = selected.includes(n.id);
                const isShown = shown.has(n.id);
                return (
                  <li
                    key={n.id}
                    className={`flex items-center gap-2 rounded-md py-1 ${isSelected ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                  >
                    <button
                      type="button"
                      aria-label={`${isSelected ? "Unselect" : "Select"} ${n.label}`}
                      aria-pressed={isSelected}
                      title={
                        isSelected
                          ? "Click again to clear selection"
                          : "Select this hub"
                      }
                      className={`min-w-0 flex-1 flex-col items-start justify-center gap-0 rounded-md px-1 py-1 text-left text-xs leading-5 ${isSelected ? "font-medium text-emerald-800" : isShown ? "text-slate-700" : "text-slate-400"}`}
                      onClick={() => toggleSelection(n.id)}
                    >
                      {n.label}
                      <span className="block text-[10px] text-slate-400">
                        {n.count} connections
                      </span>
                    </button>
                    <button
                      aria-label={`${isShown ? "Hide" : "Show"} ${n.label}`}
                      title={isShown ? "Hide hub" : "Show hub"}
                      aria-pressed={isShown}
                      onClick={() => toggleVisible(n.id)}
                    >
                      {isShown ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      aria-label={`Highlight ${n.label}`}
                      title="Highlight hub and connections"
                      aria-pressed={highlighted.includes(n.id)}
                      className={
                        highlighted.includes(n.id)
                          ? "!bg-amber-100 text-amber-800"
                          : "text-slate-400"
                      }
                      onClick={() => toggleHighlight(n.id)}
                    >
                      <Highlighter size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {!filtered.length && (
        <p className="py-6 text-center text-sm text-slate-400">
          No hubs match these filters.
        </p>
      )}
    </aside>
  );
}
