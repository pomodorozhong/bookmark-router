# Claude — connecting Claude Code, Claude Desktop, and the in-app browser

Updated October 17, 2026. This guide covers the Claude-specific setup. The tools, review rules, and the general relay setup are in [WebMCP](webmcp.md).

## Which connection

| | Chrome bridge (`bookmark-tag-chrome`) | Local relay (`bookmark-tag-relay`) |
|---|---|---|
| How it reaches the page | Attaches to Chrome over remote debugging and calls the tools Chrome registers natively | The page opens a WebSocket to the relay on `127.0.0.1:9333` |
| Browsers | Chrome with WebMCP and remote debugging enabled | Any browser that allows the page to reach `127.0.0.1`, including the Claude desktop in-app browser for a page served from `127.0.0.1` |
| App setting | None | **Connect to a local agent** turned on |

Both give the agent the same seven tools, and Agent review still decides what is saved. The relay exists so the Claude desktop in-app browser, which has no native WebMCP, can use the app.

## Chrome bridge in Claude Desktop

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

Claude Desktop supports local MCP servers through its Developer configuration and desktop extensions. Packaging an extension is outside this small round. See [Claude Desktop's local MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## Local relay

The relay is a stdio MCP server, so Claude has to start it. Set `--widget-origin` to the page's origin as described in [WebMCP](webmcp.md#local-relay-and-static-deployments); the examples use the GitHub Pages origin.

### Claude Code

Run this in the repository folder:

```bash
claude mcp add -s local bookmark-tag-relay -- npx -y @mcp-b/webmcp-local-relay@6.0.2 --widget-origin https://pomodorozhong.github.io
```

`local` scope applies only to Claude Code sessions started in that folder; `user` scope would add it to every session on this computer. Claude Code then starts the relay with each session and stops it when the session ends. To turn it off for a while, disable it in `/mcp`. To remove it, run this in the same folder:

```bash
claude mcp remove -s local bookmark-tag-relay
```

### Claude Desktop

Merge this entry into `mcpServers` beside the [bridge entry](#chrome-bridge-in-claude-desktop), adjusting `npx` and `PATH` the same way:

```json
"bookmark-tag-relay": {
  "command": "/opt/homebrew/bin/npx",
  "args": ["-y", "@mcp-b/webmcp-local-relay@6.0.2", "--widget-origin", "https://pomodorozhong.github.io"],
  "env": { "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" }
}
```

Claude Desktop has one configuration file, so this entry loads in every Desktop chat, and Code sessions in the desktop app load it too. To limit the relay to this repository, use the Claude Code command instead.

Neither entry has been tested in its client yet. The [live-site check](webmcp.md#local-relay-on-the-live-github-pages-site) started the same package and arguments from a minimal stdio client.

## In-app browser

The in-app browser has no native `document.modelContext`; enable the app's local-agent switch and run the local relay when using it. It reports local network access as `denied` and never asks, so it blocks a public page, such as the Pages site, from reaching the relay on `127.0.0.1`, and the menu stays on **Searching**. A page served from `127.0.0.1`, such as the dev server at `http://127.0.0.1:5199/`, isn't affected and connects. Each browser keeps its own collection, so the pane's collection is separate from the one in Chrome or Arc. To use the Pages site, open it in Chrome or Arc, which ask for local network access and then connect. The limitation is tracked in [#27](https://github.com/pomodorozhong/bookmark-router/issues/27).

Calling app code through the pane's JavaScript tool bypasses WebMCP and does not count as a relay test.

### Control check

Observed October 17, 2026 in the in-app browser (Claude 2.42304.0, Chrome 152.0.7977.149) with `@mcp-b/webmcp-local-relay` 6.0.2, after the [live-site check](webmcp.md#local-relay-on-the-live-github-pages-site). Only the page's origin changed:

| Page origin | Relay `--widget-origin` | Result |
|---|---|---|
| `http://127.0.0.1:5299` (a production build on a throwaway port) | `http://127.0.0.1:5299` | **Connected**; the relay received the page's tools |
| `https://pomodorozhong.github.io/bookmark-router/` | `https://pomodorozhong.github.io` | **Searching**; the console shows `WebSocket connection to 'ws://127.0.0.1:9333/' failed` and the relay logs nothing from the page |

The pane reported `local-network-access` as `denied` on both origins. The block applies only to a public page reaching loopback, so the cause is the pane's local network access handling, not the app or the relay. When the relay was restarted for the Pages origin, it rejected the still-open `127.0.0.1:5299` page with `rejecting source … with disallowed host origin`, so an unlisted origin is refused after the handshake.
