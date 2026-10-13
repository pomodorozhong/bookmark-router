import { Cover, type LoadMedia } from "./Cover";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { appearanceFor, isWebUrl, type Tag, type Workspace } from "../domain/model";
import { domainOf, reasonFor } from "../domain/triage";

/** A tag (an issue, proposal, or topic) to read on its own: what it is and which bookmarks belong to it. */
export function TagView({ tag, workspace, order, loadMedia, onOpen, onCopy, onEdit, onClose }: {
  tag: Tag;
  /** Bookmark IDs in display order, such as the clockwise selection; others follow. */
  order?: string[];
  workspace: Workspace;
  loadMedia: LoadMedia;
  onOpen: (bookmarkId: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const type = workspace.tagTypes.find((t) => t.id === tag.typeId);
  const status = (id: string) => workspace.statuses.find((s) => s.id === id)?.label ?? "";
  const ids = new Set(workspace.memberships.filter((m) => m.tagId === tag.id).map((m) => m.bookmarkId));
  const rank = new Map(order?.map((id, i) => [id, i]));
  const bookmarks = workspace.bookmarks.filter((b) => ids.has(b.id))
    .sort((a, b) => (rank.get(a.id) ?? rank.size) - (rank.get(b.id) ?? rank.size));
  const statuses = [...new Set(bookmarks.map((b) => status(b.statusId)))];
  return (
    <div className="tag-view">
      <div className="tag-view-meta">
        <span className="tag-type-chip"><i className="swatch" style={{ background: appearanceFor(tag, workspace).color }} />{type?.name ?? "Untyped"}</span>
        <span className="queue-status">{status(tag.statusId)}</span>
        <span className="tag-view-count">{bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"}</span>
        <button className="icon-button tag-view-close" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}><Icon name="close" size={15} /></button>
      </div>
      <h2>{tag.name}</h2>
      <div className="triage-links">
        {tag.url && (isWebUrl(tag.url)
          ? <a href={tag.url} target="_blank" rel="noreferrer">{shortUrl(tag.url)} <Icon name="external" size={13} /></a>
          : <span className="subtle">{tag.url}</span>)}
        <button className="text-button" disabled={!bookmarks.length} onClick={onCopy}><Icon name="copy" size={13} /> Copy…</button>
        <button className="text-button" onClick={onEdit}><Icon name="edit" size={13} /> Edit</button>
      </div>
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
                <span className="queue-thumb"><Cover asset={b.asset} load={loadMedia} className="" /></span>
                <span className="queue-text">
                  <span className="queue-title">{b.title}</span>
                  <span className="queue-meta"><span className="queue-domain">{domainOf(b.url) || "No URL"}</span><span className="queue-status">{status(b.statusId)}</span></span>
                  {why && <span className="tag-view-why">{why}</span>}
                </span>
              </button>
            );
          })}
          {!bookmarks.length && <p className="subtle">No bookmarks in this group yet.</p>}
        </div>
      </section>
    </div>
  );
}

// github.com/owner/repo/issues/141 reads better as "github.com/…/issues/141".
function shortUrl(url: string) {
  const domain = domainOf(url), path = new URL(url).pathname.split("/").filter(Boolean);
  return path.length > 2 ? `${domain}/…/${path.slice(-2).join("/")}` : `${domain}${path.length ? "/" + path.join("/") : ""}`;
}
