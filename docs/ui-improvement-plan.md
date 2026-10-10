> **Superseded October 11, 2026** by [plan.md](plan.md). Kept as history.

# Stage B.1 — UI improvement before Stage C

Status: implementation revised and U2 approved after user review, October 10, 2026. Stage B and B.1 are accepted; follow-up manual checks remain documented. See the [implementation review and evidence](ui-review/review.md).

**Review amendments:** The user rejected the realistic pin treatment; use a flat red vector pushpin with a visible needle and minimal shading. The zoomed-out tag treatment was also rejected: titles now remain centered inside only when they fit, and move below small nodes as plain constant-size labels. These amendments supersede the dimensional-pin and always-centered label requirements below.

[Product roadmap](product-plan.md) · [Review guide](product-review-guide.md#b1--ui-improvement--accepted-october-10-2026) · [Progress](product-progress.md)

## Review basis

Reviewed the running app at 1280 × 720 with an existing seven-bubble, three-tag collection, a pinned bubble, and its open Details panel. Inspected the list DOM and the source for import, editing, history, recovery, graph rendering, and responsive styles. Findings below distinguish observed visuals from source findings; narrow-screen behavior and contrast ratios still need measurement during implementation. No collection content was edited for this audit.

## Findings and priorities

P1 is the core workspace pass; P2 completes consistency across existing workflows. Both belong to B.1.

| Priority | Issue and evidence | Planned correction |
|---|---|---|
| P1 | **Pin looks detached and flat.** Live view shows a red dot floating to the right of the bubble. `GraphCanvas.tsx` renders the text glyph `●` as a generic right-top badge. | Draw a small dimensional red pushpin whose needle visibly enters the upper-right rim. Anchor it to node geometry and control its screen size. |
| P1 | **Tag text during zoom needs correction.** Explicit follow-up from the user. The renderer currently counter-scales label font and padding and suppresses crowded labels; the exact visual failure still needs reproduction across zoom levels. | Keep tag titles centered and readable at constant screen font size, with correctly sized backgrounds and clearance; make hide/restore behavior stable during zoom. |
| P1 | **Sidebar order obscures scope.** Collection selector is below samples; New tag sits under Collections & recovery; counts appear twice. Observed live and in `App.tsx`. | Order collection context before navigation, then creation and recovery. Move samples into Import. Show counts once. |
| P1 | **Icons have inconsistent shape and alignment.** Navigation, close, collapse, zoom, source cards, and success marks use unrelated text glyphs. CSS varies padding, font sizes, and dimensions. | Use one SVG icon family and shared button components with fixed icon boxes, consistent stroke weight, and explicit centering. |
| P1 | **Controls lack priority.** Reset positions, Re-layout, Fit graph, and zoom occupy one equally styled row. | Group everyday view controls; put layout/reset in a labeled overflow menu. Retain explicit reset confirmation. |
| P1 | **Details mixes information with editing.** Live view shows a linked-tag chip immediately followed by touching Pin/Edit buttons, then another tag list of checkboxes. | Establish header actions, record information, and connections as separate sections; use one membership section with an explicit edit mode. |
| P1 | **Technical text consumes prominent canvas space.** G6 version, undirected memberships, layout runs, and position samples are visible at all times. | Move diagnostics behind a development-only surface. Put gestures in a compact Help popover; retain visible loading/error feedback and zoom. |
| P1 | **Typography is too small and faint in useful places.** Live inspector/body text is weak; CSS uses 10–12px for many labels, rows, buttons, and descriptions. | Establish a readable type scale and stronger secondary-text contrast. Measure contrast instead of relying on visual judgment alone. |
| P2 | **Selected-state language is inconsistent.** Graph selection has emphasis, but list rows have no selected class/state; Details has `aria-pressed` without a matching visual rule. Source finding. | Give selected rows and pressed toggles a persistent visual state, separate from hover and focus. |
| P2 | **List content has weak structure and may sit beneath Details.** Rows use content-sized title/description spans; Details is absolutely overlaid without list accommodation. Source finding; overlap needs visual verification. | Align title, description/domain, and status consistently; reserve space for Details on desktop. Use stacked rows on narrow screens. |
| P2 | **Empty and no-match feedback is incomplete.** Graph has an empty message without a direct action; list has no empty/no-results branch. Source finding. | Distinguish empty collection, no search matches, no selection, and graph failure, each with an appropriate next action. |
| P2 | **Import repeats controls and messages.** Samples appear in both sidebar and source page; a file label wraps the native chooser; the same error can appear in a toast and inline. Source finding. | Keep samples near source input; simplify file selection and format treatment; show errors beside the relevant action once. |
| P2 | **Dialogs and feedback are visually fragmented.** Creation uses browser prompts, editing uses a custom modal, history/undo use other markup. Toast positioning uses a fixed left offset. Source finding. | Reuse a dialog, field, action-footer, and feedback system; place notices responsively. Include focus management and keyboard dismissal. |
| P2 | **Spacing and responsive rules have accumulated overrides.** `styles.css` repeatedly redefines sidebar, workspace, toolbar, canvas footer, and inspector rules; the close control is 25px with negative margins. | Consolidate each component's layout rules and tokens, with deliberate desktop/narrow layouts and consistent targets. |

Primary source locations: [App.tsx](../app/src/App.tsx), [GraphCanvas.tsx](../app/src/components/GraphCanvas.tsx), [RecordEditor.tsx](../app/src/components/RecordEditor.tsx), [styles.css](../app/src/styles.css).

## Design direction

Use a calm, compact workspace: a light neutral canvas, readable charcoal text, restrained teal for selection and primary actions, amber for warnings, and a dimensional red pin as the deliberate physical cue. Reduce competing boxes and repeated explanatory text. Keep the full-window graph, retractable navigation, top search, and top-right Graph/List and Details controls established in Stage A.

Starting tokens for visual review: 4/8/12/16/24/32px spacing; 14px normal body and control text, 12px secondary metadata, 18px detail headings; 18px icons within 36px desktop buttons and at least 44px touch targets. Use a small radius scale and reserve shadows for floating surfaces and the pin. Check optical centering alongside geometric centering, especially chevrons, plus/minus, and asymmetric icons.

### Sidebar hierarchy

Top to bottom:

1. Compact brand and aligned collapse control.
2. Current collection selector with adjacent New collection icon and a single bubble/tag count beneath it. The selector supplies the name; do not reintroduce the removed workspace title, tagline, or review badge.
3. Primary navigation: Collection and Import, using icons with labels and a clear active state.
4. Collection action: New tag, presented as creation rather than navigation.
5. Lower utility group: Import history, Download backup, and a Restore backup entry that opens the existing JSON import flow. Explain that restore creates a new collection there.
6. One quiet browser-local storage note at the bottom.

Samples live only in the Import source step. Keep collection context stable when moving between graph/list and Import. Avoid a new dashboard or extra navigation destinations.

### Control policy

| Treatment | Controls |
|---|---|
| Icon only, with accessible name and hover/focus tooltip | Panel open/close, Details close, search clear, zoom ±, Fit graph, dismiss notice, header Pin/Unpin and Edit, utility-menu trigger |
| Icon with visible label | Sidebar navigation, Import, New tag, collection recovery commands, Graph/List, Details |
| Visible text action | Read source, Review records, Continue, Confirm import/restore, Save changes, Cancel, Review undo, destructive confirmation |

Do not hide ambiguous or consequential actions behind unexplained symbols. Graph/List remains a paired mode control; Details visibly reflects open/closed state; Pin visibly reflects pinned/unpinned state. All icon hit areas are centered using shared layout rules rather than font baselines or per-button padding patches.

### Pin geometry and rendering

- Replace the dot glyph with a small vector pushpin: red head with highlight and darker underside, a short shaft/needle, and a restrained contact shadow. Avoid platform emoji rendering.
- For a circular node, place the needle's contact point at the upper-right contour, approximately `(cx + r / √2, cy − r / √2)`, slightly inset so it visibly pierces the node. The head extends outward toward the top right. Position the contact point, not the icon bounding-box center.
- Derive the anchor from actual rendered node bounds. Define equivalent contour anchors for rounded squares and diamonds so Stage C can reuse the renderer.
- Aim for a 16–18px screen-size marker at ordinary zoom, with a documented small-node fallback at far zoom. Review examples at 35%, 100%, and 200%; it must stay attached, legible, and clear of titles and selection outlines. Decorative head/shaft must not enlarge the graph's hit target or collision radius.
- Pin remains an explicit Details action; dragging still does not pin. Rendering changes must preserve saved pin state and never restart physics.

### Workspace and Details

Keep search at top left, then Graph/List and Details at top right. Put zoom and Fit in a compact bottom control group. Move Re-layout and Reset positions to a labeled layout menu; reset still describes clearing pins before confirmation. Show a short loading message only while needed and actionable graph errors with list access.

Details gets a header with record type, accessible full title, and aligned Edit, Pin, and Close actions; then status/source/description/media; then connections. Linked tags are readable chips, with an explicit Manage tags control revealing membership checkboxes in the same section. Tag details use the same structure for linked bubbles. Keep normal titles compact and provide a keyboard/touch-accessible way to read long titles, beyond hover-only `title` text.

Graph retains its closable overlay inspector. Desktop list reserves width for the inspector so rows remain readable. At narrow widths use a dismissible drawer/sheet with deliberate focus behavior; navigation and Details must not stack into inaccessible overlapping panels.

### Tag text during zoom

Reproduce the user's reported issue before changing the renderer. Preserve the established constant screen-size title rule while checking font size, positioning, background/padding, and collision visibility as one system. Tag text must remain centered on its node, avoid clipping or a conspicuous oversized background, and update smoothly while zooming in either direction. When a small node cannot accommodate its title, use a deliberate label treatment consistent with the approved mockup rather than shrinking the type unpredictably.

Use short and long tag names, crowded neighboring tags, and selected/unselected states at 15%, 35%, 100%, 200%, and 400% graph zoom. Crowded labels may hide under the established collision rule, prioritizing selection and tags; they must reappear when space returns. Check both pinch and zoom buttons, and reload at a saved zoom. Label updates must not move nodes or restart layout.

## Implementation sequence

| Step | Deliverable | Dependency | Completion condition |
|---|---|---|---|
| **1. Visual design and checkpoint U1** | Static high-fidelity HTML/CSS mockup of the populated workspace, selected pinned bubble, open Details, collapsed navigation, and a narrow-screen variant; include a pin close-up and representative icon/button states. | This plan is selected for execution. | User can judge sidebar order, density, pin placement/depth, and control clarity from a concrete artifact. Record and resolve material visual feedback before applying the design across the app. |
| **2. Foundations and core workspace** | Shared icons/buttons/tokens; consolidated styles; rebuilt sidebar/top controls; pin renderer; tag text during zoom; Details hierarchy; cleaner canvas chrome. | U1 visual direction accepted. | The original four complaints, the tag-text zoom follow-up, and all P1 findings are resolved in the running workspace. Selection, geometry, viewport, pin persistence, and force dragging behave as in Stage B. |
| **3. Consistency across existing workflows** | List layout and selection, empty/search states, import hierarchy, editor/creation/history/undo dialogs, feedback placement, narrow layouts. | Shared components and shell from step 2. | Existing Stage B tasks use the same typography, spacing, icons, states, and action hierarchy; no inaccessible/covered controls in the viewport matrix. |
| **4. Verification and checkpoint U2** | Runnable build, comparison screenshots, completed technical checks, and the short review checklist. | Steps 2–3 complete. | User verifies visual quality and everyday operation; material feedback is resolved. B.1 is then complete and Stage C resumes. |

U1 requires roughly 5–10 minutes of visual review. The implementer prepares all variants and example states; the user decides whether the hierarchy, density, and pin feel right. Broad UI implementation waits for this response; a control inventory and nonvisual regression preparation can continue independently.

U2 required roughly 10–15 minutes with the running app. The implementer supplied a separate demo collection containing long titles, URL warnings, different statuses, linked/unlinked items, and pinned nodes. The user reviewed navigation, inspection, search, and an import/recovery path. Remaining manual checks are regression work during Stage C; routine technical checks remain the implementer's responsibility.

## Verification and scope boundaries

- Capture comparison views at 1440 × 900, 1280 × 720, 768 × 1024, and 390 × 844; include both panels open/closed, graph/list, import with fixed footer, and dialogs. Also check 200% browser text/zoom accessibility without confusing it with graph zoom.
- Confirm icon optical centering, consistent hit areas, keyboard focus, tooltips on focus, pressed/selected semantics, readable text/contrast, dialog focus containment/return, Escape dismissal, and reduced motion. Measure contrast against agreed accessibility targets during implementation.
- Check pin attachment on bubbles and existing tag shapes at graph zoom extremes and normal zoom; verify no title/halo collisions or detached marker while dragging. For future shapes not yet reachable through the UI, use renderer fixtures.
- Verify tag text at 15%, 35%, 100%, 200%, and 400% graph zoom in both directions: consistent screen font size, centering, appropriate background, no clipping, stable collision suppression/restoration, and correct rendering after reload at saved zoom.
- Confirm sidebar/Details toggles, selection, graph/list switching, search, pan, pinch, and zoom preserve settled world positions. Re-layout respects pins; reset remains explicitly confirmed; reload preserves positions and pins.
- Run `npm run check`, `npm test`, and `npm run build` in `app/` after implementation. Use targeted interaction tests for changed state/focus behavior; use screenshots and visual inspection for alignment, hierarchy, and depth instead of CSS-value unit tests.
- Smoke-test import confirmation, retained failed edit drafts, membership changes, undo conflict review, backup download, and restore into a new collection. Existing transaction/revision safeguards remain in place.
- No Stage C appearance editor, bulk tools, saved filters, extraction, data-model redesign, new graph engine, deployment, or performance project is included. The pin renderer can support existing shape data without adding appearance-editing features.

Completion means the full Stage B surface is visually coherent, the four original complaints, tag-text zoom follow-up, and audit findings are resolved or explicitly agreed as deferred, and the functional baseline remains intact.
