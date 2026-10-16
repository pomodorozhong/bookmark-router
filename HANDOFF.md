# Handoff

## In progress

### test/pages-relay

- Task: #18 Verify the local agent relay on a live GitHub Pages deployment
- PR: #26, open, awaiting review
- Code checkpoint: 6507fea docs: confirm why the in-app browser can't reach the relay from Pages (pushed to #26)
- State: no app code changes. `docs/webmcp.md` records the live-site results, the relay setup, and a control check: in the Claude desktop in-app browser the relay connects from a `127.0.0.1` page but not from the Pages site, so the pane's local network access denial (no prompt) is the cause. The limitation is tracked in #27.
- Verification: in Arc, every #18 check passed against the live site with relay 6.0.2. In the in-app browser (Claude 2.42304.0, Chrome 152), the Pages site stayed on **Searching** with the relay logging nothing, while this branch's build on `127.0.0.1:5299` reached **Connected**. Switch off sends no loopback traffic in either browser.
- Not run: the client entries in each client; plain Chrome's prompt (only Arc was tested); Arc's version not recorded.
- Avoid: rewording doc text the user relies on when a gap only needs an addition.
- Next action: the user is reviewing #26 on GitHub; once accepted, remove this subsection, drop #18 from Ranked work, push, then squash-merge.

## Ranked work

1. #18 Verify the local agent relay on a live GitHub Pages deployment (in progress on `test/pages-relay`)
2. #13 Keep the detail panel's Copy and Edit buttons in one place
3. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
4. #25 Links between nodes disappear when zoomed out
5. #21 Hidden nodes overlap shown nodes after Reset positions
6. #22 Nearby nodes cover non-focused titles when zoomed in
7. #23 Threads thumbnails fall back to a loading-screen screenshot
8. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
