# Handoff

## In progress

### test/pages-relay

- Task: #18 Verify the local agent relay on a live GitHub Pages deployment
- PR: none yet
- Code checkpoint: 8a12665 (main, after #24 merged)
- State: no code changes; `docs/webmcp.md` records the results (uncommitted). All #18 checks passed in Arc against the live site with relay 6.0.2. The Claude desktop in-app browser denies local network access from the Pages origin without a prompt, so it stays on **Searching**.
- Verification: Arc reached **Connected**; the client saw one source with six tools; read (116 bookmarks, revision 0) and one create proposal worked, the user set it aside, and the collection stayed unchanged; turning the switch off dropped the source. Switch off sends no loopback traffic in both browsers.
- Not run: a page from an unlisted origin (the relay answers the handshake for any origin, so the origin check comes later); Arc version not recorded. The Arc check used the user's restored collection, with their approval.
- Next action: push and open the PR that closes #18 (approved by the user), then have the user review the recorded results.

## Ranked work

1. #18 Verify the local agent relay on a live GitHub Pages deployment (in progress on `test/pages-relay`)
2. #13 Keep the detail panel's Copy and Edit buttons in one place
3. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
4. #25 Links between nodes disappear when zoomed out
5. #21 Hidden nodes overlap shown nodes after Reset positions
6. #22 Nearby nodes cover non-focused titles when zoomed in
7. #23 Threads thumbnails fall back to a loading-screen screenshot

## Pending

None.
