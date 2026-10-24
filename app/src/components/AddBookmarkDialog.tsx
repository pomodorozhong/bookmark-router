import { useRef, useState } from "react";
import { Dialog, DialogHeader } from "./Dialog";
import { Icon } from "./Icon";
import { DuplicateBookmarkError } from "../domain/commands";
import { isWebUrl, type Workspace } from "../domain/model";
import { domainOf } from "../domain/triage";

/** Adds one bookmark from a link and an optional title; the import wizard stays one click away for anything more. */
export function AddBookmarkDialog({ workspace, onAdd, onImport, onClose }: {
  workspace: Workspace;
  /** Saves the bookmark; the title is already filled from the link when it was left empty. */
  onAdd: (url: string, title: string) => Promise<void>;
  onImport: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(""), [title, setTitle] = useState(""), [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  // Accept a bare domain such as example.com, as the import wizard does.
  const link = /^[a-z][a-z\d+.-]*:/i.test(url.trim()) ? url.trim() : url.trim() && `https://${url.trim()}`;
  const valid = Boolean(link) && isWebUrl(link);
  async function submit() {
    if (!valid || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setFailure("");
    try { await onAdd(link, title.trim() || domainOf(link)); }
    catch (error) {
      setFailure(error instanceof DuplicateBookmarkError
        ? `This link is already in the collection: “${workspace.bookmarks.find((b) => b.id === error.bookmarkId)?.title ?? "another bookmark"}”.`
        : String(error instanceof Error ? error.message : error));
    } finally { pending.current = false; setSubmitting(false); }
  }
  return (
    <Dialog className="prompt-modal add-bookmark-modal" labelledBy="add-bookmark-title" onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader id="add-bookmark-title" label="Bookmark" title="Add bookmark" closeLabel="Close" disabled={submitting} onClose={onClose} />
        {failure && <div className="alert" role="alert">{failure}</div>}
        <label>
          URL
          <input autoFocus inputMode="url" autoComplete="off" placeholder="https://" value={url} onChange={(event) => { setUrl(event.target.value); setFailure(""); }} />
        </label>
        <label>
          <span>Title <span className="subtle">(optional)</span></span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={valid ? domainOf(link) : "Filled from the link when left empty"} />
        </label>
        <p className="subtle">Added to <span className="status-name">To triage</span>. Add a description and tags afterwards in the panel.</p>
        <footer>
          <button type="button" className="text-button modal-footer-note" disabled={submitting} onClick={onImport}>Import many or from a file <Icon name="arrow-right" size={14} /></button>
          <button type="button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting || !valid}><Icon name="check" size={15} /> Add bookmark</button>
        </footer>
      </form>
    </Dialog>
  );
}
