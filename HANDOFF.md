# Handoff

## In progress

### docs/agents-handoff-sync

- **Task:** #29 Sync AGENTS.md's handoff block with the handoff skill. Branch linked to the issue.
- **PR:** not opened yet.
- **Code checkpoint:** none; docs only.
- **State:** the block between the `handoff` markers in `AGENTS.md` matches the skill's current template exactly, and nothing outside the markers changed. The stale `fix/detail-panel-bar` subsection (#28 merged) is removed.
- **Verification:** the marked block diffs clean against the template; the rest of `AGENTS.md` diffs clean against `main`. Build and tests not run, since only Markdown changed.
- **Pending P-05:** push `docs/agents-handoff-sync` and open its PR (closes #29). Needs push approval. Blocks review.
- **Next action:** after P-05, the user reviews and merges; the next session removes this subsection.

## Ranked work

1. #29 Sync AGENTS.md's handoff block with the handoff skill (awaiting review)
2. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
3. #25 Links between nodes disappear when zoomed out
4. #21 Hidden nodes overlap shown nodes after Reset positions
5. #22 Nearby nodes cover non-focused titles when zoomed in
6. #23 Threads thumbnails fall back to a loading-screen screenshot
7. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
