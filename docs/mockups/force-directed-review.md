# Force-directed graph refinement

The user selected this structural direction on October 6, 2026: one bubble per bookmark, with less displayed detail when zoomed out, connected to related topic, existing-issue, and proposal force centers. This supersedes the fixed-column and topic-container structure in the earlier mockups. The drawings are static layout studies, not a running force simulation; positions, sizes, labels, and exact zoom thresholds remain provisional.

The user approved both mockups on October 6, 2026. They are the structural reference for the planned UI. Approval covers the bubble/hub graph and progressive detail; it does not select an overview edge-visibility default or a specific graph library.

- [Workspace sketch](force-directed-map.png) / [editable SVG](force-directed-map.svg)
- [Three zoom levels](force-directed-zoom.png) / [editable SVG](force-directed-zoom.svg)
- [Editable drawing script](render_force_directed.py), using helpers in [render-variants.py](render-variants.py). Run with Python and Pillow; macOS Arial fonts are used.

## Hubs and shared bookmarks

Interpret each individual topic, existing issue, and proposal as a hub. Existing issues and new proposals are types of hub, rather than two aggregate centers. A bubble can link to its primary and secondary topics, several existing issues, and several proposals simultaneously. The shared bubble sits between competing attractions. Link inspection, rather than proximity, identifies its actual relationships.

The workspace sketch uses the same four explicit-alternatives bookmarks from the earlier reference. The selected App market and competitor research bubble links to its proposed topic, #133 Lean Canvas, and the Customer discovery and demand validation proposal. The other three bubbles remain visible. All start unreviewed, with zero selected destinations and 0/148 completion.

Topic labels in the graph may be abbreviated; the inspector provides the full topic and destination names. Example overview labels and force placement are illustrative. Topic membership uses dotted links, suggested destinations use dashed links, and selected destinations use solid links with separate placement states. Topic membership and a destination recommendation are different facts even when their hub names are similar.

## Zoom behavior

| Scale | Bookmark bubble | Hub detail |
| --- | --- | --- |
| Overview | Compact bubble with selection/status mark; selected title stays readable | Hub type, short name, matching bookmark count |
| Middle | Short title and status mark | Name and type; expanded on selection |
| Close | Descriptive title, domain/source type, review status | Full label/state where space permits; inspector always provides exact detail |

The zoom drawing repeats the same bookmark in separate explanatory panels. In the actual graph it is one canonical node. Zoom changes label visibility and detail, without rerunning layout or changing any decision. Labels need collision handling and screen-space readability. Full content remains available through selection and accessible compact navigation.

## Stable review behavior

The force layout initializes reproducibly and stops once settled. Ordinary selection, zoom, filtering, saves, and inspector changes preserve settled geometry. Users can move and pin nodes, then explicitly re-layout unpinned nodes. Positions and pins are view preferences stored separately from bookmark decisions. A bubble dropped next to a hub creates no classification or placement.

Bookmarks with no destination suggestions stay visible through their topic relationships; unclassified records remain discoverable too. Selecting a bubble highlights all immediate links and offers every target in the inspector even if some links are hidden by a focus view. Progress continues to use explicit per-target confirmation.

## Visual tuning within the approved design

Tune how much title text appears at middle zoom and how large/readable hubs remain during implementation. Support both all-connections and selected-neighborhood views, with the overview default still open for visual tuning. Exact force strengths and label thresholds can be tuned within the approved structure; no specific graph library is selected yet.
