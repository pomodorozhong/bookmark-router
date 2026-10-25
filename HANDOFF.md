# Handoff

## In progress

### feat/propose-import

- **Task:** #84 Submit and review complete collection imports through WebMCP (milestone 2, Agent-assisted imports). Created from `main` `1eca427` with `gh issue develop` and linked to #84 on 2026-10-25.
- **PR:** none.
- **Code checkpoint:** `9619d26` feat(agent): let agents propose a complete new collection for review. Plan approved 2026-10-25 with Pages verification option (a) (deploy this branch to Pages before merge) and the Undo label "Import N bookmarks".
- **State:** #83's foundation merged in #86: `stageCollectionImport`, `revalidateCollectionImport` and `WorkspaceStore.createFromImport` in `app/src/domain/collection-import.ts` and `storage.ts`. The Agent Review mockup was approved 2026-10-25 and recorded on #84 (https://claude.ai/artifact/1en8SttipNPgVzZK2Dd7FZ). Test data for the real scenario is the original 69-link import in the user's Downloads, `bookmark-tag-backup (1).json` (69 bookmarks, 12 tags, 116 tag links, 68 thumbnails). `(2)` is a later edited copy; don't use it.
- **Verification:** at `9619d26`, `npm ci`, build and 131/131 tests pass in a clean worktree. Local check on the `verify` dev server (port 5311) in a throwaway headless Chrome profile, through `@mcp-b/webmcp-local-relay` 6.0.2 and a stdio MCP client, with the real 69-link payload:
  - submitting wrote nothing; an identical retry returned the same proposal; a reused ID was rejected;
  - the review showed 69/12/116/68 and tag counts; the tag filter, search and the No image row worked;
  - Set aside, then switching collections, kept the import reviewable;
  - a forced storage failure showed "Not saved…" and created nothing;
  - Apply opened the new collection with the toast "Import 69 bookmarks", and `get_proposal_status` returned the created IDs;
  - background thumbnails were stored afterwards (38 after 12 s with Find thumbnails online on);
  - header Undo emptied the collection;
  - the phone layout at 390 px showed no horizontal overflow, and the page logged no errors.
- **Pages:** with the user's approval, a temporary `github-pages` deployment rule for this branch was added, the branch was deployed, and the same scenario passed on `https://pomodorozhong.github.io/bookmark-router/` (44 thumbnails stored after 12 s). The rule was then removed, `main` redeployed, and the live bundle confirmed back on `main`.
- **Docs:** `docs/webmcp.md` (new Complete collection imports section and its verification table), `docs/product.md`, `docs/claude-setup.md`.
- **Not yet verified:** the user's 2–4 review tasks.
- **Next action:** record the user's review result on #84, then draft the PR (open-pr).

#### Approval requests

None. The Pages request was approved and completed 2026-10-25.

## Ranked work

1. [Agent-assisted imports](https://github.com/pomodorozhong/bookmark-router/milestone/2): #84 Submit and review complete collection imports through WebMCP (on `feat/propose-import`; #83 merged in #86)
2. #22 Nearby nodes cover non-focused titles when zoomed in
3. #23 Threads thumbnails fall back to a loading-screen screenshot
4. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

None.
