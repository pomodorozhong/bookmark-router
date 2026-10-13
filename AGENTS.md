# Agent guide

Bookmark & Tag is a local-first app for triaging bookmarks into project ideas, with a graph, tags, filters, and an agent integration over WebMCP. See the [README](README.md) for setup and the [docs index](docs/README.md) for product behavior and verification.

## Start of a session

1. Resolve any items parked by an earlier wrap-up (a `chore: park pending items` commit on any branch; see the `wrap-up` skill).
2. Read [.agents/next-steps.md](.agents/next-steps.md).
3. Check that the top issue is still open (`gh issue view`), read it and its comments, then propose it to the user. Work without an issue gets one drafted.

## Where things live

- GitHub issues: work items, with handoff notes in their comments.
- `.agents/next-steps.md`: the ranked list of issues to work on next. Ranking changes often land in small docs PRs; if `main` looks stale, check open PRs (`gh pr list`).
- `.agents/pending.md`: items parked for the user's approval, in one `chore: park pending items` commit on the branch with the related work, or on `chore/pending-<date>` from `main`. Never park on a local-only backup branch.
- `docs/`: long-term knowledge: plan, behavior, decisions, and verification ([index](docs/README.md)).
- The user runs the dev server at `http://127.0.0.1:5199`; their real collection lives in that origin's browser storage. Don't restore into it or reload a pending agent batch without asking; verify with a copy (see [verification](docs/progress.md#working-agreements-and-verification)).
- Keep local configuration (`.claude/`), personal collection data (`bookmarks-*.json`), and temporary evidence out of commits.

## Branches and pull requests

- Name branches `<type>/<summary>` with Conventional Commit types (`feat/thumbnail-store`, `fix/filter-wrap`).
- One issue per change; its PR closes it. Each follows [How each change works](docs/plan.md#how-each-change-works): mockup first for visual changes, then 2–4 "You try" tasks, with approval recorded on the issue. Ask before filing a new issue or pushing.
- Write PR titles in plain words about what that PR alone does, without planning jargon.
- PRs are squash-merged. After a PR in a stack merges, rebase the next branch onto the new `main` (`git rebase --onto origin/main <old base commit> <branch>`) before filing it.

## Checks

In `app/`: `npm run build` and `npm test`. Before a PR, run them after a fresh `npm ci` in a clean worktree; an existing `node_modules` can hide a broken lockfile.

## End of a session

Run the `wrap-up` skill to leave handoff notes on the issues, re-rank next steps, move lasting knowledge into `docs/`, and commit. Use the `commit` skill for any other commit.
