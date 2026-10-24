import type { ReactNode } from "react";
import { Cover, type LoadMedia } from "./Cover";
import { DetailBar } from "./DetailBar";
import { Icon, IconButton } from "./Icon";
import { Markdown } from "./Markdown";
import { appearanceFor, isWebUrl, statusLabel, type Tag, type Workspace } from "../domain/model";
import { domainOf, reasonFor } from "../domain/triage";

/** A tag (an issue, proposal, or topic) to read on its own: what it is and which bookmarks belong to it. */
export function TagView({ tag, workspace, order, loadMedia, onOpen, onCopy, onEdit, start, pin, onClose }: {
  tag: Tag;
  /** Bookmark IDs in display order, such as the clockwise selection; others follow. */
  order?: string[];
  workspace: Workspace;
  loadMedia: LoadMedia;
  onOpen: (bookmarkId: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  /** The start of the panel's bar, such as the phone layout's Queue button. */
  start?: ReactNode;
  /** The Pin button, which the graph owns. */
  pin?: ReactNode;
  onClose: () => void;
}) {
  const type = workspace.tagTypes.find((t) => t.id === tag.typeId);
  const status = (id: string) => statusLabel(workspace, id);
  const ids = new Set(workspace.memberships.filter((m) => m.tagId === tag.id).map((m) => m.bookmarkId));
  const rank = new Map(order?.map((id, i) => [id, i]));
  const bookmarks = workspace.bookmarks.filter((b) => ids.has(b.id))
    .sort((a, b) => (rank.get(a.id) ?? rank.size) - (rank.get(b.id) ?? rank.size));
  const statuses = [...new Set(bookmarks.map((b) => status(b.statusId)))];
  return (
    <>
      <DetailBar start={start} closeLabel="Close (Esc)" closeShortcut="Esc" onClose={onClose}>
        <IconButton label="Copy…" icon="copy" size={16} disabled={!bookmarks.length} onClick={onCopy} />
        <IconButton label="Edit" icon="edit" size={16} onClick={onEdit} />
        {pin}
      </DetailBar>
      <div className="triage-detail tag-view">
        <div className="tag-view-meta">
          <span className="tag-type-chip"><i className="swatch" style={{ background: appearanceFor(tag, workspace).color }} />{type?.name ?? "Untyped"}</span>
          <span className="queue-status">{status(tag.statusId)}</span>
          <span className="tag-view-count">{bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"}</span>
        </div>
        {tag.url && <div className="detail-link">{isWebUrl(tag.url)
          ? <a href={tag.url} target="_blank" rel="noreferrer" title={tag.url}><span>{shortUrl(tag.url)}</span> <Icon name="external" size={13} /></a>
          : <span className="subtle" title={tag.url}>{tag.url}</span>}</div>}
        <h2>{tag.name}</h2>
        {tag.description?.trim() ? <Markdown text={tag.description} /> : <p className="subtle">No description.</p>}
        <section className="triage-section">
          <h3>Bookmarks ({bookmarks.length}){statuses.length === 1 && bookmarks.length > 1 && <span className="tag-view-all">all {statuses[0].toLowerCase()}</span>}</h3>
          <div className="tag-view-list">
            {bookmarks.map((b) => {
              // Converted reasons start with the bookmark's own title; the list already shows it.
              const reason = reasonFor(b, tag, workspace);
              const why = reason?.startsWith(`${b.title}: `) ? reason.slice(b.title.length + 2) : reason;
              return (
                <button key={b.id} className="tag-view-item" onClick={() => onOpen(b.id)}>
                  <span className="queue-thumb"><Cover bookmark={b} load={loadMedia} className="" letterTile /></span>
                  <span className="queue-text">
                    <span className="queue-title">{b.title}</span>
                    <span className="queue-meta"><span className="queue-domain">{domainOf(b.url) || "No URL"}</span><span className="queue-status">{status(b.statusId)}</span></span>
                    {why && <span className="tag-view-why">{why}</span>}
                  </span>
                </button>
              );
            })}
            {!bookmarks.length && <p className="subtle">No bookmarks have this tag yet.</p>}
          </div>
        </section>
      </div>
    </>
  );
}

// github.com/owner/repo/issues/141 reads better as "github.com/…/issues/141".
function shortUrl(url: string) {
  const domain = domainOf(url), path = new URL(url).pathname.split("/").filter(Boolean);
  return path.length > 2 ? `${domain}/…/${path.slice(-2).join("/")}` : `${domain}${path.length ? "/" + path.join("/") : ""}`;
}
