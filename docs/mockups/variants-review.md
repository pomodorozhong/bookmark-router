# Connection-map variants for spec review

**Superseded structure:** the user subsequently selected a [force-directed graph with semantic zoom](force-directed-review.md). Keep these sketches as historical alternatives; their fixed columns and topic containers no longer define the planned graph.

These October 6, 2026 sketches explore the approved connection-map direction. They are proposals for review, not accepted amendments or product implementation. Styling is provisional. The existing issues / bookmark groups / new proposals arrangement, side tool rail, and contextual right inspector remain common to all variants.

All screenshots use the initial unreviewed state: 0/148 complete, no chosen targets, and dashed recommendation edges. B2 and B3 use the existing four-bookmark explicit-alternatives filter; the second topic group is collapsed. B1 represents navigation across the full import with only a small part of the map expanded. Content is representative, not a full rendering of all records or exact recommendation rationale. Queue counts other than the known 148 unreviewed bookmarks are intentionally omitted.

| Variant | Structural choice | Benefit | Tradeoff |
| --- | --- | --- | --- |
| [B1 — Overview + persistent queue](connection-map-b1-overview.png) | Pin the filter drawer open; collapse topic groups; keep a compact inspector | Keeps queues and topic navigation visible while exploring all 148 records | Four regions compete for width; comparison needs a separate inspector state |
| [B2 — Destination comparison](connection-map-b2-comparison.png) | Collapse filters; widen the inspector; put existing and proposed homes side by side | Makes scope, rationale, and caveats easier to compare before selecting targets | Less canvas width; long text requires expansion or scrolling |
| [B3 — Guided review](connection-map-b3-guided.png) | Collapse filters; divide the inspector into Topic, Destination, and Placement steps | Makes the separate decisions explicit and reduces the amount shown at once | More navigation; experienced users may prefer direct editing |

## Decisions these sketches can settle

1. **Queue visibility:** should the filter drawer start open, remember its previous state, or start closed? B1 proposes visible queues during broad review. It remains collapsible.
2. **Map density:** should topic containers initially show every card or start collapsed? B1 proposes progressive expansion for the full import. Collapsed containers represent groups, not extra bookmark records; visibility changes never remove targets or change progress. Group counts must count matching bookmarks.
3. **Comparison depth:** should the inspector stack suggested targets, compare two candidates side by side, or expose comparison on demand? B2 proposes comparison as an inspector mode. Each candidate can expand its exact rationale, caveats, observed-reference status, and provenance. More than two candidates still need browsing, and users can select multiple targets with distinct placement reasons.
4. **Inspector flow:** should topic, routing, and placement appear together or as revisitable steps? B3 proposes steps inside the inspector, with the canvas and filtered queue preserved. Topic approval is not completion. Destination includes disposition selection, destination browsing, and the chosen-target list. Keep, skip, duplicate, and defer decisions use their existing validity rules; they do not require placement. Attach exposes one confirmation control per selected target. An uncreated proposal stays pending.

## Suggested combination for the next review

Start with **B1's collapsible queue and topic groups**, and use **B2's comparison mode** when inspecting alternative destinations. This gives broad navigation and detailed comparison without making the inspector wide at all times. Treat B3 as a competing inspector workflow to review before adding a second interaction mode.

Regardless of the chosen combination, retain explicit per-target pending/added/already-present states, deliberate source opening, source notes and provenance, editable fields, queue navigation, and accessible compact navigation. Dragging only changes geometry. Copying Markdown changes no placement state. Preserve map state when switching inspector modes or returning from boards.

The main review question is which navigation and inspector behaviors to adopt. Approval of these sketches would refine the spec; implementation still requires a request to build the UI.

## Editable sources

- [B1 SVG](connection-map-b1-overview.svg)
- [B2 SVG](connection-map-b2-comparison.svg)
- [B3 SVG](connection-map-b3-guided.svg)
- [Drawing source](render-variants.py): produces all three PNGs and SVGs with Python and Pillow. It uses macOS Arial font files; adapt `FONT` for other systems.
