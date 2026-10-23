# Handoff

## In progress

### fix/zoomed-out-links

- **Task:** #25 Links between nodes disappear when zoomed out. Created locally from `main` at `7df9ec6`; not yet on GitHub or linked to #25.
- **PR:** none.
- **Code checkpoint:** none; no work started. The branch holds only `docs:` handoff commits.
- **State:** not investigated yet. The issue suggests edges use a fixed `lineWidth: 1.2` with a light stroke `#a9bdba` in graph units (`app/src/components/GraphCanvas.tsx`), so they shrink under a pixel when zoomed out. #64 also edits `GraphCanvas.tsx` (theme roles for tiles and selection, not edges); start #25 after #64 merges, or expect a small rebase.
- **Pending P-07:** link this branch to #25 on GitHub (`gh issue develop 25 --name fix/zoomed-out-links --base main`) and push it. Needs push approval. Until then this handoff exists only on this computer.
- **Next action:** reproduce on a copy of the collection at the lowest zoom, then mockup first: how links look zoomed out and zoomed in.

### stack/ui-foundations

- **Task:** stack 1 of the UI/UX revamp milestone. Local stack branch in the worktree `../bookmark-router-ui-foundations`, base `7df9ec6`; never pushed. Its five PRs are published from separate branches.
- **PRs:** #62 `refactor/remove-unused-css` (ready; closes #50), #63 `fix/one-name-per-concept` (ready, independent; closes #53, #54), #64 `refactor/shared-style-values` (draft, needs #62; closes #46, #47, #48), #65 `fix/touch-screens` (draft, needs #62 and #64; closes #40, #41, #42, #45, #60), #66 `fix/dialog-layout` (draft, needs #62 and #64; closes #44, #51). CI passes on all five.
- **Code checkpoint:** stack tip `3f6f50b`; published branch tips `c524187`, `d19b1bf`, `d9e3dcc`, `41c3002`, `0a061c8`. PR map, bodies and review request: `.agents/propose-stack/ui-foundations/` in the stack worktree (git-ignored).
- **Verification:** each PR rebuilt alone from `7df9ec6` after a fresh `npm ci`; build passes, tests 113/113 (114/114 for #63). Browser checks on a copy of the collection at 1440–320 px, including computed-style comparisons for #62 and #64. Mockups and approvals are recorded on each issue ([mockup](https://claude.ai/artifact/TrrGwYPbq8XJNV8DnNj1iY)).
- **Merge order:** #62, then #64, then #65 and #66 in either order; #63 any time. The drafts carry copies of their prerequisites' commits.
- **Open question:** #54: the collection's "In progress" status still shows in Edit's Status list (keep, rename, or hide?).
- **Pending P-08:** delete the local `stack/ui-foundations` branch and its worktree (which still holds a converted copy of the collection under `app/node_modules/.tmp-verify/`), the five local PR branches, and the working files. Blocks nothing; ask before deleting.
- **Next action:** once #62 (and later #64) squash-merge, run the `propose-stack` skill's "After a prerequisite merges" steps: rebuild #64, then #65 and #66 on the new `main`, show the old and new tips, and force-push only with approval.

## Ranked work

1. Merge stack 1 of the UI/UX revamp: #62, #63, then #64, #65, #66 (on `stack/ui-foundations`; review and merge order above)
2. #25 Links between nodes disappear when zoomed out (on `fix/zoomed-out-links`; after #64 to avoid a `GraphCanvas.tsx` rebase)
3. UI/UX revamp stack 2, mockup first: phone graph layout (#34, #35, #39), phone panel (#36), queue drawer (#37, #38), panel actions (#57, #58), add bookmark and import (#55, #56, #43), shortcut badges (#61)
4. #21 Hidden nodes overlap shown nodes after Reset positions
5. #22 Nearby nodes cover non-focused titles when zoomed in
6. #23 Threads thumbnails fall back to a loading-screen screenshot
7. UI/UX revamp stack 3: menus (#49, #59), covers and letter tiles (#52)
8. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-09:** file this issue in the UI/UX revamp milestone (label `enhancement`). Needs approval to file a new issue.
  - **Title:** The graph's labels, edges and node fills don't follow the theme
  - **Body:** #64 moves every color in `styles.css` into theme roles, and the graph reads the roles for letter tiles, the current bookmark and the box selection. Its other colors are still literals in `app/src/components/GraphCanvas.tsx` and `tag-node.ts`: node fills and strokes (`#94a3b8`, `#cbd5d1`), labels (`#294d41`, `#475569`, `#183e35`), label backgrounds, and edges (`#a9bdba`). A new theme, such as a dark one, would leave the graph in today's colors. Done when every graph color comes from a theme role read at render time, and the graph redraws when the theme changes. Blocked by #64.
