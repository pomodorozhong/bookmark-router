# Handoff

## In progress

### feat/highlight-batch

- **Task:** [#94](https://github.com/pomodorozhong/bookmark-router/issues/94) Tag every agent batch by default and highlight it in one click. Branch created from `main` `47bc79c` with `gh issue develop` on 2026-10-26, in the `bookmark-router-highlight-batch` worktree.
- **PR:** none.
- **Code checkpoint:** `5471a41` feat(commands) and `3192eb9` feat(review).
- **Decisions:** mockup option A approved 2026-10-26 and recorded on #94 ([mockup](https://claude.ai/artifact/SntWBMgiUEVhDoF6upgfzq)). The Import tag type has the fixed ID `type:import` and is hidden in the graph by default; a user's own type named Import pushes it to "Import 2". The tag's name and new-tag ID are fixed when the batch arrives. Edit batches tag their additions, or their updates when they add none (the #88 option to also tag updates is gone with the card). Batch tags can't be renamed in review.
- **Verification:** each commit passed `npm ci`, build and tests in a clean detached worktree (140/140 and 143/143). On the `highlight-batch` dev server (port 5315, `localhost` origin with old disposable demo data), through the local agent runtime: the tag chip and dashed "+ Batch tag" are both 32 px tall with 6 px corners; skipping hides the gray line; the toast's Highlight and the applied review's Highlight both set the highlight, and the toast keeps Undo; after Undo the review's Highlight is disabled; a batch without a summary is named by date and time; Show reports the Import type hidden; no horizontal overflow at 375 px.
- **Not yet verified:** the user's review tasks; an agent import in the browser (covered by tests only).
- **Next action:** the user reviews; then draft the PR with the `open-pr` skill.

#### Approval requests

None.

## Ranked work

1. [#94 Tag every agent batch by default and highlight it in one click](https://github.com/pomodorozhong/bookmark-router/issues/94): built on `feat/highlight-batch`; awaiting the user's review and the PR.
2. [#93 Redesign the graph filter bar so it's clear what each control hides](https://github.com/pomodorozhong/bookmark-router/issues/93): filed 2026-10-25 at the user's request; mockup of two or three directions first.
3. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
4. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
5. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
