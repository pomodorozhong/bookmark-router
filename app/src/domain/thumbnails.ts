import type { Bookmark, ThumbnailSource } from "./model";

// Finds a thumbnail for one bookmark by trying online services in a fixed order
// and returning the first image. See docs/thumbnails.md for each service's
// limits and failure signals.

export const thumbnailWidth = 256;
const faviconWidth = 64;
export const microlinkDailyLimit = 25;

/** wsrv.nl adds CORS and resizes. The inner URL must be fully encoded, even if it is already partly encoded. */
export function wsrv(url: string, width = thumbnailWidth) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp`;
}

/** Repairs a cover whose second scheme ended up inside the host, as in `https://site.iohttps//images…`. */
export function repairImageUrl(url: string): string | undefined {
  const joined = url.match(/^https?:\/\/[^/?#]*?(https?):?\/\/(.+)$/);
  const candidate = joined ? `${joined[1]}://${joined[2]}` : url;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function webUrl(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function youtubeId(url?: string) {
  const u = webUrl(url);
  if (!u) return undefined;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  const id = host === "youtu.be" ? u.pathname.slice(1)
    : host === "youtube.com" ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1])
    : undefined;
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

export function tweetId(url?: string) {
  const u = webUrl(url);
  if (!u || !/^((www|mobile)\.)?(twitter|x)\.com$/.test(u.hostname)) return undefined;
  return u.pathname.match(/^\/[^/]+\/status(?:es)?\/(\d+)/)?.[1];
}

/** The social card for a repository, pull request or issue, or a profile's avatar. */
export function githubImage(url?: string) {
  const u = webUrl(url);
  if (!u || u.hostname.replace(/^www\./, "") !== "github.com") return undefined;
  const [owner, repo, kind, number] = u.pathname.split("/").filter(Boolean);
  if (!owner) return undefined;
  if (!repo) return `https://avatars.githubusercontent.com/${owner}?s=${thumbnailWidth}`;
  const tail = (kind === "pull" || kind === "issues") && /^\d+$/.test(number ?? "") ? `/${kind}/${number}` : "";
  return `https://opengraph.githubassets.com/1/${owner}/${repo}${tail}`;
}

export interface ThumbnailStep {
  source: ThumbnailSource;
  /** The service the bookmark's information goes to, as shown in the warning. */
  service: string;
  /** What that service receives. */
  sends: string;
  /** Shown in the step list while it runs. */
  label: string;
  usesMicrolink?: boolean;
}

/** The steps a lookup for this bookmark would try, in order. Empty when it has no web URL. */
export function thumbnailPlan(bookmark: Bookmark): ThumbnailStep[] {
  const page = webUrl(bookmark.url);
  const cover = bookmark.asset?.source === "remote" && bookmark.asset.kind === "image" ? bookmark.asset.url : undefined;
  const steps: ThumbnailStep[] = [];
  const noun = tweetId(bookmark.url) ? "post" : youtubeId(bookmark.url) ? "video" : "page";
  if (youtubeId(bookmark.url))
    steps.push({ source: "youtube", service: "YouTube", sends: "the video ID, for its thumbnail", label: "YouTube thumbnail" });
  if (tweetId(bookmark.url))
    steps.push({ source: "fxtwitter", service: "FxTwitter", sends: "the post link, to find its photos or the author's current avatar", label: "X post via FxTwitter" });
  if (githubImage(bookmark.url))
    steps.push({ source: "github", service: "GitHub", sends: "the repository or profile name, for its card or avatar", label: "GitHub card" });
  if (cover && repairImageUrl(cover))
    steps.push({ source: "cover", service: "wsrv.nl", sends: "the current image link, then any image found, to resize them", label: "Current image via wsrv.nl" });
  if (page) {
    steps.push({ source: "microlink", service: "Microlink", sends: `the ${noun} link, to find its preview image`, label: "Microlink", usesMicrolink: true });
    steps.push({ source: "screenshot", service: "Raindrop", sends: `the ${noun} link, for a page screenshot`, label: "Raindrop screenshot" });
    steps.push({ source: "favicon", service: "Google", sends: `the domain ${page.hostname.replace(/^www\./, "")}, for its icon`, label: "Google favicon" });
  }
  return page ? steps : [];
}

/** The services a lookup could send this bookmark's information to, in order, for the warning. */
export function thumbnailServices(bookmark: Bookmark): Array<Pick<ThumbnailStep, "service" | "sends" | "usesMicrolink">> {
  const steps = thumbnailPlan(bookmark);
  if (!steps.length) return steps;
  const services = [...steps, { service: "DuckDuckGo", sends: "the domain, if Google has no icon" }];
  if (steps.some((step) => step.source === "cover")) return services;
  // Every image found goes through wsrv.nl, so list it after the first step that can find one.
  const at = Math.max(1, steps.findIndex((step) => step.source === "microlink"));
  const resize = { service: "wsrv.nl", sends: "any image found, to resize it" };
  return [...services.slice(0, at), resize, ...services.slice(at)];
}

export type StepOutcome = { step: ThumbnailStep; outcome: "running" | "found" | "failed" | "skipped"; note: string };
export type FoundThumbnail = { source: ThumbnailSource; sourceUrl: string; blob: Blob };
export type LookupResult =
  | { kind: "found"; thumbnail: FoundThumbnail }
  | { kind: "failed" }
  /** A service limit paused the lookup; no failure record should be stored. */
  | { kind: "waiting"; retryAt: number };

export interface LookupDeps {
  fetch: typeof fetch;
  /** Microlink lookups left today. */
  microlinkLeft: () => number;
  /** Called after each Microlink response, with its remaining-quota header when present. */
  microlinkUsed: (remaining?: number, cached?: boolean) => void;
  signal?: AbortSignal;
  githubRetryAt?: () => number;
  githubLimited?: (retryAt: number) => void;
  onStep?: (outcome: StepOutcome) => void;
  /** When Microlink is needed but used up: skip it and go on (the button), or stop and wait (the backfill). */
  whenMicrolinkUsedUp: "skip" | "wait";
}

class StepFailure extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

/** Fetches an image through wsrv.nl, accepting only a 200 image response. */
async function fetchImage(fetcher: typeof fetch, url: string, width = thumbnailWidth): Promise<Blob> {
  const response = await fetcher(wsrv(url, width));
  if (response.status === 200 && response.headers.get("content-type")?.startsWith("image/")) {
    const blob = await response.blob();
    if (blob.size) return blob;
    throw new StepFailure("The image is empty");
  }
  // wsrv.nl explains failures in a JSON body, such as "The requested URL returned error: 404".
  const message = await response.json().then((body: { message?: unknown }) => typeof body?.message === "string" ? body.message : "", () => "");
  const upstream = message.match(/returned error: (\d{3})/)?.[1];
  throw new StepFailure(
    response.status === 429 ? "Too many requests; try again later"
    : upstream === "404" || upstream === "410" ? `Gone (${upstream})`
    : upstream ? `The image host refused it (${upstream})`
    : /blocked by policy/i.test(message) ? "wsrv.nl doesn't fetch from this site"
    : /unsupported image format/i.test(message) ? "Not an image"
    : `Couldn't load (${response.status})`, Number(upstream ?? response.status),
  );
}

async function fetchJson(fetcher: typeof fetch, url: string) {
  const response = await fetcher(url);
  const body = await response.json().catch(() => undefined);
  return { response, body };
}

async function runStep(step: ThumbnailStep, bookmark: Bookmark, deps: LookupDeps): Promise<{ sourceUrl: string; blob: Blob; note: string }> {
  const f = deps.fetch;
  switch (step.source) {
    case "youtube": {
      const url = `https://i.ytimg.com/vi/${youtubeId(bookmark.url)}/hqdefault.jpg`;
      try {
        return { sourceUrl: url, blob: await fetchImage(f, url), note: "Found the video thumbnail" };
      } catch (e) {
        throw new StepFailure(e instanceof StepFailure && /^Gone/.test(e.message) ? "Video no longer exists (404)" : (e as Error).message,
          e instanceof StepFailure ? e.status : undefined);
      }
    }
    case "fxtwitter": {
      const { response, body } = await fetchJson(f, `https://api.fxtwitter.com/2/status/${tweetId(bookmark.url)}`);
      if (!response.ok || !body?.status) throw new StepFailure(response.status === 404 ? "Post no longer exists (404)" : `FxTwitter couldn't read the post (${response.status})`, response.status);
      const status = body.status as { author?: { avatar_url?: string }; media?: { all?: Array<{ type?: string; url?: string; thumbnail_url?: string }> } };
      const media = status.media?.all ?? [];
      const photo = media.find((m) => m.type === "photo" && m.url)?.url;
      const video = media.find((m) => m.thumbnail_url)?.thumbnail_url;
      const avatar = status.author?.avatar_url;
      const url = photo ?? video ?? avatar;
      if (!url) throw new StepFailure("No photo and no avatar");
      return { sourceUrl: url, blob: await fetchImage(f, url), note: photo ? "Found the post's photo" : video ? "Found the video's thumbnail" : "Found the author's current avatar" };
    }
    case "github": {
      const url = githubImage(bookmark.url)!;
      return { sourceUrl: url, blob: await fetchImage(f, url), note: url.includes("avatars.") ? "Found the profile's avatar" : "Found the GitHub card" };
    }
    case "cover": {
      const url = repairImageUrl((bookmark.asset as { url: string }).url)!;
      return { sourceUrl: url, blob: await fetchImage(f, url), note: "Loaded the current image" };
    }
    case "microlink": {
      const { response, body } = await fetchJson(f, `https://api.microlink.io/?url=${encodeURIComponent(bookmark.url!)}`);
      const remaining = Number(response.headers.get("x-rate-limit-remaining"));
      deps.microlinkUsed(response.status === 429 ? 0 : Number.isFinite(remaining) && response.headers.has("x-rate-limit-remaining") ? remaining : undefined,
        response.headers.get("x-cache-status") === "HIT");
      if (response.status === 429) throw new StepFailure("No lookups left today");
      const url = response.ok && body?.status === "success" ? body.data?.image?.url : undefined;
      if (typeof url !== "string") throw new StepFailure(body?.status === "success" ? "No preview image on the page" : "Microlink couldn't read the page");
      return { sourceUrl: url, blob: await fetchImage(f, url), note: "Found the page's preview image" };
    }
    case "screenshot": {
      const url = `https://rdl.ink/render/${encodeURIComponent(bookmark.url!)}`;
      try {
        return { sourceUrl: url, blob: await fetchImage(f, url), note: "Took a screenshot of the page" };
      } catch (e) {
        throw new StepFailure(e instanceof StepFailure && /^Gone/.test(e.message) ? "Page not found (404)" : (e as Error).message,
          e instanceof StepFailure ? e.status : undefined);
      }
    }
    case "favicon": {
      const domain = new URL(bookmark.url!).hostname;
      const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=${faviconWidth}`;
      try {
        return { sourceUrl: url, blob: await fetchImage(f, url, faviconWidth), note: `Found the ${domain.replace(/^www\./, "")} icon` };
      } catch (e) {
        deps.signal?.throwIfAborted();
        if (e instanceof StepFailure && e.status === 429) throw e;
        const backup = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
        try {
          return { sourceUrl: backup, blob: await fetchImage(f, backup, faviconWidth), note: `Found the ${domain.replace(/^www\./, "")} icon` };
        } catch (e) {
          if (e instanceof StepFailure && e.status === 429) throw e;
          throw new StepFailure("No icon for this site");
        }
      }
    }
  }
}

/** Tries each step in order and returns the first image found. */
export async function findThumbnail(bookmark: Bookmark, deps: LookupDeps): Promise<LookupResult> {
  for (const step of thumbnailPlan(bookmark)) {
    deps.signal?.throwIfAborted();
    if (step.source === "github" && (deps.githubRetryAt?.() ?? 0) > Date.now()) {
      if (deps.whenMicrolinkUsedUp === "wait") return { kind: "waiting", retryAt: deps.githubRetryAt!() };
      deps.onStep?.({ step, outcome: "skipped", note: "GitHub is rate limited; try again later" });
      continue;
    }
    if (step.usesMicrolink && deps.microlinkLeft() <= 0) {
      if (deps.whenMicrolinkUsedUp === "wait") return { kind: "waiting", retryAt: nextQuotaDay() };
      deps.onStep?.({ step, outcome: "skipped", note: "Skipped: no lookups left today" });
      continue;
    }
    deps.onStep?.({ step, outcome: "running", note: "" });
    try {
      const { sourceUrl, blob, note } = await runStep(step, bookmark, deps);
      deps.onStep?.({ step, outcome: "found", note });
      return { kind: "found", thumbnail: { source: step.source, sourceUrl, blob } };
    } catch (e) {
      deps.signal?.throwIfAborted();
      deps.onStep?.({ step, outcome: "failed", note: e instanceof StepFailure ? e.message : "Couldn't reach the service" });
      if (e instanceof StepFailure && e.status === 429) {
        const retryAt = Date.now() + (step.source === "github" ? 15 * 60_000 : 60 * 60_000);
        if (step.source === "github") deps.githubLimited?.(retryAt);
        return { kind: "waiting", retryAt };
      }
      if (step.usesMicrolink && deps.microlinkLeft() <= 0 && deps.whenMicrolinkUsedUp === "wait")
        return { kind: "waiting", retryAt: nextQuotaDay() };
    }
  }
  return { kind: "failed" };
}

/** Microlink's keyless quota, remembered on this device per UTC day. */
export interface MicrolinkQuota { day: string; left: number }
export function currentQuota(saved: MicrolinkQuota | undefined, now = new Date()): MicrolinkQuota {
  const day = now.toISOString().slice(0, 10);
  return saved?.day === day && Number.isFinite(saved.left)
    ? { day, left: Math.max(0, Math.min(microlinkDailyLimit, saved.left)) } : { day, left: microlinkDailyLimit };
}
export function nextQuotaDay(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** What a bookmark shows: an image the user attached, then a stored thumbnail, then the imported image, loaded live. */
export type DisplayImage = { blobId: string; icon?: boolean } | { url: string };
export function displayImage(bookmark: Bookmark): DisplayImage | undefined {
  const asset = bookmark.asset?.kind === "image" ? bookmark.asset : undefined;
  if (asset?.source === "local" && asset.blobId) return { blobId: asset.blobId };
  if (bookmark.thumbnail && "blobId" in bookmark.thumbnail)
    return { blobId: bookmark.thumbnail.blobId, icon: bookmark.thumbnail.source === "favicon" };
  if (asset?.source === "remote" && asset.url) return { url: asset.url };
  return undefined;
}
