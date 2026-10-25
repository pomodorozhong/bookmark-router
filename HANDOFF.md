# Handoff

## In progress

### fix/hidden-nodes-overlap

- **Task:** #21 Hidden nodes overlap shown nodes after Reset positions. Branched from `main` `3b4e6bc` (after stack 3, #77–#82) and linked to #21 on GitHub on 2026-10-24.
- **PR:** none.
- **Code checkpoint:** none; no source work started. The branch contains only `docs:` handoff commits.
- **State:** not investigated. Per the issue, **Layout → Reset positions** leaves hidden nodes at their old positions, so peeking or re-shown nodes can overlap shown ones or sit off-screen. The reset lives in `app/src/components/GraphCanvas.tsx` (`resetPositions`). Planning and repository cleanup completed on 2026-10-25: milestone #2 and issues #83–#84 now capture the Agent-assisted imports work after #21; milestone #1 and seven merged branches were removed from the active surface.
- **Verification:** the branch link to #21 and the absence of a PR were verified on GitHub on 2026-10-25. No app checks were run because no app code changed; `git diff --check` passed.
- **Next action:** reproduce on a copy of the collection (hide a tag type with **Show**, run **Layout → Reset positions**, show the type again), then propose the fix. If the result changes what the user sees, mockup first.
- **Pending P-06 — Push the handoff commit.** Approval is needed to push this branch's new `docs:` commit; until then, another computer cannot retrieve the updated ranked work and cleanup state.

## Ranked work

1. #21 Hidden nodes overlap shown nodes after Reset positions (on `fix/hidden-nodes-overlap`)
2. [Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2): #83 Make complete collection imports stageable and atomic, then #84 Submit and review complete collection imports through WebMCP
3. #22 Nearby nodes cover non-focused titles when zoomed in
4. #23 Threads thumbnails fall back to a loading-screen screenshot
5. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
