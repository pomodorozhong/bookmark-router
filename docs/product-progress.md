> **Superseded October 11, 2026** by [plan.md](plan.md). Kept as history.

# Implementation progress

## Completed

- Full approved plan saved in [product-plan.md](product-plan.md), with [checkpoint guide](product-review-guide.md).
- User amended the location: replace the prototype in `app/`, rather than build in `product/`.
- Prototype squash merge `eadbd86` reverted by `90c8540` on `codex/bubble-tag-product`. Nothing pushed.
- Existing prototype export edits preserved in the Git stash named `preserve prototype export edits before replacement` and `/private/tmp/bookmark-prototype-preserved` (binary patch, untracked source files, prototype archive, working dataset, and ignored app files).
- Phase 1 foundations: typed entities and backup/filter/geometry contracts; invariant validation; revision-checked domain commands; transactional IndexedDB storage with a versioned initial schema and separate geometry; worker-based import parsing.
- Runnable checkpoint A: source selection, field mapping, invalid/duplicate/missing-field review, merge proposals, and an in-memory graph preview. Includes bookmark and URL-less reading/writing workflows.
- G6 5.1.1: force layout/dragging, two-finger scroll panning, fit/zoom buttons, selection, inspectors, search, list alternative, visible errors, and reduced-motion handling. Memberships are undirected.

## Verification

- 23 automated tests pass: source formats and malformed input, original source line numbers, conservative URL matching, unknown statuses/types, backup validation, reference invariants, command restrictions, reviewed status propagation, IndexedDB reload, and simultaneous cross-tab revision conflicts.
- TypeScript and Vite production build pass. Vite reports the expected large G6 bundle; performance optimization remains release-hardening work.
- Browser walkthrough: sample source → mappings → duplicate/invalid-row review → collection preview; graph renders and settles. Scrolling leaves layout and position counts unchanged. Searching and switching to list yields matching results; returning to graph preserves the existing settled layout.
- Development app responds on http://127.0.0.1:5199/.

## Checkpoint A — approved October 10, 2026

The user approved stage one on October 10, 2026 after the import and workspace design refinements. Phase 2 is now authorized. Domain/parser/storage foundations are independently implemented and tested.

Stage A was approved with in-memory previews. Stage B now persists confirmed operations and implements the reviewed import choices.

## Remaining

- Checkpoint C review feedback: clarify any confusing filter rules, copy output, or media behavior found during the complicated-workflow walkthrough.
- Stage C.1 (plan amendment, October 11, 2026): one change-set Undo/Redo model with bounds, schema 2 migration, import-history retention, media collection, New bubble, archive/unarchive, collection deletion, outcome counts, 1,000/5,000 storage and filter measurements, and the prototype converter. The user decided undo, lifecycle, conversion, and WebMCP-target questions on October 11. Close the C1 entries in the plan's deferred verification register.
- Phase 4 (after C1 and once the user names the browser/agent pair): optional extraction service, missing-data queue, reviewed WebMCP proposals, and browser/agent validation.
- Phase 5: close the remaining deferred verification entries, accessibility/recovery hardening, static-deployment verification, and 1,000/5,000-bubble performance checks.

Stage A is committed as `c31e483` and `0e3fb53`. Stage B is recorded in focused local commits. No deployment, push, or publishing has occurred.

## Checkpoint A feedback corrections

- Expanded the graph to the full available workspace, with a closable overlay inspector and optional expanded view.
- Fixed the import action bar to the viewport bottom at every step, including the final preview action.
- Clip long detail headings and linked-bubble titles with ellipses and expose full text on hover.
- Selected tags receive an outline/halo and their memberships are highlighted, without re-layout.
- Added pointer-centered trackpad pinch zoom: Chromium Ctrl-wheel and Safari gesture handling, independent of ordinary scroll panning. This supersedes the original pinch-zoom exclusion. Physical Mac pinch testing remains a user review task.

- Further user refinement: removed the expanded-view switch. The graph now fills the window by default, with navigation, collection information, search, graph/list, and details controls in a retractable left panel.

- Refined control placement: search is back at the top; Graph/List and Details are at the top right. The retractable panel retains navigation and collection information.

- Simplified the workspace summary to bubble/tag counts only; removed its preview heading, collection name, tagline, and design-review badge at user request.

## Phase 2 — functionally accepted October 10, 2026

- Transactional import confirmation, unknown status/type mapping or explicit creation, explicit invalid-row exclusion, duplicate Skip/Keep/Merge choices, and frozen revision checks. Duplicate submission is guarded; stale confirmation refreshes review.
- Persistent collections start empty; sample buttons only load sources. Collection creation/selection and browser reload are integrated with IndexedDB.
- Bubble/tag editors retain failed drafts; edits, independent statuses, tag creation, and memberships use revision-checked commands.
- Import history previews undo targets and protects bubbles edited since import. Merged values and memberships are restored; imported taxonomy is kept for reuse and saved references.
- Full JSON backup/restore bundles local media (including media retained by undo snapshots), validates encoding/references/geometry, remaps local media IDs, and restores into a new collection atomically. Remote media stays referenced. Image/video/audio previews support restored assets.
- G6 geometry and viewport save separately from content. Saved coordinates/pins are restored without renewed motion; deliberate re-layout respects pins. Structural changes use frozen placement; styles/search/selection/pan/zoom do not restart physics. Public d3-force simulation injection handles persisted pins without using G6 internals.

### Stage B verification

- 35 tests cover the existing foundations plus import/merge/undo, protected membership edits, invalid selected rows, stale/double submissions, unknown mappings, bundled-media round trips, undo snapshot media, and quota/restore failure rollback.
- TypeScript and production build pass. G6's large bundle warning remains a release-hardening item.
- Browser: imported bookmark sample with a merge; edited description and status; reloaded and verified those values; reviewed and executed undo keeping the edited bubble; downloaded a backup and restored that actual file into another collection.
- Browser: restored the bundled-media fixture and displayed its image; dragged a tag with responding neighbor; restored saved viewport after reload. Fixed a viewport coordinate-space issue and a graph initialization race during collection switching.
- Physical Mac trackpad pinch/panning remain in the user checklist. Media upload UI and the advanced Stage C tools are intentionally next-stage work.

The user accepted Stage B's functionality on October 10, 2026 and requested a UI improvement stage before Stage C. The [checkpoint B checklist](product-review-guide.md#b--real-import-and-recovery--accepted-october-10-2026) remains the functional regression reference; acceptance does not imply every manual checklist item was individually verified.

## Stage C — Checkpoint C ready for review October 10, 2026

Stage C is implemented as a runnable complicated workflow. Tags support type-inherited color, size, shape, and icon appearance with per-field overrides/reset. Tag-only and tag-plus-linked status changes show reviewed targets, include hidden linked bubbles, commit atomically, and provide revision-checked undo. Multi-selection adds reviewed bulk status changes and local image/video/audio attachments.

Nested All/Any/Not, same-linked-tag, membership, asset, date, missing-field, batch, and shortest-path distance rules share one match pipeline. Saved views retain filters, tag-display hiding, and sort order; Graph and List consume the same results. The copy composer supports field order, separators, plain/Markdown output, placeholders, current-view/all-linked scopes, ordering, and saved presets. It opens with the current default output and a prominent copy action; detailed controls are collapsed, with quick Link only, Title only, Title + link, and Markdown links presets. Bubble Details also has a one-click Copy action. Local assets remain IndexedDB-backed and copy by filename rather than blob URL.
- Reviewed status changes were first undone through a separate Undo status control in the bottom bar. Uncommitted work during review replaced it with a general per-collection Undo; the October 11 plan amendment consolidates these into one undo model (Stage C.1).
- The selected-node bar is now the single status entry point for tags, individual bubbles, and multi-selection; Details retains information and copy/media actions.

### Checkpoint C verification

- 45 automated tests pass, including nested/same-tag filters, full-graph distance paths, exact copy output, quick copy presets, saved view/preset commands, revision-checked media attachments, and atomic IndexedDB workspace/blob writes.
- `npm run check` and `npm run build` pass. Vite still reports the expected large G6 bundle warning; performance work remains Phase 5 hardening.
- Browser walkthrough verified the filter builder, nested groups, distance examples, hidden-tag separation, saved-view update/apply, Graph/List parity, multi-selection status review and toolbar Undo, the immediate-result copy composer with collapsed customization and quick presets, Bubble Details copy feedback, the appearance editor, and the local-media upload surface without selecting a file.
- The existing local review collection includes a saved `Stage C review` fixture with a nested All/Any/Not rule and one matching bubble; clear it before starting another review task if desired.

## Checkpoint B feedback — URL warnings and graph titles

- Bubble/tag URLs accept unrecognized text instead of blocking imports or editor saves. Import review and details highlight these values in amber; only HTTP(S) values become source links. Duplicate matching/merging and backup/restore preserve unrecognized text.
- Media URLs and malformed source rows retain structural validation.
- Graph titles use a fixed screen font size with G6 collision suppression. Selected records and tags get display priority; visibility recalculates during zooming, dragging, filtering, and selection without re-layout.
- Added an import/persistence/deduplication/merge/restore test for malformed and JavaScript-scheme URL text; updated existing URL expectations to match the new product rule.
- Browser verification: malformed sample URL remains checked and Continue is enabled; graph titles retain screen size at 86% and 135%, suppress crowded labels at 35%, and keep layout/position counters unchanged.

### Stage B interaction refinements

- Missing-title badges use an amber warning tint; Details shows a compact non-link warning.
- Search hides tags with no matching linked bubbles and restores them when cleared.
- Pins are explicit through Details; dragging does not pin. Pinned nodes showed a red dot (replaced by the flat pushpin in B.1).
- Fit graph uses asymmetric padding measured from the open Details panel.
- Browser verified search visibility, manual pin/unpin and marker, drag without pinning, and fit beside Details.
- Final verification: TypeScript/Vite production build and all 35 tests passed; explicit pins also survived browser reload.

## Stage B.1 — UI improvement approved October 10, 2026

The user approved B.1 after reviewing the running UI. U2 is complete for product acceptance; the remaining physical trackpad, 200% browser/text zoom, and full recovery/media matrix checks remain follow-up regression work and do not block Stage C.

- User identified detached/flat red pin, disordered sidebar, overuse of text buttons, and off-center icons.
- User additionally requested fixing tag text during zoom; this is an explicit P1 item with font, placement, background, and hide/restore checks across the supported zoom range.
- Audited the live graph/Details view and implementation; recorded additional hierarchy, typography, diagnostics, state-feedback, list, import, dialog, and responsive-style issues in [ui-improvement-plan.md](ui-improvement-plan.md).
- Inserted B.1 between B and C, with visual design review U1 and runnable review U2 in the [companion checklist](product-review-guide.md#b1--ui-improvement--accepted-october-10-2026).
- Implemented the shared SVG icon system, reordered sidebar, collection context card, responsive toolbar, attached flat vector pin marker, zoom-stable tag label padding/background, grouped layout controls, structured Details panel, list selection/empty states, import source hierarchy, and shared creation/editor dialogs.
- Browser-verified populated graph, selected Details, fit graph, list mode, list/Details coexistence, reduced and increased zoom, narrow toolbar/navigation, import source screen, and custom tag dialog. Stage C follows B.1 approval.

### B.1 review corrections — October 10, 2026

- Replaced the layered stylesheet, raised useful text sizes/contrast, simplified collection context, moved Details actions into its header, and made long titles readable without hover.
- User feedback supersedes the realistic pin: the current marker is a flat red vector pushpin. Zoomed-out tags use plain labels below small nodes instead of oversized green pills.
- Unified native dialogs and fixed creation error retention, keyboard focus, mobile drawer dismissal, and list/sheet layouts.
- Corrected empty-geometry initialization and supplied-simulation repainting discovered during demo import and layout review.
- Added a separate UI review collection, screenshots, and [a review report](ui-review/review.md) distinguishing verified checks from remaining acceptance work. All 37 tests, TypeScript, and build pass.
