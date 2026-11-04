# Handoff

## In progress

### docs/repair-handoff

- **Checkpoint.** [PR #109](https://github.com/pomodorozhong/bookmark-router/pull/109) merged into `main` as `0296119` on November 2, 2026. It shipped all seven original repair groups and all nine follow-ups, closing the nine linked issues. P-15, P-18, and P-19 are resolved. The individual review branches contain historical checkpoints.
- **Verification.** The merged application tree is identical to the clean build that passed 204 tests. [Main CI](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168641) and [Pages deployment](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168688) succeeded on the merge commit. The in-app browser verified cross-tab deletion, import Undo with and without a manual edit, agent review filters and expansion, D/X on a tag card, desktop zoom, and node selection in both graph views at 390 px. On November 4, 2026, the owner clarified that the compact layout serves narrow viewports and deferred actual-phone use. Physical-phone pinch and tap checks are deferred; narrow desktop layout and pointer checks remain relevant.
- **Local state.** P-21 and P-22 were approved and completed on November 4, 2026. `docs/repair-handoff` is published. The original checkout is clean on current `main`. Both historical Untangle branches were deleted locally, the remote `docs/untangle-plan` was deleted, and the sibling Untangle worktree and its local preview entry were removed. The detached `review-stack` worktree at `a456567` retains its ignored review evidence.
- **Archive.** `.git/archives/untangle-2026-11-04/` in the original repository is a local archive, outside Git commits and remote publication. It contains both branches' complete history in `branches.bundle`, their exact edited files and patches, the built preview, the prior preview configuration, a checksum manifest, and `RESTORE.md`. The archived tips are `7cd8c5f` (`docs/untangle-plan`) and `a648786` (`feat/untangle-connections`). A restore test compared all 115 plan-branch and 134 feature-branch tracked working files and all five preview files. Checksums passed before retirement. Current `docs/untangle.md` and `docs/map-canvas-redesign.md` already cover the useful shipped behavior. Older Trace instructions and CSS remain historical in the archive.
- **Documentation checkpoint.** The published branch contains post-merge corrections at `82b13fc` and the compact-layout scope/ranking update at `7dd44d0`, followed by this cleanup record. [The scope decision is recorded on #99](https://github.com/pomodorozhong/bookmark-router/issues/99#issuecomment-6623912201). Documentation checks passed. Application build/tests were skipped for these documentation and repository-cleanup changes. This branch has no PR and is not linked to an implementation issue. Retain it for later integration through the issue/PR workflow.
- **Next action.** Start from current `main` and draft example responses for [#100](https://github.com/pomodorozhong/bookmark-router/issues/100). The API representation still needs review before implementation. No approval request remains from P-21 or P-22.

## Ranked work

1. [#100 Stored-thumbnail metadata in agent reads](https://github.com/pomodorozhong/bookmark-router/issues/100). Draft example responses and choose useful metadata before implementation.
2. [#101 Default status in custom-status collections](https://github.com/pomodorozhong/bookmark-router/issues/101). Decide how manual and agent creation choose a default when the built-in To triage status is absent.
3. [#110 Side-by-side duplicate review](https://github.com/pomodorozhong/bookmark-router/issues/110). Start with a working mockup before implementation.
4. [#27 Desktop browser cannot reach the local relay from Pages](https://github.com/pomodorozhong/bookmark-router/issues/27). Re-test when the Claude desktop in-app browser's local-network permission behavior changes.
5. [#99 Phone zoom controls](https://github.com/pomodorozhong/bookmark-router/issues/99) and physical-phone gesture checks are deferred until actual-phone use is scheduled. The compact layout remains subject to narrow desktop viewport checks.

## Pending

None.
