# Plan — triage bookmarks into project ideas

Updated October 14, 2026. v1 is complete: rounds 0–4 are approved and landed through PRs #2–#6; round 1.5 was skipped. New work is tracked as GitHub issues, ranked in [HANDOFF.md](../HANDOFF.md). [Progress](progress.md) records current behavior and open items; [the archive](archive/README.md) preserves completed rounds and superseded checkpoint plans.

## What the app is for

1. **Triage bookmarks.** Work through a Raindrop export one bookmark at a time and decide what each one is for.
2. **Group them into project ideas.** A bookmark joins one or more groups (existing GitHub issues, proposed issues, topics), and a group can be read as a whole.
3. **Let an agent help, through WebMCP.** The agent can add new items, fill in item details, and read processed groups with their bookmarks.

**Filters** support all three: finding what is left to triage and what belongs together. Anything not serving these jobs is frozen or cut.

## Test data

Use the user's `bookmarks-working.json` (148 bookmarks, git-ignored), converted by `npm run convert` in `app/` and loaded through **Restore backup**. The backup contains 15 Existing issue, 6 Proposal issue, and 29 Topic tags, with 240 memberships from decided and suggested placements. Pending/done/dropped statuses, membership reasons, duplicate groups, link-check warnings, and original Raindrop fields are retained. [The app guide](../app/README.md) explains upgrading backups from before the rename.

## How each change works

Each change is one GitHub issue and one PR that closes it. Group related issues under a milestone only when they ship together.

1. **Mockup first** for anything visual: a working static artifact with the user's real use cases. Record the user's approval or changes as a comment on the issue before implementation.
2. **Build** the accepted direction on a `<type>/<summary>` branch.
3. **Verify** every task the user will try in the browser with their data, at desktop and narrow widths.
4. **User review:** 2–4 tasks, about 5 minutes. Record acceptance as a comment on the issue; the PR then merges and closes it. Fix feedback before moving on, or file it as a new issue if the user defers it.

Keep changes small. There are no checkpoint tags, deferred-verification registers, or release gates. [Progress](progress.md) summarizes current behavior; history lives in closed issues, merged PRs, and [the archive](archive/README.md).

## v1 rounds (complete)

v1 was built in rounds before the issue workflow; each round landed as one squash-merged PR.

| Round | Accepted scope | Status |
|---|---|---|
| 0 — Data and graph fixes | Prototype converter, restore, import placement, pan/zoom improvements, covers, readable hover/selection titles | Approved October 11, 2026 ([#2](https://github.com/pomodorozhong/bookmark-router/pull/2)) |
| 1 — Triage | Queue/graph/detail workspace, Done/Drop/Deselect, group membership, box selection, copy templates, header menus, Undo feedback | Approved October 11, 2026 ([#3](https://github.com/pomodorozhong/bookmark-router/pull/3)) |
| 1.5 — Fetch details | Planned local helper and reviewed enrichment | Skipped October 11, 2026: user's local fetcher works |
| 2 — Issues and tags | Readable issue view, create/edit tag types, appearance overrides, four tag styles in eight directions, hidden-group peeking, Bookmark & Tag rename | Approved October 12, 2026 ([#4](https://github.com/pomodorozhong/bookmark-router/pull/4)) |
| 3 — Filters | Compact search/Show/Filters bar, counted filter values, Saved filters, restored pinning, matching floating graph toolbar | Approved October 12, 2026 ([#5](https://github.com/pomodorozhong/bookmark-router/pull/5)) |
| 4 — WebMCP | Agent reads collections and groups, copies the selection, and proposes reviewed batches (additions, missing fields, remote images) with Apply anyway, Set aside, and one Undo per batch; see [WebMCP](webmcp.md) | Approved October 14, 2026 ([#6](https://github.com/pomodorozhong/bookmark-router/pull/6)) |

## Later, only if needed

- Performance work if the real collection is slow. The 148-bookmark collection does not need the former 5,000-bookmark budget.
- Static deployment (GitHub Pages). It has no bundled fetcher, so thumbnails come from keyless CORS services and are stored locally ([#7](https://github.com/pomodorozhong/bookmark-router/issues/7)); a local agent reaches the app through a WebMCP relay ([#8](https://github.com/pomodorozhong/bookmark-router/issues/8)). Collections are per origin, so a deployed copy starts empty until a backup is restored.

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
