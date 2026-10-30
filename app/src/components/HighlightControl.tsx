import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { highlightedBookmarks, type Highlight } from "../domain/highlight";
import { appearanceFor, type Workspace } from "../domain/model";
import { Icon } from "./Icon";

const plural = (n: number) => `${n} ${n === 1 ? "bookmark" : "bookmarks"}`;

/** Picks tags to highlight in the graph. Changes apply on Highlight; Cancel keeps the current highlight. */
function HighlightPicker({ workspace, highlight, activeDetails, onApply, onBack, onClose }: {
  workspace: Workspace;
  highlight: Highlight;
  activeDetails?: ReactNode;
  onApply: (next: Highlight) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(highlight);
  // Active-tag removal/Clear in this menu also updates the staged selection.
  useEffect(() => setDraft(highlight), [highlight]);
  const [query, setQuery] = useState("");
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of workspace.memberships) n.set(m.tagId, (n.get(m.tagId) ?? 0) + 1);
    return n;
  }, [workspace.memberships]);
  const q = query.trim().toLowerCase();
  // Tags already highlighted come first, so they're easy to remove or keep.
  const tags = workspace.tags.filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => Number(highlight.tagIds.includes(b.id)) - Number(highlight.tagIds.includes(a.id)) || a.name.localeCompare(b.name));
  const typeName = (typeId?: string) => workspace.tagTypes.find((t) => t.id === typeId)?.name;
  const several = draft.tagIds.length > 1;
  const preview = highlightedBookmarks(workspace, draft).size;
  return (
    <div className="chip-popover highlight-picker" role="dialog" aria-label="Highlight bookmarks">
      <button className="chip-back" onClick={onBack}><Icon name="chevron-left" size={14} /> Highlight bookmarks</button>{activeDetails}
      <input className="chip-search" autoFocus placeholder="Find a tag…" aria-label="Find a tag" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chip-options">
        {tags.map((t) => (
          <label key={t.id} className="chip-option highlight-option">
            <input type="checkbox" checked={draft.tagIds.includes(t.id)}
              onChange={(e) => setDraft({ ...draft, tagIds: e.target.checked ? [...draft.tagIds, t.id] : draft.tagIds.filter((id) => id !== t.id) })} />
            <i className="swatch" style={{ background: appearanceFor(t, workspace).color }} />
            <span><b>{t.name}</b>{typeName(t.typeId) && <em>{typeName(t.typeId)}</em>}</span><small>{counts.get(t.id) ?? 0}</small>
          </label>
        ))}
        {!tags.length && <p className="subtle chip-empty">{workspace.tags.length ? "No tags match." : "No tags yet."}</p>}
      </div>
      {several && <div className="highlight-mode">
        <div className="highlight-mode-buttons" role="group" aria-label="How the tags combine">
          <button type="button" aria-pressed={draft.mode === "any"} onClick={() => setDraft({ ...draft, mode: "any" })}>Any of them</button>
          <button type="button" aria-pressed={draft.mode === "all"} onClick={() => setDraft({ ...draft, mode: "all" })}>All of them</button>
        </div>
      </div>}
      <div className="highlight-picker-foot">
        <span className="subtle">{draft.tagIds.length ? plural(preview) : ""}</span>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" onClick={() => { onApply({ tagIds: draft.tagIds, mode: several ? draft.mode : "any" }); onClose(); }}>Highlight</button>
      </div>
    </div>
  );
}

/** The highlight picker and its active-tag controls, opened from the Bookmarks menu, which holds its trigger. */
export function HighlightMenu({ workspace, highlight, open, activeDetails, onBack, onOpen, onChange }: {
  workspace: Workspace;
  highlight: Highlight;
  open: boolean;
  activeDetails?: ReactNode;
  /** Returns to the menu the picker was opened from. */
  onBack: () => void;
  onOpen: (open: boolean) => void;
  onChange: (next: Highlight) => void;
}) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onOpen(false); };
    // Esc closes the picker only, before the triage screen's own Esc handling sees it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onOpen(false); root.current?.parentElement?.querySelector<HTMLButtonElement>(":scope > button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); };
  }, [open, onOpen]);
  if (!open) return null;
  return (
    <span className="highlight-anchor" ref={root}>
      <HighlightPicker workspace={workspace} highlight={highlight} activeDetails={activeDetails} onApply={onChange} onBack={() => { onOpen(false); onBack(); }} onClose={() => onOpen(false)} />
    </span>
  );
}

/** Active highlight settings inside the picker: tags, counts, Fade the rest, and Clear. */
export function HighlightBar({ workspace, highlight, shown, hidden, fade, onChange, onFade }: {
  workspace: Workspace;
  highlight: Highlight;
  /** Matching bookmarks the current filters show, and those they hide. */
  shown: number;
  hidden: number;
  fade: boolean;
  onChange: (next: Highlight) => void;
  onFade: (fade: boolean) => void;
}) {
  if (!highlight.tagIds.length) return null;
  const tagName = (id: string) => workspace.tags.find((t) => t.id === id)?.name ?? id;
  return (
    <div className="highlight-bar" role="status" aria-label="Highlight">
      <span className="highlight-lead">Highlighting</span>
      {highlight.tagIds.map((id) => (
        <span key={id} className="highlight-chip">
          <span title={tagName(id)}>{tagName(id)}</span>
          <button aria-label={`Stop highlighting ${tagName(id)}`} onClick={() => onChange({ ...highlight, tagIds: highlight.tagIds.filter((t) => t !== id) })}><Icon name="close" size={12} /></button>
        </span>
      ))}
      {highlight.tagIds.length > 1 && <span className="subtle">{highlight.mode === "any" ? "any of these tags" : "all of these tags"} ·</span>}
      <span className="subtle">{plural(shown)}{hidden ? ` (${hidden} hidden by filters)` : ""}</span>
      <button className="highlight-fade" aria-pressed={fade} title="Remembered on this device" onClick={() => onFade(!fade)}>{fade && <Icon name="check" size={13} />}Fade the rest</button>
      <button className="highlight-clear" onClick={() => onChange({ ...highlight, tagIds: [] })}>Clear</button>
    </div>
  );
}
