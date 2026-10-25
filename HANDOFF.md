# Handoff

## In progress

### feat/atomic-collection-imports

- **Task:** #83 Make complete collection imports stageable and atomic (milestone 2, Agent-assisted imports). Created from `main` `7f633df` with `gh issue develop` and linked to #83 on 2026-10-25.
- **PR:** none.
- **Code checkpoint:** `a912aff` feat(import): stage a complete new-collection import and apply it atomically, on top of `858f1ef` refactor(import): share record cleanup and let commits reuse given IDs. Plan approved 2026-10-25, with one change: declared tags that no bookmark uses are created empty.
- **State:** the milestone gates #83 on approval of #84's Agent Review mockup. Clickable mockup published 2026-10-25 at https://claude.ai/artifact/1en8SttipNPgVzZK2Dd7FZ, built from the original 69-link import in `~/Downloads/bookmark-tag-backup (1).json` (69 bookmarks, 12 tags, 116 tag links, 68 thumbnails). `(2)` is a later restored and edited copy (96 links); don't use it. The build script and thumbnails were in that session's scratchpad only.
- **Verification:** `npm ci`, build and tests in a clean worktree at each commit: 118/118 tests at `858f1ef`, 125/125 at `a912aff`. The real 69-link import staged, saved and undid correctly in a local script (not committed).
- **Mockup:** approved by the user 2026-10-25 and recorded on #84 (comment 6394811164).
- **Next action:** open the PR once approved. After it merges, branch `feat/` for #84 from the new `main`.

#### Approval requests

- Open the #83 PR with the drafted title and body (asked 2026-10-25; not yet answered). The branch is pushed.

## Ranked work

1. [Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2): #83 Make complete collection imports stageable and atomic (on `feat/atomic-collection-imports`), then #84 Submit and review complete collection imports through WebMCP
2. #22 Nearby nodes cover non-focused titles when zoomed in
3. #23 Threads thumbnails fall back to a loading-screen screenshot
4. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
