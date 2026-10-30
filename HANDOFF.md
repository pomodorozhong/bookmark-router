# Handoff

## In progress

### fix/zoomed-label-overlap

- **Task:** [#22](https://github.com/pomodorozhong/bookmark-router/issues/22), nearby nodes cover non-focused titles when zoomed in. Created from `main` `aec6811` on 2026-10-30 with `gh issue develop 22` (linked; the PR closes #22), in the `bookmark-router-redesign` worktree.
- **PR:** none.
- **Code checkpoint:** `aec6811` (no work yet; this branch so far carries only the handoff).
- **Next action:** reproduce on a copy of the collection in both the Tags and Connections views (Connections labels from [#98](https://github.com/pomodorozhong/bookmark-router/pull/98) resolve collisions after motion settles), then mockup first per the workflow.

## Ranked work

1. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22): on `fix/zoomed-label-overlap`.
2. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
3. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-06 — Clean up merged local branches.** [#87](https://github.com/pomodorozhong/bookmark-router/pull/87), [#91](https://github.com/pomodorozhong/bookmark-router/pull/91), [#92](https://github.com/pomodorozhong/bookmark-router/pull/92), [#96](https://github.com/pomodorozhong/bookmark-router/pull/96), [#97](https://github.com/pomodorozhong/bookmark-router/pull/97) and [#98](https://github.com/pomodorozhong/bookmark-router/pull/98) have merged. Proposed:
  - remove the clean `bookmark-router-highlight-batch` worktree;
  - remove the `bookmark-router-untangle` worktree (its only change is an uncommitted `HANDOFF.md`, superseded by this one) and delete the unpushed `feat/untangle-connections`, whose work shipped in #97 and #98;
  - delete the local `feat/propose-import`, `feat/review-batch-tag`, `feat/highlight-batch`, `feat/tag-highlight`, `feat/map-canvas-redesign` and `feat/untangle-priorities` branches, and their remote copies where they still exist;
  - decide on `docs/untangle-plan` (no PR): its plan was condensed into `docs/untangle.md`, but the main checkout holds uncommitted `HANDOFF.md` and `docs/untangle-plan.md` edits on it; look at them before deleting.

  Deleting needs the owner's OK; nothing is blocked by it.
