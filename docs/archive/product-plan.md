> **Superseded October 11, 2026** by the v1 round plan, summarized in [v1 rounds](v1-rounds.md). Kept as history.

# Build an import-first bookmark-and-tag product with G6

> **Amendment — October 11, 2026 (plan review).** A review of the plan against the Stage C build found an undocumented second undo system, storage that will not reach the 5,000-bookmark target, no schema migrations, unreclaimed media, no way to create single records or retire them, and a release criterion that the user's own collection cannot meet. This amendment adds **Stage C.1 — Foundation corrections** between Checkpoint C and Phase 4 and resolves the open wording below. The user decided the following on October 11, 2026:
>
> 1. **One undo model with redo** — a single linear per-collection Undo/Redo history, plus import-history undo for older batches ([§1 Undo and history](#undo-and-history)). Separate status undo is retired.
> 2. **Record lifecycle** — users can create single bookmarks and archive bookmarks and tags; individual records are never deleted. Only whole collections can be deleted ([§1 Record lifecycle](#record-lifecycle)).
> 3. **The user's collection** — the prototype dataset (`bookmarks-working.json`, 148 bookmarks) is converted once by a separate script into the product's versioned JSON; the app still does not read prototype JSON ([§5 Defaults and limits](#defaults-and-limits)).
> 4. **WebMCP target** — the browser build and agent are chosen when Phase 4 starts; naming them is the Phase 4 entry condition.

## 1. Foundation and architecture

Build a new general-purpose app for collecting items, organizing them with tags, and processing them through a force-directed graph.

- Revert the prototype squash merge on a fresh branch and build the new app in `app/`. Preserve the prototype in Git history and preserve its uncommitted changes separately.
- Use React, TypeScript, Vite, Tailwind, and npm. Pin **`@antv/g6` to `5.1.1`**, the version successfully tested in the disposable demo. Do not add Sigma, Graphology, or ForceAtlas2 to the new app.
- Deliver a static-hostable app with browser-local workspaces and media. No accounts, sync, or collaboration in v1.
- Use IndexedDB for content and uploaded media, with transactions, schema migrations, and revision checks to prevent conflicting writes between tabs.
- Share domain commands and validation across UI, imports, enrichment, and optional WebMCP. G6 is a rendering and interaction adapter, not the source of truth.
- Store graph positions, pins, viewport, and view preferences separately from content. Moving a node must not change content revisions.
- Run import parsing in a worker. Filter and distance evaluation may run on the main thread while a full evaluation stays under **16 ms at 5,000 bookmarks / 20,000 memberships** on the review machine; if the Stage C.1 measurement exceeds that, move evaluation to a worker that returns match IDs and example paths, keeping a synchronous path for tests. Start G6 force simulation with the tested configuration on the main thread; do not assume a worker layout preserves force-drag behavior.

### Minimal data model

| Entity | Fields and behavior |
|---|---|
| Bookmark | ID, title, description, optional URL, optional primary media asset, status, archived flag |
| Tag | ID, name, optional description and URL, optional type, status, archived flag, appearance overrides |
| Tag type | ID, name, default appearance |
| Status | ID, label, color, outcome category |
| Membership | Unique bookmark–tag connection |
| Saved view | Name, nested filter rules, sort order, tag-display settings |
| Workspace | Entities, settings, saved views, schema version |
| Import batch | Source summary, committed record IDs, and information needed for undo |

Internal revisions, timestamps, and extraction bookkeeping support recovery without complicating the user-facing model.

Bookmarks support one primary image, video, or audio asset, separate from their URL. Media can be uploaded or referenced remotely. Tags have at most one type; untyped tags are allowed. Memberships are **undirected and bookmark–tag only**.

Start with Pending, In progress, Done, and Dropped. Users can customize statuses; active, completed, and discarded outcome categories support counts. Removing an assigned status requires reassignment. Show outcome counts (active / completed / discarded, excluding archived records) beneath the collection selector, for the current view's matches when a filter is active, and in tag Details for linked bookmarks.

### Record lifecycle

*Decided by the user October 11, 2026: create and archive; no deletion of individual records.*

- **New bookmark** creates one bookmark from a title and/or URL, optional description, status, and tags, through the same validated command path as editing. Pasted-URL import remains the bulk path.
- **Archive** and **Unarchive** apply to bookmarks and tags, individually or for a multi-selection, as ordinary undoable actions. Archiving is a separate `archived` flag, independent of status: a *Done* or *Dropped* bookmark can be archived, and status is unchanged by archiving.
- Archived records keep their content, memberships, and media. They are hidden from graph, list, search, outcome counts, and copy output by default. A **Show archived** display toggle reveals them with a muted treatment, and an *Archived* filter predicate lets saved views select them explicitly.
- Archiving a tag does not archive its bookmarks. Distance filters keep using the full membership graph, including archived records, so a saved rule's meaning does not change when something is archived.
- There is no delete for individual bookmarks or tags in v1. Import-history undo still removes bookmarks that a batch created, as before.
- **Delete collection** is the only deletion: it requires typing the collection name, offers a backup download first, and removes the collection, its geometry, undo history, and media in one transaction. It is not undoable.
- Archived records keep their saved positions; unarchiving restores them where they were.

### Undo and history

*Decided by the user October 11, 2026. This replaces the separate status-change undo recorded in Stage C.*

- **One linear Undo/Redo history per collection.** The bottom-bar **Undo** reverses the latest saved content action: edits, creation, archiving, memberships, statuses (including reviewed propagation and selection changes), imports, import-history undo, media attachment, appearance, saved views, and copy presets. One confirmed dialog is one action. **Redo** reapplies the most recently undone action; any new saved action clears the redo list. Both controls name the action they will affect, and both persist across reloads with the same bounds.
- Keyboard: Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes when focus is not in a text field (text fields keep native text undo).
- Outside the history: search, selection, filters not yet saved, graph positions/pins/viewport, collection creation/deletion, and restoring a backup into a new collection.
- **Import history** remains the one non-linear tool: it undoes a specific older batch with conflict review and keeps later edits. Doing so is itself an action in the linear history.
- Entries store **inverse change sets** — the before/after values of only the records, memberships, taxonomy, and settings an action touched — never whole-collection snapshots. Undo and redo apply them with ordinary revision checks: if another tab changed a touched record, the step is refused with an explanation, and the history is kept.
- **Bounds:** at most 50 entries and 5 MB of serialized change sets per collection, oldest dropped first. Import batches keep full undo data for the 20 most recent batches; older batches keep their summary (source, date, counts, record IDs) and show as *no longer undoable*.
- Undo history is browser-local. Backups carry collection content, not history; restoring a backup starts with an empty history.
- Remove the separate `status.undo` command and `settings.statusHistory` field in the schema 2 migration.

### Storage, migrations, and media

- **Measure before Phase 4.** Generate 1,000- and 5,000-bookmark fixtures (20,000 memberships) and record serialized collection size, bytes written per command, and p95 command-commit time. Budget: p95 commit **≤ 100 ms** and bytes written per ordinary edit independent of undo-history length. If the single-record collection layout misses the budget, split content into per-record object stores (bookmarks, tags, memberships, settings) before Phase 4; the command and revision contracts stay unchanged.
- **Migrations.** Every change to stored shape bumps both the IndexedDB version and `schemaVersion`, with an ordered, tested migration per version applied to stored collections and to backups on restore. A migration either migrates stored undo entries or clears them with a visible notice; never apply an old-shape change set to new-shape data. **Schema 2** formalizes the Stage C additions (appearance, saved views, copy presets) with defaults, replaces snapshot undo with change sets, and removes `statusHistory`. Keep one fixture per schema version in the tests.
- **Media lifecycle.** A stored file is kept while it is referenced by current content (archived records included), a retained undo or redo entry, or a retained import batch. Collect unreferenced files after an asset is replaced or removed, after history trimming, and at startup. Backups bundle only files referenced by current content.
- Multiple tabs: when another tab upgrades the database, the older tab shows a reload notice instead of failing silently.

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
- Preserve unrecognized bookmark/tag URLs as text and visually distinguish them; do not block import or editing. Only valid HTTP(S) values become clickable links. Detect duplicate unrecognized values by exact text. Malformed rows and invalid media URLs still require explicit exclusion, with source row numbers and reasons.
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
- Provide fit-all, fit-selection, zoom buttons, explicit Pin/Unpin in Details, and re-layout controls. Fit into the unobscured canvas when Details is open. Search hides tags without matching linked bookmarks; clearing search restores all tags. Re-layout preserves pins; resetting positions clears pins only after an explicit choice.
- Use a full-window graph workspace by default, with a retractable left panel containing collection information and navigation/import. Keep search at the top and Graph/List and Details controls at the top right, accessible when the panel is retracted. Panel toggles must preserve geometry and selection.
- Provide search, click selection, modifier-assisted multi-selection, and equivalent list controls.
- Keep bookmark and tag titles at a constant screen size when zooming. Hide titles that overlap or are too close, preferring the selected item and tags; restore titles when space becomes available. Show more detail at close scale without changing title size.
- Keep initialization and layout errors visible. Offer retry and list access so failure cannot resemble an empty collection.
- With reduced motion enabled, calculate initial settled positions without displaying intermediate movement; use direct dragging without animated neighbor motion.

Support two-finger trackpad pinch zoom, added by user review after checkpoint A. Route Chromium Ctrl-wheel pinch and Safari gesture events to viewport zoom, keeping ordinary scrolling as panning and leaving physics unchanged. Keep zoom buttons as an alternative.

### Appearance and bulk status changes

Support tag-type defaults and per-tag overrides for color, size, shape, and optional icon. Implement circle, rounded square, and diamond through G6 node rendering. Resetting an override restores inheritance.

Changing tag status offers **Tag only** or **Tag and linked bookmarks**, defaulting to Tag only.

Propagation opens a warning modal listing every affected bookmark and current status, including hidden items. Confirm the reviewed targets atomically; cancel changes nothing. If relevant records change before confirmation, refresh the preview and require renewed confirmation. Undo is provided by the collection undo history ([§1](#undo-and-history)); there is no separate status undo.

Tag status remains independent of bookmark status unless propagation is explicitly selected.

### Copy composer

In tag details, allow users to select:

- Fields: title, URL, description, asset URL, status, and tags.
- Field order, separators, plain text or Markdown, and a simple placeholder template.
- All linked bookmarks or those matching the current view.
- Ordering by title, creation time, or status.

Show exact output before copying and support saved presets. Omit unavailable fields cleanly. Represent uploaded media by filename, never a temporary blob URL. Copying does not change status.

### Detailed filtering

Support nested All, Any, and Not groups, live counts, readable summaries, and saved views.

Include bookmark text, URL/domain, status, dates, asset presence/type, missing fields, no tags, and import batch. Add specific-tag and tag-type membership rules, plus related-tag name/type/status predicates.

Provide an explicit group for conditions that must match **the same linked tag**.

Distance filters use shortest-path edge counts over the full undirected membership graph before display filtering. Direct bookmarks are one hop from a tag; bookmarks reached through a shared bookmark and another tag are three hops away. Support “within N hops” from tags chosen in the rule, and show example paths. Rules store tag IDs, so saved views never depend on the current graph selection; the builder may prefill the rule from the current selection. If a referenced tag is archived, the rule labels it as archived and keeps matching through it.

Keep tag-display controls separate from bookmark matching. Hiding a tag must not exclude its bookmarks. Graph and list use the same match results.

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
- **Hosting:** a small Node service in this repository, started with its own npm script and listening on `http://127.0.0.1:5299` by default. It sends CORS headers only for configured app origins (the dev, preview, and eventual deployed origins). The static app never proxies arbitrary URLs itself.
- **Applying results:** every result carries the bookmark ID and the record revision it was requested for. Results for a changed record are shown as stale for review rather than applied. Automatic filling of empty fields uses the ordinary revision-checked patch command and is one undoable action per run.

### Small WebMCP experiment

Implement an optional adapter over existing commands with only:

1. Query bookmarks and missing fields.
2. Submit proposed field updates with provenance.
3. Preview imports.

Agents submit proposals; users review and apply them through the ordinary UI. Do not introduce separate agent storage, autonomous background processing, a permissions subsystem, or a broad tool catalog.

Expose unresolved records with IDs, URLs, existing values, missing fields, and revisions. The agent supplies external browsing capabilities.

Feature-detect WebMCP, isolate compatibility handling, and keep the UI fully functional when unavailable. **Entry condition for Phase 4 (user decision, October 11, 2026):** at Phase 4 kickoff the user names the one browser build and agent to support; record the WebMCP API version tested. Proposals include the record ID and revision they were based on; the review screen marks proposals for changed records as stale, and accepting a proposal uses the same revision-checked command as a manual edit.

## 5. Delivery, checkpoints, and acceptance

| Phase | Deliverable and completion condition | User review |
|---|---|---|
| **1. Model and import design** | Typed model, command contracts, persistence foundation, and clickable import/graph designs demonstrating bookmarks and a second workflow. | **A:** Use a representative export to validate mapping, duplicates, and terminology. Resolve these choices before encoding dependent interactions; parser and persistence work can continue. |
| **2. Import-first usable build** | Four import sources, preview/confirmation, basic editing, memberships, statuses, G6 graph/list, persistence, import undo, and backup/restore work end to end. | **B:** Import a real collection, resolve invalid or duplicate items, organize bookmarks, and reload. Resolve import and data-loss blockers before expanding workflows. |
| **2.1. UI improvement (B.1)** | [UI audit and improvement plan](ui-improvement-plan.md): coherent navigation, flat vector pin, consistent icons/controls, readable hierarchy, and polished existing workflows without changing Stage B behavior. | **U1:** Review a concrete visual mockup. **U2:** Review the running UI and resolve material findings before Stage C. B.1 was accepted October 10, 2026. |
| **3. Workflow tools** | Appearance inheritance, confirmed status propagation, copy composer, nested/distance filters, saved views, and bulk media upload. | **C:** Complete a complicated workflow and copy results to the intended destination. Resolve confusing rules and output; independent enrichment work can continue. |
| **3.1. Foundation corrections (C.1)** | Undo consolidated to change sets with bounds; schema 2 migration; import-history retention; media collection; Undo/Redo; New bookmark, archive/unarchive, and collection deletion; outcome counts; 1,000/5,000 measurements against the budgets in §1; prototype converter run on the user's dataset. | **C1:** Import the converted collection, create and archive records, undo and redo across several action types, reload, and review the measurement report. Phase 4 starts after C1 and the Phase 4 entry condition. |
| **4. Enrichment and agent experiment** | Optional extractor, missing-data queue, and narrow WebMCP adapter tested with the user’s agent. | **D:** Fill unresolved records and prepare an import through the agent. Keep or expand WebMCP only when it reduces effort. |
| **5. Release hardening** | Accessibility, recovery, static deployment build, documentation, and performance checks pass; checkpoint findings are resolved. | Review remaining limitations. Publishing requires separate deployment authorization. |

At each checkpoint, supply a runnable or clickable artifact, representative data, and concrete tasks to attempt without coaching. Include a short companion guide. Record feedback as **task → expected → actual → impact**. Dependent work waits on unresolved product decisions or material blockers.

**Checkpoint scope.** When a checkpoint is marked ready, commit and tag the reviewed build (`checkpoint-c`, …). Changes made during review — fixes or user-requested additions — are recorded as dated amendments in this plan and listed under *Changes since ready* in the review guide, so the reviewer knows what moved. Features not in the plan are not added during review without a recorded amendment.

**Deferred verification register.** A checkpoint may be accepted with checks left undone only if each one is listed here with the stage that must close it. The release review cannot pass while any entry is open.

| Deferred check | From | Closes at |
|---|---|---|
| Physical Mac trackpad pinch zoom and two-finger panning | A, B, B.1 | Release review |
| 200% browser and text zoom across graph, list, Details, import, and dialogs | B.1 | Release review |
| Full recovery/media matrix: backup → restore → re-backup with image, video, and audio; undo snapshots holding media | B, B.1 | C1 |
| Checkpoint B checklist items not individually verified at acceptance | B | C1 (rerun with converted collection) |
| Remaining viewport combinations from the B.1 matrix | B.1 | Release review |

### Verification

- **Imports:** every supported format, mapping, missing values, unknown statuses/types, duplicate choices, invalid rows, cancellation, stale previews, interrupted commits, and undo conflicts.
- **Persistence:** reload, multi-tab conflicts, quota failures, migrations (one fixture per schema version, including backups and stored undo entries), full backup round trips with uploaded media, and media collection after undo trimming, asset replacement, and collection deletion.
- **Undo and lifecycle:** every action type through undo and redo, redo cleared by a new action, refusal when another tab changed a touched record, history and batch bounds, archived records excluded from display/counts/copy but kept in distance filters, and collection deletion removing geometry, history, and media.
- **G6:** shared memberships, disconnected bookmarks, dragging with responding neighbors, settling, pins, explicit unpin/re-layout, appearance shapes, semantic detail, and graph/list parity.
- **Viewport stability:** verify two-finger panning, zoom controls, filtering, selection, and inspector changes do not restart layout or alter settled world coordinates.
- **Filtering:** nested predicates, same-tag semantics, full-graph distances, hidden tags, and saved-view restoration.
- **Processing:** status reassignment, appearance inheritance, hidden targets in confirmation, atomic updates, undo, and exact copy output.
- **Enrichment/WebMCP:** partial failures, blocked pages, stale responses, preserved user values, reviewed proposals, and unavailable API.
- **Usability:** keyboard operation, narrow screens, reduced motion, and visible graph failures with usable list fallback.
- **Performance:** measure storage and filter budgets in Stage C.1 (§1); review at 1,000 bookmarks; stress test 5,000 bookmarks and 20,000 memberships. Measure import responsiveness, settling, force dragging, filtering, and viewport interaction. Address main-thread bottlenecks before release without replacing the approved interaction model silently.

### Defaults and limits

The new app replaces the reverted prototype in `app/`. The app does not read prototype JSON; instead a one-time converter script (`tools/`, outside the app bundle) turns the prototype dataset into versioned product JSON — bookmarks become bookmarks, prototype categories become tags of a *Category* type, issue groups become tags of an *Issue* type, and known duplicate groups are reported for review in the normal import screen. *Decided by the user October 11, 2026.* G6 5.1.1 is selected based on the successful capability test; larger datasets and product-specific rendering still require verification. Importing remains the first priority. Prototype migration, accounts, sync, collaboration, and automatic agent-applied changes are outside v1.

Release succeeds when the user can import their own collection (the converted prototype dataset and a fresh browser bookmark export) without hand-editing the files, understand what will be added, recover from mistakes, and process bookmarks through tags and the graph with enrichment and WebMCP disabled.

[Checkpoint guide](product-review-guide.md) · [Implementation progress](product-progress.md)
