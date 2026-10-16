# WebMCP — bookmark tools, setup, and verification

Updated October 14, 2026. **The app implementation and approved review UI are complete.** Six tools register in the live app when WebMCP is available, including copying the current selection into the agent conversation and proposing remote images with visible current/proposed previews. The user reports thumbnail repair through the agent is working. The subsequently approved **Apply anyway** flow lets the human apply a stale batch after reviewing its exact overwrites against current saved values. Domain, transaction, Undo, and browser checks pass. The normal-profile Chrome connection and exact installed server command were verified during the earlier connection review; Chrome must remain open and reachable for further use. Both desktop configs have been installed with backups. This Codex conversation has discovered the live tools and read the 148-bookmark collection and #141's seven bookmarks. The user accepted the batch workflow on October 14, 2026. Claude testing is done: a Claude Code session in the Claude desktop app discovered the six tools and read the collection and #141 through the bridge. A live GitHub Pages deployment is not configured yet; the production bundle's `/bookmark-router/` path was verified locally, while HTTPS deployment verification remains follow-up work.

This document is the standalone reference for Bookmark & Tag’s round 4 agent integration. It includes the accepted behavior, tool contracts, complete client configuration, observed verification, and acceptance steps. Other project guides link here rather than maintaining separate MCP instructions.

## Connection

Claude Desktop or Codex connects to `chrome-devtools-mcp`, which discovers and invokes tools registered by the open Bookmark & Tag document. Both agents use the same app tools; use one at a time for writes. Keep the app open at `http://127.0.0.1:5199/` in the Chrome profile containing the collection.

Use **chrome-devtools-mcp 1.10.1** for this round. This version's stdio handshake, `list_webmcp_tools`, and `execute_webmcp_tool` were exercised against Chrome **154.0.8037.98**, followed by live app checks on the updated **154.0.8037.99** in a disposable profile with WebMCP enabled. The adapter registers tools on `document.modelContext`; aborting the registration signal removes them. There is no legacy navigator alias or custom global API.

For the user's existing Chrome profile:

1. Enable WebMCP in Chrome (`chrome://flags`, search WebMCP) and relaunch Chrome if requested. The disposable check used the equivalent `--enable-features=WebMCP` launch flag.
2. Open `chrome://inspect/#remote-debugging`, enable remote debugging, and keep Chrome running. Allow the MCP connection through Chrome's own permission dialog when ready. This connects to the existing profile; the default MCP launch would create a different profile without the user's collection.
3. Configure one or both clients below and restart their MCP connection. The examples below are installed on this Mac using `/opt/homebrew/bin/npx` and a Homebrew-inclusive PATH, preserving unrelated settings and private backup copies. Refresh the clients to load the new entry.
4. Ask the agent to list pages, select the Bookmark & Tag page by its exact URL, and discover its WebMCP tools. `pageId` is required on this bridge version's page tools; do not assume a fixed ID.

The connection settings follow [Chrome's configuration guide](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md) and [existing-profile connection guide](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md). The task connection disables clicking and JavaScript evaluation: human approval stays in the app. It also disables unrelated inspection categories and bridge usage telemetry. External research belongs to the agent's separate browsing tools.

### Local relay and static deployments

The app also supports an opt-in local connection for browsers without native WebMCP, including the Codex/Claude in-app browser and a static GitHub Pages deployment. In the app header, **Agent review** remains the direct human-review action. Its adjacent connection menu contains the **Connect to a local agent** switch, relay status, setup hint, and local-connection note; collection actions remain in **More actions**.

When the switch is off (the default), the app does not load the polyfill or open a loopback WebSocket. Native WebMCP detection and the ordinary app continue to work. When it is enabled, the app dynamically loads the pinned `@mcp-b/webmcp-polyfill` **2.2.0** only when a context is missing, registers the same six tools, and opens the relay protocol directly from the page. The page-owned connection keeps static deployments and embedded browsers working without a hidden cross-document bridge; the pinned `@mcp-b/webmcp-local-relay` **6.0.2** package supplies the matching local relay server.

Start the relay on the same machine as the browser and MCP client:

```bash
npx @mcp-b/webmcp-local-relay@6.0.2 --widget-origin http://127.0.0.1:5199
```

For a deployed page, replace the origin with its exact `https://…` origin. The relay listens on loopback port `9333` by default. The browser may ask for local-network access the first time; allow it only for the intended page and relay. The menu reports **Searching** until the relay accepts the page, then **Connected**. The page closes its tool WebSocket when the setting is turned off or the page unloads.

The relay's MCP client exposes `webmcp_list_sources`, `webmcp_list_tools`, and the six app tools. The same human-only Agent review and Apply/Set aside/Undo rules still apply; the relay does not add an approval or direct-save tool.

### Claude Desktop

Merge this entry into `mcpServers` in the existing macOS configuration at `~/Library/Application Support/Claude/claude_desktop_config.json`; retain any other server entries. The example below uses the absolute executable and PATH installed on this Mac. On another machine, substitute its `npx` location and Node.js PATH. Restart Claude Desktop after configuring.

```json
{
  "mcpServers": {
    "bookmark-tag-chrome": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y", "chrome-devtools-mcp@1.10.1",
        "--autoConnect", "--categoryExperimentalWebmcp",
        "--no-category-input", "--no-category-emulation",
        "--no-category-performance", "--no-category-network",
        "--no-category-debugging", "--no-category-memory",
        "--no-javascript-evaluation",
        "--no-usage-statistics", "--no-performance-crux"
      ],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
      }
    }
  }
}
```

Claude Desktop rewrote this file on October 13, 2026 and dropped the entry; re-add it (or use **Settings → Developer**) if `bookmark-tag-chrome` stops appearing. Code sessions in the desktop app also load this entry and receive the bridge tools.

The in-app browser still has no native `document.modelContext`; enable the app's local-agent switch and run the local relay when using that pane or a static deployment. From the deployed GitHub Pages site the pane denies local network access without a prompt, so use Chrome or Arc there ([results](#local-relay-on-the-live-github-pages-site)). Calling app code through a pane's JavaScript tool bypasses WebMCP and does not count as a relay test. Normal Chrome can continue to use the native `bookmark-tag-chrome` connection.

Claude Desktop supports local MCP servers through its Developer configuration and desktop extensions. Packaging an extension is outside this small round. See [Claude Desktop's local MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

### Codex desktop

Add this server in MCP settings, or merge the following table into the existing `~/.codex/config.toml`. The command and PATH below match the installed configuration on this Mac; adjust those paths when using another machine. Restart the connection so this chat sees the new tools. Do not replace unrelated configuration.

```toml
[mcp_servers.bookmark-tag-chrome]
startup_timeout_sec = 30
tool_timeout_sec = 120
command = "/opt/homebrew/bin/npx"
args = [
  "-y", "chrome-devtools-mcp@1.10.1",
  "--autoConnect", "--categoryExperimentalWebmcp",
  "--no-category-input", "--no-category-emulation",
  "--no-category-performance", "--no-category-network",
  "--no-category-debugging", "--no-category-memory",
  "--no-javascript-evaluation",
  "--no-usage-statistics", "--no-performance-crux"
]
enabled_tools = ["list_pages", "select_page", "list_webmcp_tools", "execute_webmcp_tool"]

[mcp_servers.bookmark-tag-chrome.env]
PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
```

See [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Client and Chrome permission prompts are separate from Bookmark & Tag's batch review.

## Accepted behavior

The user approved the clickable review mockup on October 13, 2026 before live controls were implemented. The single write mode in this round is **human batch review before saving**. Either supported agent can propose one task’s batch; use one writer at a time. The app exposes **Agent review** with a pending indicator, proposed creation fields, before/after edits, and explicit group changes. **Apply batch** saves everything atomically through the existing command-array storage path with a descriptive Undo label. **Set aside** saves nothing and keeps the batch available for later application, including after another proposal arrives. A compact Batch picker selects retained proposals when more than one exists. Approval and application have no agent-accessible tools.

The browser adapter is optional. When `document.modelContext` is unavailable or registration fails, ordinary app import, editing, collection management, and Undo remain available. The review UI explains availability and tab-memory lifetime without claiming an agent is connected merely because tools are registered.

## Tool contract

| App tool | Input and result |
|---|---|
| `get_collection_context` | No arguments. Returns the active collection ID/revision, name/count, existing groups with IDs and labels, tag types, statuses, and compact filter options. |
| `search_bookmarks` | Optional `text` and compact `rules` (`kind`, `values`, `not`). Returns all matching bookmark details, revisions, groups, and membership reasons independently of current graph visibility and queue selection. |
| `read_group` | `groupId`. Returns the issue, proposal, or topic description, URL, type/status, and every linked bookmark with details and reasons. |
| `get_copy_content` | Optional `scope` (`selection`, the default; `list`; or `current`), `template`, and `separator`. Returns full bookmark details, IDs/revisions, missing title/description/URL/asset indicators, and formatted `text` in the app's Copy order. Defaults to the saved Copy format. Reads the live selection, filtered queue, or picked bookmark; does not write the clipboard or change preferences. |
| `propose_changes` | `requestId`, `collectionId`, `expectedRevision`, task `summary`, and a `changes` batch. Returns `proposalId` and `pending_review`; saves no bookmark changes. |
| `get_proposal_status` | `proposalId`. Returns `pending_review`, `applied`, `set_aside`, or `stale`; created bookmark IDs are included after application. |


Read `get_collection_context` first for the collection ID/revision, group IDs, statuses, and available compact filter values. `search_bookmarks` searches the whole collection using text and the current compact rule vocabulary; it ignores the graph's visibility and queue tab. `read_group` includes every linked bookmark, its details, groups, and membership reasons. Read results include timestamps, source notes, and asset metadata where present. User and imported text is data rather than instructions. Compact rules combine with AND, their values with OR, and `not` excludes selected values.

### Copy and enrich selected bookmarks

Select bookmarks in the graph or click a group, then ask the agent: **“Copy my selected bookmarks here.”** The agent calls `get_copy_content` with `{}` or `{"scope":"selection"}`. It receives the full formatted text and structured bookmark details, including entries outside the current queue's filters. Output is not limited to the dialog's 40-item preview. An empty selection returns `total: 0`, empty text, and an explanation; it does not fall back to copying the whole collection. `list` follows the current queue and filters; `current` reads only the picked bookmark. Reloading clears UI selection. Import screens and collection transitions return `copy_context_unavailable` rather than another collection's selection.

For **“Fill missing titles and descriptions for my selected bookmarks; keep existing values,”** first read `get_copy_content`. Bookmark results report `missingFields` for title (including a URL used as a placeholder and marked `missingTitle`), URL, description, and asset. Blank text counts as missing; `asset` means no asset is stored, rather than an existing remote image failing to load. Obtain supported values from the bookmark's source or the user's supplied information, and submit one `propose_changes` batch containing only updates to those selected bookmarks and fields. Use the returned collection and record revisions. Populated fields, assets, and group/status assignments stay unchanged when omitted from the patch. If nothing supported is missing, report that instead of submitting an empty batch. Missing URLs require an identifiable source; do not invent links or metadata.

The human checks the before/after changes in **Agent review**, then applies the whole batch or sets it aside for later. Applying a real title clears the missing-title marker. The batch is one Undo action. Stale batches require human review of their latest values and overwrite warning before **Apply anyway**, or setting the batch aside and requesting a fresh proposal. The agent can update title, description, URL, status, a remote image asset, and explicit group links through the existing proposal contract; source notes, local media uploads, and arbitrary imported fields are not editable through this contract.

Submit one task with `propose_changes`. Its payload has `requestId`, `collectionId`, `expectedRevision`, `summary`, and `changes`. A creation accepts an HTTP(S) URL, optional title/description/status, and existing `tagIds`. A missing title becomes the URL with the existing missing-title marker. Pending is the default status; collections without a Pending status require an explicit existing status ID. An update accepts `bookmarkId`, `expectedRecordRevision`, an optional `patch` of title/description/URL/status/asset, and optional `addTagIds`/`removeTagIds`. Omitted values are retained; an empty URL clears the URL on an existing bookmark. Each bookmark may be updated once per batch. Unsupported fields and duplicate URLs reject the proposal before staging; a duplicate error includes the existing bookmark ID.

### Fill missing images

Select bookmarks, then ask **“Find images for my selected bookmarks that have no asset; preserve existing images and other fields. Propose one batch for review.”** Read the selection with `get_copy_content`, find a suitable image from the bookmark's source, and verify that its HTTP(S) URL loads as an image. Submit updates only for bookmarks that have no asset. Do not invent an image URL or report success merely because the proposal is pending.

Each image update uses this shape, with the IDs, revision, and image URL replaced by the actual read and sourced values:

```json
{
  "kind": "update",
  "bookmarkId": "<selected bookmark ID>",
  "expectedRecordRevision": 0,
  "patch": {
    "asset": {
      "kind": "image",
      "source": "remote",
      "url": "https://example.com/sourced-image.jpg"
    }
  }
}
```

**Agent review shows the current and proposed images**, with the source URL under each remote preview. A missing current asset shows **No image**. Existing local images load from collection media; replacing one does not delete its blob, so Undo restores it. A failed preview explicitly says **Image could not load** and leaves the source URL visible for inspection. The user can set aside or apply the batch; image availability does not change the stored proposal's validity.

Remote image replacements also work when explicitly requested. This extension accepts only `{kind: "image", source: "remote", url: "<HTTP(S) URL>"}` on an existing bookmark's `patch.asset`. Local blob references, asset removal/null, video/audio assets, extra asset fields, and assets on creations remain unsupported. Images remain remote references and are not downloaded into collection storage. A reloaded app exposes the updated schema; rediscover the page tools before retrying a task that previously saw the old schema, and reselect bookmarks after reload.

### Example: add two references

Example payload, replacing the collection identifiers with the current read result:

```json
{
  "requestId": "aso-references-1",
  "collectionId": "<collection ID>",
  "expectedRevision": 0,
  "summary": "Add two ASO references to #141",
  "changes": [
    {
      "kind": "create",
      "title": "Product page optimization",
      "url": "https://developer.apple.com/app-store/product-page-optimization/",
      "tagIds": ["issue:141"]
    },
    {
      "kind": "create",
      "title": "Custom product pages",
      "url": "https://developer.apple.com/app-store/custom-product-pages/",
      "tagIds": ["issue:141"]
    }
  ]
}
```

The bridge invokes this as `execute_webmcp_tool` with the discovered `pageId`, `toolName: "propose_changes"`, and the JSON-stringified payload in `input`. The result is `pending_review`, not a successful bookmark write. The human uses Agent review to apply or set aside; no app tool approves or applies. Apply validates again and commits the whole command array atomically with one Undo entry. `get_proposal_status` returns `pending_review`, `applied`, `set_aside`, or `stale`, plus created bookmark IDs only after application. An applied proposal records its commit; later Undo is a separate operation, so read current collection content before further writes.

One batch may await review per tab, regardless of which batch is selected in the picker. Identical retries with the same request ID reuse the proposal; changing that ID's payload rejects. Any newer collection revision marks a pending batch stale and blocks ordinary **Apply batch**. Reloading or changing collection discards the tab's proposals and retry history. Pending drafts do not enter IndexedDB or backups.

### Set aside and return later

A proposal can still be useful later even when the human chooses not to apply it now. The user therefore approved **Set aside** on October 13, 2026, superseding terminal rejection. The tool contract now uses `set_aside` in place of `rejected`; consumers should treat it as unsaved and recoverable through human review. **Set aside** does not write bookmark content or add an Undo entry. It releases the pending-review slot while retaining the original proposal, request ID, preview, and stable creation IDs in this tab. The agent sees `set_aside`; identical request retries return that same state and do not revive the batch. Tools remain read/propose-only and instruct the agent not to resubmit a set-aside batch unless asked.

When several batches exist, **Batch** lists their summaries and states. Selecting a batch changes only the displayed review. Pending review is tracked independently, so viewing an older batch does not allow a second pending batch. Applied batches remain application records and cannot be applied twice, even after Undo.

A set-aside batch can be applied directly if its original collection revision still matches. If the collection changed, it remains labeled **Set aside** and shows the latest saved values, validation errors, and exact overwrite warning. It then uses the same two-click **Apply anyway** flow as any stale proposal. Changing the selected batch, setting it aside, or closing/reopening review resets confirmation. Application validates again and checks the displayed revision and storage transaction; one Undo restores the content immediately before that application, preserving other batches already saved. Reloading or switching collections discards all retained proposals; they are not part of IndexedDB or backups.

### Apply a stale batch anyway

The user approved the initial clickable preview on October 13, 2026, then refined the interaction through live feedback. The accepted flow uses two clicks on the same button: a separate confirmation view looked like the first click did nothing, while direct one-click saving removed the intended confirmation. Keep the batch review in place and make confirmation visible through the button label/color and reminder below the buttons. Opening **Agent review** reads the latest stored collection. A stale batch is rebuilt and validated against that content without saving. The review shows current saved values beside the values that would be applied. An overwrite warning identifies each field or explicit group connection that changed since the proposal and would change again under the batch. Fields already equal to the proposal are not overwrites; newer changes outside the proposal remain intact. Images retain visible current/proposed previews and source details.

If the edits do not overlap, the warning explicitly says **No newer edits will be overwritten**. Otherwise it counts the newer edits and labels affected values **Changed since proposal · will be replaced**. A warning immediately above the save buttons lists the affected bookmark titles and field names or groups. **Apply anyway** requires two clicks on the same button in the same review: the first click saves nothing, changes the label to **Confirm overwrite** (or **Confirm apply** when there are no overwrites), changes the button from a pale warning surface to a filled warning color, and reveals a right-aligned reminder on the row below the buttons that confirming replaces the listed newer edits. The second click saves the entire batch, including other proposed changes and additions. No second review screen or modal is opened. The review closes after a successful save and shows the batch's result with Undo; failed saves keep the review open and show the error beside the buttons.

Confirmation is bound to the proposal and collection revision displayed on the first click. A further edit, a different proposal, closing/reopening review, or a save error resets the button to **Apply anyway** and requires two clicks again. Saving reads storage again and checks the reviewed revision; the existing storage transaction also rejects a write that arrives between the read and commit. An unseen newer revision blocks saving until the latest values have been reviewed. Duplicate URLs, missing bookmarks/groups/statuses, invalid changes, and a different collection still block application. Stable creation IDs and the original request payload are retained, so retries do not create extra bookmarks.

The batch creates one Undo entry using the collection immediately before application. Undo restores the latest manual fields, group connections, and local/remote image references, including edits made after the agent's proposal; local image blobs are retained. This action is available only in the human-facing UI. The six WebMCP tools do not gain an approval or application operation, and `get_proposal_status` keeps its existing states.

## Implementation locations

- [Browser adapter](../app/src/agent/webmcp.ts): feature detection, imperative registration/abort cleanup, schemas, tool reads, and structured errors.
- [Proposal session](../app/src/domain/agent-review.ts): tab-local proposal state, request-ID retries, preview validation, revisions, application, selection, and setting batches aside.
- [Domain commands](../app/src/domain/commands.ts) and [Undo labels](../app/src/domain/undo.ts): reusable `bookmark.create` and the existing transactional command-array path.
- [App integration](../app/src/App.tsx), [triage screen](../app/src/components/TriageScreen.tsx), and [shared copy preferences](../app/src/copy-settings.ts): live registration, current stored collection reads, ordered UI selection/queue/current context, and the same saved formatting as the Copy dialog.
- [Review dialog](../app/src/components/AgentReviewDialog.tsx) and [styles](../app/src/styles.css): review entry, batch selection, before/after values, and Apply/Set aside feedback.
- [Focused tests](../app/tests/agent-review.test.ts): creation defaults/validation, proposal validation, duplicate URLs/submissions, stale revisions, rollback, one-action Undo, tool reads, and optional registration cleanup.

Registration and discovery follow Chrome’s [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) and [DevTools WebMCP documentation](https://developer.chrome.com/docs/devtools/agents/webmcp-debugging).

## Verification status

The following results were observed October 13, 2026. App and bridge verification is complete, including read-only tool calls from this Codex desktop conversation. The user accepted the batch workflow on October 14, 2026.


| Check | Status |
|---|---|
| Approved Set aside flow | Passed: 96 tests and production build including TypeScript. New checks cover no-write deferral, retained batches and independent pending guards, stable retries, later application, invalid/stale batches, exact review revisions, save failures/storage races, and Undo preserving newer content. A separate local origin with a disposable 148-bookmark copy and real WebMCP registration verified Set aside without saving, identical retries, retained-batch selection, the pending indicator/guard independent of selection, latest-value overwrite review, first-click no-write, confirmation resets after selecting another batch and closing/reopening, later save, and one Undo restoring the newest manual title while retaining another applied batch. The actual review component also passed Set aside/picker/confirmation and no-overflow checks in measured 390- and 320-pixel iframes using sample data; this is not real touch-device verification. The user’s profile was not changed. |
| TypeScript check (also run by `npm run build`), `npm test`, and production build in `app/` | Passed; 96 tests including selection copy, missing-field enrichment, remote image proposals, stale-batch overwrite review/application, and reversible Set aside with retained batches |
| Apply anyway domain/storage checks | Passed: overlapping titles/descriptions/URLs/statuses/images/group adds/removes, unrelated and already-matching values, mixed create/update batches, stable retries, exact reviewed revision and transaction races, invalid batches, save-failure retry, and Undo to the latest manual content with the local blob intact |
| Initial Apply anyway UI verification, before the same-button refinement | Passed on a separate local origin with simulated WebMCP registration and real app/storage: latest-value read on open, explicit image/description/group overwrites, no-overwrite warning, Back/Reject without saving, another edit invalidating the reviewed revision, Apply/Undo restoring latest manual content, and disabled application after a duplicate URL. Desktop and a measured 390-pixel iframe viewport fit without horizontal overflow. Image previews used local illustration fixtures; the user's normal-profile collection was not changed. |
| Two-click Apply anyway in the same review | Full-app checks with a disposable copy of the 148-bookmark collection and simulated WebMCP registration verified first-click label/color/reminder with unchanged storage, reset after a further edit and closing/reopening, second-click save and result toast, Undo restoring newer manual content, the no-overwrite Confirm apply branch, and a measured 390-pixel iframe without horizontal overflow. Real IndexedDB and app save/Undo were exercised; image previews used a local illustration fixture. |
| Final reminder layout | Actual review-component fixture passed at desktop and a measured 390-pixel iframe: reminder occupies its own row below the buttons, uses right alignment, aligns with the button row's right edge, and leaves the confirmation button's horizontal position and 160-pixel width unchanged. No horizontal overflow. `npm run check` and `git diff --check` passed after this layout-only change. The earlier 92-test/build run predates it; the latest 96-test/build run includes it. |
| Image fill/replacement, rejected or stale proposals, and one-action Undo | Passed with isolated storage; missing assets and original local/remote assets restore correctly; unsupported assets and non-HTTP(S) URLs reject before staging |
| Approved image preview flow in the actual app with a copy of the 148-bookmark collection | Passed in disposable Chrome through the bridge: image schema discovery, missing-image preview, current local/proposed remote images, visible source URL and load-failure message, rejection, Apply/Undo, and preservation of other bookmarks. Desktop and actual 390-pixel mobile emulation fit without horizontal overflow. Used a served illustration fixture; no real-source image was proposed or saved in the user's profile. |
| Chrome 154 + pinned bridge 1.10.1 | Passed in a disposable headless Chrome profile |
| Register, discover, execute, and unregister tools | Original five verified in Chrome; six-tool registration/abort cleanup covered in tests; new copy tool discovered and invoked through the live Codex bridge |
| Selected missing-field read → proposal → application → Undo | Passed with isolated storage; title/description/URL fills preserve populated fields, group/status assignments, and unselected bookmarks |
| `get_copy_content` through the live Codex bridge | Passed; #131's two selected bookmarks returned in the same order and with text exactly matching the Copy dialog. Narrowing the queue to one bookmark still returned both selected bookmarks. Empty selection returned zero bookmarks. |
| Real converted collection, all 148 bookmarks/50 groups | Passed |
| Read #141, seven bookmarks; Has warning filter, 15 results | Passed |
| Propose two additions, identical retry, apply in one transaction, one Undo | Passed; counts 148 → 150 → 148, group 7 → 9 |
| Rejection without saving and staleness after a manual edit | Passed |
| Approved live UI Apply/Reject/Undo, before/after edits, desktop and 390-pixel mobile layout | Passed; no page or dialog horizontal overflow |
| Live field/status/URL/group edits and one-action Undo | Passed; exact previous fields and memberships restored |
| Manual edit makes ordinary Apply unavailable | Passed through the actual Details editor; stale batches now offer Apply anyway with an explicit warning in the same review |
| Reload and collection switch discard proposals | Passed; old proposal IDs become unavailable |
| Save failure retains draft and supports retry | Passed with simulated storage failure in disposable Chrome |
| Ordinary app use without WebMCP | Passed with the Chrome feature disabled |
| Reduced task connection tool catalog | Passed; WebMCP/page discovery enabled, clicking and JavaScript evaluation absent |
| Mockup approval | Approved by the user October 13, 2026; accepted flow implemented |
| `--autoConnect` against the user's normal profile | Passed after user enabled WebMCP and remote debugging |
| Exact installed npx command and PATH | Passed handshake, discovery, context (148), #141 (7), and warning filter (15); an earlier first browser call timed out, a retry passed |
| Local Codex configuration recognition | Passed `codex mcp get bookmark-tag-chrome`; enabled with four allowed tools |
| Claude Desktop 2.31226.1 | Done: a Claude Code session in the desktop app listed pages, discovered six tools, read the collection (148 bookmarks, revision 0), and read #141 (seven bookmarks) through the bridge; the user marked Claude testing done. In-app browser lacks WebMCP (see [limitation](#claude-desktop)). |
| Codex desktop 26.1007.30912 | Live discovery and collection/group reads passed in this conversation; batch workflow accepted October 14, 2026 |

The user enabled Chrome's WebMCP and remote-debugging settings. The bridge attached to the normal profile, discovered all five tools, and read the active collection. The profile initially contained an empty collection; a separate copy of the 148-bookmark backup was restored through the real app UI. Existing collections in the in-app browser were not changed. Native UI control recovered for Chrome and Claude after an initial macOS capture error; it explicitly disallows operating Codex itself.

### Local relay on the live GitHub Pages site

Observed October 17, 2026 against `https://pomodorozhong.github.io/bookmark-router/` ([#18](https://github.com/pomodorozhong/bookmark-router/issues/18)), with `@mcp-b/webmcp-local-relay` 6.0.2 started as `--widget-origin https://pomodorozhong.github.io` and a minimal stdio MCP client (protocol `2025-06-18`).

| Check | Arc | Claude desktop in-app browser (Chrome 152) |
|---|---|---|
| Switch off: no polyfill or loopback WebSocket; relay lists 0 sources | Passed | Passed |
| Switch on reaches **Connected** | Passed after the user allowed local network access for the site | Failed: the pane reports `local-network-access` as `denied` and shows no prompt, so every `ws://127.0.0.1:9333` attempt fails before reaching the relay. The menu stays on **Searching**. |
| Client discovers the six app tools | Passed: one source, `toolCount` 6, all six tools listed beside the relay's three | Not reached |
| Read and proposal flow | Passed: `get_collection_context` read the collection (116 bookmarks, revision 0); `propose_changes` staged one create as `pending_review`; the user set it aside in Agent review; `get_proposal_status` returned `set_aside` and the collection stayed at 116 bookmarks, revision 0 | Not reached |
| Switch off closes the connection | Passed: relay lists 0 sources and only its own three tools | Passed: failed retries stop |

Limitations: the Arc check used the user's restored collection instead of a disposable one, with the user's approval; only one set-aside proposal was staged and nothing was applied. Arc's version was not recorded. The relay accepts the WebSocket handshake from any origin (`101` for an unlisted origin), so `--widget-origin` is enforced after the handshake; a page from an unlisted origin connecting end to end was not tested. Use a browser that shows the Local Network Access prompt, such as Chrome or Arc; the Claude desktop in-app browser can't reach the relay from the deployed site.

### Finish the Codex connection

This conversation has passed live page discovery, tool discovery, collection context (148 bookmarks), and `read_group` for #141 (seven bookmarks). The connection refresh is no longer outstanding. Use these recovery steps only if a later conversation cannot discover the bridge:

1. Keep Chrome and `http://127.0.0.1:5199/` open.
2. In Codex, open **Settings → MCP servers**, find **bookmark-tag-chrome**, confirm it is enabled, and select **Restart** on the settings page. If the file-added entry is not yet visible, quit and reopen Codex, then return to this chat.
3. If Chrome displays a bridge connection request, allow it for this test. Enabling remote debugging and allowing an actual connection are separate steps.
4. Type `/mcp` in the Codex composer to check connected servers, then ask: “Use bookmark-tag-chrome to read the collection context and summarize issue:141. Do not propose or save changes yet.” Expected: 148 bookmarks; #141 has seven linked bookmarks.

The installed Codex entry allows a 30-second server startup and 120-second tool call so first-run npx startup and Chrome's permission prompt have time to complete. Desktop settings and shared config are documented in [official MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Earlier direct-client verification has now been followed by successful read-only calls from the actual Codex conversation.

After connecting Codex, try these acceptance tasks:

1. Ask it to propose two new bookmark URLs for an existing issue. Open **Agent review**, inspect the batch, **Apply batch**, close review, and **Undo**. Confirm both links disappear together.
2. Ask it to read and summarize that issue. Confirm it includes all linked bookmarks, even those outside the current queue or hidden graph groups.
3. Propose another batch and **Set aside**. Confirm the agent reports `set_aside` and no bookmarks were saved. Have the agent propose a different batch, then use the **Batch** picker to return to the first one. Confirm it can still be applied; after a collection edit, expect the latest-value review and two-click **Apply anyway** confirmation. Apply it and Undo once.
4. Propose an edit, close review, manually edit a field targeted by that batch, and reopen review. Confirm **Stale**, the latest current value, and the explicit overwrite warning. Read the named overwrites beside **Apply anyway**, click it to reveal **Confirm overwrite** and its reminder, click again to save, then Undo once to restore the newer manual edit. For an unrelated manual edit, expect **No newer edits will be overwritten** with the same two-click action, changing to **Confirm apply**. Setting aside the stale batch and requesting a fresh proposal remains available.

Application review is always batch review before saving in this round. Other approval modes, coordinated handoffs, group creation, deletion, and fetch services remain outside scope.

The implementation is maintained on `codex/bubble-tag-product`. Local configuration backups use a `.before-webmcp-<timestamp>` suffix beside each client configuration; they are private local recovery files and are not stored in this repository.
