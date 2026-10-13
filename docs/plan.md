# Plan — triage bookmarks into project ideas

Updated October 14, 2026. Rounds 0–4 are approved; round 1.5 is skipped. [Progress](progress.md) records current behavior and open items; [the archive](archive/README.md) preserves completed rounds and superseded checkpoint plans.

## What the app is for

1. **Triage bookmarks.** Work through a Raindrop export one bookmark at a time and decide what each one is for.
2. **Group them into project ideas.** A bookmark joins one or more groups (existing GitHub issues, proposed issues, topics), and a group can be read as a whole.
3. **Let an agent help, through WebMCP.** The agent can add new items, fill in item details, and read processed groups with their bookmarks.

**Filters** support all three: finding what is left to triage and what belongs together. Anything not serving these jobs is frozen or cut.

## Test data

Use the user's `bookmarks-working.json` (148 bookmarks, git-ignored), converted by `npm run convert` in `app/` and loaded through **Restore backup**. The backup contains 15 Existing issue, 6 Proposal issue, and 29 Topic tags, with 240 memberships from decided and suggested placements. Pending/done/dropped statuses, membership reasons, duplicate groups, link-check warnings, and original Raindrop fields are retained. [The app guide](../app/README.md) explains upgrading backups from before the rename.

## How each round works

1. **Mockup first** for anything visual: a working static artifact with the user's real use cases. Get approval or changes before implementation.
2. **Build** the accepted direction.
3. **Verify** every task the user will try in the browser with their data, at desktop and narrow widths.
4. **User review:** 2–4 tasks, about 5 minutes. Fix feedback before the next round unless the user defers it.

Keep rounds small. There are no checkpoint tags, deferred-verification registers, or release gates. [Progress](progress.md) summarizes the active state; completed detail goes into [the archive](archive/README.md).

## Accepted rounds

| Round | Accepted scope | Status |
|---|---|---|
| 0 — Data and graph fixes | Prototype converter, restore, import placement, pan/zoom improvements, covers, readable hover/selection titles | Approved October 11, 2026 |
| 1 — Triage | Queue/graph/detail workspace, Done/Drop/Deselect, group membership, box selection, copy templates, header menus, Undo feedback | Approved October 11, 2026 |
| 1.5 — Fetch details | Planned local helper and reviewed enrichment | Skipped October 11, 2026: user's local fetcher works |
| 2 — Issues and tags | Readable issue view, create/edit tag types, appearance overrides, four tag styles in eight directions, hidden-group peeking, Bookmark & Tag rename | Approved October 12, 2026 |
| 3 — Filters | Compact search/Show/Filters bar, counted filter values, Saved filters, restored pinning, matching floating graph toolbar | Approved October 12, 2026 |
| 4 — WebMCP | Agent reads collections and groups, copies the selection, and proposes reviewed batches (additions, missing fields, remote images) with Apply anyway, Set aside, and one Undo per batch; see [WebMCP](webmcp.md) | Approved October 14, 2026 |

## Later, only if needed

- Performance work if the real collection is slow. The 148-bookmark collection does not need the former 5,000-bookmark budget.
- Static deployment. A GitHub Pages build has no bundled fetcher; URL fetching stays outside the static app.

## Scope boundaries

| Feature | Decision |
|---|---|
| Graph, import wizard, backup/restore, current Undo | Keep; fix bugs as found. |
| Copy composer | Triage selection/list/current copy with templates, presets, and preview. |
| Media upload and bulk status propagation | Frozen; old dialogs were removed in round 1. Existing backup media support remains. |
| C.1 undo rework (change sets, Redo) | Cut. Current Undo stays until it causes a real problem. The rename's schema version 2 does not implement C.1. |
| Record lifecycle | Collections can be deleted with confirmation and a backup offer. Bookmarks, tags, and tag types have no individual deletion. Archive/unarchive is not implemented. |
| Single bookmark creation | Add bookmark opens Import; agent creation is covered in [WebMCP](webmcp.md). |
| Advanced filter rules | Linked tag status, same-group, distance, and nested any/all remain in the domain engine but are not exposed by the compact filter UI. |
| 1,000/5,000 measurements and release review | Cut. |
