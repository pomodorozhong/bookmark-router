# Handoff

## In progress

### fix/hidden-nodes-overlap

- **Task:** #21 Hidden nodes overlap shown nodes after Reset positions. Branched from `main` `3b4e6bc`.
- **PR:** none.
- **Code checkpoint:** `8bf3c7b` fix(graph): place hidden nodes in free space when resetting positions.
- **State:** fix built. After the shown nodes settle, `resetPositions` gives each hidden, unpinned node a free spot beside a linked node through `placeNear`'s new optional `radius` argument (`app/src/components/graph-placement.ts`). No visual design change, so no mockup.
- **Verification (2026-10-25, at `8bf3c7b`):** `npm run build` and `npm test` (117 pass) on the working tree. Headless Chrome on a collection copy: hide Topic, Reset positions, show Topic. Before the fix the Topic tags came back bunched at the right edge outside the layout; after it they sit beside their bookmarks inside the fitted view with no overlaps. Not yet run after a fresh `npm ci` in a clean worktree.
- **Next action:** the user tries the "You try" tasks; record acceptance on #21, then open the PR with the `open-pr` skill.

## Ranked work

1. #21 Hidden nodes overlap shown nodes after Reset positions (on `fix/hidden-nodes-overlap`)
2. [Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2): #83 Make complete collection imports stageable and atomic, then #84 Submit and review complete collection imports through WebMCP
3. #22 Nearby nodes cover non-focused titles when zoomed in
4. #23 Threads thumbnails fall back to a loading-screen screenshot
5. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
