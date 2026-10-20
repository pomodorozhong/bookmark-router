# Handoff

## In progress

### fix/side-panels-narrow

- **Task:** #32 Side panels cover each other or squeeze the graph at narrow widths. Branched from `main` at `b690b88`; pushed and linked to #32 on GitHub.
- **PR:** drafted, awaiting the user's approval to push and open (open-pr publish approval). Closes #32.
- **Code checkpoint:** `01cdea7` fix(triage): keep tag panel titles visible while the queue is minimized (on top of `cc3f643`, the rail and tabs). Not pushed. The user found the hidden tag panel titles; rail rules are now scoped to `.triage-queue`, and the tag panel was rechecked at 1280 px (rail and drawer) and 390 px.
- **Design (approved 2026-10-20, recorded on #32 with the mockup https://claude.ai/artifact/F9T6G7bj4dFQZtytJy24Et):** above 820 px the queue is a 64 px thumbnail rail; Queue (Q) expands it to the full list, a drawer over the graph up to 1280 px (graph tap, Escape, or its ‹ button put it away) and a 320 px column above 1280 px, where it starts expanded. At 820 px and below: no Queue button; graph on top, then Queue and Bookmark/Tag tabs, with ‹ › in the bookmark bar. The #32 issue text now covers wide screens too.
- **Verified:** fresh `npm ci`, `npm run build` and `npm test` (113 pass) in a clean worktree at `01cdea7`. Headless Chrome on a converted copy of the collection at 1600, 1440, 1281, 1280, 1200, 1100, 1000, 900, 840, 821, 820, 700 and 390 px: layout matches the design, no page overflow, and tag taps, the drawer, Escape, graph taps, Q and ‹ › all work.
- **Finding:** the tag-tap "drawer reopens" report did not reproduce on `main`. A tag tap never changed `queueOpen`; the earlier headless script checked `display` on a queue hidden with `visibility`, read it as open, and clicked Queue itself.
- **Next action:** on approval, push and open the PR; then watch its CI and handle review.

## Ranked work

1. #32 Side panels cover each other or squeeze the graph at narrow widths (next; on `fix/side-panels-narrow`)
2. #25 Links between nodes disappear when zoomed out
3. #21 Hidden nodes overlap shown nodes after Reset positions
4. #22 Nearby nodes cover non-focused titles when zoomed in
5. #23 Threads thumbnails fall back to a loading-screen screenshot
6. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
