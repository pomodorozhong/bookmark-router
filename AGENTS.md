# Agent guide

Bookmark & Tag is a local-first app for triaging bookmarks into project ideas, with a graph, tags, filters, and an agent integration over WebMCP. See the [README](README.md) for setup and the [docs index](docs/README.md) for product behavior and verification.

<!-- handoff:start (from the handoff skill; edit the skill's template, not this copy) -->
## Handoff

`HANDOFF.md` at the repository root is how sessions resume. It has three sections: `In progress` (one `### <branch>` subsection per active branch, holding its state and its own approval requests), `Ranked work`, and `Pending` (approval requests not tied to a branch). A pending entry, such as `P-01`, records a request, not approval.

- **Start of a session:** read `HANDOFF.md` and the subsection for `git branch --show-current`; none means this branch has no work in progress. Compare its code checkpoint with `git log`, re-check verification made stale by later commits, and run the documented checks before building on it. If this branch's PR merged or closed, follow the `commit` skill's branch-safety rules before committing or pushing. Before recommending or starting work, show each unresolved request from every branch subsection and `Pending` (marking any made obsolete by a merged or closed PR), then each decision placed first in `Ranked work`, and ask the user about them. Pick new work from the default branch's `Ranked work`.
- **Edit only this branch's subsection,** plus `Ranked work` and `Pending` when they actually change. Keep it current rather than a log, and never write secrets.
- **Commit `HANDOFF.md`** only before a push and at wrap-up, as a `docs:` commit on the work branch. Never commit it on the default branch.
- **PRs:** use the `open-pr` skill, and keep its unanswered approval requests in this branch's subsection until they are resolved. **End of a session:** use the `handoff` skill.
- **Before creating a branch, editing `HANDOFF.md`, or resolving a conflict in it,** read the `handoff` skill's working rules (`references/working-rules.md` in that skill).
<!-- handoff:end -->

Use the `commit` skill for any commit outside a handoff.

## Where things live

- GitHub issues: work items, with handoff notes in their comments.
- `HANDOFF.md`: per-branch resume points, ranked work, and requests awaiting the user's approval.
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
