# bookmark-router
Organize saved references and track where they belong.

The local UI uses a force-directed graph: one bubble per bookmark, connected to topic, existing-issue, and proposal hubs. Zoom in to reveal titles and source details; select a bubble to review it in the inspector.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
cd app
npm ci
npm run dev
```

Open [Bookmark Router](http://127.0.0.1:5173). The UI and local API run together, bound to loopback. `bookmarks.json` is the source dataset and remains unchanged. The app creates `bookmarks-working.json` from it on first run and saves review changes to that working copy. The working copy is ignored by Git. Set `BOOKMARKS_FILE` to an absolute path to use a different working file:

```sh
BOOKMARKS_FILE=/absolute/path/bookmarks.json npm run dev
```

For a production build served by the local API:

```sh
npm run build
npm start
```

Open [the production app](http://127.0.0.1:4174). `PORT` changes the API port. In development, use matching `PORT` and `API_PORT`, and optionally set `UI_PORT` to change the UI port.

## Review workflow

- Use Filters to choose a queue, topic, destination, or source type. Search covers titles, URLs, notes, tags, and destinations. Compact list navigation offers the same bookmark selection without the canvas.
- Drag bubbles and hubs to pull their neighbors through a live force simulation; pin nodes to keep them fixed during simulation and re-layout. Scroll or use the zoom buttons to reveal detail. Fit changes only the viewport. Select a hub or bubble to show **Fit linked nodes**, which chooses the highest zoom that fits it and its direct connections in the current filtered graph, accounting for full label bounds. Shift-select multiple bubbles for bulk topic approval.
- Approve or revise a topic, choose a disposition and targets, then save the review decision. Changes are staged in the inspector until saved; an unsaved indicator and navigation guard protect the draft.
- Each selected destination has its own placement status, reason, confirmation URL, and date. The app does not post to GitHub. Prepare grouped Markdown under Actions, place it manually, then confirm each placement. Copying a draft does not change completion.
- Review proposals, approve seeds, download issue drafts, and register a created issue through the proposal board. Register other existing issues through Settings. Proposal targets stay pending until their issue is registered.
- Settings offers complete JSON export, validated import preview with explicit replacement, and view-preference reset. Ordinary bookmark saves can be undone through the inspector's history section; audit events remain.

Every bubble and hub has a Progress dropdown: Pending, In progress, Done, or Dropped. Bookmark progress is staged with the inspector draft; hub progress saves immediately. Done drives completion counts, while Dropped has its own queue and count. Bookmark review and placement changes update progress automatically: decided skips become Dropped, kept resources and confirmed duplicates become Done, attachments become Done once all placements are confirmed, and deferred bookmarks remain Pending. Topic approval and other unfinished review work become In progress. A manually edited progress dropdown wins in the same save; later workflow changes can update it again. Notes, titles, tags, favorites, and layout changes preserve it. Hub progress is independent of related bookmarks and GitHub issue or proposal state.

The Progress filter section offers separate Bubble progress and Hub progress checkbox groups; the hub list also has a Progress filter section. Check multiple statuses to include any of them. All four are checked by default; unchecking all hides that node kind. Existing single-status browser preferences carry over. These filters combine with existing filters and save per dataset in this browser. A filtered-out hub does not hide its bubbles, and only connections with two visible endpoints are drawn. Selection, highlighting, and show controls cannot reveal a node excluded by a progress filter. Its inspector remains available, including after its status changes. Clear filters checks all statuses in both groups. The Pending, In progress, Completed, and Dropped queues are grouped under Progress queues.

The hub list's Hub type checkboxes filter graph hubs and both graph bubbles and compact-list bookmarks. A bubble stays visible when at least one of its linked hubs has a checked type; unchecking every type hides all hubs and bubbles. Type filters combine with the other filters, override selection and reveal, and preserve the inspector and focused-hub context. These selections save per dataset; Clear filters and preference resets check all types again.

Node progress is stored in the exported JSON's `node_progress` map, using graph IDs such as `bookmark:ID`, `topic:ID`, `issue:NUMBER`, and `proposal:ID`. Older datasets initialize bookmark progress from their workflow and hubs as Pending on load, without writing the file; the next successful save persists the initialized values. This includes hidden proposals and the generated `topic:unapproved` hub. Bookmark progress changes participate in Undo.

The API validates JSON Schema and cross-record rules, serializes writes, creates backups in `app/backups/`, and replaces the working file atomically. Stale revisions or external disk changes reject the save while the inspector keeps its draft. Reload the dataset, review the retained edits, then explicitly save again. Original CSV fields and historical source observations remain read-only. Canvas positions, pins, layout tuning, selection, and filters are browser preferences, separate from processing decisions.

The graph uses [Sigma](https://www.sigmajs.org/) for WebGL rendering and smooth camera movement, with [Graphology ForceAtlas2](https://graphology.github.io/standard-library/layout-forceatlas2.html) running live physics in a web worker during node dragging. After release, the simulation runs for the configured settle time (3.05 seconds by default) before saving positions and stopping. Pinned nodes stay fixed, and selected nodes are temporarily fixed until deselected. Click a hub row to select it, then click it again to clear selection. Every hub has a hidden connection to a fixed center to contain orphan drift; this anchor is excluded from labels, saved positions, and viewport fitting. Use the graph tuning button to tune repulsion, gravity, damping, settle time, overlap spacing, iterations, edge weights, and Barnes–Hut optimization. Fresh layouts use 5,000 iterations by default and seed the three most-linked hubs evenly around the graph perimeter with their direct links shifted alongside them before live motion begins. These settings are saved per dataset. Hub titles use consistent wrapping and have their own configurable fade thresholds (100–300% by default). Bookmark titles fade in from 100% to 200%, source details from 200% to 300%, bookmark symbols from 500% to 600%, hub badges from 10% to 20%, and hub descriptions from 300% to 350%. Use the eye button above Settings to open Zoom detail tuning and adjust the hidden/full percentages and maximum zoom (620% by default) live; these thresholds are saved per dataset and can be reset. Saved node positions carry over; the older SVG camera resets once when migrating to Sigma. Canvas nodes also have keyboard-accessible selection buttons. Tailwind uses its [Vite integration](https://tailwindcss.com/docs/installation/using-vite).

## Verify

```sh
cd app
npm run build
npm test
npm run format:check
```

Tests cover completion rules, references and duplicate cycles, proposal resolution, stable graph identities and pins, Markdown export, URL normalization, backup/write failures, stale and external edits, undo, and API origin/token protection. Tests use temporary dataset copies. See [the UI plan](web-ui-plan.md) and [approved mockups](docs/mockups/force-directed-review.md) for the design reference.

Changing a primary topic in the inspector previews its new topic links immediately and restarts the live forces. Save Changes persists the edit; discarding the draft restores the saved topic. The proposed lens uses reviewed topic choices when available, falling back to original proposals for unreviewed bookmarks. Tests use a fixed dataset fixture so working-dataset edits do not alter test assumptions.

Bubbles and hubs repel each other using fixed world-space collision envelopes. Zoom changes only the camera and label visibility; it never changes forces or restarts the simulation. Pinned nodes stay fixed. Escape dismisses the active overlay first, then clears selection (with the existing discard check for unsaved inspector edits). The Hub list button above Zoom detail tuning opens search, type/visibility filters, type grouping, and per-hub show/hide and highlight controls; visibility and highlighting save per dataset.
