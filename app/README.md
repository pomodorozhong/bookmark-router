# Bubble & Tag

A new local-first product, replacing the reverted bookmark prototype. The approved plan is [../docs/product-plan.md](../docs/product-plan.md).

## Run

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5199/. `npm run build` produces a static-hostable `dist/`; `npm run preview` serves it on port 5200. `npm test` checks parsers, data integrity, command revisions, and transactional IndexedDB conflicts. `npm run check` checks TypeScript.

## Current milestone: checkpoint B

The import-first usable build saves confirmed imports in IndexedDB. Sources include pasted links, CSV/TSV, Netscape bookmark HTML, and versioned JSON backups. Review field mappings, explicitly exclude invalid rows, resolve unknown statuses/types, and choose Skip, Keep both, or Merge. Confirmation commits the batch atomically.

Bubble/tag editors, tag creation, memberships, independent statuses, graph/list search, import history with conflict-aware undo, collection selection, and full backup/restore are available. Node positions, pins, and viewport are stored separately from content. Dragging does not pin. Use Pin/Unpin in Details; a red dot marks each pinned node. Re-layout preserves pins; confirmed Reset positions clears them. Search hides tags without matching linked bubbles, and Fit graph accounts for the Details overlay.

Backups bundle local media and preserve remote references. Restores create new collections. `fixtures/media-backup.json` contains a harmless bundled image for recovery testing. Bulk media uploads, appearance editing, advanced filters/copy, enrichment, and WebMCP arrive in later stages. See the [review checklist](../docs/product-review-guide.md).

G6 is pinned to 5.1.1. Memberships have no direction or arrows. Two-finger pinch zoom is supported through Chromium Ctrl-wheel and Safari gesture events; ordinary two-finger scrolling remains panning. Initialization errors appear over the graph; the list remains available. Sample data contains no private bookmarks.

## Prototype recovery

The old prototype is retained in Git history (`eadbd86`, PR #1); `90c8540` reverts it on the new branch. Pre-existing export edits are preserved in the stash `preserve prototype export edits before replacement` and `/private/tmp/bookmark-prototype-preserved`. Do not apply that stash to the new app; recover it into the old prototype checkout if needed.
