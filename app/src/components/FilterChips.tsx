import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { Command } from "../domain/commands";
import type { SavedView, Workspace } from "../domain/model";
import { compileRules, readRules, ruleKinds, ruleOptions, ruleValueCounts, type Rule, type TriageFilter, type TriageTab } from "../domain/triage";

type Open = { what: "add" | "views" } | { what: "edit"; index: number } | undefined;

/** Filter chips after the search box: "+ Filter" adds a rule, a chip's menu picks its values, and Views saves the setup. */
export function FilterChips({ workspace, filter, tab, onChange, save }: {
  workspace: Workspace;
  filter: TriageFilter;
  tab: TriageTab;
  onChange: (next: TriageFilter) => void;
  save: (command: Command, label?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<Open>();
  const [query, setQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const root = useRef<HTMLSpanElement>(null);
  const setRules = (rules: Rule[]) => onChange({ ...filter, rules });
  // Closing a chip's menu drops the chip if nothing was picked in it.
  function close() {
    setOpen(undefined);
    setQuery("");
    if (filter.rules.some((r) => !r.values.length)) setRules(filter.rules.filter((r) => r.values.length));
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
  const canSave = Boolean(filter.rules.some((r) => r.values.length) || filter.text.trim());
  async function saveView() {
    const name = viewName.trim();
    if (!name || !canSave) return;
    const view: SavedView = { id: crypto.randomUUID(), name, filter: compileRules(filter.rules, filter.text), sort: "title", hiddenTagIds: [] };
    await save({ type: "view.upsert", view }, `Save view: ${name}`);
    setViewName("");
    setOpen(undefined);
  }

  return (
    <span className="filter-chips" ref={root}>
      {filter.rules.map((rule, i) => {
        const options = ruleOptions(workspace, rule.kind);
        const q = query.trim().toLowerCase();
        const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q));
        return (
          <span key={i} className="chip-anchor">
            <span className={`filter-chip ${rule.not ? "not" : ""}`}>
              <button className="filter-chip-body" aria-expanded={editing === i} onClick={() => (editing === i ? close() : (setQuery(""), setOpen({ what: "edit", index: i })))}>
                {rule.not && "Not "}<b>{label(rule.kind)}:</b> {names(rule) || "pick…"}
              </button>
              <button className="filter-chip-x" aria-label={`Remove ${label(rule.kind)} filter`} onClick={() => { setOpen(undefined); setRules(filter.rules.filter((_, j) => j !== i)); }}>
                <Icon name="close" size={12} />
              </button>
            </span>
            {editing === i && (
              <div className="chip-popover" role="dialog" aria-label={`${label(rule.kind)} filter`}>
                <h4>{label(rule.kind)}</h4>
                {options.length > 8 && (
                  <input className="chip-search" autoFocus placeholder={`Find a ${label(rule.kind).toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
                )}
                <div className="chip-options">
                  {shown.map((o) => {
                    const n = counts?.get(o.value) ?? 0, on = rule.values.includes(o.value);
                    return (
                      <label key={o.value} className={`chip-option ${n || on ? "" : "zero"}`}>
                        <input type="checkbox" checked={on}
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
            )}
          </span>
        );
      })}
      <span className="chip-anchor">
        <button className="chip-add" aria-expanded={open?.what === "add"} onClick={() => (open?.what === "add" ? close() : setOpen({ what: "add" }))}>
          <Icon name="plus" size={13} /> Filter
        </button>
        {open?.what === "add" && (
          <div className="chip-popover" role="menu" aria-label="Add a filter">
            <h4>Add a filter</h4>
            {ruleKinds.map((k) => (
              <button key={k.kind} role="menuitem" className="chip-menu-item" onClick={() => {
                setRules([...filter.rules, { kind: k.kind, values: [], not: false }]);
                setQuery("");
                setOpen({ what: "edit", index: filter.rules.length });
              }}>
                {k.label}<small>{ruleOptions(workspace, k.kind).length}</small>
              </button>
            ))}
          </div>
        )}
      </span>
      <span className="chip-anchor end">
        <button className="chip-views" aria-expanded={open?.what === "views"} onClick={() => (open?.what === "views" ? close() : setOpen({ what: "views" }))}>
          Views <Icon name="chevron-down" size={13} />
        </button>
        {open?.what === "views" && (
          <div className="chip-popover" role="dialog" aria-label="Views">
            <h4>Views</h4>
            {workspace.views.map((v) => {
              const read = readRules(v.filter);
              return (
                <div key={v.id} className="view-row">
                  <button className="chip-menu-item" disabled={!read} title={read ? "Use this view" : "Made with the old filter screen; the chips cannot show it"}
                    onClick={() => { if (!read) return; onChange({ ...filter, rules: read.rules, text: read.text }); setOpen(undefined); }}>
                    {v.name}
                  </button>
                  <button className="view-delete" aria-label={`Delete view ${v.name}`} onClick={() => void save({ type: "view.remove", id: v.id }, `Delete view: ${v.name}`)}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
              );
            })}
            {!workspace.views.length && <p className="subtle chip-empty">No views yet.</p>}
            <form className="view-save" onSubmit={(e) => { e.preventDefault(); void saveView(); }}>
              <input aria-label="View name" placeholder={canSave ? "Name this view…" : "Add a filter first"} disabled={!canSave} value={viewName} onChange={(e) => setViewName(e.target.value)} />
              <button type="submit" disabled={!canSave || !viewName.trim()}>Save</button>
            </form>
          </div>
        )}
      </span>
    </span>
  );
}
