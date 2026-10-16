# Handoff

## In progress

### docs/handoff-md

- Task: #19 Move the agent handoff into HANDOFF.md
- PR: #20, awaiting review
- Code checkpoint: 8e0f042 feat(agent): add a local relay for browser agents (#15)
- State: `HANDOFF.md` replaces `.agents/next-steps.md`; AGENTS.md carries the `handoff` template from pomodorozhong/skills#11 (`feat/handoff-skill`, awaiting review). `.gitignore` now ignores `.claude/` and `bookmarks-*.json`. `docs/plan.md` and `docs/progress.md` are retired: lasting content moved to `docs/product.md`, `docs/workflow.md`, and `docs/archive/v1-rounds.md`; open items became #21–#23, a note on #16 in Ranked work, or are already covered by #13; the unverified-behavior list was dropped at the user's request.
- Verification: docs-only change; app build and tests not run because no app code changed
- Next action: try the new flow from a fresh session, then re-sync AGENTS.md if the template changes again before pomodorozhong/skills#11 merges

## Ranked work

1. #19 Move the agent handoff into HANDOFF.md (in review)
2. #17 Deploy to GitHub Pages
3. #18 Verify the local agent relay on a live GitHub Pages deployment (after #17)
4. #13 Keep the detail panel's Copy and Edit buttons in one place
5. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
6. #21 Hidden nodes overlap shown nodes after Reset positions
7. #22 Nearby nodes cover non-focused titles when zoomed in
8. #23 Threads thumbnails fall back to a loading-screen screenshot

## Pending

None.
