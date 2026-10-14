# Progress

Updated October 14, 2026. Rounds 0–4 are approved; round 1.5 was skipped because the user’s local fetcher works. Open work is tracked in GitHub issues. All agent-integration details are maintained in the standalone [WebMCP document](webmcp.md). See [the plan](plan.md) for product scope and [the completed round history](archive/rounds-0-3.md) for earlier work.

## Current behavior and decisions

- Triage replaces the old graph/list/details screen. Queue tabs filter both the graph and queue; nothing is current until a bookmark is picked. Done, Drop, and group changes save with labeled Undo feedback.
- The compact filter bar joins search, **Show**, and **Filters**, followed by **Saved filters**. Show holds tag types, Empty groups, and Ungrouped bookmarks. Filters supports Status, Group, Domain, Has, Import, and Added month, with value counts and Not. Rules combine with AND; values within a rule combine with OR. Saved filters store rules and search, not queue tabs or Show settings.
- Hidden groups linked to the current bookmark peek with faded fills and dashed outlines/links. Their bookmarks still follow the tab and filters. Peeking groups stay at their saved positions; showing them does not re-run layout.
- Clicking a group selects its bookmarks clockwise around the group, starting at the cluster edge when more than 90° of the ring is empty; the issue view uses the same order. J/K and arrow keys wrap through the queue.
- Issue views show descriptions, links, bookmarks, and membership reasons. Tag types can be created and edited. Appearance has four flat tag styles in eight directions, color presets/custom colors, size, and icons; titles always sit below tags, with no automatic initials.
- Bookmarks and tags have Pin/Unpin. Pins survive queue-tab layout changes and reloads; only **Layout → Reset positions** clears them. The bottom toolbar matches the 34 px filter controls and floats over the graph.
- Collections can be deleted with confirmation and a backup offer. Bookmarks, tags, and tag types cannot be individually deleted; archive/unarchive is not implemented.
- **Agent review** (round 4) was approved October 14, 2026; its accepted behavior and verification are documented in [WebMCP](webmcp.md).
- **Thumbnails** (#7) are stored locally. Per-bookmark lookup names the outside services before sending, and bulk lookup defaults off. Captures survive Undo and backup/restore, retain imported covers, and refresh only on manual retry. See [thumbnail behavior and verification](thumbnails.md#implementation-and-verification).
- The Agent review button remains the direct human-review action. Its adjacent Agent connection menu owns the opt-in loopback relay switch and status; **More actions** stays focused on collection operations. The page-side relay was verified on a disposable `127.0.0.1:5201` origin with six tools discovered and removed again when the switch was turned off.
- The app is **Bookmark & Tag**. Backups use `bookmark-tag` version 2 and browser storage uses `bookmark-tag`. Old `bubble-tag` version 1 backups require `npm run upgrade-backup`; there is no in-app upgrade.

## Open items

- Agent review was checked at measured 390- and 320-pixel widths, not on a real touch device. The local relay was verified on a disposable origin, but not yet against the user's real collection at `127.0.0.1:5199`.
- Not verified on real hardware: the system clipboard for Copy and the Custom color swatch's system picker. The user reported trackpad pan/pinch working.
- Below about 1150 px with the queue open, the filter bar wraps. At phone width the header is crowded and tapping a tag was not verified.
- Titles of non-focused bookmarks can be partly covered by nearby nodes when zoomed in; zooming above 60% still stutters slightly. The user accepted the remaining high-zoom panning cost.
- The live Threads thumbnail example currently falls back to a screenshot of its loading/landing screen after Microlink's image fails during resizing. See [thumbnail verification](thumbnails.md#implementation-and-verification). The separate detail-panel Copy/Edit/Pin bar is tracked in [#13](https://github.com/pomodorozhong/bookmark-router/issues/13).
- Hidden nodes hold their positions during a reset, so peeking or re-shown nodes can overlap shown nodes or sit off-screen.
- The cluster-edge selection start was not verified by eye on a lopsided group; the 90° threshold may need adjustment.
- Import filter behavior was not browser-verified because the converted collection has no import batches.
- The pre-rename `bubble-tag-v1` browser database remains available for recovery. Clear it only once its data is no longer needed.
- Root backups `bookmarks-converted_.json` and `bookmarks-visible.json` are untracked old-format files. Upgrade them before restore. Regenerate `bookmarks-converted.json` with `npm run convert` if it predates the rename.

## Working agreements and verification

**How the user likes to work**

- Mockup first for anything visual, published as a clickable Artifact; wait for approval. A mockup must work cleanly (no dead controls or layout bugs) and show the user's own use cases, not abstract options, or it can't be judged.
- Explain the use case behind a proposal in terms of what the user does in the app; round 3 was unclear until it was put that way.
- When the user proposes a solution, evaluate it and suggest better options before building; build their proposal only after they pick.
- Keep the code simple: a one-off command beats permanent in-app machinery for something done a few times (the rename's in-app upgrade was replaced by `npm run upgrade-backup` for this reason).
- Small changes, one issue each, ending with 2–4 short "You try" tasks whose result is recorded on the issue; verify on the user's real collection before reporting; conventional commits split by concern.
- The user runs the dev server themselves at `http://127.0.0.1:5199` (`.claude/launch.json` can start it too); their collections live in that origin's browser storage.

**Verifying on the real collection**

- The in-app browser pane is too throttled to lay out the graph. Headless Chrome driven over the DevTools protocol (Node's built-in WebSocket, `--remote-debugging-port`, a throwaway `--user-data-dir`) works.
- To load data: run `npm run convert -- ../bookmarks-working.json node_modules/.tmp-verify/bk.json` in `app/` (Vite serves files under `node_modules/`), then in the page fetch it, set it on the import screen's file input with a `DataTransfer`, choose Workspace JSON → Read source → Confirm restore. Delete the copy afterwards.
- Use the toolbar's zoom buttons, not wheel events (those pan the saved view away). localStorage does not survive between headless runs, so pick the restored collection from the Collections menu each run, or check reloads within one run.
