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
- After a restore, placing can take 20 seconds or more headless. Wait until "Placing your collection…" is gone before measuring or taking screenshots; otherwise the graph looks empty.
- Before concluding something is shown or hidden, read the computed `display` and `visibility` (and its size). A check of `display` alone once read a queue hidden with `visibility` as open, and the script's own Queue click produced a bug report (#32).
- Check what a panel shows, not only that it opened. The tag panel's list reuses the queue's classes (`queue-text`, `queue-thumb`), so a queue rule scoped to `.triage` instead of `.triage-queue` hid its titles (#32).
- To prove a style change is invisible, record `getComputedStyle` (colors, borders, radius, font, spacing) and the box of every element outside the graph canvas on each screen state, then compare runs. Two runs of the same code matched exactly (October 2026), so any difference is real; only the Collections menu's row order varies between runs.
- Clicking graph nodes with synthetic mouse events did not register reliably headless; pick bookmarks from the queue instead. Dragging with `Input.dispatchMouseEvent` (press, several moves, release) on empty graph space does draw a box selection.
- To check touch-only rules (`(hover: none) and (pointer: coarse)`), turn on `Emulation.setTouchEmulationEnabled` and reload the page. `Emulation.setEmulatedMedia` with `hover` and `pointer` features had no effect (October 2026), and `setDeviceMetricsOverride` with `mobile: true` alone keeps a mouse.
- In a stack of PRs, give each PR's new CSS rules and props their own lines, away from lines another PR adds or changes. Rules appended right after another PR's new line make the cherry-pick conflict, so the PR silently depends on the other one; the trial rebuild catches it.
- Use the toolbar's zoom buttons, not wheel events (those pan the saved view away). localStorage does not survive between headless runs, so pick the restored collection from the Collections menu each run, or check reloads within one run.
