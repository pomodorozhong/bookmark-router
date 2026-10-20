# Handoff

## In progress

### fix/triage-header-narrow

- **Task:** #16 Keep the triage header usable at narrow window widths. Branch linked to the issue; mockup approval and the "You try" tasks are recorded on the issue.
- **PR:** not opened yet.
- **Code checkpoint:** `a75b53f fix(triage): keep the triage header usable at narrow widths`.
- **State:** one header row down to 821 px. Below 1320 px progress is a bar plus a percentage (counts in its tooltip), Undo is icon-only, and Agent review reads "Agent" (icon-only below 900 px). At 820 px and below there are two rows (menus and icons, then full-width queue tabs) with a 3 px progress bar on the bottom edge. Agent review uses a new `bot` icon. In a graph narrower than 520 px the filter search shrinks to 64 px. `docs/product.md` describes it.
- **Verification:** `npm ci`, `npm run build`, `npm test` (113 pass) in a clean worktree. Headless Chrome on a converted copy of the collection (port 5311), queue open and closed, at 1440, 1320, 1319, 1280, 1200, 1150, 1100, 1000, 900, 821, 820, 700, 600, 480, 390 and 360 px: header 59 px at 821 px and up; 101 px at 700–820 px; 115 px at 600 px and below (44 px touch targets); nothing past the right edge; no page overflow. The filter row stays on one line at 1150 px with the queue open and wraps from 1100 px. At 390 px: tabs switch the queue, More and Agent review open, the progress tooltip shows the counts, and tapping a tag opens its panel.
- **Not run:** the user's "You try" tasks from #16; the Agent review pending badge with a real batch waiting.
- **Avoid:** in headless checks, let the graph finish placing at desktop width before resizing. If you resize during "Placing your collection…" it stays stuck, on `main` as well; this hasn't been checked in a real browser. Kill leftover headless Chrome (`pkill -f remote-debugging-port=9333`) after a failed run, or the next run attaches to the old page.
- **Pending P-03:** open the PR for `fix/triage-header-narrow` (closes #16); the branch is pushed. Needs PR approval. Blocks review.
- **Pending P-04:** file an issue: at phone width, tapping a tag opens its panel, but the queue drawer opens over it and hides it. This happens on `main` too. Needs approval to file. Blocks nothing in #16.
- **Next action:** after P-03 (draft title and body were shown in the session; regenerate with the `open-pr` skill), the user tries the three tasks on #16; record acceptance on the issue, then merge. The next session removes this subsection.

## Ranked work

1. #16 Keep the triage header usable at narrow window widths (in progress on `fix/triage-header-narrow`)
2. #25 Links between nodes disappear when zoomed out
3. #21 Hidden nodes overlap shown nodes after Reset positions
4. #22 Nearby nodes cover non-focused titles when zoomed in
5. #23 Threads thumbnails fall back to a loading-screen screenshot
6. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
