# Plan — triage bookmarks into project ideas

October 11, 2026. Replaces [product-plan.md](product-plan.md), [product-review-guide.md](product-review-guide.md), and the C.1 amendment. Those stay as history.

## What the app is for

1. **Triage bookmarks.** Work through a Raindrop export one bookmark at a time and decide what each one is for.
2. **Group them into project ideas.** A bookmark joins one or more groups (existing GitHub issues, proposed issues, topics), and a group can be read as a whole.
3. **Let an agent help, through WebMCP.** The agent can add new items, fill in item details, and read processed groups with their bookmarks.

**Filters** support all three: finding what is left to triage and what belongs together.

Anything not serving these jobs is frozen (kept in the code, not extended, hidden if it gets in the way) or cut.

## Test data

From now on the test data is the user's own `bookmarks-working.json` (148 bookmarks, git-ignored), not the samples. A one-off script converts it to the app's backup JSON, which is restored through **Restore backup**:

| Prototype | App |
|---|---|
| bookmarks (title, URL, note/excerpt, cover, Raindrop tags) | bubbles |
| 15 GitHub issues and 6 proposed issues | tags of type **Project idea** (proposals marked as proposed) |
| 29 categories | tags of type **Topic** |
| existing references and seed bookmarks | memberships |
| `node_progress` pending / done / dropped | statuses |
| 2 duplicate groups, link-check warnings, suggested next action | kept as bubble details so triage can show them |

The original Raindrop fields are kept on each bubble so nothing is lost. The converter lives in `scripts/` and is tested on a small fixture.

## How each round works

Each round is one small piece of work:

1. **Mockup first** for anything you will look at: a static page with your real data. You approve or change it before any code is written.
2. **Build** it.
3. **I verify it myself** in the browser with your data, checking every task you will try, at desktop and narrow widths. It is not ready until those pass.
4. **You try it**: 2–4 tasks, about 5 minutes. Feedback is fixed before the next round starts, unless you choose to defer an item.

There are no checkpoint tags, deferred-verification registers, or release gates. [progress.md](progress.md) records one line per round: what shipped and what is still open.

## Rounds

### 0. Your data in, known bugs out

- Write the converter and restore your collection.
- Fix the bugs found in the Checkpoint C review: the graph is blank until **Fit graph** after an import, and new tags from a second import are placed badly.
- **You try:** restore your collection; check that bookmarks, project ideas, and topics look right.

### 1. Triage

The main screen for job 1. Its shape is decided in the mockup. The likely starting point is a queue of pending bookmarks with the current one's details beside it and fast actions: add to a project idea or topic, keep, skip, mark duplicate, defer. Warnings (broken link, possible duplicate) appear inline.

- Decide in the mockup: which decisions you need (the prototype had keep / attach / skip / duplicate / defer) and how they map to statuses.
- **You try:** triage 10 real bookmarks and see how long it takes.

### 1.5. Fetch title, description, and image from the URL

A browser page cannot read other sites (CORS), so fetching needs a small helper.

- **Helper:** a local Node service started with the app (`npm run dev` starts both). It downloads the page with a timeout and size limit, reads the title, description, and preview image (Open Graph / Twitter / `<title>` / meta description), and downloads the image. It never runs page scripts, and it refuses `localhost` and private-network addresses. It does not work on a static-only deployment unless it is hosted there too.
- **In the app:** a **Fetch details** action on one bubble, a multi-selection, or a filtered view. Results are reviewed before saving: empty fields can be filled in one step; values that differ from existing ones are shown side by side to choose. Saving appears in Undo.
- **Images** are stored as local image assets on the bubble (this unfreezes media for images). Raindrop's `cover` URL is used when the page has no image.
- Failures (timeout, 404, blocked, non-HTML) are recorded on the bubble so triage and filters can find them. This replaces the prototype's link-check warnings for bookmarks that are fetched again.
- **You try:** fetch one bookmark, then 20 at once; accept some changes and reject others; check the images after reload and in a backup.

### 2. Project ideas and tags

- Create and edit tag types (Project idea, Topic, …). This does not exist today.
- A project-idea view: the group's description and its bookmarks, readable on its own.
- Tag appearance moves into a collapsed **Appearance** section. Overrides must actually change the node: color fills the node instead of only the border; size, shape, and icon render.
- **You try:** create a type, review one project idea, override one tag's color.

### 3. Filters, redesigned

Same capabilities, new UI. Mockup options first, built from what you dislike about the current screen. The rule types you need are decided then; distance filters stay only if you want them.

- **You try:** find "pending bookmarks in topic X not yet in any project idea", save it as a view, and reopen it.

### 4. WebMCP for your agent

Starting this round requires naming the browser and agent you will use.

- Tools: **add item**, **update item details** (description, URL, tags, status), **read a project idea** (its bookmarks and their details), plus **search and filter** for finding things.
- Writes go through the same domain commands as the UI and appear in Undo. Whether you approve each agent write or review afterwards is decided at the start of the round.
- **You try:** have your agent add two bookmarks to a project idea and summarize one group.

### Later, only if needed

- Performance work, if your real collection is slow. 148 bookmarks does not need the 5,000-bubble budget.
- Static deployment.

## Frozen or cut

| Feature | Decision |
|---|---|
| Graph view, import wizard, backup/restore, current Undo | Keep. Fix bugs as they are found. |
| Copy composer | Freeze: keep the one-click Copy and quick presets; no more template work. |
| Media upload | Freeze, except image assets from round 1.5. |
| Bulk status propagation | Keep; revisit in round 1 if triage replaces it. |
| C.1 undo rework (change sets, Redo, schema 2) | Cut. Current undo stays until it causes a real problem. |
| New bubble, archive | Moved into rounds 1/4 (WebMCP needs add item; triage may need archive). |
| 1,000/5,000 measurements, release review | Cut. |
