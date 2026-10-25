# Handoff

## In progress

### fix/hidden-nodes-overlap

- **Task:** #21 Hidden nodes overlap shown nodes after Reset positions. Branched from `main` `3b4e6bc`.
- **PR:** opened from tip after this commit; closes #21.
- **Code checkpoint:** `5733208` fix(graph): keep a hidden type's bookmarks around their tags during a reset (on top of `8bf3c7b`).
- **State:** the user's first review found re-shown tags far from their bookmarks; they chose option B (2026-10-25). A reset now lays out shown nodes plus the hidden tags of shown bookmarks (undrawn, via `laidOutHidden` in `GraphCanvas.tsx`); other hidden nodes take free spots from `placeNear`, which now starts from the middle of all placed neighbors. While a type is hidden, its bookmarks group around empty spots; that is the accepted trade-off.
- **Verification (2026-10-25, at `5733208`):** `npm run build` and `npm test` (118 pass). Headless Chrome on a collection copy, hide Topic → Reset → show Topic: median Topic link 1564 on `main`, 685 at `8bf3c7b`, 165 now; no overlaps; Done tab still fits at 29%. Not yet run after a fresh `npm ci` in a clean worktree.
- **Approval requests:** none open. The user accepted the review on their collection and approved opening the PR (2026-10-25).
- **Next action:** after the PR merges, start the next ranked item from `main`.

## Ranked work

1. #21 Hidden nodes overlap shown nodes after Reset positions (on `fix/hidden-nodes-overlap`)
2. [Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2): #83 Make complete collection imports stageable and atomic, then #84 Submit and review complete collection imports through WebMCP
3. #22 Nearby nodes cover non-focused titles when zoomed in
4. #23 Threads thumbnails fall back to a loading-screen screenshot
5. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
