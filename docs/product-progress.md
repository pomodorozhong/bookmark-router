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

The UI explicitly saves nothing yet. Merge selections and unknown status/type resolution are design previews, not committed edits.

## Remaining

- Phase 2: transactional import confirmation and undo, basic editing, memberships/statuses, persistence integration, saved geometry/pins, and full media backup/restore.
- Phase 3: appearance editor/inheritance, confirmed bulk status UI and undo, copy composer, detailed/saved/distance filters, bulk media uploads, full selection and semantic detail.
- Phase 4: optional extraction service, missing-data queue, reviewed WebMCP proposals, and browser/agent validation.
- Phase 5: accessibility/recovery hardening, static-deployment verification, and 1,000/5,000-bubble performance checks.

Implementation changes after the revert remain uncommitted. No deployment or publishing has occurred.

## Checkpoint A feedback corrections

- Expanded the graph to the full available workspace, with a closable overlay inspector and optional expanded view.
- Fixed the import action bar to the viewport bottom at every step, including the final preview action.
- Clip long detail headings and linked-bubble titles with ellipses and expose full text on hover.
- Selected tags receive an outline/halo and their memberships are highlighted, without re-layout.
- Added pointer-centered trackpad pinch zoom: Chromium Ctrl-wheel and Safari gesture handling, independent of ordinary scroll panning. This supersedes the original pinch-zoom exclusion. Physical Mac pinch testing remains a user review task.

- Further user refinement: removed the expanded-view switch. The graph now fills the window by default, with navigation, collection information, search, graph/list, and details controls in a retractable left panel.

- Refined control placement: search is back at the top; Graph/List and Details are at the top right. The retractable panel retains navigation and collection information.

- Simplified the workspace summary to bubble/tag counts only; removed its preview heading, collection name, tagline, and design-review badge at user request.

## Phase 2 started

Transactional import/undo and media backup/restore domain code is in progress, not yet wired into the UI or verified. Keep this work out of the approved stage-one commit.
