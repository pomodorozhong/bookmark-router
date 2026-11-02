import type { Bookmark, Thumbnail } from "./model";

type ImageSource = Pick<Bookmark, "url" | "asset">;

/** A capture belongs to the page and media source used for its lookup. */
export function sameImageSource(left: ImageSource, right: ImageSource): boolean {
  return left.url === right.url && (["kind", "source", "url", "blobId", "filename"] as const)
    .every((key) => left.asset?.[key] === right.asset?.[key]);
}

/** Keep newer captures only when they belong to the source being restored. */
export function restoredThumbnail(before: Bookmark, current?: Bookmark): Thumbnail | undefined {
  return current && sameImageSource(before, current) ? current.thumbnail : before.thumbnail;
}

export function hasImage(bookmark: Bookmark): boolean {
  return bookmark.asset?.kind === "image" || Boolean(bookmark.thumbnail && "blobId" in bookmark.thumbnail);
}
