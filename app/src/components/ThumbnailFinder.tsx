import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Bookmark, ThumbnailSource } from "../domain/model";
import { microlinkDailyLimit, thumbnailPlan, thumbnailServices, type StepOutcome } from "../domain/thumbnails";
import { useMicrolinkLeft } from "../thumbnail-settings";
import type { FindBookmarkThumbnail } from "../use-thumbnails";
import { domainOf } from "../domain/triage";
import { Icon } from "./Icon";

const sourceNames: Record<ThumbnailSource, string> = {
  youtube: "YouTube", fxtwitter: "FxTwitter", github: "GitHub", cover: "the current image",
  microlink: "Microlink", screenshot: "Raindrop screenshot", favicon: "site icon",
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * The detail panel's thumbnail block: the cover, where it comes from, a button
 * that finds this bookmark's thumbnail online after a warning naming the
 * services involved, the Microlink counter, and the steps of the last run.
 */
export function ThumbnailFinder({ bookmark, cover, onFind }: {
  bookmark: Bookmark;
  /** The bookmark's image, shown at the start of the block. */
  cover: ReactNode;
  /** Stores what the lookup found, or that it failed. */
  onFind: FindBookmarkThumbnail;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "done">("idle");
  const [steps, setSteps] = useState<StepOutcome[]>([]);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const left = useMicrolinkLeft();
  const attached = bookmark.asset?.kind === "image" && bookmark.asset.source === "local";
  const canSearch = thumbnailPlan(bookmark).length > 0;
  const thumbnail = bookmark.thumbnail;
  if (attached) return <div className="thumb-row"><div className="thumb-main">{cover}<p className="thumb-status">Attached image</p></div></div>;

  async function run() {
    if (controller.current && !controller.current.signal.aborted) return;
    const current = controller.current = new AbortController();
    setPhase("running");
    setSteps([]);
    setError("");
    try {
      const result = await onFind(bookmark, (outcome) => {
        if (!current.signal.aborted) setSteps((list) => outcome.outcome === "running" || !list.length || list.at(-1)!.step !== outcome.step
          ? [...list, outcome] : [...list.slice(0, -1), outcome]);
      }, current.signal);
      if (result.kind === "waiting") setError("The service is rate limited. Nothing changed; try again later.");
    } catch (e) {
      if (!current.signal.aborted) setError(`Couldn't save the thumbnail: ${String(e)}`);
    }
    if (!current.signal.aborted) { controller.current = undefined; setPhase("done"); }
  }

  // Short enough for one line beside the cover; the longer explanation is the tooltip.
  const site = domainOf(bookmark.url) || "its site";
  const [status, statusTitle] = phase === "running" ? ["Searching…", undefined]
    : !canSearch ? ["Needs a web link", "A thumbnail can only be found for a web link."]
    : thumbnail && "blobId" in thumbnail ? [<><strong>Stored</strong> · {sourceNames[thumbnail.source]} · {day(thumbnail.capturedAt)}</>, `Stored thumbnail, found by ${sourceNames[thumbnail.source]}`]
    : thumbnail ? [<>Not found · {day(thumbnail.failedAt)}</>, "No thumbnail was found online."]
    : bookmark.asset?.source === "remote" ? [<>From {site}</>, `Imported image, not stored: it loads from ${site} each time.`]
    : ["No image yet", undefined];
  return (
    <div className="thumb-row">
      <div className="thumb-main">
        {cover}
        <div className="thumb-actions">
          <p className="thumb-status" title={statusTitle}>{status}</p>
          <button aria-expanded={phase === "confirm"} disabled={!canSearch || phase === "running"}
            onClick={() => setPhase(phase === "confirm" ? "idle" : "confirm")}>
            <Icon name="search" size={14} /> {thumbnail ? "Retry" : "Find online"}
          </button>
          <span className={`thumb-counter ${left ? "" : "empty"}`} title={`Microlink allows ${microlinkDailyLimit} lookups a day without a key`}>
            Microlink: {left} of {microlinkDailyLimit} left today
          </span>
        </div>
      </div>
      {phase === "confirm" && (
        <div className="thumb-confirm" role="group" aria-label="Confirm sending">
          <strong>Send this bookmark's link to outside services?</strong>
          <span>They're tried in this order, and the search stops at the first image found:</span>
          <ol>
            {thumbnailServices(bookmark).map((s, i) => s.usesMicrolink && !left
              ? <li key={i} className="skipped">{s.service}: skipped, no lookups left today</li>
              : <li key={i}><strong>{s.service}</strong>: {s.sends}{s.usesMicrolink && <small> · uses 1 of {left} lookups left today</small>}</li>)}
          </ol>
          {thumbnail && "blobId" in thumbnail && <span>The new image replaces the stored thumbnail only if one is found.</span>}
          <div className="thumb-confirm-buttons">
            {/* Keep focus on the disclosure button so opening the warning preserves scroll. */}
            <button className="primary" onClick={() => void run()}><Icon name="search" size={14} /> Send and find</button>
            <button onClick={() => setPhase("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {(phase === "running" || phase === "done") && (
        <ul className="thumb-steps" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className={s.outcome}>
              <span className="mark" aria-hidden="true">{{ running: "…", found: "✓", failed: "✕", skipped: "–" }[s.outcome]}</span>
              <span>{s.step.label} <small>{s.outcome === "running" ? "trying…" : `· ${s.note}`}</small></span>
            </li>
          ))}
          {phase === "done" && !error && steps.every((s) => s.outcome !== "found") && <li className="failed"><span className="mark" aria-hidden="true" /><span>{thumbnail && "blobId" in thumbnail ? "Nothing found; keeping the stored thumbnail." : "Nothing found; showing the imported image or a letter tile."}</span></li>}
        </ul>
      )}
      {error && <p role="alert" className="thumb-error">{error}</p>}
      {phase === "done" && <button className="text-button thumb-hide" onClick={() => setPhase("idle")}>Hide details</button>}
    </div>
  );
}
