import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon } from "./Icon";
import type { Command } from "../domain/commands";
import type { SavedView, Workspace } from "../domain/model";
import { compileRules, readRules, ruleKinds, ruleOptions, ruleValueCounts, type Rule, type TriageFilter, type TriageTab } from "../domain/triage";

type Open = { what: "show" | "filters" | "saved" | "sheet" } | { what: "edit"; index: number } | undefined;

/**
 * The graph's filter controls: search, Show, and Filters joined in one group, then Saved filters.
 * Filters holds the chips: its menu lists the ones that are on and adds new ones; a chip opens its values.
 * In the phone layout (compact) Show, Filters and Saved filters share one sheet behind a single Filters button.
 */
export function FilterBar({ workspace, filter, tab, searchRef, compact = false, onChange, save }: {
  workspace: Workspace;
  filter: TriageFilter;
  tab: TriageTab;
  searchRef: RefObject<HTMLInputElement | null>;
  compact?: boolean;
  onChange: (next: TriageFilter) => void;
  save: (command: Command, label?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<Open>();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const setRules = (rules: Rule[]) => onChange({ ...filter, rules });
  const dropEmpty = () => { if (filter.rules.some((r) => !r.values.length)) setRules(filter.rules.filter((r) => r.values.length)); };
  // Closing drops a chip if nothing was picked in it.
  function close() {
    setOpen(undefined);
    setQuery("");
    dropEmpty();
  }
  function toggle(what: "show" | "filters" | "saved" | "sheet") {
    if (open?.what === what || ((what === "filters" || what === "sheet") && open?.what === "edit")) close();
    else { dropEmpty(); setQuery(""); setOpen({ what }); }
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    // Esc closes the menu only, before the triage screen's own Esc handling sees it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  });

  const label = (kind: Rule["kind"]) => ruleKinds.find((k) => k.kind === kind)!.label;
  const names = (rule: Rule) => {
    const options = ruleOptions(workspace, rule.kind);
    return rule.values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(" or ");
  };
  const editing = open?.what === "edit" ? open.index : undefined;
  const counts = useMemo(
    () => (editing !== undefined && filter.rules[editing] ? ruleValueCounts(workspace, filter, tab, editing) : undefined),
    [editing, workspace, filter, tab],
  );
  const on = filter.rules.filter((r) => r.values.length).length;
  const hidden = filter.hiddenTypeIds.length + (filter.showEmptyGroups ? 0 : 1) + (filter.showUngrouped ? 0 : 1);
  const canSave = Boolean(on || filter.text.trim());
  async function saveFilter() {
    const n = name.trim();
    if (!n || !canSave) return;
    const view: SavedView = { id: crypto.randomUUID(), name: n, filter: compileRules(filter.rules, filter.text), sort: "title", hiddenTagIds: [] };
    await save({ type: "view.upsert", view }, `Save filter: ${n}`);
    setName("");
    setOpen(undefined);
  }

  const chip = (rule: Rule, i: number) => (
    <span key={i} className={`filter-chip ${rule.not ? "not" : ""}`}>
      <button className="filter-chip-body" title={`${rule.not ? "Not " : ""}${label(rule.kind)}: ${names(rule)}`} onClick={() => { setQuery(""); setOpen({ what: "edit", index: i }); }}>
        {rule.not && "Not "}<b>{label(rule.kind)}:</b> {names(rule) || "pick…"}
      </button>
      <button className="filter-chip-x" aria-label={`Remove ${label(rule.kind)} filter`} onClick={() => setRules(filter.rules.filter((_, j) => j !== i))}>
        <Icon name="close" size={12} />
      </button>
    </span>
  );

  function editor(i: number) {
    const rule = filter.rules[i];
    const options = ruleOptions(workspace, rule.kind);
    const q = query.trim().toLowerCase();
    const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q));
    return (
      <div className={`chip-popover ${compact ? "filter-sheet" : ""}`} role="dialog" aria-label={`${label(rule.kind)} filter`}>
        <button className="chip-back" onClick={() => { dropEmpty(); setQuery(""); setOpen({ what: compact ? "sheet" : "filters" }); }}>
          <Icon name="chevron-left" size={14} /> {label(rule.kind)}
        </button>
        {options.length > 8 && (
          <input className="chip-search" autoFocus placeholder={`Find a ${label(rule.kind).toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        <div className="chip-options">
          {shown.map((o) => {
            const n = counts?.get(o.value) ?? 0, checked = rule.values.includes(o.value);
            return (
              <label key={o.value} className={`chip-option ${n || checked ? "" : "zero"}`}>
                <input type="checkbox" checked={checked}
                  onChange={(e) => setRules(filter.rules.map((r, j) => (j === i ? { ...r, values: e.target.checked ? [...r.values, o.value] : r.values.filter((v) => v !== o.value) } : r)))} />
                <span>{o.label}</span><small>{n}</small>
              </label>
            );
          })}
          {!shown.length && <p className="subtle chip-empty">{options.length ? "No match." : `No ${label(rule.kind).toLowerCase()} values yet.`}</p>}
        </div>
        <label className="chip-option chip-not">
          <input type="checkbox" checked={rule.not} onChange={(e) => setRules(filter.rules.map((r, j) => (j === i ? { ...r, not: e.target.checked } : r)))} />
          <span>Not (exclude these)</span>
        </label>
      </div>
    );
  }

  // Each menu's contents, shown in its own popover or, in the phone layout, all in one sheet.
  const showPanel = <>
    <h4>Tag types</h4>
    {workspace.tagTypes.map((type) => (
      <label key={type.id} className="chip-option">
        <input type="checkbox" checked={!filter.hiddenTypeIds.includes(type.id)}
          onChange={(e) => onChange({ ...filter, hiddenTypeIds: e.target.checked ? filter.hiddenTypeIds.filter((id) => id !== type.id) : [...filter.hiddenTypeIds, type.id] })} />
        <i className="swatch" style={{ background: type.appearance.color }} /><span>{type.name}</span>
      </label>
    ))}
    <h4 className="chip-divided">Also show</h4>
    <label className="filter-check">
      <input type="checkbox" checked={filter.showEmptyGroups} onChange={(e) => onChange({ ...filter, showEmptyGroups: e.target.checked })} />
      <span>Empty tags</span><small>Tags with no shown bookmark</small>
    </label>
    <label className="filter-check">
      <input type="checkbox" checked={filter.showUngrouped} onChange={(e) => onChange({ ...filter, showUngrouped: e.target.checked })} />
      <span>Untagged bookmarks</span><small>Bookmarks with no shown tag</small>
    </label>
  </>;
  const filtersPanel = <>
    {filter.rules.length > 0 && <>
      <h4>On now</h4>
      <div className="chip-list">{filter.rules.map(chip)}</div>
      <button className="chip-menu-item chip-clear" onClick={() => setRules([])}>Clear all</button>
    </>}
    <h4 className={filter.rules.length ? "chip-divided" : ""}>Add a filter</h4>
    {ruleKinds.map((k) => (
      <button key={k.kind} className="chip-menu-item" onClick={() => {
        setRules([...filter.rules, { kind: k.kind, values: [], not: false }]);
        setQuery("");
        setOpen({ what: "edit", index: filter.rules.length });
      }}>
        {k.label}<small>{ruleOptions(workspace, k.kind).length}</small>
      </button>
    ))}
  </>;
  const savedPanel = <>
    <h4>Saved filters</h4>
    {workspace.views.map((v) => {
      const read = readRules(v.filter);
      return (
        <div key={v.id} className="view-row">
          <button className="chip-menu-item" disabled={!read} title={read ? "Use these filters" : "Made with the old filter screen; it cannot be shown here"}
            onClick={() => { if (!read) return; onChange({ ...filter, rules: read.rules, text: read.text }); setOpen(undefined); }}>
            {v.name}
          </button>
          <button className="view-delete" aria-label={`Delete saved filter ${v.name}`} onClick={() => void save({ type: "view.remove", id: v.id }, `Delete saved filter: ${v.name}`)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      );
    })}
    {!workspace.views.length && <p className="subtle chip-empty">No saved filters yet.</p>}
    <form className="view-save" onSubmit={(e) => { e.preventDefault(); void saveFilter(); }}>
      <input aria-label="Saved filter name" placeholder={canSave ? "Save current filters as…" : "Add a filter first"} disabled={!canSave} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={!canSave || !name.trim()}>Save</button>
    </form>
  </>;

  if (compact) return (
    <div className="filter-bar compact" ref={root}>
      <label className={`filter-search filter-box ${filter.text.trim() ? "searching" : ""}`}>
        <Icon name="search" size={15} />
        <input ref={searchRef} type="search" aria-label="Search bookmarks and tags" placeholder="Search…" title="Search (F)" value={filter.text}
          onChange={(e) => onChange({ ...filter, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Escape") { onChange({ ...filter, text: "" }); e.currentTarget.blur(); } }} />
      </label>
      <button className={`filter-saved filter-sheet-button ${on || hidden ? "on" : ""}`} aria-expanded={open?.what === "sheet" || editing !== undefined} aria-haspopup="dialog" onClick={() => toggle("sheet")}>
        <Icon name="filter" size={15} />Filters{on + hidden ? <span className="filter-count">{on + hidden}</span> : null}
      </button>
      {open?.what === "sheet" && (
        <div className="chip-popover filter-sheet" role="dialog" aria-label="Filters">
          {showPanel}
          <div className="chip-divided" />
          {filtersPanel}
          <div className="chip-divided" />
          {savedPanel}
        </div>
      )}
      {editing !== undefined && filter.rules[editing] && editor(editing)}
    </div>
  );

  return (
    <div className="filter-bar" ref={root}>
      <div className={`filter-joined ${filter.text.trim() ? "searching" : ""}`}>
        <label className="filter-search">
          <Icon name="filter" size={15} />
          <input ref={searchRef} type="search" aria-label="Search bookmarks and tags" placeholder="Search…" title="Search (F)" value={filter.text}
            onChange={(e) => onChange({ ...filter, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape") { onChange({ ...filter, text: "" }); e.currentTarget.blur(); } }} />
        </label>
        <span className="filter-anchor">
          <button className="filter-button" aria-expanded={open?.what === "show"} aria-haspopup="dialog" onClick={() => toggle("show")}>
            <span className="filter-dots" aria-hidden="true">
              {workspace.tagTypes.map((t) => <i key={t.id} className={filter.hiddenTypeIds.includes(t.id) ? "off" : ""} style={{ background: t.appearance.color }} />)}
            </span>
            Show{hidden ? <small>· {hidden} hidden</small> : null}<Icon name="chevron-down" size={13} />
          </button>
          {open?.what === "show" && (
            <div className="chip-popover" role="dialog" aria-label="Show">
              {showPanel}
            </div>
          )}
        </span>
        <span className="filter-anchor">
          <button className={`filter-button ${on ? "on" : ""}`} aria-expanded={open?.what === "filters" || editing !== undefined} aria-haspopup="dialog" onClick={() => toggle("filters")}>
            Filters{on ? ` · ${on}` : ""}<Icon name="chevron-down" size={13} />
          </button>
          {open?.what === "filters" && (
            <div className="chip-popover" role="dialog" aria-label="Filters">
              {filtersPanel}
            </div>
          )}
          {editing !== undefined && filter.rules[editing] && editor(editing)}
        </span>
      </div>
      <span className="filter-anchor">
        <button className="filter-saved" aria-expanded={open?.what === "saved"} aria-haspopup="dialog" onClick={() => toggle("saved")}>
          Saved filters <Icon name="chevron-down" size={13} />
        </button>
        {open?.what === "saved" && (
          <div className="chip-popover" role="dialog" aria-label="Saved filters">
            {savedPanel}
          </div>
        )}
      </span>
    </div>
  );
}
