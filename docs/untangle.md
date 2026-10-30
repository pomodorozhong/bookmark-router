# Untangle

The Connections view and **Best next** for [#90](https://github.com/pomodorozhong/bookmark-router/issues/90). It builds on the [Map canvas redesign](map-canvas-redesign.md), which was designed alongside it. [Product behavior](product.md#current-behavior) summarizes the result; this page records the design and the calculation.

## Goal

Inspired by [Vax!](https://github.com/digitalepidemiologylab/VaxGame): show bookmarks as small nodes joined by shared tags, and calculate which bookmark's completion would best separate the remaining backlog into smaller clusters. That turns the game's visual search for a good node to "vaccinate" into a starting point for triage.

In the saved 148-bookmark collection, processing **SCRNSHTS** splits a connected set of 31 To triage bookmarks into **19 and 11**, while the bookmark with the most direct neighbors splits nothing.

## Behavior

- **Tags | Connections** at the start of the graph tools switches views; Tags is the default. Connections draws one node per bookmark and one link per pair sharing a visible tag, keeping every shared tag as evidence. More shared tags make stronger links. Node size counts the bookmarks split off from the largest remaining cluster if that bookmark were processed (11 for a 19 + 11 split); a ring marks Best next.
- **Tag nodes** shows tags as context nodes: it re-layouts bookmarks and tags around their memberships, draws only bookmark-to-tag links with pointed, punched tag shapes, and fits the scope. Turning it off restores the direct arrangement. Tags never become processing targets, and the toggle changes no score, order or forecast. Clicking a context tag highlights its bookmarks without changing the current bookmark; its chip at the end of the graph tools opens the tag or clears the highlight.
- **Scope:** on To triage, the analysis uses the bookmarks matching the current search, filters, tag visibility and selection. Done and Dropped bookmarks are not part of the remaining network. In other states, **Untangle To triage** takes the place of Best next.
- **Queue and Best next:** on To triage, the queue strip is ranked by untangling priority, with the rank as a badge on each thumbnail; J/K and list copying follow that order. **Best next** opens the top candidate and is disabled when it is already current.
- **Preview split** forecasts processing the current bookmark: it fades it and its links, colors the pieces that remain (split-off pieces in violet), and pauses motion, dragging and re-layout. Pointing at or focusing Done or Drop previews the same split. The bookmark card states the forecast: "Finishing it splits its 31-bookmark cluster into 19 + 11", with separated pairs and direct connections. A bookmark that splits nothing says how many direct connections it has; an isolated one says it has none in this view.
- **Processing:** Done or Drop changes only the current bookmark, with the usual Undo. After the save succeeds, priorities are recalculated and the new Best next opens. A failed save leaves the graph and current bookmark unchanged.
- **Motion:** saved positions seed a live d3-force simulation; only pins stay fixed. Dragging a node pulls its neighbors, dragging empty canvas pans, and Shift-drag selects. Reduced motion settles changes immediately.
- **Trace connections** (one hop at a time) was built and then removed from the interface at the owner's request on October 30. The `traceConnections` domain function and its tests remain.

## Recommendation calculation

The calculation is exact for the next single decision:

1. Build the undirected graph from the scoped bookmarks and visible shared tags. Styling never prunes it.
2. Remove each candidate in turn and find the pieces its cluster breaks into.
3. Score the pairs of **other** remaining bookmarks that lose their connecting path: for piece sizes `n1, n2, …`, the score is `sum(ni * nj)` over `i < j`. SCRNSHTS scores `19 * 11 = 209`.
4. Rank by score, then direct connections removed, then oldest creation date, then ID.

This is the best measured next step, not an optimal sequence. It is recalculated after status, membership, filter and selection changes, and after Undo. Custom statuses decide To triage through the existing status outcomes.

## Implementation and compatibility

- `domain/connections.ts` is a pure module for projection, ranking, predicted splits and trace layers. Tag display nodes stay outside the analyzed graph.
- `ConnectionsCanvas` renders with the installed G6 and d3-force. Position updates are coalesced to one animation frame with one draw in flight, theme colors are cached, label collisions are resolved after motion settles, a drag reheats only its own cluster, and viewport saves are debounced.
- `Geometry` gains optional `connections.direct` and `connections.tags` layouts (positions, pins, viewport); the top-level layout remains the Tags view. Backups validate and round-trip them, and older backups stay valid. There is no schema or IndexedDB version change.
- Saved views also store the graph view, Tag nodes and the context tag.
- Content similarity, game objectives and automatic status changes to neighbors are out of scope.

## Verification canaries

On a copy of the 148-bookmark collection with all tag types shown: 116 to triage in five clusters; SCRNSHTS first, forecasting 31 → 19 + 11 (11 split off, 209 pairs separated); Done leaves 115 in six clusters and opens Microsoft's 80/20 bookmark; Undo restores 116 in five clusters. These come from the copied fixture, not hardcoded data. The pull request lists the checks run.
