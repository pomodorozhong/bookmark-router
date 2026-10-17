# Handoff

## In progress

### fix/detail-panel-bar

- **Task:** #13 Keep the detail panel's Copy and Edit buttons in one place. Branch linked to the issue; mockup approval recorded on the issue.
- **PR:** not opened yet.
- **Code checkpoint:** `7f662ae fix(triage): keep the detail panel's actions in a fixed top bar`.
- **State:** bookmark and tag panels share a new `DetailBar` (link left, Copy/Edit/Pin/close right), pinned above the scrolling content. Docs updated in `docs/product.md`.
- **Verification:** `npm ci`, `npm run build`, `npm test` (113 pass) in a clean worktree. Headless Chrome on a converted copy of the collection (port 5311): button positions identical for 1-, 2- and 10-line titles and after scrolling, at 1440 and 390 px; no horizontal overflow; an injected long domain truncates with an ellipsis on one line; the tag panel bar matches.
- **Not run:** the user's "You try" review in their own browser.
- **Pending P-01:** push `fix/detail-panel-bar` and open a PR that closes #13. Needs the user's publish approval. Blocks the PR and review.
- **Next action:** after approval, push and open the PR; then give the user the "You try" tasks and record acceptance on #13.

## Ranked work

1. #13 Keep the detail panel's Copy and Edit buttons in one place (in progress on `fix/detail-panel-bar`)
2. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
3. #25 Links between nodes disappear when zoomed out
4. #21 Hidden nodes overlap shown nodes after Reset positions
5. #22 Nearby nodes cover non-focused titles when zoomed in
6. #23 Threads thumbnails fall back to a loading-screen screenshot
7. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
