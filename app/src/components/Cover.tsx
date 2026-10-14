import { useEffect, useState } from "react";
import type { Bookmark } from "../domain/model";
import { displayImage } from "../domain/thumbnails";

export type LoadMedia = (id: string) => Promise<{ blob: Blob } | undefined>;

/**
 * A bookmark's image: an attached one, then a stored thumbnail, then the
 * imported image loaded live. With `letterTile`, a bookmark with no image that
 * loads shows its first letter instead of nothing.
 */
export function Cover({ bookmark, load, className = "triage-cover", letterTile = false }: {
  bookmark: Bookmark; load: LoadMedia; className?: string; letterTile?: boolean;
}) {
  const image = displayImage(bookmark);
  const key = image && ("blobId" in image ? `blob:${image.blobId}` : image.url);
  const icon = Boolean(image && "blobId" in image && image.icon);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined, canceled = false;
    setSrc(undefined);
    if (!image) return;
    if ("url" in image) setSrc(image.url);
    else void load(image.blobId).then((m) => {
      if (!canceled) {
        if (m) setSrc(objectUrl = URL.createObjectURL(m.blob));
        else setFailedKey(key);
      }
    }).catch(() => { if (!canceled) setFailedKey(key); });
    return () => { canceled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // The key identifies the image; the descriptor object is new on every render.
  }, [key, load]);
  // Track which source finished loading: a cached image can fire load before an
  // effect would reset a plain flag, leaving it hidden.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [failedSrc, setFailedSrc] = useState<string>();
  const [failedKey, setFailedKey] = useState<string>();
  const loaded = Boolean(src) && loadedSrc === src;
  const failed = !image || (Boolean(key) && failedKey === key) || (Boolean(src) && failedSrc === src);
  if (letterTile && failed) {
    const letter = (bookmark.title.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase();
    return <span className={`${className} letter-tile`} aria-hidden="true">{letter}</span>;
  }
  // Hidden until loaded, so a slow or blocked cover never leaves an empty frame.
  return src && !failed
    ? <img className={`${className}${icon ? " is-icon" : ""}`} src={src} alt="" hidden={!loaded} onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} />
    : null;
}
