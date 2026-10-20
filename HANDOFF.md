# Handoff

## In progress

### fix/zoomed-out-links

- **Task:** #25 Links between nodes disappear when zoomed out. Created locally from `main` at `7df9ec6`; not yet on GitHub or linked to #25.
- **PR:** none.
- **Code checkpoint:** none; no work started.
- **State:** not investigated yet. The issue suggests edges use a fixed `lineWidth: 1.2` with a light stroke `#a9bdba` in graph units (`app/src/components/GraphCanvas.tsx`), so they shrink under a pixel when zoomed out.
- **Pending P-07:** link this branch to #25 on GitHub (`gh issue develop 25 --name fix/zoomed-out-links --base main`) and push it. Needs push approval. Until then this handoff exists only on this computer.
- **Next action:** reproduce on a copy of the collection at the lowest zoom, then mockup first: how links look zoomed out and zoomed in.

## Ranked work

1. #25 Links between nodes disappear when zoomed out (next; on `fix/zoomed-out-links`)
2. #21 Hidden nodes overlap shown nodes after Reset positions
3. #22 Nearby nodes cover non-focused titles when zoomed in
4. #23 Threads thumbnails fall back to a loading-screen screenshot
5. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
