import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import express from "express";
import { Store } from "./store";
import { createApi } from "./api";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuredFile = process.env.BOOKMARKS_FILE;
const file = configuredFile
  ? resolve(configuredFile)
  : resolve(root, "../bookmarks-working.json");
if (!configuredFile) {
  try {
    await copyFile(
      resolve(root, "../bookmarks.json"),
      file,
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
const store = new Store(file, resolve(root, "backups"));
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
