import { useCallback, useEffect, useRef, useState } from "react";
import type { Bookmark, Workspace } from "./domain/model";
import type { WorkspaceStore } from "./domain/storage";
import { findThumbnail, thumbnailPlan, type LookupResult, type StepOutcome } from "./domain/thumbnails";
import { githubLimited, githubRetryAt, microlinkLeft, microlinkUsed, thumbnailFetch, useFindOnline, waitForThumbnail } from "./thumbnail-settings";

export type FindBookmarkThumbnail = (bookmark: Bookmark, onStep: (step: StepOutcome) => void, signal: AbortSignal) => Promise<LookupResult>;
type Job = { promise: Promise<LookupResult>; listeners: Set<(step: StepOutcome) => void>; steps: StepOutcome[] };

/** One queue per open collection. Progress is persisted as thumbnail records, so reload resumes it. */
export function useThumbnails(store: WorkspaceStore, workspaceId: string, loaded: boolean, onSaved: (workspace: Workspace) => void) {
  const enabled = useFindOnline();
  const [status, setStatus] = useState("");
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const jobs = useRef(new Map<string, Job>());
  const lookup = useCallback(async (collectionId: string, bookmark: Bookmark, signal: AbortSignal,
    mode: "skip" | "wait", onStep?: (step: StepOutcome) => void): Promise<LookupResult> => {
    const key = `${collectionId}:${bookmark.id}`;
    let job = jobs.current.get(key);
    if (!job) {
      const listeners = new Set<(step: StepOutcome) => void>(), steps: StepOutcome[] = [];
      const promise = (async () => {
        const result = await findThumbnail(bookmark, {
          fetch: thumbnailFetch(signal), signal, microlinkLeft, microlinkUsed, githubRetryAt, githubLimited,
          whenMicrolinkUsedUp: mode,
          onStep: (step) => { steps.push(step); listeners.forEach((listener) => listener(step)); },
        });
        signal.throwIfAborted();
        if (result.kind === "waiting") return result;
        const thumbnail = result.kind === "found"
          ? { blobId: crypto.randomUUID(), source: result.thumbnail.source, sourceUrl: result.thumbnail.sourceUrl, capturedAt: new Date().toISOString() }
          : { failedAt: new Date().toISOString() };
        const image = result.kind === "found" ? { mime: result.thumbnail.blob.type, blob: result.thumbnail.blob } : undefined;
        const next = await store.setThumbnail(collectionId, bookmark.id, thumbnail, image, bookmark);
        saved.current(next);
        return result;
      })().finally(() => jobs.current.delete(key));
      job = { promise, listeners, steps };
      jobs.current.set(key, job);
    }
    if (onStep) { job.steps.forEach(onStep); job.listeners.add(onStep); }
    try { return await job.promise; }
    finally { if (onStep) job.listeners.delete(onStep); }
  }, [store]);

  const find: FindBookmarkThumbnail = useCallback((bookmark, onStep, signal) =>
    lookup(workspaceId, bookmark, signal, "skip", onStep), [lookup, workspaceId]);

  useEffect(() => {
    setStatus("");
    if (!loaded || !enabled) return;
    const controller = new AbortController(), { signal } = controller;
    const waiting = new Map<string, number>();
    let completed = 0;
    void (async () => {
      while (!signal.aborted) {
        const workspace = await store.get(workspaceId);
        signal.throwIfAborted();
        if (!workspace) return;
        const pending = workspace.bookmarks.filter((bookmark) => !bookmark.thumbnail
          && !(bookmark.asset?.kind === "image" && bookmark.asset.source === "local") && thumbnailPlan(bookmark).length);
        const bookmark = pending.find((b) => (waiting.get(b.id) ?? 0) <= Date.now());
        if (!bookmark) {
          setStatus(pending.length ? `${pending.length} waiting for service limits; resumes automatically.` : `Up to date · ${completed} checked.`);
          await waitForThumbnail(pending.length ? Math.min(60_000, Math.max(1000, Math.min(...pending.map((b) => waiting.get(b.id)!)) - Date.now())) : 3000, signal);
          continue;
        }
        setStatus(`Finding thumbnails · ${pending.length} left.`);
        try {
          const result = await lookup(workspaceId, bookmark, signal, "wait");
          if (result.kind === "waiting") waiting.set(bookmark.id, result.retryAt);
          else { waiting.delete(bookmark.id); completed++; }
        } catch (error) {
          signal.throwIfAborted();
          // Keep the queue available after a transient save conflict or storage error.
          setStatus(`Lookup paused: ${error instanceof Error ? error.message : String(error)}`);
          await waitForThumbnail(30_000, signal);
        }
      }
    })().catch((error) => { if (!signal.aborted) setStatus(`Lookup stopped: ${String(error)}`); });
    return () => controller.abort();
  }, [enabled, loaded, lookup, store, workspaceId]);
  return { find, status, enabled };
}
