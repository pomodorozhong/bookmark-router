# Handoff

## In progress

### docs/untangle-plan

- **Task:** document and publish the user's Untangle feature plan, tracked in [#90](https://github.com/pomodorozhong/bookmark-router/issues/90). This documentation branch does not implement the feature.
- **PR:** none. This documentation branch is not linked to an issue because it does not implement the feature.
- **Code checkpoint:** `f3ab37d` on `origin/main`, the squash merge of [#87](https://github.com/pomodorozhong/bookmark-router/pull/87). Created `docs/untangle-plan` locally from that checkpoint on 2026-10-25; no source changes.
- **State:** the user approved P-01, P-02, and P-03 on 2026-10-25. P-01 completed by filing [#90](https://github.com/pomodorozhong/bookmark-router/issues/90); P-02 completed by publishing `docs/untangle-plan` with documentation checkpoint `20aa735`. [The plan](docs/untangle-plan.md) records the chosen Connections view, scoring, preview, and trace behavior. No mockup or implementation has started. The two batch-follow-up requests were filed as [#88](https://github.com/pomodorozhong/bookmark-router/issues/88) and [#89](https://github.com/pomodorozhong/bookmark-router/issues/89). P-03 is approved but its normal-browser condition remains unverified; see Pending.
- **Verification:** documentation whitespace and relative Markdown links were checked; the root `AGENTS.md` handoff block matches the current skill template and was left unchanged. Application build/tests were skipped because only Markdown changed; they remain required for implementation and its PR.
- **Prior branch cleanup:** [#84](https://github.com/pomodorozhong/bookmark-router/issues/84) closed through merged [#87](https://github.com/pomodorozhong/bookmark-router/pull/87), so its in-progress subsection and obsolete PR approvals were removed. The prior local handoff edits' implementation approval is already retained in [the issue's review note](https://github.com/pomodorozhong/bookmark-router/issues/84#issuecomment-6395953180); the outstanding normal-browser check is retained in Ranked work.
- **Next action:** deliver the clickable mockup for [#90](https://github.com/pomodorozhong/bookmark-router/issues/90) and obtain approval before implementation.

#### Approval requests

None. The approved documentation push completed; no PR creation or merge was authorized.

## Ranked work

1. Hand-check the deployed agent import flow in a normal browser, including the local network access prompt: outstanding reviewer follow-up from merged [#87](https://github.com/pomodorozhong/bookmark-router/pull/87). The prior scripted Pages check granted access through the debugging protocol. Use a disposable collection and do not disturb the user's real browser collection or pending agent batch.
2. [#22 Nearby nodes cover non-focused titles when zoomed in](https://github.com/pomodorozhong/bookmark-router/issues/22)
3. [#23 Threads thumbnails fall back to a loading-screen screenshot](https://github.com/pomodorozhong/bookmark-router/issues/23)
4. [#27 The Claude desktop in-app browser can't reach the local relay from the Pages site](https://github.com/pomodorozhong/bookmark-router/issues/27) (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)
5. [#88 Add a batch tag to bookmarks in Agent review](https://github.com/pomodorozhong/bookmark-router/issues/88)
6. [#89 Highlight bookmarks by tag while keeping the graph visible](https://github.com/pomodorozhong/bookmark-router/issues/89)
7. [#90 Find the best next bookmark to process in a Connections view](https://github.com/pomodorozhong/bookmark-router/issues/90): direction documented; clickable mockup approval comes before implementation.

## Pending

### P-03 — Close Agent-assisted imports after its browser follow-up (approved)

- **Proposed action:** after the normal-browser follow-up in Ranked work is verified, close [milestone 2, Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2).
- **Approval:** granted by the user on 2026-10-25. No further closure approval is needed once the browser follow-up passes.
- **Execution:** the milestone is open with zero open issues, but the normal-browser/local-network-prompt follow-up remains unverified. This chat exposes only the in-app browser and MCP Apps; no normal Chrome or Arc session is connected. The earlier in-app WebMCP checks do not verify that browser permission prompt.
- **Next action:** verify the deployed relay flow in a normal browser with a disposable collection, record the result, then close milestone 2 under the approval already granted. This condition blocks closure, not independent feature planning.
