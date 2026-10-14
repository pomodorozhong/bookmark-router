import { useSyncExternalStore } from "react";
import { currentQuota, type MicrolinkQuota } from "./domain/thumbnails";

// Device preferences for finding thumbnails online: the opt-in setting and
// Microlink's daily quota, which every lookup on this device shares.

const settingKey = "bookmark-tag-find-thumbnails";
const quotaKey = "bookmark-tag-microlink-quota";
const githubKey = "bookmark-tag-github-thumbnail-retry";
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function read<T>(key: string): T | undefined {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined; } catch { return undefined; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the setting lasts until reload */ }
}

let findOnline = read<boolean>(settingKey) === true;
let quota = currentQuota(read<MicrolinkQuota>(quotaKey));
let githubUntil = read<number>(githubKey) ?? 0;
window.addEventListener("storage", (event) => {
  if (event.key === settingKey) findOnline = read<boolean>(settingKey) === true;
  if (event.key === quotaKey) quota = currentQuota(read<MicrolinkQuota>(quotaKey));
  if (event.key === githubKey) githubUntil = read<number>(githubKey) ?? 0;
  changed();
});

export function setFindOnline(on: boolean) {
  findOnline = on;
  write(settingKey, on);
  changed();
}
export function useFindOnline() {
  return useSyncExternalStore(subscribe, () => findOnline);
}

/** Microlink lookups left today on this device. */
export function microlinkLeft() {
  return currentQuota(quota).left;
}
/** Records one Microlink lookup, trusting the service's own count when it sends one. */
export function microlinkUsed(remaining?: number, cached = false) {
  const today = currentQuota(quota);
  quota = { day: today.day, left: Math.max(0, Math.min(today.left, remaining ?? today.left - (cached ? 0 : 1))) };
  write(quotaKey, quota);
  changed();
}
export const githubRetryAt = () => githubUntil;
export function githubLimited(retryAt: number) {
  githubUntil = retryAt;
  write(githubKey, retryAt);
}
/** Refresh the counter when a new quota day starts, including while the queue is off. */
setInterval(changed, 60_000);

export function waitForThumbnail(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
let nextRequestAt = 0;
/** Shared by bulk and individual lookups: no more than four requests start per second. */
export function thumbnailFetch(signal: AbortSignal): typeof fetch {
  return async (input, init) => {
    const at = Math.max(Date.now(), nextRequestAt);
    nextRequestAt = at + 250;
    await waitForThumbnail(Math.max(0, at - Date.now()), signal);
    return fetch(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  };
}
export function useMicrolinkLeft() {
  return useSyncExternalStore(subscribe, microlinkLeft);
}
