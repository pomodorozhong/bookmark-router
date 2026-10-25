# Handoff

## In progress

### docs/untangle-plan

- **Task:** document and publish the user's Untangle feature plan, tracked in [#90](https://github.com/pomodorozhong/bookmark-router/issues/90). This documentation branch does not implement the feature.
- **PR:** none. This documentation branch is not linked to an issue because it does not implement the feature.
- **Code checkpoint:** `f3ab37d` on `origin/main`, the squash merge of [#87](https://github.com/pomodorozhong/bookmark-router/pull/87). Created `docs/untangle-plan` locally from that checkpoint on 2026-10-25; no source changes.
- **State:** the user approved P-01, P-02, and P-03 on 2026-10-25. P-01 completed by filing [#90](https://github.com/pomodorozhong/bookmark-router/issues/90); P-02 completed by publishing `docs/untangle-plan` with documentation checkpoint `20aa735`. [The plan](docs/untangle-plan.md) records the chosen Connections view, scoring, preview, and trace behavior. No mockup or implementation has started. The two batch-follow-up requests were filed as [#88](https://github.com/pomodorozhong/bookmark-router/issues/88) and [#89](https://github.com/pomodorozhong/bookmark-router/issues/89). P-03 is resolved: on 2026-10-25 the user hand-checked the deployed agent import flow in a normal browser and closed milestone 2 themselves.
- **Verification:** documentation whitespace and relative Markdown links were checked; the root `AGENTS.md` handoff block matches the current skill template and was left unchanged. Application build/tests were skipped because only Markdown changed; they remain required for implementation and its PR.
- **Prior branch cleanup:** [#84](https://github.com/pomodorozhong/bookmark-router/issues/84) closed through merged [#87](https://github.com/pomodorozhong/bookmark-router/pull/87), so its in-progress subsection and obsolete PR approvals were removed. The prior local handoff edits' implementation approval is already retained in [the issue's review note](https://github.com/pomodorozhong/bookmark-router/issues/84#issuecomment-6395953180); the user later completed the normal-browser check.
- **Next action:** after the `stack/batch-tag-highlight` PRs are published, deliver the clickable mockup for [#90](https://github.com/pomodorozhong/bookmark-router/issues/90) and obtain approval before implementation.

#### Approval requests

None. The approved documentation push completed; no PR creation or merge was authorized.

### stack/batch-tag-highlight

- **Task:** two independent PRs built on one local stack branch with the `propose-stack` skill, in the `bookmark-router-batch-tag-highlight` worktree: [#91](https://github.com/pomodorozhong/bookmark-router/pull/91) (`feat/review-batch-tag`) closes [#88](https://github.com/pomodorozhong/bookmark-router/issues/88), and [#92](https://github.com/pomodorozhong/bookmark-router/pull/92) (`feat/tag-highlight`) closes [#89](https://github.com/pomodorozhong/bookmark-router/issues/89). Each targets `main` and squash-merges on its own.
- **PR:** #91 at `748156a` and #92 at `88297ca`, opened 2026-10-25 with the user's approval. Both awaiting review and merge; CI passed on both.
- **Code checkpoint:** base `f3ab37d` on `origin/main`. Stack tip `ff72bed` (local only). Working files (PR map, bodies, review) are in `.agents/propose-stack/batch-tag-highlight/` in that worktree.
- **Decisions:** `tag.create` takes an optional caller-supplied `id`; in an edit batch the batch tag covers additions, optionally the updated bookmarks too; the highlight is tab-session only, with a device-remembered **Fade the rest**. The user's review feedback was folded into #92: a glow three times as wide, no diamond marker, and Highlight as the last segment of the joined filter box.
- **Verification:** trial rebuilds from `f3ab37d` with a fresh `npm ci` passed (#91: build passed and 138/138 tests passed; #92: build passed and 133/133). Published trees matched the trial trees. Headless Chrome on the stack with a disposable collection copy covered both flows at desktop and 390 px. Reviewer follow-up: the "You try" steps in each PR body, in a normal browser.
- **Next action:** the user reviews and merges #91 and #92 (merge needs their approval). Once both merge, delete the local stack branch, the worktree, and the working files with the user's OK, and remove this subsection.

#### Approval requests

- Deleting the local stack branch, the `bookmark-router-batch-tag-highlight` worktree, and the working files after merge (not yet asked).

## Ranked work

1. [#88](https://github.com/pomodorozhong/bookmark-router/issues/88) and [#89](https://github.com/pomodorozhong/bookmark-router/issues/89): PRs [#91](https://github.com/pomodorozhong/bookmark-router/pull/91) and [#92](https://github.com/pomodorozhong/bookmark-router/pull/92) await review and merge.
2. Follow-up once #88 and #89 both merge: after applying an agent batch with a batch tag, offer a one-click "Highlight this batch" shortcut. File it as an issue when the user approves.
3. [#90 Find the best next bookmark to process in a Connections view](https://github.com/pomodorozhong/bookmark-router/issues/90): direction documented; clickable mockup approval comes before implementation.
4. [#93 Redesign the graph filter bar so it's clear what each control hides](https://github.com/pomodorozhong/bookmark-router/issues/93): filed 2026-10-25 at the user's request; mockup of two or three directions first.
5. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
6. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
7. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
