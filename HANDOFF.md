# Handoff

## In progress

### fix/zoomed-out-links

- **Task:** #25 Links between nodes disappear when zoomed out. Linked to #25 on GitHub and pushed on 2026-10-23, based on `main` `cb04ac9` (after #64).
- **PR:** none.
- **Code checkpoint:** none; no work started. The branch holds only `docs:` handoff commits.
- **State:** not investigated yet. The issue suggests edges use a fixed `lineWidth: 1.2` with a light stroke `#a9bdba` in graph units (`app/src/components/GraphCanvas.tsx`), so they shrink under a pixel when zoomed out. #64 has merged, so `GraphCanvas.tsx` on `main` already reads theme roles for tiles and selection; #67 covers the remaining graph colors, edges included.
- **Next action:** reproduce on a copy of the collection at the lowest zoom, then mockup first: how links look zoomed out and zoomed in.

### stack/ui-foundations

- **Task:** stack 1 of the UI/UX revamp milestone. #62, #63 and #64 squash-merged into `main` (latest `cb04ac9`); #65 and #66 remain, both independent now.
- **PRs:** #65 `fix/touch-screens` (ready for review; closes #40, #41, #42, #45, #60), #66 `fix/dialog-layout` (ready for review; closes #44, #51). Their Stack sections mark #62, #63 and #64 merged.
- **Code checkpoint:** rebuilt on `origin/main` `cb04ac9` and force-pushed on 2026-10-23: #65 `0520f70`, #66 `eedd5e3`, each with only its own commit; files are identical to the tips before the rebuild.
- **Verification:** one clean worktree from `cb04ac9`, fresh `npm ci`, then per branch `npm run build` and `npm test`: all pass, 114/114 each. No browser re-check after the rebuild (no conflicts, same files).
- **Pending P-08:** delete the local `stack/ui-foundations` branch and its worktree `../bookmark-router-ui-foundations` (which still holds a converted copy of the collection under `app/node_modules/.tmp-verify/`), the merged local branches `refactor/remove-unused-css`, `fix/one-name-per-concept` and `refactor/shared-style-values`, and the scratch branches `rb64`, `rb65`, `rb66`, `r2-65`, `r2-66`. Approved on 2026-10-23, but the agent's permission check blocked the deletion; the user runs it or allows it. Blocks nothing.
- **Next action:** review and merge #65 and #66 in either order; after both merge, remove this subsection.

## Ranked work

1. Decide #68: what the editor's "In progress" status should be (keep, rename, or hide; label `needs-decision`)
2. Merge the rest of stack 1 of the UI/UX revamp: #65 and #66, either order (on `stack/ui-foundations`)
3. #25 Links between nodes disappear when zoomed out (on `fix/zoomed-out-links`)
4. #67 The graph's labels, edges and node fills don't follow the theme
5. UI/UX revamp stack 2, mockup first: phone graph layout (#34, #35, #39), phone panel (#36), queue drawer (#37, #38), panel actions (#57, #58), add bookmark and import (#55, #56, #43), shortcut badges (#61)
6. #21 Hidden nodes overlap shown nodes after Reset positions
7. #22 Nearby nodes cover non-focused titles when zoomed in
8. #23 Threads thumbnails fall back to a loading-screen screenshot
9. UI/UX revamp stack 3: menus (#49, #59), covers and letter tiles (#52)
10. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-12:** open a PR from `docs/push-without-approval` (pushed, `3119f87`): AGENTS.md says work branches may be pushed without asking, including lease-guarded force-pushes of rebuilt PR branches; never `main`. Needs approval to open a PR. Until it merges, the rule lives only on that branch and in local memory.
