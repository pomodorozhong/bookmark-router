import { Dialog } from "./Dialog";
import { useState } from "react";
import {
  appearanceFor,
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
}: {
  workspace: Workspace;
  id: string;
  onSave: (command: Command | Command[]) => Promise<void>;
  onClose: () => void;
}) {
  const bubble = workspace.bubbles.find((b) => b.id === id),
    tag = workspace.tags.find((t) => t.id === id),
    record = (bubble ?? tag)!;
  const [expectedRecordRevision] = useState(record.revision);
  const [title, setTitle] = useState(bubble?.title ?? tag?.name ?? ""),
    [description, setDescription] = useState(record.description ?? ""),
    [url, setUrl] = useState(record.url ?? ""),
    [statusId, setStatus] = useState(record.statusId),
    [typeId, setType] = useState(tag?.typeId ?? ""),
    [mediaUrl, setMedia] = useState(
      bubble?.asset?.source === "remote" ? (bubble.asset.url ?? "") : "",
    ),
    [kind, setKind] = useState(bubble?.asset?.kind ?? "image");
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
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const command: Command = bubble
        ? {
            type: "bubble.patch",
            id,
            expectedRecordRevision,
            patch: {
              title: title.trim(),
              description,
              url: url.trim() || undefined,
              statusId,
              asset: mediaUrl.trim()
                ? { source: "remote", kind, url: mediaUrl.trim() }
                : bubble.asset?.source === "local"
                  ? bubble.asset
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
                ...(appearanceOverrides.shape ? { shape: appearance.shape } : {}),
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
              color: appearance.color,
              size: appearance.size,
              shape: appearance.shape,
              ...(appearance.icon?.trim() ? { icon: appearance.icon.trim() } : {}),
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
  return (
    <Dialog labelledBy="edit-title" onClose={() => { if (!busy) onClose(); }}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{bubble ? "BUBBLE" : "TAG"} DETAILS</div>
            <h2 id="edit-title">Edit {bubble ? "bubble" : "tag"}</h2>
          </div>
          <IconButton label="Close editor" icon="close" size={17} disabled={busy} onClick={onClose} />
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
          {bubble ? "Title" : "Name"}
          <input
            autoFocus
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
            <select value={typeId} onChange={(e) => setType(e.target.value)}>
              <option value="">Untyped</option>
              {workspace.tagTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {tag && (
          <section className="appearance-editor">
            <div className="section-heading">
              <div>
                <h3>Appearance</h3>
                <p className="subtle">
                  Unchecked fields inherit from {typeId ? "the tag type" : "the workspace default"}.
                </p>
              </div>
            </div>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.color}
                  onChange={(event) =>
                    setAppearanceOverrides({
                      ...appearanceOverrides,
                      color: event.target.checked,
                    })
                  }
                />
                Color override
              </span>
              <input
                aria-label="Tag color"
                type="color"
                value={appearance.color}
                disabled={!appearanceOverrides.color}
                onChange={(event) => setAppearance({ ...appearance, color: event.target.value })}
              />
            </label>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.size}
                  onChange={(event) =>
                    setAppearanceOverrides({
                      ...appearanceOverrides,
                      size: event.target.checked,
                    })
                  }
                />
                Size override
              </span>
              <input
                aria-label="Tag size"
                type="range"
                min="20"
                max="160"
                step="1"
                value={appearance.size}
                disabled={!appearanceOverrides.size}
                onChange={(event) => setAppearance({ ...appearance, size: Number(event.target.value) })}
              />
              <output>{appearance.size}px</output>
            </label>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.shape}
                  onChange={(event) =>
                    setAppearanceOverrides({
                      ...appearanceOverrides,
                      shape: event.target.checked,
                    })
                  }
                />
                Shape override
              </span>
              <select
                aria-label="Tag shape"
                value={appearance.shape}
                disabled={!appearanceOverrides.shape}
                onChange={(event) =>
                  setAppearance({
                    ...appearance,
                    shape: event.target.value as Appearance["shape"],
                  })
                }
              >
                <option value="circle">Circle</option>
                <option value="rounded-square">Rounded square</option>
                <option value="diamond">Diamond</option>
              </select>
            </label>
            <label className="appearance-field">
              <span className="appearance-field-label">
                <input
                  type="checkbox"
                  checked={appearanceOverrides.icon}
                  onChange={(event) =>
                    setAppearanceOverrides({
                      ...appearanceOverrides,
                      icon: event.target.checked,
                    })
                  }
                />
                Icon override
              </span>
              <input
                aria-label="Tag icon"
                placeholder="Optional symbol or icon name"
                value={appearance.icon ?? ""}
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
          </section>
        )}
        {bubble && (
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
    </Dialog>
  );
}
