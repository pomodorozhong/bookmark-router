# Product

What Bookmark & Tag is for, what it deliberately leaves out, and how it behaves today. Work in progress and known gaps are in [HANDOFF.md](../HANDOFF.md) and GitHub issues; v1's build history is in [the v1 rounds](archive/v1-rounds.md).

## What the app is for

1. **Triage bookmarks.** Work through a Raindrop export one bookmark at a time and decide what each one is for.
2. **Group them into project ideas.** A bookmark joins one or more groups (existing GitHub issues, proposed issues, topics), and a group can be read as a whole.
3. **Let an agent help, through WebMCP.** The agent can add new items, fill in item details, and read processed groups with their bookmarks.

**Filters** support all three: finding what is left to triage and what belongs together. Anything not serving these jobs is frozen or cut.

## Scope boundaries

| Feature | Decision |
|---|---|
| Graph, import wizard, backup/restore, current Undo | Keep; fix bugs as found. |
| Copy composer | Triage selection/list/current copy with templates, presets, and preview. |
| Media upload and bulk status propagation | Frozen; old dialogs were removed in round 1. Existing backup media support remains. |
| C.1 undo rework (change sets, Redo) | Cut. Current Undo stays until it causes a real problem. The rename's schema version 2 does not implement C.1. |
| Record lifecycle | Collections can be deleted with confirmation and a backup offer. Bookmarks, tags, and tag types have no individual deletion. Archive/unarchive is not implemented. |
| Single bookmark creation | Add bookmark opens Import; agent creation is covered in [WebMCP](webmcp.md). |
| Advanced filter rules | Linked tag status, same-group, distance, and nested any/all remain in the domain engine but are not exposed by the compact filter UI. |
| Performance | Only if the real collection is slow. The 148-bookmark collection does not need the former 5,000-bookmark budget; 1,000/5,000 measurements and release review are cut. |
| Static deployment (GitHub Pages) | The `Pages` workflow builds `app/` and publishes it to `https://pomodorozhong.github.io/bookmark-router/` on every push to `main` ([#17](https://github.com/pomodorozhong/bookmark-router/issues/17)); the repository's Pages source must be set to GitHub Actions. It has no bundled fetcher, so thumbnails come from keyless CORS services and are stored locally; a local agent reaches the app through a WebMCP relay. Collections are per origin, so a deployed copy starts empty until a backup is restored. |

## Current behavior

- Triage replaces the old graph/list/details screen. Queue tabs filter both the graph and queue; nothing is current until a bookmark is picked. Done, Drop, and group changes save with labeled Undo feedback.
- The compact filter bar joins search, **Show**, and **Filters**, followed by **Saved filters**. Show holds tag types, Empty tags, and Untagged bookmarks. Filters supports Status, Group, Domain, Has, Import, and Added month, with value counts and Not. Rules combine with AND; values within a rule combine with OR. Saved filters store rules and search, not queue tabs or Show settings.
- Hidden groups linked to the current bookmark peek with faded fills and dashed outlines/links. Their bookmarks still follow the tab and filters. Peeking groups stay at their saved positions; showing them does not re-run layout.
- Clicking a group selects its bookmarks clockwise around the group, starting at the cluster edge when more than 90° of the ring is empty; the issue view uses the same order. J/K and arrow keys wrap through the queue.
- Issue views show descriptions, links, bookmarks, and membership reasons. Tag types can be created and edited. Appearance has four flat tag styles in eight directions, color presets/custom colors, size, and icons; titles always sit below tags, with no automatic initials.
- The triage header keeps one row down to 821 px. Below 1320 px, progress shows as a bar and a percentage, with the full counts in its tooltip. Undo becomes icon-only, and Agent review shortens to "Agent" (icon-only below 900 px). At 820 px and below, the header has two rows: the collection menu and icon buttons on the first, and the queue tabs across the second. Progress then runs as a 3 px bar along the header's bottom edge. There the logo is hidden and **Agent** is one button whose menu starts with Agent review; a dot on it marks a batch waiting for review. Between 821 and 1319 px a long collection name shortens to fit its slot. Agent review uses a robot-head icon at every width. At 820 px and below the graph keeps one row of tools along its top: search, **Filters** (one sheet holding Show, Filters and Saved filters, with a count of what's on) and **View** in the corner (Center, Whole collection, zoom, Re-layout and Reset positions); there is no bottom toolbar.
- Above 820 px the queue is a 64 px rail of thumbnails under the list's count; hovering one shows its title. **Queue** (`Q`) switches it to the full list and back. Up to 1280 px the full list floats over the graph as a drawer: picking from it keeps it open, and a tap on the graph, Escape, or its ‹ button puts it away. Above 1280 px the full list is a 320 px column beside the graph, and the queue starts that way. At 820 px and below there is no Queue button. The graph sits on top, and the queue and the bookmark or tag share the area below it as two tabs. ‹ › in the bookmark bar step through the queue, and `Q` switches tabs.
- The bookmark and issue panels open with a fixed bar: the link on the left, truncated with an ellipsis, and Copy, Edit, Pin, and close on the right. It stays in place for any title length and while the panel scrolls. Under the title, a thumbnail block shows the cover at 16:9, sized to the panel, beside where it comes from, **Find online** and the Microlink count. Done and Drop fill the decision bar; Deselect joins them only during a box selection. A tag's name in the Tags list opens that tag's view, and **Back** or Escape returns to the bookmark. Related bookmarks names the shared tag only when the bookmark has more than one. On phones the description follows the title, and on phones 760 px tall or less the panel takes 60% of the height while a bookmark or tag is open.
- Bookmarks and tags have Pin/Unpin. Pins survive queue-tab layout changes and reloads; only **Layout → Reset positions** clears them. The bottom toolbar matches the 34 px filter controls and floats over the graph.
- Collections can be deleted with confirmation and a backup offer. Bookmarks, tags, and tag types cannot be individually deleted; archive/unarchive is not implemented.
- **Agent review** (round 4) was approved October 14, 2026; its accepted behavior and verification are documented in [WebMCP](webmcp.md).
- **Thumbnails** ([#7](https://github.com/pomodorozhong/bookmark-router/issues/7)) are stored locally. Per-bookmark lookup names the outside services before sending, and bulk lookup defaults off. Captures survive Undo and backup/restore, retain imported covers, and refresh only on manual retry. See [thumbnail behavior and verification](thumbnails.md#implementation-and-verification).
- The Agent review button remains the direct human-review action. Its adjacent Agent connection menu owns the opt-in loopback relay switch and status; **More actions** stays focused on collection operations. The page-side relay was verified on a disposable `127.0.0.1:5201` origin with six tools discovered and removed again when the switch was turned off.
- The app is **Bookmark & Tag**. Backups use `bookmark-tag` version 2 and browser storage uses `bookmark-tag`. Old `bubble-tag` version 1 backups require `npm run upgrade-backup`; there is no in-app upgrade.
