# Handoff

## In progress

### ci/github-pages

- Task: #17 Deploy to GitHub Pages
- PR: none yet; branch is on GitHub, commits are local
- Code checkpoint: 5f31213 ci: deploy the app to GitHub Pages from main
- State: `.github/workflows/pages.yml` builds `app/` with `npm ci` and `npm run build` and deploys `app/dist` with `actions/deploy-pages` on push to `main` or manual dispatch. Vite already uses `base: './'`, so the build works under `/bookmark-router/`. `docs/product.md` describes the deployment. The user enabled Pages with GitHub Actions as the source; the site URL is `https://pomodorozhong.github.io/bookmark-router/`.
- Verification: `npm run build` passes; `npm test` passes (113 tests); built `index.html` references assets with relative paths. The workflow has not run; it deploys only after the merge to `main`.
- Next action: push, open the PR with its "You try" tasks, and after merge confirm the Pages run succeeds and the site loads.

## Ranked work

1. #17 Deploy to GitHub Pages (in progress on `ci/github-pages`)
2. #18 Verify the local agent relay on a live GitHub Pages deployment (after #17)
3. #13 Keep the detail panel's Copy and Edit buttons in one place
4. #16 Keep the triage header usable at narrow window widths (also: the filter bar wraps below about 1150 px with the queue open, and tapping a tag at phone width is unverified)
5. #21 Hidden nodes overlap shown nodes after Reset positions
6. #22 Nearby nodes cover non-focused titles when zoomed in
7. #23 Threads thumbnails fall back to a loading-screen screenshot

## Pending

None.
