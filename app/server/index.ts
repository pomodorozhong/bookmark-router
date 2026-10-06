import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Store } from "./store";
import { createApi } from "./api";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = new Store(
  process.env.BOOKMARKS_FILE
    ? resolve(process.env.BOOKMARKS_FILE)
    : resolve(root, "../bookmarks.json"),
  resolve(root, "backups"),
);
await store.read();
const app = createApi(store);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
}
app.listen(Number(process.env.PORT ?? 4174), "127.0.0.1", () =>
  console.log(
    `Bookmark Router API: http://127.0.0.1:${process.env.PORT ?? 4174}`,
  ),
);
