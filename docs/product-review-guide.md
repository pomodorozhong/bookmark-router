# Product review checklist

Follow the [approved plan](product-plan.md). **Checkpoint A is approved. Checkpoint B is being built.** Later sections are for future builds; see [implementation progress](product-progress.md).

Check an item when its expected result matches what you see. Leave failed items unchecked and add a note. Share feedback as **task → expected → actual → impact**.

## A — Import mapping and terminology — approved October 10, 2026

Open [the review app](http://127.0.0.1:5199/). Allow about 10–15 minutes. The UI saves nothing yet; reloading clears your preview. You are reviewing mapping, duplicate choices, terminology, and graph interaction.

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

## B — Real import and recovery — future build

Prepare a real collection with some duplicates and invalid records. The implementer will supply transactional importing, editors, persistence, import undo, and full backup/restore.

- [ ] Import the collection and check that only reviewed records are committed.
- [ ] Try Skip, Keep both, and Merge on duplicate records. Confirm the resulting records and memberships match the reviewed choices.
- [ ] Resolve unknown statuses/types by mapping them or explicitly creating them.
- [ ] Organize bubbles through tags, edit fields and statuses, and compare graph and list results.
- [ ] Reload. Expect content, positions, and pins to survive.
- [ ] Undo an import. Expect created records to be removed and merged values restored.
- [ ] Edit an imported record, then try undo. Expect a conflict preview rather than loss of the later edit.
- [ ] Export a full backup containing uploaded media and restore it. Expect a new workspace with matching content, media, memberships, styles, statuses, views, and layout preferences.
- [ ] Report import or recovery problems before moving to expanded workflow tools.

## C — A complicated workflow — future build

Prepare a processing task and the destination where you will paste its output. The implementer will supply appearance editing, bulk status changes, copy composition, detailed filters, saved views, and media uploads.

- [ ] Set a tag type's color, size, shape, and icon. Expect its tags to inherit those defaults.
- [ ] Override one tag's appearance, then reset the override. Expect inheritance to return.
- [ ] Change a tag's status using **Tag only**. Expect linked bubbles to keep their statuses.
- [ ] Choose **Tag and linked bubbles**. Expect a warning listing every affected bubble and its current status, including hidden bubbles.
- [ ] Cancel that operation. Expect no status changes. Repeat and confirm; expect exactly the reviewed targets to change.
- [ ] Undo the bulk status change. Expect previous statuses to return.
- [ ] Build nested All / Any / Not filters and a same-linked-tag rule. Check whether the results match your intended workflow.
- [ ] Try tag-distance filtering and inspect example paths. Expect distances to use the full membership graph, even when some tags are hidden.
- [ ] Compare graph and list results; save the view and reopen it.
- [ ] Configure copy fields, order, separators, format, and a template. Expect the preview to match the copied output exactly.
- [ ] Compare **All linked bubbles** with **Current view** and try a saved copy preset.
- [ ] Paste the result into your actual destination. Check links, missing fields, ordering, and formatting.
- [ ] Upload image, video, and audio files. Expect usable assets; copied local assets should use filenames, not temporary blob URLs.
- [ ] Report confusing rules or output. Enrichment work can continue independently.

## D — Agent assistance — future build

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

Publishing requires separate deployment authorization.
