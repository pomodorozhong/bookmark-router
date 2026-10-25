# Handoff

## In progress

### docs/untangle-plan

- **Task:** document the user's Untangle feature plan and wrap up; no feature issue filed. The complete issue draft is P-01 below.
- **PR:** none. This documentation branch is not linked to an issue because it does not implement the feature.
- **Code checkpoint:** `f3ab37d` on `origin/main`, the squash merge of [#87](https://github.com/pomodorozhong/bookmark-router/pull/87). Created `docs/untangle-plan` locally from that checkpoint on 2026-10-25; no source changes.
- **State:** the user selected the feature direction and asked to save the plan. [The plan](docs/untangle-plan.md) records the separate Connections view, shared-tag links, bridge-removal scoring, scoped analysis, ranked queue, automatic next bookmark after a successful Done/Drop, on-demand preview, and step-by-step trace. No mockup or implementation has started. The docs index links the plan.
- **Verification:** `git diff --check` passed; all 13 relative Markdown links across the plan, index, and handoff resolve; the root `AGENTS.md` handoff block matches the current skill template and was left unchanged. Application build/tests were skipped because only Markdown changed; they remain required for implementation and its PR.
- **Prior branch cleanup:** [#84](https://github.com/pomodorozhong/bookmark-router/issues/84) closed through merged [#87](https://github.com/pomodorozhong/bookmark-router/pull/87), so its in-progress subsection and obsolete PR approvals were removed. The prior local handoff edits' implementation approval is already retained in [the issue's review note](https://github.com/pomodorozhong/bookmark-router/issues/84#issuecomment-6395953180); the outstanding normal-browser check is retained in Ranked work.
- **Next action:** obtain P-02 approval to push this documentation checkpoint. For the feature, resolve P-01, then deliver the clickable mockup for approval before implementation.

#### Approval requests

- **P-02 — Push `docs/untangle-plan`.** Publish only this documentation branch's plan, index, and handoff commit; no PR creation or merge. Requested at wrap-up on 2026-10-25. Approval is required by the repository's push rule; until then the checkpoint exists only on this computer.

## Ranked work

1. Hand-check the deployed agent import flow in a normal browser, including the local network access prompt: outstanding reviewer follow-up from merged [#87](https://github.com/pomodorozhong/bookmark-router/pull/87). The prior scripted Pages check granted access through the debugging protocol. Use a disposable collection and do not disturb the user's real browser collection or pending agent batch.
2. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
3. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
4. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

### P-01 — File the Untangle feature issue

- **Proposed action:** file the complete draft below, with label `enhancement` and no milestone. Requested 2026-10-25. The user authorized planning and documentation, not filing a new issue; the repository requires approval before filing.
- **Blocks:** creating the feature work item and recording mockup approval on it before implementation. Feature behavior has been chosen; there are no unanswered product questions in this draft. The mockup still needs approval.
- **Title:** Find the best next bookmark to process in a Connections view
- **Labels:** `enhancement`
- **Milestone:** none

**Draft issue body:**

Bookmark triage currently shows bookmarks attached to tags, but the user must inspect the graph to decide where to start. Add **Untangle**, a Vax!-inspired Connections view that shows bookmark-to-bookmark relationships and calculates a useful next bookmark to process.

Use existing shared tags to connect bookmarks. On To triage, analyze the current search, filters, selection, and shown tag types. Recommend the bookmark whose removal separates the most pairs of other remaining bookmarks; break ties by direct connections removed, then oldest creation date and stable ID. When no removal can split a cluster, recommend the most connected bookmark and explain that limitation. Rank the queue using the same calculation.

Offer an on-demand impact preview showing the clusters that would remain, plus a step-by-step trace through shared-tag connections. Processing uses the existing Done/Drop action for only the current bookmark; after a successful save, recalculate and automatically open the new Best next. Failed saves do not advance, and Undo restores the network. Keep each graph's layout and pins separate and preserve backup compatibility.

Acceptance: a bridge must outrank a more highly connected non-bridge; previewed cluster sizes must match the result after processing; filters and hidden tag types must change the calculation consistently; trace layers must match hop distances; dense groups and isolated bookmarks must remain usable. Verify failed saves, Undo, queue/keyboard/copy order, independent layouts, backup/restore, and desktop and phone layouts.

The user chose the direction on 2026-10-25. The complete decision record and verification plan are in `docs/untangle-plan.md` on `docs/untangle-plan` (local until P-02 is approved). First deliver a working clickable mockup using a disposable copy of the real collection; record its approval here before implementation. After implementation, offer three review tasks: preview and process a bridge, trace its shared-tag connections, then use Undo and filters to inspect recalculation. Run fresh `npm ci`, `npm run build`, and `npm test` in a clean worktree before the PR.

### P-03 — Close the completed Agent-assisted imports milestone after its browser follow-up

- **Proposed action:** after the normal-browser follow-up in Ranked work is verified, close [milestone 2, Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2).
- **Reason:** both feature issues are closed, but the milestone is still open as of 2026-10-25. Existing authorization does not explicitly cover closing it, and the browser follow-up remains outstanding.
- **Blocks:** marking the milestone complete; independent Untangle planning can continue.
