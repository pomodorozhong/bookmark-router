# Agent guide

Bookmark & Tag is a local-first app for triaging bookmarks into project ideas, with a graph, tags, filters, and an agent integration over WebMCP. See the [README](README.md) for setup and the [docs index](docs/README.md) for product behavior and verification.

Use the `commit` skill for every commit.

## Where things live

- GitHub issues: work items, with handoff notes in their comments.
- `docs/`: long-term knowledge: plan, behavior, decisions, and verification ([index](docs/README.md)).
- The user runs the dev server at `http://127.0.0.1:5199`; their real collection lives in that origin's browser storage. Don't restore into it or reload a pending agent batch without asking; verify with a copy (see [verification](docs/workflow.md#verifying-on-the-real-collection)).
- Keep local configuration (`.claude/`), personal collection data (`bookmarks-*.json`), and temporary evidence out of commits.

## Branches and pull requests

- Name branches `<type>/<summary>` with Conventional Commit types (`feat/thumbnail-store`, `fix/filter-wrap`).
- Every change has an issue, and its PR closes it. A PR may close several issues when they touch the same area and share one mockup; it lists each with `Closes #N`. Each follows [How each change works](docs/workflow.md#how-each-change-works): mockup first for visual changes, then 2–4 "You try" tasks, with approval recorded on the issue. Ask before filing a new issue or pushing, unless the user already authorized that scope.
- Write PR titles in plain words about what that PR alone does, without planning jargon.
- PRs are squash-merged. After a PR in a stack merges, rebase the next branch onto the new `main` (`git rebase --onto origin/main <old base commit> <branch>`) before filing it.

## Checks

In `app/`: `npm run build` and `npm test`. Before a PR, run them after a fresh `npm ci` in a clean worktree; an existing `node_modules` can hide a broken lockfile. CI ([checks.yml](.github/workflows/checks.yml)) runs the same `npm ci`, build, and tests on every PR to `main`.
