import { useEffect, useState } from "react";
import type { Asset } from "../domain/model";
export function AssetPreview({
  asset,
  load,
}: {
  asset: Asset;
  load: (id: string) => Promise<{ blob: Blob } | undefined>;
}) {
  const [url, setUrl] = useState<string>(),
    [error, setError] = useState("");
  useEffect(() => {
    let canceled = false,
      objectUrl: string | undefined;
    setError("");
    setUrl(undefined);
    if (asset.source === "remote") setUrl(asset.url);
    else
      void load(asset.blobId!)
        .then((m) => {
          if (!m)
            throw new Error(
              "Bundled media is missing. Restore it from a backup.",
            );
          if (!canceled) {
            objectUrl = URL.createObjectURL(m.blob);
            setUrl(objectUrl);
          }
        })
        .catch((e) => {
          if (!canceled) setError(String(e));
        });
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.source, asset.url, asset.blobId]);
  return (
    <figure className="asset-preview">
      {error && <p role="alert">{error}</p>}
      {url &&
        (asset.kind === "image" ? (
          <img
            src={url}
            alt={asset.filename || "Primary asset"}
            onError={() => setError("Media could not be loaded.")}
          />
        ) : asset.kind === "video" ? (
          <video src={url} controls />
        ) : (
          <audio src={url} controls />
        ))}
      <figcaption>{asset.filename || "Remote media reference"}</figcaption>
    </figure>
  );
}
