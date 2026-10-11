import { useEffect, useState } from "react";
import type { Asset } from "../domain/model";

export type LoadMedia = (id: string) => Promise<{ blob: Blob } | undefined>;

/** A bookmark's image, loaded from local media or its remote URL. */
export function Cover({ asset, load, className = "triage-cover" }: { asset?: Asset; load: LoadMedia; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined, canceled = false;
    setSrc(undefined);
    if (asset?.kind !== "image") return;
    if (asset.source === "remote") setSrc(asset.url);
    else void load(asset.blobId!).then((m) => {
      if (m && !canceled) setSrc(objectUrl = URL.createObjectURL(m.blob));
    });
    return () => { canceled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset, load]);
  // Track which source finished loading: a cached image can fire load before an
  // effect would reset a plain flag, leaving it hidden.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const loaded = Boolean(src) && loadedSrc === src;
  // Hidden until loaded, so a slow or blocked cover never leaves an empty frame.
  return src ? <img className={className} src={src} alt="" hidden={!loaded} onLoad={() => setLoadedSrc(src)} onError={() => setSrc(undefined)} /> : null;
}
