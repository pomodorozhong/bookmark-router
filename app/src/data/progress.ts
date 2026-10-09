import type { Bookmark, Dataset, ProgressStatus } from "./types";

export const progressLabels: Record<ProgressStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped",
};
export const progressStatuses = Object.keys(progressLabels) as ProgressStatus[];
export type ProgressFilter = ProgressStatus[];
export function readProgressFilter(value: unknown): ProgressFilter {
  if (Array.isArray(value)) {
    const statuses = progressStatuses.filter((status) =>
      value.includes(status),
    );
    return statuses.length || value.length === 0
      ? statuses
      : [...progressStatuses];
  }
  // Upgrade the previous single-select browser preferences.
  return progressStatuses.includes(value as ProgressStatus)
    ? [value as ProgressStatus]
    : [...progressStatuses];
}
export function matchesProgress(
  status: ProgressStatus,
  filter: ProgressFilter,
) {
  return filter.includes(status);
}
// Workflow completion still requires the review and placement evidence.
// Explicit node progress is allowed to differ from this calculation.
export function isWorkflowComplete(b: Bookmark) {
  const p = b.processing;
  if (p.review_status !== "decided") return false;
  if (["keep", "skip", "duplicate"].includes(p.disposition)) return true;
  return (
    p.disposition === "attach" &&
    p.selected_targets.length > 0 &&
    p.selected_targets.every((t) => t.placement_status !== "pending")
  );
}
export function bookmarkWorkflowProgress(b: Bookmark): ProgressStatus {
  const p = b.processing;
  if (p.review_status === "decided" && p.disposition === "skip")
    return "dropped";
  if (isWorkflowComplete(b)) return "done";
  if (p.disposition === "defer") return "pending";
  if (
    p.review_status === "unreviewed" &&
    p.disposition === "undecided" &&
    b.classification.status === "pending" &&
    !b.duplicate_review.confirmed_duplicate_of
  )
    return "pending";
  return "in_progress";
}
export function nodeIds(d: Dataset) {
  return new Set([
    ...d.bookmarks.map((b) => `bookmark:${b.id}`),
    ...d.category_review.categories.map((c) => `topic:${c.id}`),
    ...d.issue_catalog.map((i) => `issue:${i.number}`),
    ...d.bookmarks_worth_their_own_issues.map((p) => `proposal:${p.id}`),
    "topic:unapproved",
  ]);
}
export function nodeProgress(d: Dataset, id: string): ProgressStatus {
  const stored = d.node_progress?.[id];
  if (stored) return stored;
  const b = d.bookmarks.find((b) => `bookmark:${b.id}` === id);
  return b ? bookmarkWorkflowProgress(b) : "pending";
}
export function initializeProgress(d: Dataset) {
  const progress = { ...d.node_progress };
  for (const id of nodeIds(d)) progress[id] = nodeProgress(d, id);
  d.node_progress = progress;
}
export function isComplete(b: Bookmark, d: Dataset) {
  return nodeProgress(d, `bookmark:${b.id}`) === "done";
}
// Notes and confirmation evidence do not themselves change progress.
export function bookmarkWorkflowSignature(b: Bookmark) {
  return JSON.stringify([
    b.classification.status,
    b.classification.approved_category_id,
    b.classification.approved_secondary_category_ids,
    b.processing.review_status,
    b.processing.disposition,
    b.processing.selected_targets.map((t) => [
      t.kind,
      t.kind === "existing_issue" ? t.issue_number : t.proposal_id,
      t.placement_status,
    ]),
    b.duplicate_review.status,
    b.duplicate_review.confirmed_duplicate_of,
  ]);
}
