# Untangle: find the best next bookmark to process

Recorded October 25, 2026. This is a feature plan, not current app behavior. The user chose the direction below and approved filing [#90](https://github.com/pomodorozhong/bookmark-router/issues/90) and publishing the documentation branch. The issue is filed and `docs/untangle-plan` is published; the clickable mockup and implementation are still to come.

## Goal and inspiration

Add a **Connections** view inspired by [Vax!](https://github.com/digitalepidemiologylab/VaxGame): small bookmark nodes, direct links, visible hubs, and step-by-step connection tracing. The reference was inspected in the user-provided local checkout and at `http://127.0.0.1:3000` during planning.

The central action is **Best next**. Calculate which bookmark's completion would most effectively separate the remaining backlog into smaller clusters, explain the recommendation, and let the user preview its effect. This turns the game's visual search for a good node to "vaccinate" into a calculated starting point for bookmark triage.

In the saved 148-bookmark collection, processing **SCRNSHTS** would split a connected set of 31 To triage bookmarks into sets of **19 and 11**. The bookmark with the most direct neighbors would not split its cluster. These measurements came from the saved fixture with all tag types shown, not the user's live browser collection; membership, status, and filter changes can change the result.

## Chosen behavior

### View and connections

- Add a **Tags / Connections** switch to the desktop graph tools and the phone's View menu. Tags remains the initial default.
- Draw one node per bookmark and one undirected link per bookmark pair sharing an eligible tag. Retain every shared tag ID as evidence. More shared tags produce stronger links and attraction; larger nodes indicate more direct neighbors. A distinct ring marks Best next.
- On **To triage**, analyze bookmarks matching the current search, filters, and selection. Hidden tag types contribute no connections. Display the analyzed bookmark count. Done and Dropped bookmarks do not participate in the remaining network.
- Rank the To triage queue by untangling priority. J/K follows that displayed order. Done, Dropped, and All support browsing connections; recommendation controls direct the user to To triage.
- Selecting a bookmark opens its existing detail panel. Connection information names the shared tags that explain each link.

### Preview and trace

- **Preview impact** is on demand. Temporarily fade the selected bookmark and its links, then color and label the clusters that would remain. Keep positions fixed for comparison. Exiting restores the actual network.
- **Trace connections** starts at the selected bookmark. Forward/back controls reveal one hop at a time, with hop and reached-bookmark counts. Choosing another bookmark or changing the analysis scope resets the trace.
- Preview and trace are separate temporary modes. Neither changes bookmark data or saves forecast geometry.

### Processing

- Done or Drop affects only the current bookmark, using the existing commands and Undo.
- After the save succeeds, remove that bookmark from the remaining network, recalculate priorities, and automatically open the new Best next.
- If no single bookmark can split a cluster, recommend the most connected bookmark and explain the limit, for example: **"Removes 12 connections; this step won't split the cluster."**
- Keep isolated bookmarks in the queue with **"No connections in this view."** An empty scoped backlog has no recommendation.
- A failed save leaves the actual graph and current bookmark unchanged. Undo restores the bookmark's connections and recalculates priorities.

## Recommendation calculation

Use an exact calculation for the next individual decision:

1. Build the undirected graph from the scoped bookmarks and eligible shared tags. Styling and visual emphasis must not prune this graph or change its connectivity.
2. Temporarily remove each candidate and find the resulting pieces of its original connected cluster. Other clusters are unchanged.
3. Score how many pairs of **other remaining bookmarks** lose their connecting path. If the resulting piece sizes are `n1, n2, ...`, the score is `sum(ni * nj)` for every `i < j`.
4. Rank by descending separation score, then descending direct connections removed, then oldest creation date, then stable ID.

For the SCRNSHTS example, the separation score is `19 * 11 = 209`. The processed bookmark itself is excluded from the surviving-pair count. A candidate that leaves one connected piece has a separation score of zero; direct-connection count then provides the agreed fallback. Candidates with no connections are ordered by creation date and ID.

The recommendation describes the best measured **next step**, not a globally optimal sequence. Recalculate after status changes, membership changes, filters, selection changes, and Undo. Existing status outcomes determine whether a bookmark is To triage, including collections with custom statuses.

## Implementation and compatibility

- Add a pure domain module for graph projection, candidate ranking, predicted splits, and trace layers. Its inputs describe the scoped bookmarks and eligible tags; its output includes shared-tag evidence, ranked candidates, resulting cluster sizes, and hop layers.
- Add a dedicated Connections canvas using the installed G6 and d3-force libraries. Reuse the existing bookmark details, commands, Undo, queue controls, and copy context. The ranked queue must also be the list published to copy context.
- Preserve separate positions, pins, and viewports for each graph. Extend the existing `Geometry` record with an optional `connections` layout containing positions and viewport. Merge saves so either view preserves the other's layout.
- Validate and round-trip the optional layout through backup/restore. Existing backups remain valid. No Workspace schema or IndexedDB version change is needed.
- Advance to the next recommendation from the successfully committed state, rather than from a stale queue or a forecast. Browsing other status tabs retains the existing triage navigation behavior.
- Use theme colors, readable selection labels, keyboard-accessible controls, and immediate trace updates when reduced motion is enabled. Recommendation reasons remain available as text.
- V1 uses shared tags for all connections and local calculations for recommendations. Content similarity, game objectives, resource limits, and automatic status changes to neighboring bookmarks are outside this plan.

## Verification and delivery

Follow [the change workflow](workflow.md#how-each-change-works):

1. Track the feature in [#90](https://github.com/pomodorozhong/bookmark-router/issues/90), filed with the user's approval on October 25, 2026. The documentation branch only records the plan; link the eventual implementation branch to the feature issue when it will fully resolve it.
2. Deliver a working clickable mockup using a disposable copy of the real collection. Include the SCRNSHTS example, dense-cluster fallback, step-by-step trace, impact preview, and phone layout. Record the user's mockup approval on the issue before implementation.
3. Build on a feature branch from the then-current `main` after the mockup is approved.
4. Verify the behavior locally with a copied collection on a separate origin, following [the real-collection verification recipe](workflow.md#verifying-on-the-real-collection). Do not restore into or reload a pending agent batch on the user's `127.0.0.1:5199` origin without approval.
5. Before the eventual PR, run fresh `npm ci`, `npm run build`, and `npm test` in a clean worktree. Use the normal PR approval workflow.

### Automated cases

- A bridge outranks a higher-degree non-bridge. Cover chains, cycles, cliques, disconnected clusters, isolates, deterministic ties, and an empty backlog.
- Cover shared-tag evidence, multiple shared tags, hidden tag types, search and filters, selected subsets, and custom status outcomes. Trace layers must match shortest hop distances.
- Forecasted cluster sizes must equal the actual result after processing. Failed saves must not advance; Undo must restore connectivity and priorities.
- Cover queue order, J/K, copy context, independent layouts and pins, reload, and compatibility with backups with and without the optional layout.

### Browser checks and user review

Verify desktop and narrow layouts, trace controls, preview exit, recommendation text, filtering, and absence of horizontal overflow. Offer these three **You try** tasks and record the result on the issue:

1. Find Best next, preview its split, and process the bookmark. Check that the resulting clusters match the forecast and the next recommendation opens.
2. Trace from a bookmark one hop at a time and inspect the shared tags explaining its connections.
3. Undo a decision, change filters, and switch graph views. Check that priorities update and each view retains its own layout and pins.

## Resume state

The plan and handoff are documented, the documentation branch is published, and the feature is tracked in [#90](https://github.com/pomodorozhong/bookmark-router/issues/90). No Untangle source implementation or mockup has started. The next feature deliverable is the clickable mockup for approval. The feature has no dependency on the already merged agent-import implementation.
