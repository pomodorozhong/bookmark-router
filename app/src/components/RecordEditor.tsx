import { Dialog } from "./Dialog";
import { useState } from "react";
import { NodePreview } from "./NodePreview";
import { ColorPicker, PointsPicker, StylePicker } from "./AppearancePickers";
import {
  appearanceFor,
  defaultAppearance,
  type Appearance,
  type MediaKind,
  type Workspace,
} from "../domain/model";
import type { Command } from "../domain/commands";
import { Icon, IconButton } from "./Icon";
export function RecordEditor({
  workspace,
  id,
  onSave,
  onClose,
  inline = false,
  onNewType,
}: {
  /** Opens the tag type manager, from the type list's "New type…" option. */
  onNewType?: () => void;
  workspace: Workspace;
  id: string;
  onSave: (command: Command | Command[]) => Promise<void>;
  onClose: () => void;
  /** Render in the triage detail panel instead of a dialog. */
  inline?: boolean;
}) {
  const bookmark = workspace.bookmarks.find((b) => b.id === id),
    tag = workspace.tags.find((t) => t.id === id),
    record = (bookmark ?? tag)!;
  const [expectedRecordRevision] = useState(record.revision);
  const [title, setTitle] = useState(bookmark?.title ?? tag?.name ?? ""),
    [description, setDescription] = useState(record.description ?? ""),
    [url, setUrl] = useState(record.url ?? ""),
    [statusId, setStatus] = useState(record.statusId),
    [typeId, setType] = useState(tag?.typeId ?? ""),
    [mediaUrl, setMedia] = useState(
      bookmark?.asset?.source === "remote" ? (bookmark.asset.url ?? "") : "",
    ),
    [kind, setKind] = useState(bookmark?.asset?.kind ?? "image");
  const inherited = tag ? appearanceFor(tag, workspace) : undefined;
  const [appearance, setAppearance] = useState<Appearance>(
    inherited ?? { color: "#0f766e", size: 64, shape: "circle" },
  );
  const [appearanceOverrides, setAppearanceOverrides] = useState({
    color: tag?.appearance.color !== undefined,
    size: tag?.appearance.size !== undefined,
    shape: tag?.appearance.shape !== undefined,
    icon: tag?.appearance.icon !== undefined,
  });
  const [updateTypeDefaults, setUpdateTypeDefaults] = useState(false);
  // What the node shows: each overridden field, otherwise the selected type's value.
  const typeAppearance: Appearance = { ...defaultAppearance, ...workspace.tagTypes.find((t) => t.id === typeId)?.appearance };
  const effective: Appearance = {
    color: appearanceOverrides.color ? appearance.color : typeAppearance.color,
    size: appearanceOverrides.size ? appearance.size : typeAppearance.size,
    shape: appearanceOverrides.shape ? appearance.shape : typeAppearance.shape,
    // Direction belongs to the shape: overriding one overrides both.
    points: appearanceOverrides.shape ? appearance.points : typeAppearance.points,
    icon: appearanceOverrides.icon ? appearance.icon : typeAppearance.icon,
  };
  const overridden = Object.values(appearanceOverrides).some(Boolean);
  const typeLabel = workspace.tagTypes.find((t) => t.id === typeId)?.name ?? "the default";
  // Checking an override starts from the value it was inheriting.
  const override = (field: keyof typeof appearanceOverrides, on: boolean) => {
    if (on && !appearanceOverrides[field])
      setAppearance({ ...appearance, [field]: effective[field], ...(field === "shape" ? { points: effective.points } : {}) });
    setAppearanceOverrides({ ...appearanceOverrides, [field]: on });
  };
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const command: Command = bookmark
        ? {
            type: "bookmark.patch",
            id,
            expectedRecordRevision,
            patch: {
              title: title.trim(),
              description,
              url: url.trim() || undefined,
              statusId,
              asset: mediaUrl.trim()
                ? { source: "remote", kind, url: mediaUrl.trim() }
                : bookmark.asset?.source === "local"
                  ? bookmark.asset
                  : undefined,
            },
          }
        : {
            type: "tag.patch",
            id,
            expectedRecordRevision,
            patch: {
              name: title.trim(),
              description,
              url: url.trim() || undefined,
              statusId,
              typeId: typeId || undefined,
              appearance: {
                ...(appearanceOverrides.color ? { color: appearance.color } : {}),
                ...(appearanceOverrides.size ? { size: appearance.size } : {}),
                ...(appearanceOverrides.shape ? { shape: appearance.shape, points: appearance.points } : {}),
                ...(appearanceOverrides.icon && appearance.icon?.trim()
                  ? { icon: appearance.icon.trim() }
                  : {}),
              },
            },
          };
      const commands: Command[] = [command];
      if (tag && updateTypeDefaults && typeId) {
        commands.push({
          type: "tag-type.patch",
          id: typeId,
          patch: {
            appearance: {
              color: effective.color,
              size: effective.size,
              shape: effective.shape,
              points: effective.points,
              ...(effective.icon?.trim() ? { icon: effective.icon.trim() } : {}),
            },
          },
        });
      }
      await onSave(commands.length === 1 ? commands[0] : commands);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const content = (
      <>
        {inline && <button className="text-button editor-back" disabled={busy} onClick={onClose}><Icon name="arrow-left" size={14} /> Back</button>}
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{bookmark ? "BOOKMARK" : "TAG"} DETAILS</div>
            <h2 id="edit-title">Edit {bookmark ? "bookmark" : "tag"}</h2>
          </div>
          {!inline && <IconButton label="Close editor" icon="close" size={17} disabled={busy} onClick={onClose} />}
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
            <p>
              Your draft is kept. Close and reopen after refreshing to edit the
              latest record.
            </p>
          </div>
        )}
        <label>
          {bookmark ? "Title" : "Name"}
          <input
            autoFocus={!inline}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Action status
          <select value={statusId} onChange={(e) => setStatus(e.target.value)}>
            {workspace.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {tag && (
          <label>
            Tag type
            <select value={typeId} onChange={(e) => { if (e.target.value === "__new") onNewType?.(); else setType(e.target.value); }}>
              <option value="">Untyped</option>
              {workspace.tagTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {onNewType && <option value="__new">New type…</option>}
            </select>
          </label>
        )}
        {tag && (
          <details className="appearance-editor">
            <summary>
              <Icon name="chevron-right" size={14} />
              <h3>Appearance</h3>
              <span className="subtle">{overridden ? "Overridden" : `From ${typeLabel}`}</span>
            </summary>
            <div className="appearance-body">
            <div className="appearance-fields">
            <p className="subtle">Unchecked fields use {typeId ? `the ${typeLabel} type` : "the workspace default"}.</p>
            <div className="appearance-field wide">
              <label className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.color}
                  onChange={(event) => override("color", event.target.checked)}
                />
                Color override
              </label>
              <ColorPicker label="Tag color" value={effective.color} disabled={!appearanceOverrides.color}
                onChange={(color) => setAppearance({ ...appearance, color })} />
            </div>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.size}
                  onChange={(event) => override("size", event.target.checked)}
                />
                Size override
              </span>
              <input
                aria-label="Tag size"
                type="range"
                min="20"
                max="160"
                step="1"
                value={effective.size}
                disabled={!appearanceOverrides.size}
                onChange={(event) => setAppearance({ ...appearance, size: Number(event.target.value) })}
              />
              <output>{effective.size}px</output>
            </label>
            <div className="appearance-field wide">
              <label className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.shape}
                  onChange={(event) => override("shape", event.target.checked)}
                />
                Style and direction override
              </label>
              <StylePicker value={effective} disabled={!appearanceOverrides.shape} onChange={(patch) => setAppearance({ ...appearance, ...patch })} />
              <div className="points-field">
                <PointsPicker value={effective} disabled={!appearanceOverrides.shape} onChange={(points) => setAppearance({ ...appearance, points })} />
                <span className="subtle">Which way the end with the hole points. On a diagonal the icon tilts with the tag.</span>
              </div>
            </div>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.icon}
                  onChange={(event) => override("icon", event.target.checked)}
                />
                Icon override
              </span>
              <input
                aria-label="Tag icon"
                placeholder="Optional symbol or icon name"
                value={effective.icon ?? ""}
                disabled={!appearanceOverrides.icon}
                onChange={(event) => setAppearance({ ...appearance, icon: event.target.value })}
              />
            </label>
            {typeId && (
              <label className="appearance-type-default">
                <input
                  type="checkbox"
                  checked={updateTypeDefaults}
                  onChange={(event) => setUpdateTypeDefaults(event.target.checked)}
                />
                Also update the {workspace.tagTypes.find((type) => type.id === typeId)?.name ?? "tag"} type default
              </label>
            )}
            </div>
            <div className="appearance-preview"><NodePreview appearance={effective} box={96} /><span className="subtle">Preview</span></div>
            </div>
          </details>
        )}
        {bookmark && (
          <>
            <label>
              Primary media URL
              <input
                value={mediaUrl}
                onChange={(e) => setMedia(e.target.value)}
              />
            </label>
            <label>
              Media kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MediaKind)}
              >
                {["image", "video", "audio"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <footer>
          <button disabled={busy} onClick={onClose}>
            <Icon name="close" size={15} /> Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            <Icon name="check" size={15} /> {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </>
  );
  return inline
    ? <section className="triage-editor" aria-labelledby="edit-title">{content}</section>
    : <Dialog labelledBy="edit-title" onClose={() => { if (!busy) onClose(); }}>{content}</Dialog>;
}
