# Bubble & Tag

A new local-first product, replacing the reverted bookmark prototype. The approved plan is [../docs/product-plan.md](../docs/product-plan.md).

## Run

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5199/. `npm run build` produces a static-hostable `dist/`; `npm run preview` serves it on port 5200. `npm test` checks parsers, data integrity, command revisions, and transactional IndexedDB conflicts. `npm run check` checks TypeScript.

## Current milestone: checkpoint A

The runnable design supports pasted links, CSV/TSV, bookmark HTML, and versioned product JSON; editable column mappings; previews with source rows, duplicate choices, invalid rows, unknown types/statuses, and missing titles; and an in-memory G6 collection preview. Try the bookmark and URL-less reading samples. Search, graph/list navigation, selection, node dragging, fit, zoom buttons, and two-finger panning are available.

**The UI saves nothing yet.** This is the review artifact for import semantics, not the phase-2 usable product. The IndexedDB store and domain commands are implemented and tested separately. Import commit/undo, backup/media restore, editing, persistence integration, layout preferences, advanced filtering/copy, enrichment, and WebMCP remain later milestones.

G6 is pinned to 5.1.1. Memberships have no direction or arrows. Two-finger pinch zoom is supported through Chromium Ctrl-wheel and Safari gesture events; ordinary two-finger scrolling remains panning. Initialization errors appear over the graph; the list remains available. Sample data contains no private bookmarks.

## Prototype recovery

The old prototype is retained in Git history (`eadbd86`, PR #1); `90c8540` reverts it on the new branch. Pre-existing export edits are preserved in the stash `preserve prototype export edits before replacement` and `/private/tmp/bookmark-prototype-preserved`. Do not apply that stash to the new app; recover it into the old prototype checkout if needed.
