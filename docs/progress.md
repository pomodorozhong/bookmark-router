# Progress

One line per round of [plan.md](plan.md): what shipped, what is still open.

- **Before the new plan:** import, graph/list, editing, backup/restore, Undo, filters, copy composer, and media are built (history in [product-progress.md](product-progress.md)). Open from the Checkpoint C review: tag types cannot be created; appearance overrides show as a border only or do nothing; the filter UI needs a redesign.
- **Round 0 — October 11, 2026:** `npm run convert` (in `app/`) turns `bookmarks-working.json` into `bookmarks-converted.json` for **Restore backup**: 148 bubbles; 15 Project idea, 6 Proposed idea, and 29 Topic tags; memberships only for decided placements plus each bookmark's proposed topic; other suggestions, link checks, and duplicate groups appear under **From import** in Details. Fixed: blank graph until **Fit graph** after an import, new nodes from a later import placed in a detached line, and a transform error during graph start-up. Open: Raindrop cover images are remote and some do not load (round 1.5 downloads images).
