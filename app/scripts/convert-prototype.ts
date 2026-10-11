// Usage: npm run convert -- <prototype.json> <backup.json>
import { readFileSync, writeFileSync } from "node:fs";
import { convertPrototype } from "../src/domain/prototype";

const [input = "../bookmarks-working.json", output = "../bookmarks-converted.json"] =
  process.argv.slice(2);
const backup = convertPrototype(JSON.parse(readFileSync(input, "utf8")), new Date().toISOString());
writeFileSync(output, JSON.stringify(backup, null, 2));
const w = backup.workspace;
console.log(
  `${output}: ${w.bookmarks.length} bookmarks, ${w.tags.length} tags, ${w.memberships.length} memberships, ` +
    `${w.bookmarks.reduce((n, b) => n + (b.notes?.length ?? 0), 0)} notes`,
);
