import { useMemo, useState } from "react";
import type { Asset, MediaKind, Workspace } from "../domain/model";
import { Dialog } from "./Dialog";
import { Icon, IconButton } from "./Icon";

function mediaKind(file: File): MediaKind | undefined {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(file.name)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/i.test(file.name)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) return "audio";
  return undefined;
}

export function MediaUploadDialog({
  workspace,
  bubbleIds,
  onAttach,
  onClose,
}: {
  workspace: Workspace;
  bubbleIds: string[];
  onAttach: (
    assignments: Array<{ bubbleId: string; expectedRecordRevision: number; asset: Asset }>,
    files: Array<{ id: string; filename: string; mime: string; blob: Blob }>,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const bubbles = useMemo(
    () => bubbleIds.map((id) => workspace.bubbles.find((bubble) => bubble.id === id)).filter(Boolean),
    [bubbleIds, workspace.bubbles],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function chooseFiles(next: File[]) {
    setError("");
    const usable = next.filter((file) => mediaKind(file));
    if (usable.length !== next.length) setError("Only image, video, and audio files can be attached.");
    if (usable.length > bubbles.length) setError("Select no more files than the selected bubbles.");
    const limited = usable.slice(0, bubbles.length);
    const nextAssignments: Record<number, string> = {};
    limited.forEach((file, index) => {
      const normalized = file.name.replace(/\.[^.]+$/, "").toLowerCase();
      const matching = bubbles.find((bubble) => bubble && bubble.title.toLowerCase().includes(normalized));
      nextAssignments[index] = matching?.id ?? bubbles[index]?.id ?? "";
    });
    setFiles(limited);
    setAssignments(nextAssignments);
  }

  const usedBubbleIds = Object.values(assignments);
  const ready = files.length > 0 && files.every((file, index) => mediaKind(file) && assignments[index]) && new Set(usedBubbleIds).size === files.length;

  async function attach() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const records = files.map((file, index) => {
        const id = crypto.randomUUID();
        return {
          id,
          file,
          assignment: {
            bubbleId: assignments[index],
            expectedRecordRevision: bubbles.find((bubble) => bubble?.id === assignments[index])!.revision,
            asset: {
              source: "local" as const,
              kind: mediaKind(file)!,
              blobId: id,
              filename: file.name,
            },
          },
        };
      });
      await onAttach(
        records.map((record) => record.assignment),
        records.map((record) => ({ id: record.id, filename: record.file.name, mime: record.file.type || "application/octet-stream", blob: record.file })),
      );
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy="media-upload-title" onClose={() => { if (!busy) onClose(); }} className="media-dialog">
      <div className="modal-heading">
        <div><div className="eyebrow">LOCAL MEDIA</div><h2 id="media-upload-title">Attach media to selected bubbles</h2></div>
        <IconButton label="Close media upload" icon="close" size={17} disabled={busy} onClick={onClose} />
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <p className="subtle">Choose up to {bubbles.length} files. Each reviewed file is assigned to one selected bubble; an existing asset will be replaced atomically.</p>
      <label className="file-picker media-file-picker"><Icon name="upload" size={16} /><span>Choose image, video, or audio files</span><input aria-label="Choose media files" type="file" accept="image/*,video/*,audio/*" multiple onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))} /></label>
      {files.length > 0 && <div className="media-upload-list">{files.map((file, index) => <div className="media-upload-row" key={`${file.name}-${index}`}><span><strong>{file.name}</strong><small>{mediaKind(file)} · {(file.size / 1024).toFixed(1)} KB</small></span><select aria-label={`Assign ${file.name}`} value={assignments[index] ?? ""} onChange={(event) => setAssignments({ ...assignments, [index]: event.target.value })}><option value="">Choose bubble</option>{bubbles.map((bubble) => <option key={bubble!.id} value={bubble!.id} disabled={usedBubbleIds.includes(bubble!.id) && assignments[index] !== bubble!.id}>{bubble!.title}</option>)}</select></div>)}</div>}
      <div className="notice">Local files stay in this browser and are included in backups. Copy output uses the filename instead of a temporary blob URL.</div>
      <footer><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={!ready || busy} onClick={() => void attach()}><Icon name="upload" size={15} />{busy ? "Attaching…" : `Attach ${files.length || ""} file${files.length === 1 ? "" : "s"}`}</button></footer>
    </Dialog>
  );
}
