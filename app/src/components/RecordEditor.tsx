import { useState } from "react";
import type { MediaKind, Workspace } from "../domain/model";
import type { Command } from "../domain/commands";
export function RecordEditor({
  workspace,
  id,
  onSave,
  onClose,
}: {
  workspace: Workspace;
  id: string;
  onSave: (command: Command) => Promise<void>;
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
            },
          };
      await onSave(command);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
      >
        <h2 id="edit-title">Edit {bubble ? "bubble" : "tag"}</h2>
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
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </section>
    </div>
  );
}
