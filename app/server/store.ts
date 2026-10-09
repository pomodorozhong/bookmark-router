import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateDataset } from "./validation";
import type {
  BookmarkPatch,
  Dataset,
  Issue,
  Proposal,
  ProgressStatus,
} from "../src/data/types";
import { normalizedUrl } from "../src/data/selectors";
import {
  initializeProgress,
  nodeIds,
  nodeProgress,
  progressStatuses,
  bookmarkWorkflowProgress,
  bookmarkWorkflowSignature,
} from "../src/data/progress";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function allowed(patch: Record<string, unknown>, keys: string[]) {
  for (const key of Object.keys(patch))
    if (!keys.includes(key)) throw new ApiError(422, `Cannot edit ${key}`);
}
export class Store {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    public file: string,
    private backups: string,
  ) {}
  async read() {
    const raw = await readFile(this.file, "utf8");
    const data: unknown = JSON.parse(raw);
    validateDataset(data);
    initializeProgress(data);
    return { data, hash: hash(raw) };
  }
  async transaction(
    revision: number,
    diskHash: string,
    change: (d: Dataset) => void,
  ) {
    const operation = this.tail.then(async () => {
      const { data, hash: currentHash } = await this.read();
      if (data.metadata.revision !== revision || currentHash !== diskHash)
        throw new ApiError(
          409,
          "The dataset changed in another tab or on disk. Reload, then explicitly reapply your edits.",
        );
      const candidate = structuredClone(data);
      change(candidate);
      initializeProgress(candidate);
      candidate.metadata.revision++;
      candidate.metadata.updated_at = new Date().toISOString();
      validateDataset(candidate);
      await mkdir(this.backups, { recursive: true });
      const original = await readFile(this.file, "utf8");
      if (hash(original) !== currentHash)
        throw new ApiError(
          409,
          "The dataset changed on disk during this save.",
        );
      await writeFile(
        join(
          this.backups,
          `${data.dataset_id}-r${data.metadata.revision}-${randomUUID()}.json`,
        ),
        original,
        { flag: "wx", mode: 0o600 },
      );
      const tmp = join(
        dirname(this.file),
        `.${randomUUID()}.bookmark-router.tmp`,
      );
      try {
        await writeFile(tmp, JSON.stringify(candidate, null, 2) + "\n", {
          flag: "wx",
          mode: 0o600,
        });
        if (hash(await readFile(this.file, "utf8")) !== currentHash)
          throw new ApiError(
            409,
            "The dataset changed on disk during this save.",
          );
        await rename(tmp, this.file);
      } finally {
        await unlink(tmp).catch(() => {});
      }
      return this.read();
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  patchBookmark(d: Dataset, id: string, patch: BookmarkPatch) {
    const b = d.bookmarks.find((b) => b.id === id);
    if (!b) throw new ApiError(404, "Bookmark not found");
    initializeProgress(d);
    const workflowBefore = bookmarkWorkflowSignature(b);
    allowed(patch, [
      "display_title",
      "url",
      "tags",
      "favorite",
      "classification",
      "processing",
      "duplicate_review",
      "source_review",
      "progress",
    ]);
    const nested: Record<string, string[]> = {
      classification: [
        "approved_category_id",
        "approved_secondary_category_ids",
        "status",
      ],
      processing: [
        "review_status",
        "disposition",
        "selected_targets",
        "user_notes",
        "defer_reason",
      ],
      duplicate_review: ["confirmed_duplicate_of", "status"],
      source_review: ["strength", "note", "latest_link_check"],
    };
    const at = new Date(
      Math.max(Date.now(), Date.parse(b.history.at(-1)?.at ?? "") + 1 || 0),
    ).toISOString();
    for (const [key, value] of Object.entries(patch)) {
      if (key === "progress") continue;
      const previous = structuredClone(b[key as keyof typeof b]);
      if (nested[key]) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new ApiError(422, `Invalid ${key}`);
        allowed(value as Record<string, unknown>, nested[key]);
        Object.assign(b[key as keyof typeof b] as object, value);
      } else Object.assign(b, { [key]: value });
      const next = structuredClone(b[key as keyof typeof b]);
      if (JSON.stringify(previous) !== JSON.stringify(next))
        b.history.push({
          id: randomUUID(),
          at,
          action: "edit",
          field: key,
          previous_value: previous,
          new_value: next,
          note: "",
        });
    }
    const workflowChanged = workflowBefore !== bookmarkWorkflowSignature(b);
    if (Object.hasOwn(patch, "progress"))
      this.setBookmarkProgress(
        d,
        b,
        patch.progress,
        at,
        "edit",
        workflowChanged,
      );
    else if (workflowChanged)
      this.setBookmarkProgress(
        d,
        b,
        bookmarkWorkflowProgress(b),
        at,
        "edit",
        true,
      );
    if (patch.url) b.normalized_url = normalizedUrl(patch.url);
    b.processing.updated_at = new Date().toISOString();
  }
  private setBookmarkProgress(
    d: Dataset,
    b: Dataset["bookmarks"][number],
    status: unknown,
    at: string,
    action = "edit",
    recordUnchanged = false,
  ) {
    if (!progressStatuses.includes(status as ProgressStatus))
      throw new ApiError(422, "Invalid progress status");
    const id = `bookmark:${b.id}`;
    const previous = nodeProgress(d, id);
    d.node_progress ??= {};
    d.node_progress[id] = status as ProgressStatus;
    if (previous !== status || recordUnchanged)
      b.history.push({
        id: randomUUID(),
        at,
        action,
        field: "progress",
        previous_value: previous,
        new_value: status,
        note: "",
      });
  }
  patchNodeProgress(d: Dataset, id: string, status: unknown) {
    if (!nodeIds(d).has(id)) throw new ApiError(422, "Unknown progress node");
    if (!progressStatuses.includes(status as ProgressStatus))
      throw new ApiError(422, "Invalid progress status");
    if (id.startsWith("bookmark:")) {
      this.patchBookmark(d, id.slice("bookmark:".length), {
        progress: status as ProgressStatus,
      });
      return;
    }
    d.node_progress ??= {};
    d.node_progress[id] = status as ProgressStatus;
  }
  undo(d: Dataset, id: string) {
    const b = d.bookmarks.find((b) => b.id === id);
    if (!b) throw new ApiError(404, "Bookmark not found");
    initializeProgress(d);
    const workflowBefore = bookmarkWorkflowSignature(b);
    const last = [...b.history]
      .reverse()
      .find(
        (h) =>
          h.action === "edit" &&
          h.field &&
          !b.history.some((u) => u.action === "undo" && u.note === h.id),
      );
    if (!last?.field) throw new ApiError(422, "No edit to undo");
    // Undo every field changed in the last save, preserving compound decision validity.
    const events = b.history.filter(
      (h) =>
        h.action === "edit" &&
        h.at === last.at &&
        !b.history.some((u) => u.action === "undo" && u.note === h.id),
    );
    for (const h of events.reverse()) {
      const field = h.field!;
      const previous = structuredClone(
        field === "progress"
          ? nodeProgress(d, `bookmark:${b.id}`)
          : b[field as keyof typeof b],
      );
      if (field === "progress")
        d.node_progress![`bookmark:${b.id}`] =
          h.previous_value as ProgressStatus;
      else Object.assign(b, { [field]: structuredClone(h.previous_value) });
      b.history.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        action: "undo",
        field,
        previous_value: previous,
        new_value: structuredClone(h.previous_value),
        note: h.id,
      });
    }
    // Saves made before node progress existed have no progress snapshot.
    if (
      !events.some((h) => h.field === "progress") &&
      workflowBefore !== bookmarkWorkflowSignature(b)
    )
      this.setBookmarkProgress(
        d,
        b,
        bookmarkWorkflowProgress(b),
        new Date().toISOString(),
        "undo",
      );
    b.normalized_url = normalizedUrl(b.url);
    b.processing.updated_at = new Date().toISOString();
  }
  patchProposal(d: Dataset, id: string, patch: Partial<Proposal>) {
    const p = d.bookmarks_worth_their_own_issues.find((p) => p.id === id);
    if (!p) throw new ApiError(404, "Proposal not found");
    initializeProgress(d);
    allowed(patch, [
      "title",
      "questions",
      "user_notes",
      "status",
      "approved_seed_bookmark_ids",
      "created_issue_number",
      "created_issue_url",
    ]);
    Object.assign(p, patch);
    // Rejected proposals send affected bookmarks back to review, preserving other targets.
    if (p.status === "rejected")
      for (const b of d.bookmarks) {
        if (
          !b.processing.selected_targets.some(
            (t) => t.kind === "proposed_issue" && t.proposal_id === id,
          )
        )
          continue;
        const previous = structuredClone(b.processing);
        b.processing.selected_targets = b.processing.selected_targets.filter(
          (t) => t.kind !== "proposed_issue" || t.proposal_id !== id,
        );
        b.processing.review_status = "reviewing";
        if (!b.processing.selected_targets.length)
          b.processing.disposition = "undecided";
        b.history.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "proposal_rejected",
          field: "processing",
          previous_value: previous,
          new_value: structuredClone(b.processing),
          note: id,
        });
        this.setBookmarkProgress(
          d,
          b,
          bookmarkWorkflowProgress(b),
          new Date().toISOString(),
          "proposal_rejected",
        );
      }
  }
  registerIssue(d: Dataset, issue: Issue) {
    if (d.issue_catalog.some((i) => i.number === issue.number))
      throw new ApiError(422, "Issue number already registered");
    d.issue_catalog.push(issue);
    d.node_progress ??= {};
    d.node_progress[`issue:${issue.number}`] = "pending";
  }
}
