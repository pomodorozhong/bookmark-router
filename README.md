# Bookmark & Tag

A local-first workspace for triaging bookmarks into project ideas, organized with tags on a force-directed graph.

- [Documentation](docs/README.md)
- [Product scope and current behavior](docs/product.md)
- [Work in progress and open items](HANDOFF.md)
- [App setup and usage](app/README.md)

```sh
cd app
npm ci
npm run dev
```

Open http://127.0.0.1:5199/. Rounds 0–4 are approved; round 1.5 was skipped because the user's local fetcher already works. All MCP-related setup, behavior, and verification are in the standalone [WebMCP document](docs/webmcp.md).

Completed plans, reviews, and round history are preserved in [docs/archive](docs/archive/README.md). The original personal bookmark prototype remains recoverable from Git history.
