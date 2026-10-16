# Handoff

## In progress

### docs/handoff-md

- Task: #19 Move the agent handoff into HANDOFF.md
- PR: #20, awaiting review
- Code checkpoint: 8e0f042 feat(agent): add a local relay for browser agents (#15)
- State: `HANDOFF.md` replaces `.agents/next-steps.md`; AGENTS.md carries the `handoff` template from pomodorozhong/skills#11 (`feat/handoff-skill`, awaiting review). `.gitignore` now ignores `.claude/` and `bookmarks-*.json`. `docs/plan.md` and `docs/progress.md` are retired: lasting content moved to `docs/product.md`, `docs/workflow.md`, and `docs/archive/v1-rounds.md`; open items became issue drafts P-01–P-04 below, a note on #16 in Ranked work, or are already covered by #13.
- Verification: docs-only change; app build and tests not run because no app code changed
- Next action: try the new flow from a fresh session, then re-sync AGENTS.md if the template changes again before pomodorozhong/skills#11 merges

## Ranked work

1. #19 Move the agent handoff into HANDOFF.md (in review)
2. #17 Deploy to GitHub Pages
3. #18 Verify the local agent relay on a live GitHub Pages deployment (after #17)
4. #13 Keep the detail panel's Copy and Edit buttons in one place
5. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)

## Pending

Issue drafts from the retired `docs/progress.md` open items. Why: filing issues needs approval. Each blocks only its own tracking.

- **P-01** File issue "Verify remaining behavior on real devices and data". Labels: `question`. Body:
  > Some accepted behavior was checked only in emulation or with data that lacks the case. Verify each on real hardware or suitable data, and record results here.
  >
  > - Agent review on a real touch device (checked only at measured 390 and 320 px widths).
  > - The local agent relay against the real collection at `127.0.0.1:5199` (verified only on a disposable `127.0.0.1:5201` origin). Ask before connecting it to the real collection.
  > - The system clipboard for Copy, and the Custom color swatch's system picker.
  > - Group selection's cluster-edge start on a lopsided group; the 90° empty-ring threshold may need adjusting.
  > - Import filters with a collection that has import batches (the converted test collection has none).
  >
  > Done when each item is checked or split into its own issue.
- **P-02** File issue "Hidden nodes overlap shown nodes after Reset positions". Labels: `bug`. Body:
  > Hidden nodes keep their positions during **Layout → Reset positions**, so peeking or re-shown nodes can overlap shown nodes or sit off-screen.
  >
  > Done when nodes hidden during a reset land in free space and stay on-screen when shown again.
- **P-03** File issue "Nearby nodes cover non-focused titles when zoomed in". Labels: `bug`. Body:
  > When zoomed in, titles of non-focused bookmarks can be partly covered by nearby nodes. Zooming above 60% also still stutters slightly; the user accepted the remaining high-zoom panning cost, so this issue is about the covered titles.
  >
  > Done when non-focused titles stay readable at high zoom without making panning slower.
- **P-04** File issue "Threads thumbnails fall back to a loading-screen screenshot". Labels: `bug`. Body:
  > The live Threads example falls back to a screenshot of its loading/landing screen after Microlink's image fails during resizing. See `docs/thumbnails.md#implementation-and-verification`.
  >
  > Done when a Threads bookmark gets a real preview image, or the lookup reports the failure instead of storing the loading screen.
