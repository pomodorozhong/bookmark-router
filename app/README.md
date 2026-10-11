# Bubble & Tag

A local-first app for triaging bookmarks into project ideas. The current plan is [../docs/plan.md](../docs/plan.md); progress is in [../docs/progress.md](../docs/progress.md).

## Run

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5199/. `npm run build` produces a static-hostable `dist/`; `npm run preview` serves it on port 5200. `npm test` checks parsers, data integrity, command revisions, and transactional IndexedDB conflicts. `npm run check` checks TypeScript.

## Triage (round 1)

The collection screen is triage: a queue on the left, the force-directed graph in the middle, and the current bookmark on the right. The graph frames the current bookmark with its groups, highlights bookmarks that share a group, and fades the rest.

- **Decide:** Done (`D`), Drop (`X`), and Deselect (`S`, removes a bookmark from the box selection without deciding it). Each moves to the next bookmark. Tabs follow status outcomes: To triage, Done, Dropped, All.
- **Groups:** remove with ✕ or add with the search (`/`). Reasons from the converted collection show under each group.
- **Select:** drag on empty canvas to box-select (Shift adds, Esc clears). The queue narrows to the selection, ordered clockwise around its center. Two-finger scrolling pans; pinching zooms.
- **Filter** (`F`): text over titles, URLs, descriptions, and group names; group-type toggles; hide decided bookmarks. The filter narrows the graph and the queue.
- **Copy** (`C`): the selection, the current list, or the current bookmark through a template with presets and fields; the template is remembered on this device.
- **Edit** opens the bookmark editor; clicking a tag in the graph opens the tag editor.

Every decision and group change is a revision-checked command with a labeled entry in the per-collection **Undo** (up to 50 actions, kept across reloads). Selection, filter, and graph positions are not undoable. Node positions, existing pins, and the viewport are stored separately from content; Layout → Reset positions clears pins.

Imports, import history, and backup/restore are unchanged from Stage B. Backups bundle local media and restore into new collections. `npm run convert` turns the prototype tracker `bookmarks-working.json` into a restorable backup.

G6 is pinned to 5.1.1.

## Prototype recovery

The old prototype is retained in Git history (`eadbd86`, PR #1); `90c8540` reverts it on the new branch. Pre-existing export edits are preserved in the stash `preserve prototype export edits before replacement` and `/private/tmp/bookmark-prototype-preserved`. Do not apply that stash to the new app; recover it into the old prototype checkout if needed.
