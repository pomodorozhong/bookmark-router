import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { Workspace } from "../domain/model";

/** The Bubble & Tag mark: one tag joined to three bubbles, like a cluster in the graph. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 12 5 6M12 12l7-5M12 12v8" fill="none" stroke="var(--logo-line)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="5" cy="6" r="2.6" fill="var(--logo-bubble)" stroke="var(--logo-line)" strokeWidth="1.6" />
      <circle cx="19" cy="7" r="2.6" fill="var(--logo-bubble)" stroke="var(--logo-line)" strokeWidth="1.6" />
      <circle cx="12" cy="20" r="2.6" fill="var(--logo-bubble)" stroke="var(--logo-line)" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.4" fill="var(--teal)" />
    </svg>
  );
}

// A button that opens a menu; closes on outside click, Escape, or choosing an item.
function MenuButton({ label, button, className = "", align = "start", children }: {
  label: string;
  button: ReactNode;
  className?: string;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    (root.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? items()[0])?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
        list[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keys, true); };
  }, [open]);
  return (
    <div className={`menu-root ${className}`} ref={root}>
      <button ref={trigger} type="button" className="menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open && <div className={`app-menu align-${align}`} role="menu" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function Item({ icon, children, onSelect, current, meta, className }: { icon?: IconName; children: ReactNode; onSelect: () => void; current?: boolean; meta?: ReactNode; className?: string }) {
  return (
    <button type="button" role="menuitem" className={className} aria-current={current || undefined} onClick={onSelect}>
      <span className="menu-icon">{current ? <Icon name="check" size={15} /> : icon ? <Icon name={icon} size={15} /> : null}</span>
      <span className="menu-label">{children}</span>
      {meta && <span className="menu-meta">{meta}</span>}
    </button>
  );
}

export function CollectionMenu({ workspace, collections, onOpen, onNew, onDelete }: {
  workspace: Workspace;
  collections: Workspace[];
  onOpen: (w: Workspace) => void;
  onNew: () => void;
  onDelete: (w: Workspace) => void;
}) {
  return (
    <MenuButton label="Collections" className="collection-menu-root" button={<><Logo /><span className="collection-name">{workspace.name}</span><Icon name="chevron-down" size={15} /></>}>
      {(close) => (
        <>
          <div className="menu-heading">Collections</div>
          {collections.map((w) => (
            <div key={w.id} className="menu-row">
              <Item current={w.id === workspace.id} onSelect={() => { close(); onOpen(w); }}
                meta={<span title="Bubbles · tags">{w.bubbles.length} · {w.tags.length}</span>}>{w.name}</Item>
              <button type="button" role="menuitem" className="menu-row-delete" aria-label={`Delete ${w.name}…`} title={`Delete ${w.name}…`}
                onClick={() => { close(); onDelete(w); }}><Icon name="trash" size={15} /></button>
            </div>
          ))}
          <hr />
          <Item icon="plus" onSelect={() => { close(); onNew(); }}>New collection…</Item>
        </>
      )}
    </MenuButton>
  );
}

export function MoreMenu({ onAddBubble, onAddTag, onTagTypes, onHistory, onDownload, onRestore, onDelete }: {
  onTagTypes: () => void;
  onDelete: () => void;
  onAddBubble: () => void;
  onAddTag: () => void;
  onHistory: () => void;
  onDownload: () => void;
  onRestore: () => void;
}) {
  return (
    <MenuButton label="More actions" align="end" className="more-menu-root" button={<Icon name="more" size={18} />}>
      {(close) => (
        <>
          <Item icon="plus" onSelect={() => { close(); onAddBubble(); }}>Add bubble…</Item>
          <Item icon="tag" onSelect={() => { close(); onAddTag(); }}>Add tag…</Item>
          <Item icon="layout" onSelect={() => { close(); onTagTypes(); }}>Tag types…</Item>
          <Item icon="history" onSelect={() => { close(); onHistory(); }}>Import history…</Item>
          <hr />
          <Item icon="download" onSelect={() => { close(); onDownload(); }}>Download backup</Item>
          <Item icon="upload" onSelect={() => { close(); onRestore(); }}>Restore backup…</Item>
          <hr />
          <Item icon="trash" className="danger-item" onSelect={() => { close(); onDelete(); }}>Delete this collection…</Item>
          <hr />
          <p className="menu-note">Changes are saved on this device.</p>
        </>
      )}
    </MenuButton>
  );
}
