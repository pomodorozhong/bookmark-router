# Handoff

## In progress

### test/pages-relay

- Task: #18 Verify the local agent relay on a live GitHub Pages deployment
- PR: #26, open, awaiting review; CI was pending at last check
- Code checkpoint: 3796dec docs: restore the relay connection paragraph and clarify the in-app browser note (local only; the PR is at 011d639)
- State: no app code changes. `docs/webmcp.md` records the live-site results and the relay setup (client entries untested in each client, origins, local network access, troubleshooting). 3796dec restores the user's original "For a deployed page…" paragraph word for word and rewrites the in-app browser note to say that the browser, not the site, is what differs.
- Verification: in Arc, every #18 check passed against the live site with relay 6.0.2: Connected, six tools, read (116 bookmarks, revision 0), one proposal set aside by the user with the collection unchanged, and disconnect on switch off. In the Claude desktop in-app browser, the page reported local network access as `denied` with no prompt and stayed on **Searching**, even after the user changed a setting and the page was reloaded. Switch off sends no loopback traffic in either browser.
- Not run: the client entries in each client; a page from an unlisted origin (the relay answers the handshake for any origin); Arc's version not recorded.
- Avoid: rewording doc text the user relies on when a gap only needs an addition.
- Open question for the user: how to word the in-app browser limitation. Soften "can't connect" to "didn't connect in our test; no prompt appeared"? State it once or in both places (Claude Desktop note and "Connect the page")?
- Next action: settle that wording with the user, amend the doc, then push 3796dec and any follow-up to #26 (push not yet approved).

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
