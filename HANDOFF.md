# Handoff

## In progress

### docs/repair-handoff

- **Checkpoint.** [PR #109](https://github.com/pomodorozhong/bookmark-router/pull/109) merged into `main` as `0296119` on November 2, 2026. It shipped all seven original repair groups and all nine follow-ups, closing the nine linked issues. P-15, P-18, and P-19 are resolved. The individual review branches contain historical checkpoints.
- **Verification.** The merged application tree is identical to the clean build that passed 204 tests. [Main CI](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168641) and [Pages deployment](https://github.com/pomodorozhong/bookmark-router/actions/runs/41447168688) succeeded on the merge commit. The in-app browser verified cross-tab deletion, import Undo with and without a manual edit, agent review filters and expansion, D/X on a tag card, desktop zoom, and node selection in both graph views at 390 px. Physical two-finger pinch still needs a device check.
- **Local state.** This documentation branch starts at the squash merge. The owner chose to retain both older Untangle worktrees with their existing edits. The review screenshots and the synthetic collection on port 5201 are optional local evidence. The temporary review server was stopped at wrap-up.
- **Next action.** Resume application work from `main`. This branch holds the post-merge handoff and documentation corrections.

#### Approval requests

- **P-21 — Publish the documentation checkpoint.** Push `docs/repair-handoff` to make this post-merge handoff available on another machine. The prior push approval covered the combined repair branch. This request only affects sharing the new documentation branch.

## Ranked work

1. Check two-finger pinch and tapping beside a label on a physical phone in **Tags** and **Connections**. Both views passed touch emulation and phone-width selection checks.
2. Re-test the deployed relay connection when the Claude desktop in-app browser's local-network permission behavior changes. [#27 Desktop browser cannot reach the local relay from Pages](https://github.com/pomodorozhong/bookmark-router/issues/27)
3. Deferred features available for scheduling are [#99 Phone zoom controls](https://github.com/pomodorozhong/bookmark-router/issues/99), [#100 Stored-thumbnail metadata in agent reads](https://github.com/pomodorozhong/bookmark-router/issues/100), and [#101 Default status in custom-status collections](https://github.com/pomodorozhong/bookmark-router/issues/101).

## Pending

- **P-20 — File the duplicate-review proposal.** Filing requires the owner's approval. This would track the proposed feature for later scheduling. It does not block any repair.
  - **Issue title:** Review possible duplicate bookmarks side by side
  - **Label:** `enhancement`. **Milestone:** none.
  - **Issue body:** Conversion currently turns suggested duplicate groups into text notes. The 148-bookmark test collection contains two pairs. Preserve candidate IDs during conversion and offer a comparison of URLs, titles, notes, tags and status. **Keep both** dismisses the suggestion. **Keep this copy** previews missing tags to carry over and marks the other bookmark Dropped in one undoable action. Start with the two known pairs and exact duplicate URLs. For older backups, have the reviewer identify the other bookmark when a note is ambiguous. Before implementation, review a working mockup on a copy of the collection. Verify both choices, preservation of notes and memberships, and Undo.
