# Handoff

## In progress

### feat/untangle-priorities

- **Task:** [#90](https://github.com/pomodorozhong/bookmark-router/issues/90), the second of the owner's two PRs: Untangle on top of the merged Map canvas redesign ([#97](https://github.com/pomodorozhong/bookmark-router/pull/97), closed #93). Created from `main` `8029ba2` on 2026-10-30 with `gh issue develop 90` (linked; the PR closes #90), in the `bookmark-router-redesign` worktree.
- **PR:** none yet; drafted for the owner's publish approval (P-13).
- **Code checkpoint:** `528036a` (app) and `47cb211` (docs). The app and tests are the accepted tree of `feat/untangle-connections` (`a648786`), minus CSS that no component uses. The long plan and design-history docs were condensed into `docs/untangle.md`.
- **Verification (2026-10-30):** after a fresh `npm ci`, `npm run build` and 168 tests pass. Headless Chrome on a disposable `127.0.0.1:5318` origin with a converted copy of the 148-bookmark collection passed 85 checks: SCRNSHTS ranked first; 116 bookmarks / 5 clusters; the card states 31 → 19 + 11 with 209 pairs; Best next disabled at the best; Preview split shows 19 and 11 and disables Re-layout; Done → 115 / 6 clusters with Microsoft's 80/20 next; Undo → 116 / 5; Tag nodes keeps the ranking; layout and every header menu on screen in both views at 12 widths light and 3 dark; the redesign's Saved view, Reset, Agent review and dark dialog checks still pass; no uncaught errors. Not checked: real touch input. The profile was deleted; the converted copy in the ignored `app/node_modules/.tmp-verify/` must be deleted after review. Port 5199 was untouched.
- **Next action:** on P-13 approval, push and open the PR. After it merges, `feat/untangle-connections` and its worktree can be removed (add to P-06).

#### Approval requests

- **P-13 — Open the Untangle PR.** Push `feat/untangle-priorities` and open its PR against `main` with `Closes #90`. Merging needs its own approval.

### feat/untangle-connections

- **Task:** local working copy (not pushed) holding the accepted combined redesign + Untangle state at `a648786`, in the `bookmark-router-untangle` worktree; its own `HANDOFF.md` has the full history. It is the source for `feat/untangle-priorities` ([#90](https://github.com/pomodorozhong/bookmark-router/issues/90)); keep it until that PR merges.

## Ranked work

1. [#90 Find the best next bookmark to process in a Connections view](https://github.com/pomodorozhong/bookmark-router/issues/90): built on `feat/untangle-priorities`; awaiting P-13.
2. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
3. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
4. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-06 — Clean up merged local branches.** [#91](https://github.com/pomodorozhong/bookmark-router/pull/91), [#92](https://github.com/pomodorozhong/bookmark-router/pull/92), and [#96](https://github.com/pomodorozhong/bookmark-router/pull/96) have merged. Proposed: remove the clean `bookmark-router-highlight-batch` worktree and delete the local and remote `feat/highlight-batch`, `feat/tag-highlight` and merged `feat/map-canvas-redesign` branches. Deleting needs the user's OK; nothing is blocked by it.
