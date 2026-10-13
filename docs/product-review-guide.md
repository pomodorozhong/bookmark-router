> **Superseded October 11, 2026** by [plan.md](plan.md). Kept as history.

# Product review checklist

Follow the [product plan](product-plan.md). **Checkpoints A, B, and B.1 are accepted. Stage C may proceed.** The [UI improvement plan](ui-improvement-plan.md) and its running implementation review are retained as references. See [implementation progress](product-progress.md).

Check an item when its expected result matches what you see. Leave failed items unchecked and add a note. Share feedback as **task → expected → actual → impact**.

## A — Import mapping and terminology — approved October 10, 2026

Open [the review app](http://127.0.0.1:5199/). Allow about 10–15 minutes. This section records the earlier design review. The current Stage B build saves confirmed changes; use the checklist below for current testing.

### Bookmark sample

- [ ] On **Import**, select **Bookmarks with duplicates**, then **Read source**. Expect CSV detection and **6 records**.
- [ ] Check the suggested mappings: Title → `title`, Description → `description`, URL → `url`, Action status → `status`, Tags → `tags`. Media URL and Tag type should be unmapped.
- [ ] Change a mapping and change it back. Confirm the column names and sample records make it clear which data each field will receive.
- [ ] Leave the tag separator as `|`. Enter `Test batch` in **Common tags**, then select **Review records**. Expect that tag on each reviewed record.
- [ ] With default duplicate choices, expect **4 ready for preview**, **1 duplicate candidate**, and **1 invalid row**.
- [ ] Inspect source row 4. Expect its URL to match source row 2, with **Skip** selected by default.
- [ ] Select **Keep both** for row 4. Expect the ready count to increase from 4 to 5.
- [ ] Select **Merge**. Check whether the proposed title, description, and tag changes are understandable. This is a design proposal; it does not merge records yet.
- [ ] Return row 4 to **Skip** before previewing the collection.
- [ ] Inspect row 5. Expect the invalid `not-a-url` value and a clear exclusion reason.
- [ ] Inspect row 6. Expect the URL as its fallback title and a **Title missing** label.
- [ ] Inspect row 7. Expect **No URL · allowed**; its title and description should remain usable.
- [ ] Uncheck a valid row. Expect the ready count to decrease; check it again to restore it.
- [ ] Select **Continue**. Confirm the screen clearly says this is a preview and no data will be saved.

### Graph and list preview

- [ ] Check that the graph fills the window by default. Use **Retract left panel** and **Open left panel**; expect navigation and collection information in the retractable panel, search at the top, and Graph/List and Details at the top right. The top controls remain accessible with the panel retracted. Toggling it must preserve selection and the settled layout.

- [ ] Select **Open collection preview**. Expect 4 bubbles, each appearing once, with their tags and connections.
- [ ] Select a bubble. Expect its title, description, status, source link when available, and linked tags in the detail panel. Long titles should clip with an ellipsis; hover to see the full title. Close Details to recover unobstructed graph space.
- [ ] Select a tag. Expect a visible selection outline/halo, highlighted connected edges, its linked-bubble count, and a list you can use to select those bubbles.
- [ ] Drag a colored tag. Expect connected bubbles to respond naturally and settle after release.
- [ ] Pan with two fingers on your Mac trackpad. Expect the view to move without restarting layout or moving nodes relative to one another.
- [ ] Try **Fit graph** and the **− / +** zoom buttons. Expect viewport changes without renewed physics. Also pinch with two fingers: expect graph scaling around the pointer without browser page zoom or renewed physics.
- [ ] Search for `Import`. Expect only **Import patterns** to match. Switch to **List** and expect the same bubble result.
- [ ] Clear the search and return to **Graph**. Expect all bubbles to return without a fresh layout.

### A second workflow and your own export

- [ ] Select **Reading & writing**, then return to **Import** and walk through its source, mapping, and review steps. Expect TSV detection and 3 valid records without URLs.
- [ ] Preview the reading collection. Decide whether “bubble,” “tag,” and “action status” make sense for tasks and reading notes as well as bookmarks.
- [ ] Start a fresh preview with a representative export using **Choose file**, or paste a few real links. Expect recognizable column mappings and useful source-row references. CSV, TSV, bookmark HTML, pasted URLs, and versioned product JSON are supported; prototype JSON is not.
- [ ] Scroll at each import step. Expect **Back** and the next-step action to remain visible at the bottom. Check that going **Back** lets you adjust mappings and review again without changing your original file.
- [ ] Note any confusing field names, duplicate choices, counts, or proposed changes. Unknown status/type mapping, transactional importing, backup restore, editing, and persistence are not ready for testing yet.
- [ ] Report whether the import design fits your workflow or which changes you need before the usable import build.

Checkpoint A findings guide the final import interactions. Parser and storage work can continue independently.

## B — Real import and recovery — accepted October 10, 2026

The user accepted Stage B's functionality. The tasks below remain a regression reference; unchecked items do not claim individual verification. The red-dot expectation describes Stage B and will be superseded by the pushpin review in B.1.

Open [the app](http://127.0.0.1:5199/). Allow about 15–20 minutes. Confirmed changes now persist in this browser. Use **New collection** to keep your test separate from your own data. Samples load import sources without replacing a collection.

### Import and confirmation

- [ ] Create a new collection, select **Bookmark sample**, then **Read source**. Expect 6 source records with suggested mappings.
- [ ] Review the sample in an empty collection. Expect 5 selected records, 1 duplicate candidate, and 0 invalid rows.
- [ ] Inspect row 5 (`not-a-url`). Expect an amber **Unrecognized URL** warning and an enabled, checked inclusion checkbox. It can be imported without repairing the value.
- [ ] Try a malformed CSV row or invalid media URL. Expect an exclusion reason and acknowledgement before continuing with the remaining records.
- [ ] Leave the duplicate on **Skip**, continue and confirm. Expect 5 bubbles and 2 tags, including **Broken link** with its URL saved as text. No records should be saved before the final confirmation.
- [ ] Load the same sample again. Choose **Keep both** for a duplicate, confirm, and check that a separate bubble was added.
- [ ] Try **Merge** in another import. Inspect the proposed title, description, status, media, and added tags before confirming; expect one existing bubble to change rather than a second bubble being created.
- [ ] Uncheck a valid row. Expect it to be excluded from the final result.
- [ ] Go Back and change a mapping. Expect the review to reflect the change; navigating to Collection before confirming must leave its contents unchanged.
- [ ] Try **Reading & writing**. Expect three URL-less records that can be imported and edited normally.
- [ ] Try your own CSV/TSV, browser bookmark HTML, or pasted URLs. Check source-row references, missing-title fallback, and preserved URL query parameters.
- [ ] Try an unfamiliar status or tag type in a CSV. Choose an existing mapping or explicitly create it; confirmation must stay unavailable while selected rows have unresolved values.

### Editing and layout

- [ ] Select a bubble and choose **Edit bubble**. Change its title, description, URL, and status; expect Save changes to persist them.
- [ ] Create a tag and use **Manage linked tags** in bubble details to add/remove connections. Expect graph and list details to agree.
- [ ] Edit a tag's name, description, URL, type, and status. Its status should change independently of its bubbles. Bulk propagation arrives in Stage C.
- [ ] Search and switch between Graph and List. Expect the same matching bubbles, including unlinked items. While searching, tags without matching linked bubbles should hide; clearing search restores all tags.
- [ ] Drag a tag; expect connected bubbles to respond and settle. Dragging must not pin. Open Details and press **Pin node**; expect **Unpin node** and a red dot at the upper-right edge of the circle. Unpin it and expect the dot to disappear.
- [ ] Open Details and click **Fit graph**. Expect the graph to fit beside the panel, with nodes visible. Close Details and fit again to use the full canvas.
- [ ] Use **Re-layout** with a pinned node. Expect its position to remain fixed.
- [ ] Use **Reset positions**. Expect confirmation before clearing all pins and rearranging the graph.
- [ ] Zoom in and out. Expect bubble and tag titles to keep the same screen size. Nearby titles should hide rather than overlap, then return when space opens up. Selected titles get priority.
- [ ] Select **Broken link**. Expect its URL highlighted as unrecognized text, with a compact **Not a link** warning and no **Open source** link. Edit it to a valid HTTP(S) URL and expect a source link to appear.
- [ ] Pan, pinch, fit, change search, select items, or toggle Details/left panel. Expect settled world positions to stay unchanged. Please verify physical Mac trackpad pinch and two-finger panning.
- [ ] Reload. Expect content, memberships, node positions, pins, and viewport to survive.
- [ ] If using two tabs, edit the same record in each. Expect a conflict warning rather than silent replacement; a failed editor save keeps the draft.

- [ ] In import review, check **Title missing** uses a yellow warning tint.

### Recovery and backup

- [ ] Open **Import history**, then **Review undo**. Inspect the affected bubble list before confirming.
- [ ] Undo an unchanged batch. Expect imported bubbles to be removed and merged values/memberships to be restored. Imported tags remain available for reuse.
- [ ] Edit an imported bubble, then review undo. Expect that bubble listed under **Keep these later edits**; confirm undo and check its later edit survives while unchanged records are removed/restored.
- [ ] Download a backup, then import that JSON. Expect a restore confirmation and a new collection; the current collection should remain intact.
- [ ] Switch collections and check that restored content, tags, memberships, statuses, appearance, saved views (if present), and layout match the backup.
- [ ] For bundled-media recovery, choose [the included media backup fixture](../app/fixtures/media-backup.json) as an import file. Confirm restore, select **Backup item**, and expect a small teal image and `fixture.svg` in its details. Reload and check it again. Media uploads arrive in Stage C.
- [ ] Download a backup of that restored fixture and restore it again. Expect the image to remain available. Remote media remains a URL reference rather than being downloaded into backups.
- [ ] Report import or recovery blockers using **task → expected → actual → impact** before moving to Stage C.

## B.1 — UI improvement — accepted October 10, 2026

See the [detailed plan and audit](ui-improvement-plan.md). The user approved the running implementation after U2 review; no new data preparation is needed. The tasks below remain a regression reference, and unchecked items do not claim individual verification.

### U1 — Review the visual direction (5–10 minutes)

The implementer will supply a high-fidelity mockup with a populated graph, a selected pinned bubble, open Details, collapsed navigation, a narrow-screen layout, and a pin close-up.

- [ ] Find the current collection, Import, New tag, and recovery tools. Their grouping should make sense without an explanation.
- [ ] Look at the pin on a small bubble and a larger tag. It should visibly enter the upper-right edge with a clear flat silhouette; it should not float beside the node.
- [ ] Compare the close, collapse, fit, zoom, pin, and edit controls. Icons should look centered and consistent, and their purpose should be understandable.
- [ ] Read the Details panel in order. Record information, actions, and connections should be clearly separated.
- [ ] Judge text size, spacing, contrast, and overall density at desktop and narrow sizes.

The written visual direction was used to implement B.1 directly. Use this checklist to record follow-up regression findings during Stage C.

### U2 — Try the improved app (10–15 minutes)

The implementer will provide the running build, comparison screenshots, technical verification results, and a separate demo collection with long titles, warnings, several statuses, and pinned/linked/unlinked items.

- [ ] Switch collections, retract/open navigation, and switch Graph/List. It should remain clear where you are and which controls are active.
- [ ] Select a bubble and a tag, read a long title, edit a record, and manage its connections. Check that the panel is easy to scan and controls stay reachable.
- [ ] Pin/unpin, drag, pan, zoom, and fit. The pin should stay attached and visible, while the established graph behavior stays familiar.
- [ ] Zoom in and out with short and long tag names. Text should stay readable and centered at a consistent screen size, without clipping or awkward backgrounds. Crowded labels should return when there is room; try a selected tag too.
- [ ] Search for a known item and then something absent. Selected and empty states should be understandable, and clearing search should be easy.
- [ ] Try Import and review an undo/restore flow using the demo collection. Labels, icons, dialogs, warnings, and primary actions should follow one visual system.
- [ ] Narrow the window and use keyboard navigation. Look for clipped titles, overlapping panels, tiny targets, or focus that disappears.

Report **screen/action → expected → actual → impact**; a screenshot or a quick “too dense / too faint / hard to find” note is useful. B.1 is approved; use this checklist for follow-up regression checks while Stage C proceeds.

## C — A complicated workflow — ready for review October 10, 2026

Open the running app at http://127.0.0.1:5199/ and use the existing review collection. A saved `Stage C review` view is available under **Filters** as a concrete nested-filter example; clear the view before starting a fresh task. Prepare a real processing task and the destination where you will paste its output. Allow about 15–20 minutes. The goal is to judge whether the rules are understandable and whether the copied result is ready to use, not to re-check the accepted import foundation.

- [ ] Open a tag with a type and set the type's color, size, shape, and icon defaults. Expect its tags to inherit those defaults.
- [ ] Override one tag's appearance field, then uncheck/reset that field. Expect only that field to return to type/default inheritance.
- [ ] Select a tag and use **Change status** from the selected-node bar. Choose the new status with the segmented control. With **Tag only**, expect linked bubbles to keep their statuses and the tag-only target list to show one record.
- [ ] Choose **Tag and linked bubbles**. Expect a warning listing every affected bubble and its current status, including hidden bubbles.
- [ ] Cancel that operation. Expect no status changes. Repeat and confirm; expect exactly the reviewed targets to change.
- [ ] Undo the bulk status change. Expect previous statuses to return.
- [ ] Build nested All / Any / Not filters and a same-linked-tag rule. Check the live count and whether the summary describes your intended workflow.
- [ ] Try tag-distance filtering and inspect example paths. Expect distances to use the full membership graph, even when some tags are hidden.
- [ ] Compare graph and list results; save the view and reopen it.
- [ ] Configure copy fields, order, separators, format, and a template. Expect the preview to match the copied output exactly.
- [ ] Open **Compose copy** from a tag. Expect the current default result and a prominent **Copy text** action immediately; the source-bubble scope should stay visible while the detailed controls remain collapsed under **Customize copy**.
- [ ] In **Customize copy**, try **Link only**, **Title only**, **Title + link**, and **Markdown links**. Expect the result to update without leaving the composer.
- [ ] Compare **All linked bubbles** with **Current view**, save a copy preset, reload the composer, and try that preset.
- [ ] Open **Bubble Details** and choose **Copy**. Expect the bubble's default copy text to reach the clipboard and a visible confirmation.
- [ ] Expect **Undo** to remain visible in the bottom bar in Graph and List, disabled when no saved action is available, with no dismiss control. Save an edit, then change a status. Undo twice to restore the status and then the edit. The adjacent label identifies the next action to undo.
- [ ] Reload after saving a change and switch between collections. Undo history should persist separately for each collection. Changes made before the general history was introduced have no entry.
- [ ] Paste the result into your actual destination. Check links, missing fields, ordering, and formatting.
- [ ] Upload image, video, and audio files. Expect usable assets; copied local assets should use filenames, not temporary blob URLs.
- [ ] Report confusing rules or output, including the exact filter summary or copied text that caused trouble. Enrichment work can continue independently.

Report feedback as **task → expected → actual → impact**. For copy issues, include the selected fields, separator, format, template, scope, ordering, and the exact output. For media issues, include kind, filename, and whether the Details preview or backup was affected. Checkpoint C remains open until the confusing rules/output findings are resolved; independent enrichment work can continue after this review.

### Changes since ready

- General per-collection Undo replaced the separate Undo status control (uncommitted when this checkpoint was marked ready). Stage C.1 reworks its storage; behavior in this checklist stays the same.
- October 11: the import-screen Undo bar covered the wizard footer, hiding **Read source**, **Continue**, and **Confirm import**. Undo now sits inside the footer beside **Back**.

### Decisions made October 11, 2026

- **Undo model:** one linear Undo/Redo for all saved actions; Import history still undoes an older batch. Implemented in C.1.
- **Record lifecycle:** New bubble and archive/unarchive for bubbles and tags; no deletion of individual records; whole collections can be deleted. Implemented in C.1.
- **Your collection:** `bookmarks-working.json` is converted once by a separate script; the app does not read the prototype format.
- **WebMCP target:** chosen at the start of Phase 4.

## C.1 — Foundation corrections — future build

The implementer will supply the converted collection, a measurement report for 1,000 and 5,000 bubbles, and a build with schema 2.

- [ ] Import the converted collection. Expect your bookmarks, categories, and issue groups as bubbles and typed tags, with duplicate groups shown in review.
- [ ] Create a bubble with **New bubble**, then archive it and a tag. Expect both to disappear from graph, list, and counts, the archived tag's bubbles to remain, and **Show archived** to reveal them muted.
- [ ] Undo an archive, an edit, a status propagation, and an import in sequence, then Redo two of them. Expect each to reverse exactly once, Redo to reapply in order, and a new edit to clear Redo.
- [ ] Edit a record in a second tab, then press Undo for an action touching it in the first. Expect a refusal that explains why.
- [ ] Use Cmd+Z and Shift+Cmd+Z outside a text field; inside a text field expect ordinary text undo.
- [ ] Back up, restore, and back up again with an image, a video, and an audio file. Expect all three to survive.
- [ ] Delete a test collection. Expect a backup offer and a typed-name confirmation.
- [ ] Review the measurement report against the plan's budgets.

## D — Agent assistance — future build

Entry condition: name the browser build and agent you want supported.

Prepare unresolved records and an import source. The implementer will supply the optional extractor, missing-data queue, and narrow WebMCP adapter for the supported browser/agent combination.

- [ ] Run enrichment on missing fields. Expect supplied values to remain unchanged.
- [ ] Try a blocked or unavailable page. Expect an understandable unresolved result with manual editing and retry available.
- [ ] Ask your agent to find missing fields and propose updates. Expect proposals with provenance for review before application.
- [ ] Accept one proposal and reject another. Expect only accepted values to change.
- [ ] Ask your agent to preview an import. Expect the ordinary import review flow before committing anything.
- [ ] Disable enrichment and use a browser without WebMCP. Expect importing and ordinary editing to remain usable.
- [ ] Compare agent assistance with manual work and report whether it saves enough effort to keep or expand.

## Release review — future build

The implementer will supply accessibility, recovery, static-build, and performance results, plus documented limitations.

- [ ] Complete a representative workflow using the keyboard and on a narrow screen.
- [ ] Try reduced motion. Expect a stable initial graph and no animated neighbor motion.
- [ ] Review recovery instructions and known limitations; identify any release blocker.
- [ ] Review the reported 1,000-bubble and 5,000-bubble performance findings against your expected collection size.
- [ ] Confirm that previous checkpoint findings have been resolved or explicitly documented.
- [ ] Confirm every entry in the plan's deferred verification register is closed: physical trackpad gestures, 200% browser/text zoom, and the remaining viewport combinations.

Publishing requires separate deployment authorization.
