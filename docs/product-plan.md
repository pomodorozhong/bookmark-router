# Build an import-first bubble-and-tag product with G6

## 1. Foundation and architecture

Build a new general-purpose app for collecting items, organizing them with tags, and processing them through a force-directed graph.

- Revert the prototype squash merge on a fresh branch and build the new app in `app/`. Preserve the prototype in Git history and preserve its uncommitted changes separately.
- Use React, TypeScript, Vite, Tailwind, and npm. Pin **`@antv/g6` to `5.1.1`**, the version successfully tested in the disposable demo. Do not add Sigma, Graphology, or ForceAtlas2 to the new app.
- Deliver a static-hostable app with browser-local workspaces and media. No accounts, sync, or collaboration in v1.
- Use IndexedDB for content and uploaded media, with transactions, schema migrations, and revision checks to prevent conflicting writes between tabs.
- Share domain commands and validation across UI, imports, enrichment, and optional WebMCP. G6 is a rendering and interaction adapter, not the source of truth.
- Store graph positions, pins, viewport, and view preferences separately from content. Moving a node must not change content revisions.
- Run import parsing and expensive distance/filter calculations in workers. Start G6 force simulation with the tested configuration on the main thread; do not assume a worker layout preserves force-drag behavior.

### Minimal data model

| Entity | Fields and behavior |
|---|---|
| Bubble | ID, title, description, optional URL, optional primary media asset, status |
| Tag | ID, name, optional description and URL, optional type, status, appearance overrides |
| Tag type | ID, name, default appearance |
| Status | ID, label, color, outcome category |
| Membership | Unique bubble–tag connection |
| Saved view | Name, nested filter rules, sort order, tag-display settings |
| Workspace | Entities, settings, saved views, schema version |
| Import batch | Source summary, committed record IDs, and information needed for undo |

Internal revisions, timestamps, and extraction bookkeeping support recovery without complicating the user-facing model.

Bubbles support one primary image, video, or audio asset, separate from their URL. Media can be uploaded or referenced remotely. Tags have at most one type; untyped tags are allowed. Memberships are **undirected and bubble–tag only**.

Start with Pending, In progress, Done, and Dropped. Users can customize statuses; active, completed, and discarded outcome categories support counts. Removing an assigned status requires reassignment.

## 2. Importing is the first complete workflow

The first usable build supports **import → review → confirm → organize in graph or list**. Metadata extraction and agents must never block importing.

### Sources and import screen

Include pasted URLs, CSV, TSV, Netscape bookmark HTML, and the product’s versioned JSON format. Prototype-schema migration is outside v1. Bulk media uploads arrive with the full editor in Phase 3.

Use four steps:

1. **Select or paste:** detect format and show record count.
2. **Map fields:** map title, description, URL, media URL, status, tags, and tag type. Show sample records and an explicit delimiter for tag columns.
3. **Review:** show records, unrecognized URL warnings, malformed rows, duplicate candidates, and tags/types/statuses to create.
4. **Confirm:** commit the reviewed records transactionally and open the imported collection in graph or list.

Allow common tags and an initial status for the entire import. Unknown statuses and tag types require mapping or explicit creation.

### Import behavior and recovery

- Allow URL-less records. Missing titles fall back to URL, filename, or “Untitled”; track the missing supplied title separately for enrichment.
- Detect repeated source rows and duplicate URLs within the import and existing workspace.
- Default to skipping duplicate URLs. Offer Keep both or Merge, with an exact field preview before overwriting existing values.
- Use conservative URL matching; preserve parameters that identify content.
- Preserve unrecognized bubble/tag URLs as text and visually distinguish them; do not block import or editing. Only valid HTTP(S) values become clickable links. Detect duplicate unrecognized values by exact text. Malformed rows and invalid media URLs still require explicit exclusion, with source row numbers and reasons.
- Canceling a preview changes nothing. Revalidate if the workspace changes before confirmation.
- Prevent duplicate submission. Commit before starting optional extraction; failed enrichment leaves usable records.
- Associate committed records with their import batch.
- Support import undo, including restoration of merged values. Preview conflicts if affected records have subsequently changed; never silently overwrite later edits.
- Report completion counts and actionable failures. Transaction or quota failures must leave no partially committed batch.

Provide backup and restore in this first usable build. Full backups bundle uploaded media, appearance, statuses, memberships, saved views, and layout preferences. Restore into a new workspace by default. Identify remote media as references rather than bundled files.

## 3. G6 workspace and processing tools

### Tested G6 baseline

Use the disposable demo’s working configuration:

- `d3-force` layout with **`layout.animation: true`**, needed for visible simulation updates during force dragging. Disable ordinary transition animation separately.
- `drag-element-force` with no modifier required and `fixed: false`: dragging pulls connected neighbors without pinning. Pin/Unpin in Details explicitly controls saved pins. Stage B uses a red dot; Stage B.1 replaces it with a flat red vector pushpin anchored into the upper-right node contour, as specified in the [UI improvement plan](ui-improvement-plan.md).
- `scroll-canvas` for two-finger trackpad panning, with sensitivity `1`. Exclude Ctrl-wheel events from panning.
- Begin with the tested force values: link distance `120`, link strength `0.45`, many-body strength `-250`, alpha decay `0.035`, and velocity decay `0.45`. Calculate collision radius from rendered node size plus label clearance.
- Render membership edges without arrows. Directed-edge rendering was tested but is not part of the membership model.

Keep one G6 instance per mounted workspace and destroy it on unmount. Use stable node and membership IDs. Update styles and selection without recreating the graph or rerunning layout.

### Layout, navigation, and selection

- Initialize nodes from saved positions; use deterministic starting positions for new nodes. Respect saved pins.
- Run force layout on initial placement, deliberate re-layout, and force dragging. Let it settle.
- Panning, zooming, selection, status edits, appearance edits, filtering, and inspector actions must not restart global physics.
- Place newly imported nodes near linked tags or an insertion area; preserve existing settled positions until deliberate re-layout.
- Filtering changes visibility rather than deleting records or rebuilding the layout. Preserve full-workspace geometry and memberships.
- Provide fit-all, fit-selection, zoom buttons, explicit Pin/Unpin in Details, and re-layout controls. Fit into the unobscured canvas when Details is open. Search hides tags without matching linked bubbles; clearing search restores all tags. Re-layout preserves pins; resetting positions clears pins only after an explicit choice.
- Use a full-window graph workspace by default, with a retractable left panel containing collection information and navigation/import. Keep search at the top and Graph/List and Details controls at the top right, accessible when the panel is retracted. Panel toggles must preserve geometry and selection.
- Provide search, click selection, modifier-assisted multi-selection, and equivalent list controls.
- Keep bubble and tag titles at a constant screen size when zooming. Hide titles that overlap or are too close, preferring the selected item and tags; restore titles when space becomes available. Show more detail at close scale without changing title size.
- Keep initialization and layout errors visible. Offer retry and list access so failure cannot resemble an empty collection.
- With reduced motion enabled, calculate initial settled positions without displaying intermediate movement; use direct dragging without animated neighbor motion.

Support two-finger trackpad pinch zoom, added by user review after checkpoint A. Route Chromium Ctrl-wheel pinch and Safari gesture events to viewport zoom, keeping ordinary scrolling as panning and leaving physics unchanged. Keep zoom buttons as an alternative.

### Appearance and bulk status changes

Support tag-type defaults and per-tag overrides for color, size, shape, and optional icon. Implement circle, rounded square, and diamond through G6 node rendering. Resetting an override restores inheritance.

Changing tag status offers **Tag only** or **Tag and linked bubbles**, defaulting to Tag only.

Propagation opens a warning modal listing every affected bubble and current status, including hidden items. Confirm the reviewed targets atomically; cancel changes nothing. If relevant records change before confirmation, refresh the preview and require renewed confirmation. Provide undo.

Tag status remains independent of bubble status unless propagation is explicitly selected.

### Copy composer

In tag details, allow users to select:

- Fields: title, URL, description, asset URL, status, and tags.
- Field order, separators, plain text or Markdown, and a simple placeholder template.
- All linked bubbles or those matching the current view.
- Ordering by title, creation time, or status.

Show exact output before copying and support saved presets. Omit unavailable fields cleanly. Represent uploaded media by filename, never a temporary blob URL. Copying does not change status.

### Detailed filtering

Support nested All, Any, and Not groups, live counts, readable summaries, and saved views.

Include bubble text, URL/domain, status, dates, asset presence/type, missing fields, no tags, and import batch. Add specific-tag and tag-type membership rules, plus related-tag name/type/status predicates.

Provide an explicit group for conditions that must match **the same linked tag**.

Distance filters use shortest-path edge counts over the full undirected membership graph before display filtering. Direct bubbles are one hop from a tag; bubbles reached through a shared bubble and another tag are three hops away. Support “within N hops” from selected tags and show example paths.

Keep tag-display controls separate from bubble matching. Hiding a tag must not exclude its bubbles. Graph and list use the same match results.

## 4. Optional enrichment and WebMCP

### Metadata enrichment

After importing works reliably, add a separately runnable extraction service with a configurable endpoint. The core app remains static-hostable and usable without it.

The service accepts a URL and returns candidate title, description, primary media, provenance, and extraction outcome. Read Open Graph, Twitter Card, and ordinary HTML metadata; resolve relative media URLs.

- Fill empty fields automatically and preserve supplied values.
- Preview replacements when refreshing metadata.
- Track partial, unavailable, failed, queued, and running extraction separately from action status.
- Discard stale results when the source URL changes.
- Provide a missing-data queue with manual editing and retry.
- Restrict fetch addresses and redirects; enforce timeout and response-size limits.
- Treat authenticated or blocked pages as unresolved.

### Small WebMCP experiment

Implement an optional adapter over existing commands with only:

1. Query bubbles and missing fields.
2. Submit proposed field updates with provenance.
3. Preview imports.

Agents submit proposals; users review and apply them through the ordinary UI. Do not introduce separate agent storage, autonomous background processing, a permissions subsystem, or a broad tool catalog.

Expose unresolved records with IDs, URLs, existing values, missing fields, and revisions. The agent supplies external browsing capabilities.

Feature-detect WebMCP, isolate compatibility handling, and keep the UI fully functional when unavailable. Validate one supported browser/agent combination before expanding support.

## 5. Delivery, checkpoints, and acceptance

| Phase | Deliverable and completion condition | User review |
|---|---|---|
| **1. Model and import design** | Typed model, command contracts, persistence foundation, and clickable import/graph designs demonstrating bookmarks and a second workflow. | **A:** Use a representative export to validate mapping, duplicates, and terminology. Resolve these choices before encoding dependent interactions; parser and persistence work can continue. |
| **2. Import-first usable build** | Four import sources, preview/confirmation, basic editing, memberships, statuses, G6 graph/list, persistence, import undo, and backup/restore work end to end. | **B:** Import a real collection, resolve invalid or duplicate items, organize bubbles, and reload. Resolve import and data-loss blockers before expanding workflows. |
| **2.1. UI improvement (B.1)** | [UI audit and improvement plan](ui-improvement-plan.md): coherent navigation, flat vector pin, consistent icons/controls, readable hierarchy, and polished existing workflows without changing Stage B behavior. | **U1:** Review a concrete visual mockup. **U2:** Review the running UI and resolve material findings before Stage C. B.1 was accepted October 10, 2026. |
| **3. Workflow tools** | Appearance inheritance, confirmed status propagation, copy composer, nested/distance filters, saved views, and bulk media upload. | **C:** Complete a complicated workflow and copy results to the intended destination. Resolve confusing rules and output; independent enrichment work can continue. |
| **4. Enrichment and agent experiment** | Optional extractor, missing-data queue, and narrow WebMCP adapter tested with the user’s agent. | **D:** Fill unresolved records and prepare an import through the agent. Keep or expand WebMCP only when it reduces effort. |
| **5. Release hardening** | Accessibility, recovery, static deployment build, documentation, and performance checks pass; checkpoint findings are resolved. | Review remaining limitations. Publishing requires separate deployment authorization. |

At each checkpoint, supply a runnable or clickable artifact, representative data, and concrete tasks to attempt without coaching. Include a short companion guide. Record feedback as **task → expected → actual → impact**. Dependent work waits on unresolved product decisions or material blockers.

### Verification

- **Imports:** every supported format, mapping, missing values, unknown statuses/types, duplicate choices, invalid rows, cancellation, stale previews, interrupted commits, and undo conflicts.
- **Persistence:** reload, multi-tab conflicts, quota failures, migrations, and full backup round trips with uploaded media.
- **G6:** shared memberships, disconnected bubbles, dragging with responding neighbors, settling, pins, explicit unpin/re-layout, appearance shapes, semantic detail, and graph/list parity.
- **Viewport stability:** verify two-finger panning, zoom controls, filtering, selection, and inspector changes do not restart layout or alter settled world coordinates.
- **Filtering:** nested predicates, same-tag semantics, full-graph distances, hidden tags, and saved-view restoration.
- **Processing:** status reassignment, appearance inheritance, hidden targets in confirmation, atomic updates, undo, and exact copy output.
- **Enrichment/WebMCP:** partial failures, blocked pages, stale responses, preserved user values, reviewed proposals, and unavailable API.
- **Usability:** keyboard operation, narrow screens, reduced motion, and visible graph failures with usable list fallback.
- **Performance:** review at 1,000 bubbles; stress test 5,000 bubbles and 20,000 memberships. Measure import responsiveness, settling, force dragging, filtering, and viewport interaction. Address main-thread bottlenecks before release without replacing the approved interaction model silently.

### Defaults and limits

The new app replaces the reverted prototype in `app/`; no prototype-schema migration is included. G6 5.1.1 is selected based on the successful capability test; larger datasets and product-specific rendering still require verification. Importing remains the first priority. Prototype migration, accounts, sync, collaboration, and automatic agent-applied changes are outside v1.

Release succeeds when a user can import a real collection without manual preprocessing, understand what will be added, recover from mistakes, and process bubbles through tags and the graph with enrichment and WebMCP disabled.

[Checkpoint guide](product-review-guide.md) · [Implementation progress](product-progress.md)
