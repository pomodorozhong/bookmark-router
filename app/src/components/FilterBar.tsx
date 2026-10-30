import { useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { Icon } from "./Icon";
import type { Command } from "../domain/commands";
import type { Workspace } from "../domain/model";
import { loadView, saveView, type ViewSettings } from "../domain/saved-views";
import { readRules, ruleKinds, ruleOptions, ruleValueCounts, type Rule, type TriageFilter, type TriageTab } from "../domain/triage";

type Menu = "bookmarks" | "tags" | "views" | "all";
type Panel = "types" | "tags" | "filters" | "saved";
/** An open menu, the panel picked from it, and the filter rule being edited in that panel. */
type Open = { menu: Menu; panel?: Panel; edit?: number } | undefined;

/** Labeled Bookmarks, Tags and Views menus; on phones one Filters menu holds all three. */
export function FilterBar({ workspace, filter, tab, highlight, highlightCount, phone, settings, onHighlight, onLoad, onReset, onTagTypes, onChange, save }: {
  workspace: Workspace;
  filter: TriageFilter;
  tab: TriageTab;
  /** The highlight picker, opened from the Bookmarks menu and placed under it; `back` reopens that menu. */
  highlight: (back: () => void) => ReactNode;
  highlightCount: number;
  phone: boolean;
  settings: ViewSettings;
  onHighlight: () => void;
  onLoad: (next: ViewSettings) => void;
  onReset: () => void;
  onTagTypes: () => void;
  onChange: (next: TriageFilter) => void;
  save: (command: Command, label?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<Open>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const highlightFrom = useRef<Menu>("bookmarks");
  const setRules = (rules: Rule[]) => onChange({ ...filter, rules });
  const dropEmpty = () => { if (filter.rules.some((r) => !r.values.length)) setRules(filter.rules.filter((r) => r.values.length)); };
  function close(focus = false) {
    setOpen(undefined); setQuery(""); dropEmpty();
    if (focus) trigger.current?.focus();
  }
  function toggle(menu: Menu, event: MouseEvent<HTMLButtonElement>) {
    trigger.current = event.currentTarget;
    if (open?.menu === menu) close();
    else { dropEmpty(); setQuery(""); setPage(0); setError(""); setOpen({ menu }); }
  }
  const pick = (panel: Panel) => { setQuery(""); setPage(0); setError(""); setOpen(open && { menu: open.menu, panel }); };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) || (e.target as Element).closest?.(".highlight-anchor")) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(true); } };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", key, true); };
  });
  const label = (kind: Rule["kind"]) => ruleKinds.find((k) => k.kind === kind)!.label;
  const names = (rule: Rule) => {
    const options = ruleOptions(workspace, rule.kind);
    return rule.values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(" or ");
  };
  const editing = open?.edit;
  const counts = useMemo(() => editing !== undefined && filter.rules[editing] ? ruleValueCounts(workspace, filter, tab, editing) : undefined, [editing, workspace, filter, tab]);
  const on = filter.rules.filter((r) => r.values.length).length;
  async function saveFilter() {
    if (!name.trim() || saving) return;
    setSaving(true); setError("");
    try { await save({ type: "view.upsert", view: saveView(name.trim(), settings) }, `Save view: ${name.trim()}`); setName(""); close(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  const chip = (rule: Rule, i: number) => (
    <span key={i} className={`filter-chip ${rule.not ? "not" : ""}`}>
      <button className="filter-chip-body" title={`${rule.not ? "Not " : ""}${label(rule.kind)}: ${names(rule)}`} onClick={() => { setQuery(""); setOpen(open && { ...open, edit: i }); }}>
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
      <div className="chip-popover" role="dialog" aria-label={`${label(rule.kind)} filter`}>
        <button className="chip-back" onClick={() => { dropEmpty(); setQuery(""); setOpen(open && { menu: open.menu, panel: "filters" }); }}>
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


  const typesPanel = <>
    {workspace.tagTypes.map((type) => <label key={type.id} className="chip-option">
      <input type="checkbox" checked={!filter.hiddenTypeIds.includes(type.id)} onChange={(e) => onChange({ ...filter, hiddenTypeIds: e.target.checked ? filter.hiddenTypeIds.filter((id) => id !== type.id) : [...filter.hiddenTypeIds, type.id] })} />
      <i className="swatch" style={{ background: type.appearance.color }} /><span>{type.name}</span>
    </label>)}
    {!workspace.tagTypes.length && <p className="subtle chip-empty">None yet</p>}
  </>;
  const q = query.trim().toLowerCase();
  const tags = workspace.tags.filter((t) => `${t.name} ${workspace.tagTypes.find((type) => type.id === t.typeId)?.name ?? ""}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(tags.length / 6)), tagPage = Math.min(page, pages - 1);
  const tagsPanel = <>
    <input className="chip-search" autoFocus aria-label="Find visibility tag" placeholder="Find a tag or type…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
    <div className="tag-visibility-options">
      {tags.slice(tagPage * 6, tagPage * 6 + 6).map((tag) => <label key={tag.id} className="tag-visibility-option">
        <span title={tag.name}>{tag.name}{(tag.typeId && workspace.tagTypes.some((t) => t.id === tag.typeId)) && <small>{workspace.tagTypes.find((t) => t.id === tag.typeId)!.name}{filter.hiddenTypeIds.includes(tag.typeId) ? " · hidden" : ""}</small>}</span>
        <select aria-label={`Visibility for ${tag.name} (${workspace.tagTypes.find((t) => t.id === tag.typeId)?.name ?? "No type"})`} value={filter.hiddenBookmarkTagIds.includes(tag.id) ? "bookmarks" : filter.hiddenTagIds.includes(tag.id) ? "hide" : "show"}
          onChange={(e) => onChange({ ...filter, hiddenTagIds: [...filter.hiddenTagIds.filter((id) => id !== tag.id), ...(e.target.value === "show" ? [] : [tag.id])],
            hiddenBookmarkTagIds: [...filter.hiddenBookmarkTagIds.filter((id) => id !== tag.id), ...(e.target.value === "bookmarks" ? [tag.id] : [])] })}>
          <option value="show">Show</option><option value="hide">Hide tag</option><option value="bookmarks">Hide tag + bookmarks</option>
        </select>
      </label>)}
      {!tags.length && <p className="subtle chip-empty">{workspace.tags.length ? "No matching tags." : "No tags yet."}</p>}
    </div>
    {pages > 1 && <div className="tag-pages"><button disabled={!tagPage} onClick={() => setPage(tagPage - 1)}>Previous</button><span>{tagPage + 1} / {pages}</span><button disabled={tagPage === pages - 1} onClick={() => setPage(tagPage + 1)}>Next</button></div>}
  </>;
  const filtersPanel = <>
    <label className="chip-option" title="Include bookmarks with no visible tag"><input type="checkbox" checked={filter.showUngrouped} onChange={(e) => onChange({ ...filter, showUngrouped: e.target.checked })} /><span>Untagged bookmarks</span></label>
    {filter.rules.length > 0 && <><h4 className="chip-divided">On now</h4><div className="chip-list">{filter.rules.map(chip)}</div><button className="chip-menu-item chip-clear" onClick={() => setRules([])}>Clear all</button></>}
    <h4 className="chip-divided">Add a filter</h4>
    {ruleKinds.map((k) => <button key={k.kind} className="chip-menu-item" onClick={() => { setRules([...filter.rules, { kind: k.kind, values: [], not: false }]); setQuery(""); setOpen(open && { ...open, edit: filter.rules.length }); }}>{k.label}<small>{ruleOptions(workspace, k.kind).length}</small></button>)}
  </>;
  const savedPanel = <>
    {workspace.views.map((v) => <div key={v.id} className="view-row">
      <button className="chip-menu-item" disabled={!readRules(v.filter)} title={v.graph ? "Apply bookmark and tag settings together" : "Legacy view: applies its filter and hidden tags; preserves other settings"}
        onClick={() => { const next = loadView(v, settings); if (next) { onLoad(next); close(true); } }}>{v.name}{!v.graph && <small>Legacy</small>}</button>
      <button className="view-delete" aria-label={`Delete saved view ${v.name}`} onClick={() => { void save({ type: "view.remove", id: v.id }, `Delete saved view: ${v.name}`).catch((e) => setError(String(e))); }}><Icon name="close" size={12} /></button>
    </div>)}
    {!workspace.views.length && <p className="subtle chip-empty">No saved views yet</p>}
    <form className="view-save" title="Saves search, state, filters, tag visibility and highlights" onSubmit={(e) => { e.preventDefault(); void saveFilter(); }}><input aria-label="Saved view name" placeholder="Save current view as…" value={name} onChange={(e) => setName(e.target.value)} /><button type="submit" disabled={saving || !name.trim()}>Save</button></form>
    {error && <p className="chip-empty" role="alert">{error}</p>}
  </>;
  const hiddenTags = new Set([...filter.hiddenTagIds, ...filter.hiddenBookmarkTagIds]).size;
  const shownTypes = workspace.tagTypes.filter((t) => !filter.hiddenTypeIds.includes(t.id)).length;
  const menuCounts = { bookmarks: on + highlightCount, tags: filter.hiddenTypeIds.length + hiddenTags, views: 0 };
  const item = (icon: "filter" | "scope" | "tag" | "edit" | "download" | "refresh", text: string, note: string, onClick: () => void) =>
    <button className="chip-menu-item rule-item" onClick={onClick}><Icon name={icon} size={15} /><span>{text}</span>{note && <small>{note}</small>}</button>;
  const lists: Record<Exclude<Menu, "all">, ReactNode> = {
    bookmarks: <>
      {item("filter", "Filter bookmarks", on ? `${on} on` : "", () => pick("filters"))}
      {item("scope", "Highlight bookmarks", highlightCount ? `${highlightCount} ${highlightCount === 1 ? "tag" : "tags"}` : "", () => { highlightFrom.current = open?.menu ?? "bookmarks"; close(); onHighlight(); })}
    </>,
    tags: <>
      {item("filter", "Show tag types", workspace.tagTypes.length ? `${shownTypes} of ${workspace.tagTypes.length}` : "", () => pick("types"))}
      {item("tag", "Hide single tags", hiddenTags ? `${hiddenTags} hidden` : "", () => pick("tags"))}
      {item("edit", "Edit tag types", "", () => { close(); onTagTypes(); })}
    </>,
    views: <>
      {item("download", "Saved views", workspace.views.length ? String(workspace.views.length) : "", () => pick("saved"))}
      {item("refresh", "Reset search and state", "", () => { close(true); onReset(); })}
    </>,
  };
  const titles = { bookmarks: "Bookmarks", tags: "Tags", views: "Views", all: "Filters" };
  const panels = { types: typesPanel, tags: tagsPanel, filters: filtersPanel, saved: savedPanel };
  const panelTitles = { types: "Show tag types", tags: "Hide single tags", filters: "Filter bookmarks", saved: "Saved views" };
  const content = (menu: Menu) => {
    if (editing !== undefined && filter.rules[editing]) return editor(editing);
    if (open?.panel) return <div className={`chip-popover ${open.panel === "tags" ? "tag-visibility-menu" : ""}`} role="dialog" aria-label={titles[menu]}>
      <button className="chip-back" onClick={() => { dropEmpty(); setQuery(""); setOpen({ menu }); }}><Icon name="chevron-left" size={14} /> {panelTitles[open.panel]}</button>
      {panels[open.panel]}
    </div>;
    return <div className="chip-popover rule-menu" role="dialog" aria-label={titles[menu]}>
      {menu === "all"
        ? (["bookmarks", "tags", "views"] as const).map((m, i) => <div key={m} className="rule-section"><h4 className={i ? "chip-divided" : ""}>{titles[m]}</h4>{lists[m]}</div>)
        : lists[menu]}
    </div>;
  };
  const menuButton = (menu: Menu, icon: "bookmark" | "tag" | "filter" | undefined, count: number) => <span className="filter-anchor">
    <button className={`filter-button rule-menu-button ${count ? "on" : ""}`} aria-expanded={open?.menu === menu} aria-haspopup="dialog" title={titles[menu]} onClick={(e) => toggle(menu, e)}>
      {icon && <Icon name={icon} size={15} />}<span className="rule-menu-label">{titles[menu]}</span>{count > 0 && <span className="filter-count">{count}</span>}<Icon name="chevron-down" size={13} />
    </button>
    {open?.menu === menu && content(menu)}
    {(menu === "bookmarks" || menu === "all") && highlight(() => setOpen({ menu: highlightFrom.current }))}
  </span>;
  return <div className={`filter-bar joined-rules ${phone ? "phone-rules" : ""}`} ref={root}>
    {phone
      ? menuButton("all", "filter", menuCounts.bookmarks + menuCounts.tags)
      : <>{menuButton("bookmarks", "bookmark", menuCounts.bookmarks)}{menuButton("tags", "tag", menuCounts.tags)}{menuButton("views", undefined, 0)}</>}
  </div>;
}
