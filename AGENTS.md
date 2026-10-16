# Agent guide

Bookmark & Tag is a local-first app for triaging bookmarks into project ideas, with a graph, tags, filters, and an agent integration over WebMCP. See the [README](README.md) for setup and the [docs index](docs/README.md) for product behavior and verification.

<!-- handoff:start (from the handoff skill; edit the skill's template, not this copy) -->
## Handoff

`HANDOFF.md` at the repository root is how sessions resume. It is committed on every branch, including the default branch, and has three sections: `In progress` (one `### <branch>` subsection per active branch, holding that branch's state and its own approval requests), `Ranked work`, and `Pending` (approval requests not tied to a branch, such as issue drafts). Approval requests have stable IDs (`P-01`), the proposed action and scope, why approval is needed, and what they block.

### Start of a session

- Read `HANDOFF.md` and find the subsection named after the current branch (`git branch --show-current`). No subsection means nothing is in progress on this branch.
- To pick new work, start from the default branch's `Ranked work`. To resume an issue from another computer, find its branch with `gh issue develop --list <N>`, fetch it, and read that branch's `HANDOFF.md`. Preserve local changes when switching checkouts.
- Compare the subsection's code checkpoint with `git log`; list commits made after it, skipping the branch's own `docs:` commits that only touch `HANDOFF.md` or the docs folder, and re-check verification the rest may have made stale. Run the project's documented checks before building on the previous session's work.
- Verify issue and PR status when GitHub is available. If the PR has merged or closed, apply the `commit` skill's branch-safety rules before new commits or pushes.
- A pending entry records a request, not approval. Handle only the approvals the chosen action needs, and continue other authorized work.

### During work

- Create each work branch from its primary issue: `gh issue develop <N> --name <type>/<summary> --base <default branch> --checkout` (or `--worktree <path>`). This creates the branch on GitHub at once, so it needs the same authorization as a push; without it, create the branch locally and link it when pushing is approved. If the work has no issue yet, create the branch locally, add an issue draft to its subsection's pending requests, and link the branch once the issue is filed. The PR may close other issues too; list each with `Closes #N`.
- Edit only the current branch's subsection, plus `Ranked work` and `Pending` when they actually change. Keep subsections in alphabetical order. Remove subsections whose PR has merged or closed.
- The branch subsection records: task and issue, PR, code checkpoint, observed state, verification run and results, one concrete next action, and when useful: checks not run, approaches to avoid, and pending IDs with what they block. Describe unmerged work as awaiting review or merge.
- Keep it current rather than a log. History and decisions belong on the issue; lasting knowledge belongs in the docs folder. Never write secrets or local paths containing personal IDs.
- Commit `HANDOFF.md` only before a push and at wrap-up, as a `docs:` commit on the work branch. Never commit it on the default branch; with no work branch, commit it on the next task's branch, created as above.
- On a rebase conflict in `HANDOFF.md`, keep the incoming version of this branch's subsection and the base's version of everything else.

### Before merge

- When the user accepts the work, remove this branch's subsection, update `Ranked work`, and commit and push that before the PR merges, within the user's authorization.

### End of a session

- Use the `handoff` skill to update issues and `HANDOFF.md`, resolve relevant pending requests, checkpoint intended changes, and report what is committed, uncommitted, and retrievable on another computer. Push only within the user's authorization.
<!-- handoff:end -->

Use the `commit` skill for any commit outside a handoff.

## Where things live

- GitHub issues: work items, with handoff notes in their comments.
- `HANDOFF.md`: per-branch resume points, ranked work, and requests awaiting the user's approval.
- `docs/`: long-term knowledge: plan, behavior, decisions, and verification ([index](docs/README.md)).
- The user runs the dev server at `http://127.0.0.1:5199`; their real collection lives in that origin's browser storage. Don't restore into it or reload a pending agent batch without asking; verify with a copy (see [verification](docs/progress.md#working-agreements-and-verification)).
- Keep local configuration (`.claude/`), personal collection data (`bookmarks-*.json`), and temporary evidence out of commits.

## Branches and pull requests

- Name branches `<type>/<summary>` with Conventional Commit types (`feat/thumbnail-store`, `fix/filter-wrap`).
- One issue per change; its PR closes it. Each follows [How each change works](docs/plan.md#how-each-change-works): mockup first for visual changes, then 2–4 "You try" tasks, with approval recorded on the issue. Ask before filing a new issue or pushing, unless the user already authorized that scope.
- Write PR titles in plain words about what that PR alone does, without planning jargon.
- PRs are squash-merged. After a PR in a stack merges, rebase the next branch onto the new `main` (`git rebase --onto origin/main <old base commit> <branch>`) before filing it.

## Checks

In `app/`: `npm run build` and `npm test`. Before a PR, run them after a fresh `npm ci` in a clean worktree; an existing `node_modules` can hide a broken lockfile. CI ([checks.yml](.github/workflows/checks.yml)) runs the same `npm ci`, build, and tests on every PR to `main`.
