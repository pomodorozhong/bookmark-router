# Agent handoff

Read [.agents/progress.md](.agents/progress.md) for current state, decisions, and verification limits, then [.agents/plan.md](.agents/plan.md) for remaining work and next steps.

Use [docs/README.md](docs/README.md) to find lasting product behavior, setup, and verification references.

The two handoff notes are tracked project files. Keep them concise and current at meaningful milestones; link to durable docs instead of repeating them. Check Git and live app state before relying on a prior session's snapshot. Keep local configuration, temporary evidence, and personal collection data out of handoff commits.

## Start of a session

1. Resolve any parked pending items first (`git log --branches --source --format='%h %S %s' --grep='^chore: park pending items$'`).
2. Read [.agents/next-steps.md](.agents/next-steps.md), check the top issue is still open (`gh issue view`), and propose it to the user.
3. End sessions with the `wrap-up` skill.
