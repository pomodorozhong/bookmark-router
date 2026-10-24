# Handoff

## In progress

### fix/zoomed-out-links

- **Task:** #25 Links between nodes disappear when zoomed out. Linked to #25 on GitHub and pushed on 2026-10-23, based on `main` `cb04ac9` (after #64).
- **PR:** none.
- **Code checkpoint:** none; no work started. The branch holds only `docs:` handoff commits.
- **State:** not investigated yet. The issue suggests edges use a fixed `lineWidth: 1.2` with a light stroke `#a9bdba` in graph units (`app/src/components/GraphCanvas.tsx`), so they shrink under a pixel when zoomed out. #64 has merged, so `GraphCanvas.tsx` on `main` already reads theme roles for tiles and selection; #67 covers the remaining graph colors, edges included.
- **Next action:** `main` has moved to `0959409` (stack 2, #70–#74, changed `GraphCanvas.tsx`); rebase this branch onto it first. Then reproduce on a copy of the collection at the lowest zoom, and mockup first: how links look zoomed out and zoomed in.

## Ranked work

1. Decide #68: what the editor's "In progress" status should be (keep, rename, or hide; label `needs-decision`)
2. #25 Links between nodes disappear when zoomed out (on `fix/zoomed-out-links`)
3. #67 The graph's labels, edges and node fills don't follow the theme (pairs with #25: both change how `GraphCanvas.tsx` draws edges)
4. UI/UX revamp stack 3, not yet planned: menus (#49, #59), covers and letter tiles (#52), grouping by state in the tag view and Related bookmarks (#69)
5. #21 Hidden nodes overlap shown nodes after Reset positions
6. #22 Nearby nodes cover non-focused titles when zoomed in
7. #23 Threads thumbnails fall back to a loading-screen screenshot
8. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-02 File an issue for the import screen at phone widths.** Found while checking stack 2; asked on 2026-10-24, not answered. Proposed issue, milestone UI/UX revamp, label `bug`:
  > **Title:** At 390 px the import screen is wider than the screen
  >
  > **Body:** On the import screen at 390 px, the header's buttons (Undo, the Agent control and More) push past the right edge, so the page is wider than the viewport: More is cut off and the page content sits in a narrower column with empty space on the right. Seen on `main` `10bbcba` in headless Chrome with a copy of the collection, both on the Source step and after More → Add bookmark…. Likely cause: the import screen's `.topbar` keeps the desktop Undo and Agent controls, unlike the triage header's phone layout.
  >
  > Done when the import screen fits a 320 px and a 390 px viewport with nothing cut off.
