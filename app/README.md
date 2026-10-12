# Bookmark & Tag

A local-first app for triaging bookmarks into project ideas. The current plan is [../docs/plan.md](../docs/plan.md); progress is in [../docs/progress.md](../docs/progress.md).

Rounds 0–3 are approved as of October 12, 2026. Round 1.5 was skipped because the user's local fetcher works; round 4 (WebMCP) is next. Completed plans and reviews are in [the documentation archive](../docs/archive/README.md).

## Run

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5199/. `npm run build` produces a static-hostable `dist/`; `npm run preview` serves it on port 5200. `npm test` checks parsers, data integrity, command revisions, and transactional IndexedDB conflicts. `npm run check` checks TypeScript.

## Triage

The collection screen is triage: a queue on the left, the force-directed graph in the middle, and the current bookmark on the right. The graph frames the current bookmark with its groups, highlights bookmarks that share a group, and fades the rest.

- **Decide:** Done (`D`), Drop (`X`), and Deselect (`S`, removes a bookmark from the box selection without deciding it). Each moves to the next bookmark. Tabs follow status outcomes: To triage, Done, Dropped, All, and filter both the graph and the queue. J/K or the arrow keys move through the queue and wrap at either end.
- **Groups:** remove with ✕ or add with the search (`/`). Reasons from the converted collection show under each group.
- **Select:** drag on empty canvas to box-select (Shift adds, Esc clears). The queue narrows to the selection, ordered clockwise around its center. Two-finger scrolling pans; pinching zooms.
- **Filter** (`F` focuses search): text over titles, URLs, descriptions, and group names. **Show** holds tag types, Empty groups, and Ungrouped bookmarks. **Filters** adds Status, Group, Domain, Has (image/description/warning/no group), Import, and Added month rules, with counted values and Not. Rules combine with AND, values with OR; filters narrow the graph and queue.
- **Saved filters:** save rules and search by name, apply one, or delete it with Undo. Queue tabs and Show settings are separate. Older saved filters using advanced rules cannot be applied from this UI.
- **Copy** (`C`): the selection, the current list, or the current bookmark through a template with presets and fields; the template is remembered on this device.
- **Edit** opens the current bookmark's editor.
- **Issues and tags:** clicking a tag selects its bookmarks and opens its issue view: type, status, link, rendered description, and bookmarks with membership reasons. **Edit** opens the tag editor; its collapsed **Appearance** section previews overrides. **Tag types…** creates and edits types with inherited appearance. Tag styles (price, rounded, shipping, hang) point in eight directions; titles stay below tags.
- **Hidden groups:** groups of a hidden type linked to the current bookmark peek with faded fills and dashed outlines/links, alongside their matching bookmarks. Their saved positions stay fixed.
- **Pin/Unpin:** beside Copy and Edit for bookmarks and tags. Pins survive tab changes and reloads. Switching tabs re-lays out shown nodes and hides empty groups; **Layout → Reset positions** clears pins.
- **Header:** the collection menu (logo and name) switches, creates, or deletes collections; **⋯** holds Add bookmark (Import), Add tag, Tag types, Import history, Download backup, Restore backup, and Delete this collection. Deletion offers a backup and requires confirmation. There is no sidebar; Import has a Back link.
- **Graph toolbar:** Queue (`Q`) toggles the queue beside the filter bar. The bottom toolbar floats over the graph with Layout, Center (current bookmark), Whole collection, and zoom controls. No bookmark is current until one is picked.

Every decision and group change is a revision-checked command with a labeled entry in the per-collection **Undo** (up to 50 actions, kept across reloads). Undo is in the header and saved-change toasts. Selection, active filters, and graph positions are not undoable; saved-filter changes are. Node positions, pins, and the viewport are stored separately from content.

Imports, import history, and backup/restore are unchanged from Stage B. Backups bundle local media and restore into new collections. `npm run convert` turns the prototype tracker `bookmarks-working.json` into a restorable backup. `npm run upgrade-backup -- old.json` turns a backup from before the rename (Bubble & Tag, format `bubble-tag` version 1) into one this app restores, written next to it as `old-bookmark-tag.json`.

G6 is pinned to 5.1.1.

## Current limitations

WebMCP, archive/unarchive, and individual record deletion are not implemented. Add bookmark opens Import. Media-upload and bulk-status dialogs are frozen; backup/restore still supports existing local media. The compact UI does not expose the domain engine's distance, same-group, linked-tag-status, or nested filter rules.

The filter bar can wrap below about 1150 px with the queue open, and the phone header is crowded. Some remote covers fail to load; non-focused graph titles can overlap nodes, and zooming above 60% may stutter. See [open items](../docs/progress.md#open-items) for verification gaps and remaining graph issues.

## Prototype recovery

The old prototype is retained in Git history (`eadbd86`, PR #1); `90c8540` reverts it on the new branch. Pre-existing export edits are preserved in the stash `preserve prototype export edits before replacement` and `/private/tmp/bookmark-prototype-preserved`. Do not apply that stash to the new app; recover it into the old prototype checkout if needed.
