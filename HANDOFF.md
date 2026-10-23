# Handoff

## In progress

### fix/zoomed-out-links

- **Task:** #25 Links between nodes disappear when zoomed out. Linked to #25 on GitHub and pushed on 2026-10-23, based on `main` `cb04ac9` (after #64).
- **PR:** none.
- **Code checkpoint:** none; no work started. The branch holds only `docs:` handoff commits.
- **State:** not investigated yet. The issue suggests edges use a fixed `lineWidth: 1.2` with a light stroke `#a9bdba` in graph units (`app/src/components/GraphCanvas.tsx`), so they shrink under a pixel when zoomed out. #64 has merged, so `GraphCanvas.tsx` on `main` already reads theme roles for tiles and selection; #67 covers the remaining graph colors, edges included.
- **Next action:** reproduce on a copy of the collection at the lowest zoom, then mockup first: how links look zoomed out and zoomed in.

### stack/ui-phone-flows

- **Task:** stack 2 of the UI/UX revamp milestone, built with the `propose-stack` skill (now at its step 5, review). Mockup approved on 2026-10-24 ([Phone and flows mockup](https://claude.ai/artifact/VkSFUTosi4cM7MUvJcFd7Z)); the approval and a handoff note are on each issue.
- **PRs:** none yet. Planned, each against `main`: 1 `fix/phone-graph-tools` (closes #34, #35, #39), 2 `fix/phone-panel` (#36, #57, #58), 3 `fix/queue-drawer` (#37, #38), 4 `fix/add-bookmark` (#55, #56, #43), 5 `feat/shortcut-badges` (#61; depends on 2, opens as a draft). No PR branch exists or is linked to its issues yet.
- **Code checkpoint:** local branch `stack/ui-phone-flows` in the worktree `../bookmark-router-ui-phone-flows`, base `main` `10bbcba`, tip `37989e8`. PR 1: `85fcbeb`, `35d6807`; PR 2: `d64fb12`, `988cede`, `06973a1`; PR 3: `21f6908`; PR 4: `1dcaaa1`, `f398130`, `80d7588`; PR 5: `37989e8`. The stack branch is never pushed, so this work exists only on this computer. The PR map, review request and the five PR bodies are in that worktree's `.agents/propose-stack/ui-phone-flows/` (git-excluded).
- **Verification:** trial rebuild of each PR alone on `10bbcba` (PR 5 on PR 2), one fresh `npm ci`: every commit passes `npx tsc --noEmit` and `npm test` (114/114), every branch passes `npm run build`, and so does the stack tip. Browser checks in headless Chrome on a copy of the collection, each PR on the stack branch with the earlier PRs applied (320×640, 390, 1024, 1200, 1280, 1440 px; touch emulation for the badges).
- **Not done:** none of the PRs updates `docs/product.md` yet (for example its "Single bookmark creation" row still says Add bookmark opens Import, and the filter bar, queue drawer and phone panel lines describe the old behavior). Add each PR's doc change as a fixup in that PR before publishing.
- **Requests:**
  - **P-01 Review the built stack.** The review request (in `review.md`) lists details to check: View menu icon-only buttons, ~12-character collection name at 320 px, Filters count, short-phone threshold 760 px, description order on phones, tag view without box selection, empty title saved as the site name (not marked Title missing), bare domains, "1 of N" hidden at 1200 px and below, no F badge on the phone search. Blocks publishing. After feedback, the skill's step 6 asks "Push these 5 branches and open the PRs?"; opening the PRs needs that separate approval.
- **Next action:** get the user's feedback on P-01, fold fixes and the `docs/product.md` updates into their PRs as `fixup!` commits, repeat the trial rebuild, show the final review, and ask to publish.

## Ranked work

1. Decide #68: what the editor's "In progress" status should be (keep, rename, or hide; label `needs-decision`)
2. Review and publish UI/UX revamp stack 2: 5 PRs for #34, #35, #39, #36, #57, #58, #37, #38, #55, #56, #43, #61 (on `stack/ui-phone-flows`, P-01)
3. #25 Links between nodes disappear when zoomed out (on `fix/zoomed-out-links`)
4. #67 The graph's labels, edges and node fills don't follow the theme
5. #21 Hidden nodes overlap shown nodes after Reset positions
6. #22 Nearby nodes cover non-focused titles when zoomed in
7. #23 Threads thumbnails fall back to a loading-screen screenshot
8. UI/UX revamp stack 3: menus (#49, #59), covers and letter tiles (#52)
9. #27 The Claude desktop in-app browser can't reach the local relay from the Pages site (tracking; re-test when the desktop app updates; optional menu hint when local network access is denied)

## Pending

- **P-02 File an issue for the import screen at phone widths.** Found while checking stack 2; asked on 2026-10-24, not answered. Proposed issue, milestone UI/UX revamp, label `bug`:
  > **Title:** At 390 px the import screen is wider than the screen
  >
  > **Body:** On the import screen at 390 px, the header's buttons (Undo, the Agent control and More) push past the right edge, so the page is wider than the viewport: More is cut off and the page content sits in a narrower column with empty space on the right. Seen on `main` `10bbcba` in headless Chrome with a copy of the collection, both on the Source step and after More → Add bookmark…. Likely cause: the import screen's `.topbar` keeps the desktop Undo and Agent controls, unlike the triage header's phone layout.
  >
  > Done when the import screen fits a 320 px and a 390 px viewport with nothing cut off.
