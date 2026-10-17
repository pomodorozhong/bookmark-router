# Thumbnails — store once, resolve with fallbacks

Reviewed and implemented October 14, 2026 (see [Decisions](#decisions)). This is the reference for [#7](https://github.com/pomodorozhong/bookmark-router/issues/7): how the app finds an image for each bookmark, stores it, and what goes wrong with each service. Services were probed on 2026-10-13/14. All of them are unofficial or best-effort and can change without notice.

## Decision: store the bytes, not the URL

A remote image URL is a lease, not an asset. Today every imported cover is `asset.source === "remote"`, and the graph loads it on every visit. A quarter of those covers are already dead. Links decay quickly: Pew found 18% of tweets gone after about three months, and 25% of web pages from 2013–2023 gone by late 2023. X avatar URLs also change whenever the person changes their picture. A static build has no server to fetch from, so a dead URL cannot be repaired there.

The resolver therefore runs **once per bookmark**. It fetches a 256 px WebP (about 3–6 KB) and stores it in the existing `media` store. The result goes in a new **`thumbnail` field** on the bookmark, beside the imported `asset`, which stays untouched:

- `thumbnail: { blobId, source, sourceUrl, capturedAt }` after a capture, where `source` names the step that won (for example `fxtwitter`) and `sourceUrl` is the image URL it fetched.
- `thumbnail: { failedAt }` when every online step failed, so the bookmark isn't retried on every load.

Display order: a local `asset` the user attached, then the stored `thumbnail`, then a remote `asset` loaded live as today, then the letter tile. Capturing a thumbnail is not a user edit: it doesn't change the bookmark's revision or add an Undo entry. Backups export the thumbnail's Blob with the rest of the `media` store; restore must remap `thumbnail.blobId` the same way it remaps a local asset's.

**A stored thumbnail is never refreshed automatically**, even when the source changes (a new X avatar, say). It changes only when the user retries that bookmark. Every remote service becomes a one-time capture channel rather than a display dependency, and a later outage affects only bookmarks not yet captured.

Size is not a concern. Even at 10 KB each, 5,000 thumbnails take 50 MB, against browser quotas of up to 60% of disk.

Stored Blobs never taint the graph canvas, because object URLs are same-origin. Until a bookmark is captured, the graph keeps today's display path. `GraphCanvas.tsx` loads the remote image without `crossOrigin` and draws it into its own canvas. That shows images from hosts without CORS, but taints the canvas, which breaks PNG export and pixel hit-testing.

## What the cover check found

All 113 unique Raindrop cover URLs in the 148-bookmark collection were requested directly and through wsrv.nl on 2026-10-14.

| Outcome | Covers | Cause |
|---|---|---|
| Loads through wsrv.nl | 82 | One (Notion) failed once, then loaded on retry |
| Gone at the origin (404) | 19 | 13 X avatars or media replaced, 3 deleted YouTube videos, 3 removed article images |
| Signed URL expired (403/400) | 6 | Instagram and Facebook CDNs (`URL signature expired`), LinkedIn |
| Refused by wsrv.nl's domain policy | 2 | scrnshts.club (an HTML page anyway) and disp.cc |
| Not an image | 1 | The URL now serves an HTML page |
| Hotlink-blocked (403) | 1 | hakune.co, which also failed an earlier link check |
| Unreachable or malformed | 2 | A TLS error, and `https://boyney.iohttps//images.unsplash.com/…` from the export |

By bookmark: 84 have a working cover, 32 have a cover that fails, and 32 have none. **Most failures are dead or expired URLs, not blocking.** Retrying the same URL never helps. What helps is asking a service for the *current* image and storing it straight away. The collection is half X: 73 of 148 bookmarks are on `twitter.com` or `x.com`, and 26 are on YouTube, so those two site rules matter most.

## Resolver order

The resolver tries these layers in order, and the first image it stores wins. Each step fetches through wsrv.nl so the result has CORS and is resized.

1. **Already stored.** A bookmark with a `thumbnail`, or a local asset, is skipped.
2. **Site rules**, which need no page lookup:
   - YouTube: `i.ytimg.com/vi/<id>/hqdefault.jpg`, never `maxresdefault`, which exists only for some videos.
   - X (both `twitter.com` and `x.com`): `api.fxtwitter.com/2/status/<id>`. The resolver uses the first photo in `media.all[]`, else a video's `thumbnail_url`, else `author.avatar_url`, which is always the current one. This recovers the 13 dead X covers.
   - GitHub: repo, pull request and issue pages use `opengraph.githubassets.com/1/<owner>/<repo>[/pull/<n>]`, and profiles use `avatars.githubusercontent.com/<user>`. Not `github.com/<user>.png`, whose redirect sends no CORS. The collection has no GitHub bookmarks today; this rule is cheap to keep.
3. **Imported cover** through wsrv.nl. Covers that are clearly broken, such as two schemes joined together, get repaired first.
4. **Microlink** og:image (`api.microlink.io/?url=`). It returns the site's own image URL, which then goes through wsrv.nl like a cover. The quota is 25 lookups a day per visitor IP, and cache hits are free, so a stored queue keeps going across days. This step should recover the expired social-CDN covers and most bookmarks without a cover.
5. **Agent proposal.** The existing WebMCP image proposal (see [WebMCP](webmcp.md#fill-missing-images)) stays a remote URL until the human applies it. After that, the resolver captures it like an imported cover. This is how the user's own fetcher, which uses a residential IP, covers the long tail.
6. **Page screenshot** from `rdl.ink/render/<encoded page URL>`. This is Raindrop's own endpoint and isn't documented. It returns a 1200×800 WebP, synchronously, in about 5 s when uncached.
7. **Favicon** from Google (`www.google.com/s2/favicons?domain=<d>&sz=64`) through wsrv.nl. Google sends no CORS, but wsrv.nl adds it. An unknown domain gives a 404, so a missing icon is detectable. This is the right fallback for sites that block metadata fetches (Medium, Stack Overflow, npm) or have no og:image (Hacker News). DuckDuckGo (`icons.duckduckgo.com/ip3/<d>.ico`) behaves the same way and is the backup.
8. **Letter tile.** If every step fails, the app generates a tile from the title or domain and records `thumbnail: { failedAt }`. Only a manual retry runs the resolver again.

## Services

| Service | Endpoint | Free limit | How to recognize failure |
|---|---|---|---|
| wsrv.nl | `wsrv.nl/?url=<encodeURIComponent(src)>&w=256&output=webp` | 2,500 uncached images per 10 min per IP, then blocked for 1 h | JSON body with `status: "error"`; 400 means the domain is blocked by policy, 404 means the upstream failed or wasn't an image |
| YouTube | `i.ytimg.com/vi/<id>/hqdefault.jpg` | None stated | 404 with a 1,097-byte 120×90 placeholder JPEG |
| FxTwitter | `api.fxtwitter.com/2/status/<id>` | 1,000/min per IP | Non-200, or no media and no avatar |
| GitHub cards | `opengraph.githubassets.com/1/<owner>/<repo>` | About 100, then 429 with `retry-after: 900` | 429 |
| Microlink | `api.microlink.io/?url=<page>` | 25/day without a key | `status` not `success`, or no `image.url` |
| rdl.ink | `rdl.ink/render/<encoded page>` | Undocumented | 404 for dead pages, 500 for some sites (Hacker News) |
| Google favicons | `www.google.com/s2/favicons?domain=<d>&sz=64` | None published | 404 with a globe placeholder |

All of these sent `Access-Control-Allow-Origin: *` when probed, except Google and DuckDuckGo favicons, which work only through wsrv.nl. wsrv.nl caches on its server for 31 days at most, so it is not an archive. It sends only the image URL to the image's host, not who asked for it. Its code is open source (weserv/images) and can be self-hosted if the public service goes away.

## Gotchas that cause bugs

- **Encode the inner URL fully.** wsrv.nl's `url=` value must go through `encodeURIComponent`. A URL that already contains `%3A`, such as `rdl.ink/render/https%3A…`, must be encoded again, or wsrv.nl returns 404.
- **Check the status, not just the bytes.** YouTube and Google return a real image with status 404. In an `<img>` that can still fire `onload`. Store a result only when the response is 200 with an `image/*` type.
- **Expired is permanent.** A 403 saying `URL signature expired` (Facebook, Instagram) or a LinkedIn 400 will never load again. Go to Microlink for a fresh URL rather than retrying.
- **Throttle backfills.** At most 4 service requests start per second, a 15-minute pause after a GitHub 429, and a Microlink queue that stops at 25 a day. Bookmarks waiting for a limit are not recorded as permanently failed. Turning the setting off aborts the active bulk lookup; opening another collection moves the queue there. Reload resumes from the bookmarks without a thumbnail record.
- **G6 forces `crossOrigin = "Anonymous"`** on image nodes given a string `src`, so a host without CORS fails in the graph. Keep handing G6 a canvas, as `GraphCanvas.tsx` does now.
- **Eviction deletes everything at once.** Browsers evict a whole origin's storage, and Safari does so after 7 days of browser use without visiting the site. Call `navigator.storage.persist()` after the user's first import. Firefox shows a prompt; Chrome and Safari decide silently. Thumbnails are already in backups, because backups export the `media` store.

## Privacy setting and the detail-view button

Steps 2–4, 6 and 7 send the bookmark's URL, its domain, or its image URL to an outside service: YouTube, FxTwitter, GitHub, Microlink, Raindrop, Google, DuckDuckGo and wsrv.nl. Nothing is sent unless the user asks.

- **Find thumbnails online** is a setting, **off by default everywhere**, on the dev server and on a static build. It lists the services by name. Turning it on fills in thumbnails for every bookmark without one, throttled as above. While it is off, only stored thumbnails, imported covers and letter tiles show.
- **The bookmark detail view has a Find thumbnail online button** that runs the resolver for that one bookmark, whatever the setting says. Before it runs, a warning names the services this bookmark's URL would be sent to; an X bookmark, for example, goes to FxTwitter and wsrv.nl, then Microlink and Raindrop if needed. A counter beside it shows Microlink lookups left today (out of 25). When a thumbnail or a failure is stored, the button becomes **Retry thumbnail**, which is the only way a stored thumbnail is replaced.

## Considered and not built

| Option | Why not |
|---|---|
| Free CORS proxies (allorigins, codetabs, thingproxy, cors.sh, corsproxy.io) | On 2026-10-13: Cloudflare errors, DNS failures, or an API key required. They would also see every URL and could alter the HTML. |
| Keyed unfurl APIs (Iframely, LinkPreview, OpenGraph.io, Peekalink) | A key shipped in a static bundle is public. Only acceptable as a key each user enters themselves. |
| mShots and thum.io screenshots | Both return a placeholder on the first request. mShots is unofficial abandonware; thum.io allows 1,000 a month. rdl.ink is better on every point except official status. |
| unavatar | 25 anonymous requests a day, and free use requires an attribution link. FxTwitter already gives the current X avatar. |
| icon.horse and favicone | They send CORS, but always return 200 with a generic icon, so a real favicon can't be told from a fallback. |
| X oEmbed, vxTwitter, noembed | X oEmbed has no image field. vxTwitter returned 403. noembed doesn't match `x.com` URLs. |
| Raindrop API | Needs OAuth and adds nothing beyond the export's `cover`. |
| Cloudflare Worker fetcher | 100,000 requests a day free, but it is a backend to deploy and protect (a user-pasted token, an exact-origin CORS header, an `image/*` check, size caps, SSRF guards). Some sites return 403 to Worker traffic. Worth it only if the app gets other users. |
| Browser extension or Tampermonkey userscript | Fetches anything from the user's own IP, but it is extra software to install, and Firefox needs a `postMessage` relay. The agent proposal already covers this need. |
| Local helper on `127.0.0.1` | Works from an HTTPS page, but since Chrome 142 a public site calling loopback shows a Local Network Access prompt, and it only works while the computer runs it. |
| Bookmarklet | Can read the og:image of the page you're on, but can't backfill existing bookmarks. |

## Decisions

Recorded October 14, 2026, after reviewing this draft:

1. The thumbnail sits in a separate `thumbnail` field; the imported `asset` is never overwritten.
2. **Find thumbnails online** defaults to off everywhere. The detail view has a per-bookmark button with a warning and a counter.
3. Stored thumbnails refresh only on a manual retry.

## Implementation and verification

Implemented for #7; the fixed Copy/Edit/Pin bar landed with #13. The detail button and counter keep their position, with the warning, step list, result, and **Hide details** underneath. Opening the warning leaves focus on **Find thumbnail online** or **Retry thumbnail**, preserving the detail panel's scroll position; Tab moves to **Send and find**. A failed retry retains a previously stored image. Attached images take precedence, then stored thumbnails, imported covers, and letter tiles, in the detail panel, queue, group view, and graph. Stored favicons are inset rather than stretched.

Captures and media replacements are atomic IndexedDB transactions. They preserve bookmark and collection revisions and the existing Undo action. A changed URL or imported asset during a lookup rejects the capture. Undo, including import-merge Undo, retains current thumbnails. Restore remaps thumbnail media IDs and rejects missing bytes; retry does not delete media still referenced by another bookmark or import snapshot.

The setting and daily counter are remembered per origin on this device. Quota days use UTC; responses reporting `x-rate-limit-remaining` can lower the local estimate to the IP's actual remaining quota, and cache hits do not force a decrement ([Microlink's response headers and caching](https://microlink.io/api)). Individual lookup skips Microlink at zero quota and tries the remaining fallbacks; bulk lookup waits and resumes automatically. GitHub cooldowns are remembered across reloads. Requests have a 20-second timeout. Applying an agent's remote image remains a human-reviewed edit; it can then be captured through the imported-cover step.

Verified October 14, 2026:

- `npm run build` and all 110 tests passed. Regression coverage includes 404 image placeholders, expired-cover fallback, URL encoding, quota exhaustion/reset, cancellation, service rate limits, GitHub cooldown, atomic storage failure, shared media, Undo, and backup remapping.
- PR preparation repeated `npm ci`, `npm run build`, and `npm test` in a clean worktree of the final application code, including the retry-scroll fix; all passed. Vite still reports its large-chunk warning.
- Browser checks used a converted copy of the 148-bookmark collection in a throwaway Chrome profile on port 5201. The user's storage at port 5199 was not used. Thumbnail controls fit at desktop, 390 px, and 320 px; the result and step list remained visible until hidden. Existing narrow-header/queue behavior is outside #7.
- With explicit permission, the two agreed examples were checked live. **Retention and paid conversion over downloads** recovered the current avatar through FxTwitter and wsrv.nl without using Microlink. **Five App Store submission tips** still had an expired cover; Microlink supplied an image URL that wsrv.nl rejected with 400, so Raindrop's screenshot won. That screenshot shows a Threads loading/landing screen rather than the post content. Its single Microlink request adjusted the counter to the service's IP-wide remaining count.
- Both live captures survived reload and the Download backup → Restore backup flow into a new collection. Their imported cover URLs and revisions remained unchanged; images loaded from local Blob URLs after reload without online lookup requests.
- Bulk network responses were simulated locally, without sending additional collection links outside the browser. Cancel sent nothing, the setting defaulted off, requests started roughly 250 ms apart, existing thumbnails stayed untouched, turning off stopped new requests and saves, and a zero-quota queue waited without storing failures and resumed when quota became available.
- The compiled static build was served with `npm run preview -- --port 5202` and checked in another throwaway Chrome profile with two synthetic bookmarks. All external requests were intercepted locally. X and generic-page lookup, the Microlink counter, bundled thumbnail bytes, restore ID remapping, unchanged covers, and local-image reload passed; no online lookup requests ran before confirmation or after reload. Retry opening kept the same scroll position at 1440, 390, and 320 px, and Tab reached **Send and find**. Only compiled assets were loaded, with no development source modules or application backend.

**You try:**

1. Find the thumbnail for **Retention and paid conversion over downloads**. Confirm the warning; the avatar should appear in the panel, queue, and graph without using Microlink.
2. Find the thumbnail for **Five App Store submission tips**. Inspect the fallback steps and counter; current live services may supply the Threads screenshot instead of a preview of the post.
3. Reload, download a backup, and restore it into a new collection. Both thumbnails should remain, and the imported cover URLs in **Edit** should be unchanged.
4. Enable **Find thumbnails online** from **More actions**, confirm, watch missing thumbnails fill in, then turn it off. Stored thumbnails should not be retried.
