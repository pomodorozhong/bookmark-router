# Handoff

## In progress

### fix/hidden-nodes-overlap

- **Task:** #21 Hidden nodes overlap shown nodes after Reset positions. Branched from `main` `3b4e6bc` (after stack 3, #77–#82) and linked to #21 on GitHub on 2026-10-24.
- **PR:** none.
- **Code checkpoint:** none; no work started. The branch holds only this `docs:` handoff commit.
- **State:** not investigated. Per the issue, **Layout → Reset positions** leaves hidden nodes at their old positions, so peeking or re-shown nodes can overlap shown ones or sit off-screen. The reset lives in `app/src/components/GraphCanvas.tsx` (`resetPositions`).
- **Next action:** reproduce on a copy of the collection (hide a tag type with **Show**, run **Layout → Reset positions**, show the type again), then propose the fix. If the result changes what the user sees, mockup first.

## Ranked work

1. #21 Hidden nodes overlap shown nodes after Reset positions (on `fix/hidden-nodes-overlap`)
2. #22 Nearby nodes cover non-focused titles when zoomed in
3. #23 Threads thumbnails fall back to a loading-screen screenshot
4. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-03 Delete merged and finished branches.** `fix/zoomed-out-links` (local and GitHub) holds only handoff commits; its #25 work merged in #77. The stack 3 branches `fix/graph-links-theme`, `fix/menu-rows`, `fix/covers`, `feat/group-by-state`, `fix/import-phone` and `fix/queue-badges` are still on GitHub after their squash merges (#77–#82). Why: deleting branches needs approval. Blocks: nothing.
- **P-04 Close the UI/UX revamp milestone.** All 33 of its issues are closed after stack 3 merged on 2026-10-24; its description is updated. Why: closing a milestone needs approval. Blocks: nothing.
