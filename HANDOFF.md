# Handoff

## In progress

### feat/map-canvas-redesign

- **Task:** [#93](https://github.com/pomodorozhong/bookmark-router/issues/93), the first of the owner's two PRs split from the local `feat/untangle-connections` working copy: the Map canvas redesign without the Connections view. Created from `main` `138c1ab` on 2026-10-30 with `gh issue develop 93` (linked; the PR closes #93), in the `bookmark-router-redesign` worktree beside the main checkout.
- **PR:** none yet; drafted for the owner's publish approval (P-12).
- **Code checkpoint:** `f83608f` (app) and `692595b` (docs). Built from the final approved tree of `feat/untangle-connections` (`a648786`) with Untangle removed: the Connections canvas, controls, ranking, Preview split, Best next, card split line, queue ranks, Tag nodes, context tag, separate Connections layouts in geometry/backups, the `--color-split` role, and their tests and plan doc. Saved views drop the graph view / tag presentation fields. The three design-history docs were replaced by `docs/map-canvas-redesign.md`.
- **Approval:** P-11 resolved: the owner accepted the Map canvas build on 2026-10-30; recorded on [#93](https://github.com/pomodorozhong/bookmark-router/issues/93#issuecomment-6521779079) and [#90](https://github.com/pomodorozhong/bookmark-router/issues/90#issuecomment-6521779567).
- **Verification (2026-10-30):** after a fresh `npm ci` in the new worktree, `npm run build` and 151 tests pass (the 17 Connections/geometry tests move to the Untangle PR). Headless Chrome on a disposable `127.0.0.1:5318` origin with a converted copy of the 148-bookmark collection passed 46 checks: restore, 116 to triage, no Connections UI, layout and every header menu on screen at 1440/1280/1180/1060/1000/990/900/821/820/600/390/320 px light and 1280/820/390 dark, Done → 115 and Undo → 116, tag-type hiding counted on Tags, Enter saves a view, Reset clears only search, loading the view restores it, Reset… confirms, Agent review opens from the Agent menu with a dark dialog, no uncaught errors. Not checked: real touch input. The temporary profile was deleted; the converted copy sits in the worktree's ignored `app/node_modules/.tmp-verify/` and must be deleted after review. Port 5199 was untouched.
- **Next action:** on P-12 approval, push and open the PR. Then build the Untangle PR branch on top of this one (`feat/untangle-priorities`, `Closes #90`), restoring the final tree of `feat/untangle-connections`.

#### Approval requests

- **P-12 — Open the redesign PR.** Push `feat/map-canvas-redesign` and open its PR against `main` with `Closes #93`. Merging needs its own approval.

### feat/untangle-connections

- **Task:** local working copy (not pushed) holding the accepted combined redesign + Untangle state at `a648786`, in the `bookmark-router-untangle` worktree; its own `HANDOFF.md` has the full history. It is the source for the second PR ([#90](https://github.com/pomodorozhong/bookmark-router/issues/90)); keep it until that PR is built.

## Ranked work

1. [#93 Redesign the graph filter bar so it's clear what each control hides](https://github.com/pomodorozhong/bookmark-router/issues/93): built on `feat/map-canvas-redesign`; awaiting P-12.
2. [#90 Find the best next bookmark to process in a Connections view](https://github.com/pomodorozhong/bookmark-router/issues/90): accepted on `feat/untangle-connections`; becomes the second PR on top of #93.
3. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
4. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
5. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-06 — Clean up merged local branches.** [#91](https://github.com/pomodorozhong/bookmark-router/pull/91), [#92](https://github.com/pomodorozhong/bookmark-router/pull/92), and [#96](https://github.com/pomodorozhong/bookmark-router/pull/96) have merged. Proposed: remove the clean `bookmark-router-highlight-batch` worktree and delete the local and remote `feat/highlight-batch` and `feat/tag-highlight` branches. Deleting needs the user's OK; nothing is blocked by it.
