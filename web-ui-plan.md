# Bookmark processing tracker: web UI plan

The first version is a local web app with a freeform connection map for reviewing saved bookmarks, approving their categories, comparing issue destinations, and recording confirmed placements. The working JSON remains the portable source of truth.

## Files and starting state

- `bookmarks.json` contains all 148 original CSV records, editable display fields, proposed category corrections, 38 earlier existing-issue reference suggestions, six new-issue proposals with 25 seed links, and two duplicate/mirror groups.
- `bookmarks.schema.json` defines the structural data contract.
- The refreshed catalog contains 14 issues labeled `indie-hacking` and the related, unlabeled #171. #151 and #171 are newer than the earlier review. Five optional contextual mappings to them are explicitly labeled `current_catalog_extension`.
- Six source records are already represented in issue bodies, including one content mirror. This is a routing observation, not a completed user decision.
- All 148 records start unreviewed. All approved categories are null and all selected targets are empty.
- Link checks from the earlier review are recorded as historical observations from September 12, 2026. Current checks are null.
- The previous local checkout path is unavailable. Build and run the app in this task's workspace. Configure the JSON file path instead of depending on the old checkout.

The normalized taxonomy has 29 proposed topics grouped into broader sections. Preserve the original 11-category taxonomy as a read-only provenance view. Topic assignments are suggestions until approved.

## Approved UI direction

On October 6, 2026, the user refined **B — Connection map** into a **force-directed graph with semantic zoom**. Use it as the main desktop workspace. Every bookmark is one bubble connected to its related topic, existing issue, and proposal hubs. These relationships can coexist without duplicating the bookmark. Typography, colors, and detailed styling remain provisional.

The user approved the force-directed workspace and semantic-zoom mockups on October 6, 2026. Use them as the structural design reference for implementation. Exact sizes, force strengths, and zoom thresholds can be tuned within this approved direction. Support both all-connections and selected-neighborhood views; the default overview edge visibility remains open for visual tuning.

- [Force-directed graph mockup](docs/mockups/force-directed-map.png)
- [Semantic zoom mockup](docs/mockups/force-directed-zoom.png)
- [Editable SVG reference](docs/mockups/force-directed-map.svg)
- [Approved design notes](docs/mockups/force-directed-review.md)

The [earlier connection-map reference](docs/mockups/connection-map.png) and [B1–B3 variants](docs/mockups/variants-review.md) are historical explorations. Their fixed columns and topic containers are superseded by the force-directed direction. Their inspector variations remain optional ideas, not accepted requirements.

The canvas has no fixed existing-issue/bookmark/proposal columns. Each individual topic, existing issue, and new proposal is a distinguishable force center (hub); existing issues and new proposals are hub types rather than two catch-all centers. Related bookmark bubbles are attracted through their connections, so a shared bookmark can sit between several hubs. A vertical side rail opens filters and canvas tools; selecting a bookmark opens its detail inspector on the right. Position communicates layout only; explicit links carry the relationships.

The earlier reference shows four bookmarks under a filter for explicitly paired existing/proposed alternatives. Preserve that filter. The application must support the whole import, including bookmarks with no destination recommendations. The initial unreviewed queue covers all 148 bookmarks and completion remains 0/148.

## Main user workflow

1. Open the side filters and pick a queue: unreviewed, category corrections, suggested existing references, new-issue seeds, link follow-up, duplicates, deferred, or completed. Narrow by topic or destination as needed.
2. Inspect the matching bookmark bubbles and their connections. Zoom in for more detail; select a bookmark to read its original note/excerpt in the side inspector and open its source deliberately.
3. Approve the proposed category or choose another primary and optional secondary topic. Edit the display title, URL, tags, and working notes as needed.
4. Choose a disposition: attach to issue, keep as a resource, skip, duplicate, or defer.
5. For attachments, accept or change the suggested destinations. Select multiple issues only when each placement has a distinct use. Existing/proposed alternatives are visible together.
6. Prepare grouped Markdown references, copy them, and add them to the relevant GitHub issue.
7. Record each placement as added or already present, with the destination URL and confirmation date.
8. Use previous/next in the inspector to continue through the same filtered queue. Pending items retain their place in the queue and canvas, and every decision change is saved.

Category approval, choosing a destination, and adding the reference are separate actions. Bulk category approval must not mark bookmarks complete.

## Screens and controls

### Connection-map review workspace

Use a large force-directed canvas, a compact vertical tool rail, an optional filter drawer, and a contextual right inspector. The canvas is the main browsing surface. Filters and details open when needed and can collapse to give the map more space.

#### Nodes, groups, and connections

- Render one canonical bubble per bookmark ID and one hub per topic ID, catalog issue number, and proposal ID. A bookmark can connect to several hubs without appearing as multiple independent records. No topic containers are required.
- Bookmark bubbles progressively reveal detail as the user zooms in: overview shows compact bubbles and selection/status marks; middle zoom adds short titles; close zoom adds descriptive titles, domain/source type, and review status. Keep hub type/name and matching bookmark count readable at overview scale, using collision-aware label placement. Keep the selected bookmark's label visible at any zoom and its full details in the inspector. Exact thresholds and bubble sizes remain provisional. Detail changes affect rendering, not node identity, filtering, or completion.
- Topic hubs represent primary and optional secondary topic relationships. The topic lens selects proposed or approved classifications, with unapproved records discoverable in an explicit unapproved hub when the approved lens is used. Preserve original taxonomy browsing as read-only provenance. Show topic links with a distinct thin dotted treatment and label them as proposed or approved on selection; topic membership never means issue placement.
- Existing issue nodes show the exact issue title, number, and open/closed state. Proposal nodes show the title, seed count, approval state, and whether a GitHub issue has been registered. Both kinds of destination appear together.
- Dashed connections represent recommendations or proposed seed relationships. Solid connections represent explicitly selected destinations. Label selected connections with their independent placement state: pending, added, or already present. Use text and line treatment as well as color.
- When a recommendation becomes a selected target, show a single connection to that destination while retaining the recommendation's rationale and provenance in the inspector. Do not draw duplicate edges for the same resolved issue.
- Distinguish earlier recommendations, newer contextual suggestions, and references observed in issue bodies. An observed reference is still a suggestion requiring review and confirmation; it does not produce a confirmed edge by itself.
- Keep bookmarks without destination recommendations visible, connected to their topic hubs. Provide destination browsing in the inspector. Records with no usable topic connection remain visible as unclassified bubbles rather than disappearing.
- Selecting a bubble highlights all its immediate relationships and dims unrelated edges. Selecting a connection reveals its kind, rationale, caveats, and target state. Selecting a hub focuses its related bookmarks; issue and proposal hubs offer their processing/drafting view. Connected nodes need not be nearest neighbors: users must be able to inspect every relationship through the inspector or compact navigation.
- Registering a created proposal resolves selected proposal connections through its catalog issue identity. Preserve the proposal's scope and seed provenance while avoiding a second selected connection to the same resolved issue.

#### Side controls and canvas navigation

The tool rail provides Select, Pan, Filters, Topic lens, Layout, and Actions. Actions provides contextual operations and access to the issue/proposal boards; the header provides access to Progress. Include zoom in/out, fit view, and an overview/minimap. Start with a reproducible seeded force layout, using link attraction, node repulsion, and collision avoidance. Hubs attract related bookmarks, while bookmarks linked to several hubs settle between competing attractions. Bound the simulation and stop it once settled so bubbles remain stable for selection and reading.

Allow repositioning and pinning bubbles or hubs, with explicit unpin and re-layout controls. Saved positions and pins take precedence over a fresh simulation. Pan/zoom, selection, inspector opening, filters, and ordinary saves must not restart global layout. New nodes receive a local initial position without moving existing pinned or settled nodes; a deliberate re-layout can recompute unpinned positions. Focus a hub or limit visible edges to the selected neighborhood to keep the full dataset readable. Low zoom reduces displayed detail rather than merging multiple bookmark IDs into a single record.

The filter drawer includes queue counts and the 29 topics grouped into broader sections, with the original 11 categories available as read-only provenance. Filters support original/proposed/approved category, issue, proposal, review state, disposition, source type, favorite, duplicate status, and historical link warnings. Include the reference's filter for explicitly paired existing/proposed alternatives, derived from recommendations with `alternative_proposal_id`. Merely having an issue recommendation and a proposal seed relationship does not imply that they were curated as alternatives.

Search title, URL, tags, original note/excerpt, working notes, issue title, and issue number. Filter counts count distinct bookmarks, not nodes or connections. Keep related topic and destination hubs as labeled context for matching bookmarks. Filtering or focusing a hub changes visibility, not selected targets or progress; the inspector continues to list every target of the selected bookmark. Hidden relationships remain available in the inspector. Show exact issue titles and hub states there when overview labels are abbreviated.

Preserve selection, queue order, filters, pan/zoom, and user positions when editing, moving to the next bookmark, or returning from a source. Do not automatically rearrange the map after each save. Explicit fit/reset-layout controls can change the viewport or geometry.

Dragging bubbles or hubs arranges the canvas only. It must not approve a category, change disposition, select a destination, or confirm placement. Dropping a bubble near a hub does not create a relationship. Use explicit inspector actions for those decisions. Store canvas positions, pins, zoom/detail preferences, and other view preferences separately from the working bookmark data.

Support multiple-bubble selection with a contextual Actions panel. Bulk topic approval changes only classification approval. Destination choices and dispositions require explicit actions and the same validity rules as individual review; placements are confirmed per target. Selecting bubbles itself changes no review state.

#### Bookmark inspector

The right inspector has:

- Editable title, URL, tags, and favorite.
- Original CSV values in a collapsible read-only section.
- Proposed versus approved category, the correction reason, and approve/revise actions.
- Existing issue recommendations with exact issue title, rationale, caveats, and whether the reference is already represented.
- New-issue proposals with their scope, seed sources, and overlap with existing issues.
- A clear chosen-target list with independent placement states.
- Source notes, dated link observations, duplicate relationships, working notes, and history.
- A save indicator and previous/next controls. Add keyboard navigation after the basic workflow works.

Render source content as text. Do not auto-fetch remote covers or embed media. Open source URLs with `noopener`; the user can repair a URL after examining a dated warning.

#### Narrow screens and accessible navigation

On narrow screens, show a focused neighborhood of the map and open filters or the inspector as a drawer. Provide a compact list/outline alternative with the same search, queue, and selection controls for touch, keyboard, and assistive-technology use. Switch between that navigation view and detail when space is limited. Every decision and placement action must be available without dragging, precise connector selection, or hover. The compact list is an alternative navigation surface, not the default desktop layout.

### Issue board

Group accepted attachments by existing issue. Show recommended-but-unaccepted sources separately so they do not inflate the workload.

Each issue card shows its title, accepted references awaiting placement, confirmed placements, and unresolved sources. Clicking a card focuses that issue and its bookmark connections in the map, with access to its processing queue and Markdown preview. The side rail also provides access to the board.

### New-issue proposal board

Show the six proposed topics, their scope/questions, seed bookmarks, overlap notes, and editable title/notes. Allow approving/rejecting a proposal and selecting its approved seeds.

Export a draft issue body with selected references. After the user creates the issue, allow registering its GitHub number/URL. Add it to the issue catalog and resolve selected proposal targets through that catalog entry.

A bookmark attached to an uncreated proposal remains pending. Rejecting a proposal surfaces affected bookmarks for reassignment instead of marking them done.

Open a proposal from its map node or the proposal board. Keep its scope/questions, seed review, and issue-registration controls in a dedicated proposal view, with navigation back to the preserved map selection and filters.

### Progress view

Show both review progress and placement progress. Include actionable queues for reviewed-but-unplaced bookmarks, unresolved proposals, duplicates, and deferred work.

Avoid a Kanban-only interface: a record can have several placements, so one card column cannot express all its work. Use the connection map and inspector for decisions and per-target states for placement. Progress queues open the corresponding filtered map.

## Data model and progress rules

| Object | Purpose | Editable parts |
| --- | --- | --- |
| `bookmarks[].original` | Exact original 10-column CSV values | Read-only |
| `classification` | Proposed corrections and approved topics | Approved fields and status |
| `references_for_existing_issues` | Curated suggestions with origin, rationale, and caveat | Recommendations may be explicitly revised |
| `bookmarks_worth_their_own_issues` | Six proposed topics and their seed relationships | Title, questions, notes, approval, approved seeds, created issue identity |
| `processing` | User decision and confirmed placements | Review state, disposition, targets, notes, defer reason |
| `source_review` | Source assessment and dated link observations | New checks and working assessment; preserve historical checks |
| `duplicate_review` | Suggested/confirmed canonical relationship | Confirm or reject the proposed relationship |
| `history` | Reversible change history | App-appended events |
| `metadata.revision` | Dataset revision for write conflicts | Server-incremented |

Build reverse indexes and the map's nodes/connections in memory from the dataset. Do not save redundant bookmark-to-recommendation lists, graph edges, category totals, issue counts, or completion flags. Canvas selection and positions are interface preferences, not processing decisions.

A bookmark is complete when:

- Its review state is `decided`, and
- Its disposition is `keep`, `skip`, or `duplicate`; or
- Its disposition is `attach`, at least one target is selected, and every selected target is `added` or `already_present`.

Apply these validity rules before the completion calculation:

- Attach/keep requires an approved primary category.
- Duplicate requires a confirmed canonical bookmark, with no self-reference or cycle.
- Skip requires a reason in working notes.
- Defer requires a defer reason and never counts as complete.
- Confirmed placement requires a destination URL and confirmation date.
- A proposed target can be confirmed only after its proposal has a created issue identity.
- The same resolved GitHub issue cannot appear twice in a bookmark's selected targets.
- Created proposal number/URL must match a catalog entry.
- Recommendation IDs, bookmark IDs, category IDs, proposal IDs, and issue numbers must resolve.
- Approved seed IDs must belong to that proposal's seed list.
- Closed issues remain visible; show their state before a destination is selected.

Keep the denominator at 148 for this import, including skip/duplicate decisions. Show completed kept, skipped, and duplicate records separately from attached ones. Two confirmed placements out of three means that bookmark is still pending. A record already represented in an issue remains unreviewed until its decision is confirmed.

`reviewing` is user progress state, not a concurrency lock. Reject contradictory combinations such as `decided + undecided`. Suggestions can be dismissed without editing original provenance.

## Recommended implementation

Use React + TypeScript + Vite for the UI, Tailwind CSS for styling, and a small Node + Express local API. Use npm. Validate JSON with Ajv 8's draft-2020-12 entry point and `ajv-formats`, then run the cross-record checks above.

Use a React-compatible graph canvas supporting bubble/hub nodes, force-directed layout, semantic zoom, controlled pan/zoom and positions, pins, and accessible node selection. Choose and verify the canvas and simulation libraries during implementation. Keep graph derivation, force layout, and detail rendering separate from bookmark validation and persistence.

The API owns the JSON file and binds to loopback. Browser localStorage stores only interface preferences such as filters, selection, hub focus, viewport, positions, and pins keyed by dataset and stable node IDs; it is not the bookmark database. Recover from missing/stale preference IDs without changing dataset records, and provide a reset-view action. A browser cannot safely autosave to an arbitrary disk file without a server or explicit file permission, so use the local API as the default.

Suggested project structure:

```text
bookmarks.json
bookmarks.schema.json
web-ui-plan.md
docs/
  mockups/
    connection-map.png
    connection-map.svg
app/
  package.json
  src/
    components/
      ConnectionCanvas.tsx
      BookmarkBubble.tsx
      IssueNode.tsx
      ProposalNode.tsx
      TopicHubNode.tsx
      CanvasToolRail.tsx
      FilterDrawer.tsx
      SelectionActions.tsx
      BookmarkList.tsx
      BookmarkInspector.tsx
      IssueTargetPicker.tsx
      ProposalBoard.tsx
      ProgressSummary.tsx
    data/
      types.ts
      selectors.ts
      graph.ts
      validation.ts
      markdown.ts
    ui/
      forceLayout.ts
      semanticZoom.ts
      canvasPreferences.ts
    api/client.ts
  server/
    index.ts
    store.ts
    validation.ts
  tests/
backups/
```

Allow a configured `BOOKMARKS_FILE` path, defaulting to the workspace's `bookmarks.json`. The application must never overwrite the CSV. Add backups and runtime temporary files to an app-specific ignore file when the implementation is created.

### Local API

| Endpoint | Behavior |
| --- | --- |
| `GET /api/dataset` | Validate/load JSON; return data and revision/ETag |
| `PATCH /api/bookmarks/:id` | Update allowed working fields, append history, save transaction |
| `PATCH /api/proposals/:id` | Edit proposal, approved seeds, or register created issue |
| `POST /api/catalog/issues` | Register a user-supplied issue identity |
| `POST /api/import` | Preview an imported JSON, validate, then explicitly replace the working dataset |
| `GET /api/export` | Download the current complete JSON |
| `POST /api/reference-drafts` | Produce grouped Markdown from accepted pending placements |

Mutations carry the revision they were based on. Perform each mutation under a serialized write queue, validate the entire candidate dataset, create a recoverable backup, write to a temporary file in the same directory, and rename it atomically. Increment revision once per committed transaction. Check the disk content hash before replacing it to catch edits made outside the app.

On a stale revision or external edit, return a conflict response. Keep the unsaved edit in the browser and offer reload plus explicit reapply; never silently overwrite another tab's or editor's changes. If validation, backup, or disk writing fails, show the error and retain unsaved edits.

Restrict mutations to allowed fields. Keep imported original values and earlier recommendations intact unless the user explicitly edits a recommendation. Recompute `normalized_url` after URL changes, preserve video identifiers such as YouTube's `v`, and remove only known tracking parameters.

Protect the localhost mutation API against cross-origin writes: same-origin requests, JSON content type, a session token, and no permissive CORS. Issue numbers and field paths are validated, not interpolated into shell commands.

### Markdown export and GitHub placement

Version 1 exports reference blocks and proposal drafts for manual placement. Preview the exact text, group references by issue, include a short reason, and optionally include relevant source caveats. Escape Markdown labels and allow only HTTP(S) URLs.

Do not include duplicate references or unaccepted suggestions. For a rejected/deferred item, export nothing. Export/copy does not change placement status.

A future explicit GitHub integration can refresh issue snapshots and compare URLs before adding references. Authenticate through the local server, never expose tokens to the browser, and preserve unrelated issue text. Posting and confirming placement are distinct from preparing a draft.

## Build phases and acceptance criteria

### Phase 1: data contract and working storage

Implement typed models, JSON Schema validation, referential checks, derived progress selectors, and the local storage API.

Acceptance:

- The supplied 148-record JSON loads successfully and originals round-trip unchanged.
- All 38 prior suggestions, six proposals, and newer contextual mappings are discoverable.
- Initial progress is 0/148 complete.
- Invalid category/issue references and duplicate IDs produce useful errors.
- An edit survives restart; backup and conflict behavior work.

### Phase 2: connection-map review workspace

Build the force-directed bubble/hub graph, semantic zoom, side tool rail, filtering/search, selection highlighting, and bookmark inspector. Add pan/zoom, fit view, node positioning/pinning, category approval, disposition selection, and multi-issue assignment. Include the compact list/outline alternative and keep view preferences separate from dataset writes.

Acceptance:

- The user can process one bookmark through the map and inspector, then continue in the same filtered queue without losing selection context, positions, or viewport.
- One bookmark connects to several destinations through one canonical node. Bookmarks with no suggested destination remain discoverable and reviewable.
- One bubble can link to a topic, an existing issue, and a new proposal simultaneously. Topic links remain distinguishable from recommendations and selected placements.
- Zooming out reduces bubble detail; zooming in reveals titles, domains, and status. Node IDs and decisions remain unchanged. Selected labels and inspector details stay available at overview scale.
- The initial force simulation settles; selection, zoom, filters, and saves do not make the graph drift. Pins and saved geometry survive reload; explicit re-layout respects pinned nodes.
- The explicit-alternatives filter follows recommendation `alternative_proposal_id`, finds the four source records represented in the approved mockup, and exposes both kinds of destination together.
- Suggestions stay distinguishable from selected destinations.
- Selected connections show independent placement states; observed references are not automatically confirmed.
- A new-issue target remains pending until the issue is registered.
- Approving a category cannot change placement progress.
- Moving or pinning nodes, filtering, selecting bubbles, changing zoom detail, focusing hubs, and resetting layout do not change review decisions or completion.
- Multi-selection approval changes only the selected bookmarks' approved categories.
- Working notes, tags, favorites, and corrected URLs persist.

### Phase 3: issue/proposal boards and drafting

Build grouped pending/confirmed placements, proposal editing and issue registration, and copy/download of reference Markdown.

Acceptance:

- Different proposed homes for the same bookmark are visible.
- Existing references can be marked already present after review.
- Copying a draft never increments completion.
- A new issue can be registered, its seeds routed, and its placements confirmed.
- Multiple placements remain independently tracked.
- Board and progress entries focus the matching map context; returning restores the previous view.
- Resolving a proposal to a created catalog issue keeps one selected connection per resolved destination.

### Phase 4: recovery, import/export, and usability

Add import preview, complete JSON export, undo for ordinary edits through history, visible saving/error states, keyboard navigation, and recovery/reset of canvas preferences. Test desktop, touch, narrow-screen, and compact-list/outline use.

Acceptance:

- Restart/export/import preserves decisions, history, and original data.
- Invalid imports leave the working dataset untouched.
- A failed save retains the pending edit and reports the failure.
- Two tabs attempting edits from the same revision cannot silently lose data.
- Undo restores the chosen working value without removing audit history.
- Canvas view preferences survive reload independently of dataset decisions; stale view IDs recover safely and reset-view changes no bookmark data.
- Every review and placement action works through keyboard or compact navigation without requiring dragging or hover.

### Optional later work

Only after the manual workflow is useful: read-only issue refresh, URL health checks, direct GitHub writes with review, and additional CSV imports. Keep CSV ingestion separate from the initial app; merge by Raindrop ID, preserve prior decisions, and explicitly review changed source records. Do not add accounts, cloud sync, AI recategorization, or a database to the first version.

## Focused verification

Use tests for data integrity and persistence, where a defect could lose work or misstate progress. Cover:

- Pending, decided, deferred, skipped, duplicate, and attached completion cases.
- Several selected targets, including one uncreated proposal.
- Duplicate cycles, missing references, and duplicate resolved destinations.
- Markdown escaping and tracking-query removal that preserves content IDs.
- Failed writes, stale revisions, external file edits, and invalid imports.
- Original CSV fidelity and preservation of prior mappings.
- Canonical graph identities, suggestion versus selected-target edges, and proposal resolution without duplicate connections to the same issue.

Add one browser workflow check through the connection map: filter an item, select its node, reposition it, approve its category in the inspector, select two existing targets, export a draft, confirm only one, reload, then confirm the second. Progress must remain pending until the last confirmation, while the filtered context and user position remain available. A second case marks a bookmark already present after review. Also check that an existing/proposed alternative stays pending until the proposal is registered and its placement confirmed.

Check map navigation separately from decision writes: selecting, moving, or pinning a node, changing filters or zoom detail, and resetting layout must not issue dataset mutations or change completion. Verify that a bookmark with no destination edges can be reviewed through both the map and compact navigation. Check a bubble linked to topic, existing-issue, and proposal hubs; it must retain one identity at every zoom level. Confirm that layout settles, selection remains stable, and pins survive reload and deliberate re-layout. Graph motion must respect reduced-motion preferences; provide a settled initial view without visible animation when requested.

## Decisions for the initial build

Proceed with a local app, disk-backed JSON, manual GitHub placement, a force-directed graph as the main workspace, one bubble per bookmark, individual topic/issue/proposal hubs, semantic zoom, side filters/actions, a contextual inspector, and explicit per-target confirmation. Provide compact navigation for narrow screens and accessibility. Canvas geometry and pins remain view state. The approved force-directed and semantic-zoom mockups supersede the earlier fixed-column references; tune visual details within this accepted structure during implementation.
