import { useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { NodePreview } from "./NodePreview";
import { ColorPicker, PointsPicker, StylePicker } from "./AppearancePickers";
import type { Command } from "../domain/commands";
import type { Appearance, TagType, Workspace } from "../domain/model";

const blank = { name: "", appearance: { color: "#1d4ed8", size: 56, shape: "price-tag", icon: "" } as Appearance };

/** Lists tag types with their node, and creates or edits them. Types are never deleted. */
export function TagTypesDialog({ workspace, save, onClose }: {
  workspace: Workspace;
  save: (command: Command, label?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<TagType>();
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const count = (id: string) => workspace.tags.filter((t) => t.typeId === id).length;
  const set = (patch: Partial<Appearance>) => setDraft({ ...draft, appearance: { ...draft.appearance, ...patch } });
  function edit(type?: TagType) {
    setEditing(type);
    setDraft(type ? { name: type.name, appearance: { ...type.appearance, icon: type.appearance.icon ?? "" } } : blank);
    setError("");
  }
  async function submit() {
    const name = draft.name.trim();
    if (!name || busy) return;
    const { icon, ...rest } = draft.appearance;
    const appearance: Appearance = { ...rest, ...(icon?.trim() ? { icon: icon.trim() } : {}) };
    setBusy(true);
    setError("");
    try {
      if (editing) await save({ type: "tag-type.patch", id: editing.id, patch: { name, appearance: { ...appearance, icon: appearance.icon } } }, `Edit type: ${name}`);
      else await save({ type: "tag-type.create", name, appearance }, `New type: ${name}`);
      edit(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog labelledBy="types-title" className="types-modal" onClose={() => { if (!busy) onClose(); }}>
      <div className="modal-heading">
        <h2 id="types-title">Tag types</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" size={17} /></button>
      </div>
      <div className="type-list">
        {workspace.tagTypes.map((t) => (
          <div key={t.id} className={`type-row ${editing?.id === t.id ? "editing" : ""}`}>
            <NodePreview appearance={t.appearance} />
            <div className="type-row-text">
              <strong>{t.name}</strong>
              <span className="subtle">{count(t.id)} tag{count(t.id) === 1 ? "" : "s"} · {t.appearance.shape.replace("-", " ")}{t.appearance.points ? ` (${t.appearance.points.replace("-", " ")})` : ""} · {t.appearance.size} px{t.appearance.icon ? ` · ${t.appearance.icon}` : ""}</span>
            </div>
            <button onClick={() => edit(t)}>Edit</button>
          </div>
        ))}
      </div>
      <form className="type-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="type-form-head">
          <strong>{editing ? `Edit ${editing.name}` : "New type"}</strong>
          <NodePreview appearance={draft.appearance} />
        </div>
        <label>Name<input value={draft.name} placeholder="e.g. Reading list" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="type-form-grid">
          <div className="type-form-wide"><span className="field-label">Color</span>
            <ColorPicker value={draft.appearance.color} onChange={(color) => set({ color })}
              used={workspace.tagTypes.filter((t) => t.id !== editing?.id).map((t) => t.appearance.color)} /></div>
          <div className="type-form-wide"><span className="field-label">Style</span><StylePicker value={draft.appearance} onChange={set} /></div>
          <div className="type-form-wide"><span className="field-label">Points</span>
            <div className="points-field"><PointsPicker value={draft.appearance} onChange={(points) => set({ points })} />
              <span className="subtle">Which way the end with the hole points. Tags of this type follow unless they set their own.</span></div></div>
          <label>Size<input type="number" min={20} max={160} value={draft.appearance.size} onChange={(e) => set({ size: Math.max(20, Math.min(160, Number(e.target.value) || 56)) })} /></label>
          <label>Icon<input maxLength={4} placeholder="Optional" value={draft.appearance.icon ?? ""} onChange={(e) => set({ icon: e.target.value })} /></label>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <footer>
          {editing && <button type="button" disabled={busy} onClick={() => edit(undefined)}>Cancel</button>}
          <button className="primary" type="submit" disabled={busy || !draft.name.trim()}>
            <Icon name={editing ? "check" : "plus"} size={15} /> {editing ? "Save type" : "Add type"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
