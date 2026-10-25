# Workflow

How changes are made here, how the user likes to work, and how to verify against the real collection. Agent session rules are in [AGENTS.md](../AGENTS.md).

## How each change works

Each change has a GitHub issue and a PR that closes it. One PR may close several issues when they touch the same area and share one mockup; its "You try" tasks then cover each of them. Group related issues under a milestone when they belong to one goal, such as the UI/UX revamp.

1. **Mockup first** for anything visual: a working static artifact with the user's real use cases. Record the user's approval or changes as a comment on the issue before implementation.
2. **Build** the accepted direction on a `<type>/<summary>` branch.
3. **Verify** every task the user will try in the browser with their data, at desktop and narrow widths.
4. **User review:** 2–4 tasks, about 5 minutes. Record acceptance as a comment on the issue; the PR then merges and closes it. Fix feedback before moving on, or file it as a new issue if the user defers it.

Keep changes small. There are no checkpoint tags, deferred-verification registers, or release gates. [Product](product.md) summarizes current behavior; history lives in closed issues, merged PRs, and [the archive](archive/README.md).

## How the user likes to work

- Mockup first for anything visual, published as a clickable Artifact; wait for approval. A mockup must work cleanly (no dead controls or layout bugs) and show the user's own use cases, not abstract options, or it can't be judged.
- Explain the use case behind a proposal in terms of what the user does in the app; round 3 was unclear until it was put that way.
- When the user proposes a solution, evaluate it and suggest better options before building; build their proposal only after they pick.
- Keep the code simple: a one-off command beats permanent in-app machinery for something done a few times (the rename's in-app upgrade was replaced by `npm run upgrade-backup` for this reason).
- Small changes, each closing one issue or a few closely related ones, ending with 2–4 short "You try" tasks whose result is recorded on the issue; verify on the user's real collection before reporting; conventional commits split by concern.
- The user runs the dev server themselves at `http://127.0.0.1:5199` (`.claude/launch.json` can start it too); their collections live in that origin's browser storage.

## Test data

Use the user's `bookmarks-working.json` (148 bookmarks, git-ignored), converted by `npm run convert` in `app/` and loaded through **Restore backup**. The backup contains 15 Existing issue, 6 Proposal issue, and 29 Topic tags, with 240 memberships from decided and suggested placements. Pending/done/dropped statuses, membership reasons, duplicate groups, link-check warnings, and original Raindrop fields are retained. [The app guide](../app/README.md) explains upgrading backups from before the rename.

Local data to keep in mind:

- The pre-rename `bubble-tag-v1` browser database remains available for recovery. Clear it only once its data is no longer needed.
- Root backups `bookmarks-converted_.json` and `bookmarks-visible.json` are untracked old-format files. Upgrade them before restore. Regenerate `bookmarks-converted.json` with `npm run convert` if it predates the rename.

## Verifying on the real collection

- The in-app browser pane is too throttled to lay out the graph. Headless Chrome driven over the DevTools protocol (Node's built-in WebSocket, `--remote-debugging-port`, a throwaway `--user-data-dir`) works.
- To load data: run `npm run convert -- ../bookmarks-working.json node_modules/.tmp-verify/bk.json` in `app/` (Vite serves files under `node_modules/`), then in the page fetch it, set it on the import screen's file input with a `DataTransfer`, choose Workspace JSON → Read source → Confirm restore. Delete the copy afterwards.
- Create `node_modules/.tmp-verify` before converting; the script does not create it.
- Let the graph finish placing at desktop width before emulating a narrow one. Resizing while it shows "Placing your collection…" left it stuck in headless runs (on `main` too; not seen in a real browser). Use the **Whole collection** button to fit it to the new width.
- If a run fails, kill its Chrome (`pkill -f remote-debugging-port=<port>`) before the next one, or the next run attaches to the old page.
- After a `git rebase` (such as folding in `fixup!` commits) while the Vite dev server runs, it can keep serving an intermediate `styles.css`: new rules were missing until the server restarted (2026-10-24). Restart the server after a rebase before checking styles.
- Reusing one `--user-data-dir` across headless runs keeps the restored collection in IndexedDB, so restore once per profile. The profile then holds a copy of the collection: delete it when done.
- To check graph positions, read the `geometry` store of the `bookmark-tag` IndexedDB database from the page: it holds every node's saved position, hidden ones included, right after a reset.
- The browser pane opens the dev server at `localhost:5199`, a different origin from `127.0.0.1:5199`, so it does not show the user's collection; point the user to `http://127.0.0.1:5199` in their own browser. The desktop app may also stop a preview server between turns: check `preview_list` before saying it is running.
- Use the toolbar's zoom buttons, not wheel events (those pan the saved view away). localStorage does not survive between headless runs, so pick the restored collection from the Collections menu each run, or check reloads within one run.
