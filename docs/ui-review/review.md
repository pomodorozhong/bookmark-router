# B.1 implementation review — October 10, 2026

Reviewed the running UI against [the improvement plan](../ui-improvement-plan.md). The previous “implemented” status overstated completion: the old layered stylesheet, small typography, dot badge, clipped detail titles, and incomplete dialog behavior were still present.

## Corrections

| Finding | Correction |
| --- | --- |
| The pin remained a red dot. A subsequent shaded version felt too realistic to the user. | Flat red vector pushpin with a thin needle anchored to the node contour. No gradients, contact shadows, or glossy highlights. Decorative markers do not participate in hit testing or force layout. |
| Counter-scaled tag backgrounds turned small nodes into large green pills. | Constant 13px titles stay inside when they fit; otherwise a plain dark label sits below the node on a quiet canvas-colored background. Four-pixel hysteresis prevents placement flicker near the fit threshold. Graph titles have bounded screen widths; full titles remain in Details. |
| The stylesheet accumulated competing layouts and 10–12px body text. | Replaced the stacked overrides with one component stylesheet, 14px body/control text, 12px metadata, shared targets, stronger contrast, and deliberate phone/tablet layouts. |
| Sidebar still contained a collection card, a separate New collection navigation row, and oversized category gaps. | Flattened collection context, placed New collection beside the selector, separated New tag, and moved utilities to the lower sidebar. |
| Details actions occupied a separate row; full titles were hover-only. | Edit, Pin, and Close share the header. Titles wrap in full. Information and connections use separate sections. |
| List rows competed with Details. | Reserved a desktop Details column; stacked phone rows and a dismissible phone sheet. Selection has a persistent visual and pressed state. |
| Help remained permanent canvas prose; graph empty/no-match/error states lacked direct actions. | Compact Help disclosure, visible zoom, labeled Layout menu, Import/Clear search/Open list actions. |
| Creation/editor/history/undo dialogs lacked consistent focus handling. Creation errors could be swallowed. | Shared native modal dialog, focus containment/return, Escape, inline creation errors, retained drafts, and duplicate-submit protection. |
| Mobile navigation obscured the destination after selection. | Drawer closes after navigation, contains an accessible close button, traps focus, and prevents interaction with the covered page. Narrow navigation and Details cannot open together. |
| New imports into empty saved collections could pile nodes together. Re-layout could run without repainting the supplied simulation. | Empty geometry no longer suppresses initial layout; new nodes use distinct placements around saved neighbors. A namespaced public d3 tick listener publishes positions through G6. Saved geometry is kept current in React, and hidden graph views no longer resize to zero. |

## Verification performed

- `npm run check`, `npm test`, `npm run build`: pass; 37 tests, including label fit at 15/35/100/200/400% and both hysteresis directions. The existing G6 bundle-size warning remains.
- Browser inspection at 1440×900, 1280×720, 768×1024, and 390×844 across graph, list, Details, navigation, import and dialogs. This is representative coverage, not every combination in the original matrix.
- Graph zoom inspected at the 15% and 400% endpoints, around 35%, ordinary zoom and roughly 200%; plain labels replace oversized pills and centered labels return when space permits. Saved low zoom reload was checked; the pinned demo bookmark also retained its pinned state after reload.
- Created a separate **UI review** collection through the actual CSV import flow: six bookmarks and four tags, including a long title/tag, an unrecognized URL, URL-less items, an unlinked item, and multiple statuses. Existing collections were not edited by this fixture import.
- Checked editor and creation-dialog initial focus, Escape and focus return; phone Details dismissal, drawer navigation, full long titles, list selection, pin action, and visible re-layout results.
- Calculated contrast for final tokens: body/white **11.99:1**, secondary/white **5.76:1**, quiet/canvas **4.65:1**, teal/white **5.47:1**, external tag title/canvas **8.97:1**.

## Review evidence

- [Desktop graph and Details](desktop-graph.jpg)
- [Desktop list and Details](desktop-list-details.jpg)
- [Tablet list](tablet-list.jpg)
- [Phone Details](phone-details.jpg)
- [Phone Import](phone-import.jpg)
- [Zoomed-out labels](zoom-out.jpg)

## Remaining acceptance checks

User approved visual acceptance (U2) on October 10, 2026. Physical Mac trackpad gestures, 200% browser/text zoom, and the complete recovery/media interaction matrix were not reverified in this pass and remain follow-up regression checks. Existing transaction, backup/restore, undo and conflict tests pass. No Stage C features, deployment, or publishing were added.
