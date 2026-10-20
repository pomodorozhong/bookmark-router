# Handoff

## In progress

### fix/side-panels-narrow

- **Task:** #32 Side panels cover each other or squeeze the graph at narrow widths. Created locally from `main` at `b690b88`; not yet on GitHub or linked to the issue.
- **PR:** none.
- **Code checkpoint:** none; no work started.
- **State:** reproduced on `main` in headless Chrome: at 390 and 700 px, tapping a tag opens its panel and also reopens the 320 px queue drawer on top of it. Between 821 and about 1000 px, with both panels open, the graph is 191–370 px wide.
- **Pending P-06:** link this branch to #32 on GitHub (`gh issue develop 32 --name fix/side-panels-narrow --base main`) and push it. Needs push approval. Blocks retrieving this handoff on another computer.
- **Next action:** mockup first: how the queue and detail panel share widths below about 1000 px, using the user's collection.

## Ranked work

1. #32 Side panels cover each other or squeeze the graph at narrow widths (next; on `fix/side-panels-narrow`)
2. #25 Links between nodes disappear when zoomed out
3. #21 Hidden nodes overlap shown nodes after Reset positions
4. #22 Nearby nodes cover non-focused titles when zoomed in
5. #23 Threads thumbnails fall back to a loading-screen screenshot
6. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
