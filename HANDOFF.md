# Handoff

## In progress

### docs/repair-handoff

- **Checkpoint.** [PR #109](https://github.com/pomodorozhong/bookmark-router/pull/109) merged into `main` as `0296119` on November 2, 2026. It shipped all seven original repair groups and all nine follow-ups, closing the nine linked issues. P-15, P-18, and P-19 are resolved. The individual review branches contain historical checkpoints.
- **Verification.** The merged application tree is identical to the clean build that passed 204 tests. [Main CI](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168641) and [Pages deployment](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168688) succeeded on the merge commit. The in-app browser verified cross-tab deletion, import Undo with and without a manual edit, agent review filters and expansion, D/X on a tag card, desktop zoom, and node selection in both graph views at 390 px. On November 4, 2026, the owner clarified that the compact layout serves narrow viewports and deferred actual-phone use. Physical-phone pinch and tap checks are deferred; narrow desktop layout and pointer checks remain relevant.
- **Local state.** This documentation branch starts at the squash merge. Both older Untangle checkouts and their existing edits remain intact. On November 3, 2026, the owner requested branch cleanup: 19 completed local repair branches and the remote `fix/zoomed-label-overlap` were deleted after checking ancestry, equivalent patches, and the merged tree. The clean label-repair worktree was removed. The `review-stack` worktree is detached at `a456567` so its ignored local review evidence remains available. The review screenshots and the synthetic collection on port 5201 are optional local evidence. The temporary review server was stopped at wrap-up.
- **Documentation checkpoint.** The November 4 wrap-up records the compact-layout scope, reprioritizes the backlog, and retains the November 3 cleanup state and outstanding requests. [The scope decision is recorded on #99](https://github.com/pomodorozhong/bookmark-router/issues/99#issuecomment-6623912201). Only documentation changed. `git diff --check` passed and application build/tests were skipped. The two older Untangle checkouts retain their historical documentation edits. This branch has no PR and is not linked to an implementation issue.
- **Next action.** Start from current `main` and draft example responses for [#100](https://github.com/pomodorozhong/bookmark-router/issues/100). The API representation still needs review before implementation. This branch holds the post-merge handoff and documentation corrections; publishing it remains P-21. Review P-22 before retiring either older Untangle checkout.

#### Approval requests

- **P-21 — Publish the documentation checkpoint.** Push `docs/repair-handoff`, including the post-merge documentation corrections, November 3 cleanup record, and November 4 scope/ranking update, to make the handoff available on another machine. The prior push approval covered the combined repair branch. This request only affects sharing the new documentation branch.

## Ranked work

1. [#100 Stored-thumbnail metadata in agent reads](https://github.com/pomodorozhong/bookmark-router/issues/100). Draft example responses and choose useful metadata before implementation.
2. [#101 Default status in custom-status collections](https://github.com/pomodorozhong/bookmark-router/issues/101). Decide how manual and agent creation choose a default when the built-in To triage status is absent.
3. [#110 Side-by-side duplicate review](https://github.com/pomodorozhong/bookmark-router/issues/110). Start with a working mockup before implementation.
4. [#27 Desktop browser cannot reach the local relay from Pages](https://github.com/pomodorozhong/bookmark-router/issues/27). Re-test when the Claude desktop in-app browser's local-network permission behavior changes.
5. [#99 Phone zoom controls](https://github.com/pomodorozhong/bookmark-router/issues/99) and physical-phone gesture checks are deferred until actual-phone use is scheduled. The compact layout remains subject to narrow desktop viewport checks.

## Pending

- **P-20 resolved.** The owner approved filing only the duplicate-review proposal on November 3, 2026. Filed [#110 Review possible duplicate bookmarks side by side](https://github.com/pomodorozhong/bookmark-router/issues/110), labeled `enhancement`, without a milestone. P-21 remains pending.

- **P-06 resolved for completed branches.** The November 3 cleanup removed all 19 local `fix/*` branches and the remaining remote `fix/zoomed-label-overlap`. The merged `fix/review-followup` remote was already absent. The original Untangle checkouts were retained with their uncommitted changes. Historical Untangle approval requests P-05/P-07/P-11/P-13 and repair requests P-15/P-18/P-19 are obsolete or resolved by merged #97/#98/#109. Physical-phone verification was deferred by the owner's November 4 clarification.

- **P-22 — Retire the preserved Untangle branches after archiving.** Proposed, not yet approved:
  - `docs/untangle-plan` (local and remote): preserve its historical documentation commits, November 4 handoff checkpoint, and the original checkout’s uncommitted `docs/untangle-plan.md` edits in a verified local archive. The automatic membership-layout behavior is already described in `main`’s `docs/untangle.md`. Move only still-useful historical design notes into current docs; treat obsolete Trace and pre-implementation instructions as history. Then switch the original checkout to current `main` and delete the branch locally and remotely.
  - `feat/untangle-connections` (local only): archive the branch history, its uncommitted handoff, and any wanted local preview artifacts before removing its worktree and branch. Implementation shipped through #97/#98. Compared with their combined base `aec6811`, remaining source differences are older CSS; do not merge this historical branch into current `main`.
  - Keep `docs/repair-handoff` until its documentation corrections are published and integrated through the repository’s issue/PR workflow, or the owner explicitly chooses to archive them instead. It contains the post-merge checkpoint `82b13fc` and the November 4 wrap-up; P-21 still covers publication. Cleanup authorization did not authorize publication or discarding these documents.
