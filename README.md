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

Open [Bookmark Router](http://127.0.0.1:5173). The UI and local API run together, bound to loopback. `bookmarks.json` in the repository is the default working dataset. Set `BOOKMARKS_FILE` to an absolute path to use another file:

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
- Drag to arrange bubbles and hubs; pin them to preserve their positions during explicit re-layout. Scroll or use the zoom buttons to reveal detail. Fit changes only the viewport. Shift-select multiple bubbles for bulk topic approval.
- Approve or revise a topic, choose a disposition and targets, then save the review decision. Changes are staged in the inspector until saved; an unsaved indicator and navigation guard protect the draft.
- Each selected destination has its own placement status, reason, confirmation URL, and date. The app does not post to GitHub. Prepare grouped Markdown under Actions, place it manually, then confirm each placement. Copying a draft does not change completion.
- Review proposals, approve seeds, download issue drafts, and register a created issue through the proposal board. Register other existing issues through Settings. Proposal targets stay pending until their issue is registered.
- Settings offers complete JSON export, validated import preview with explicit replacement, and view-preference reset. Ordinary bookmark saves can be undone through the inspector's history section; audit events remain.

The API validates JSON Schema and cross-record rules, serializes writes, creates backups in `app/backups/`, and replaces the working file atomically. Stale revisions or external disk changes reject the save while the inspector keeps its draft. Reload the dataset, review the retained edits, then explicitly save again. Original CSV fields and historical source observations remain read-only. Canvas positions, pins, selection, and filters are browser preferences, separate from processing decisions.

The graph uses [D3 force simulation](https://d3js.org/d3-force/simulation) to compute a reproducible, settled layout. React renders the accessible SVG surface; simulation does not run continuously or restart on filtering, selection, or saves. Tailwind uses its [Vite integration](https://tailwindcss.com/docs/installation/using-vite).

## Verify

```sh
cd app
npm run build
npm test
npm run format:check
```

Tests cover completion rules, references and duplicate cycles, proposal resolution, stable graph identities and pins, Markdown export, URL normalization, backup/write failures, stale and external edits, undo, and API origin/token protection. Tests use temporary dataset copies. See [the UI plan](web-ui-plan.md) and [approved mockups](docs/mockups/force-directed-review.md) for the design reference.
