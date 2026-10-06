import type { Bookmark, Dataset, Target } from "./types";
export function isComplete(b: Bookmark) {
  const p = b.processing;
  if (p.review_status !== "decided") return false;
  if (["keep", "skip", "duplicate"].includes(p.disposition)) return true;
  return (
    p.disposition === "attach" &&
    p.selected_targets.length > 0 &&
    p.selected_targets.every((t) => t.placement_status !== "pending")
  );
}
export const targetKey = (t: Target, d: Dataset): string =>
  t.kind === "existing_issue"
    ? `issue:${t.issue_number}`
    : d.bookmarks_worth_their_own_issues.find((p) => p.id === t.proposal_id)
          ?.created_issue_number
      ? `issue:${d.bookmarks_worth_their_own_issues.find((p) => p.id === t.proposal_id)!.created_issue_number}`
      : `proposal:${t.proposal_id}`;
export const targetLabel = (t: Target, d: Dataset) =>
  t.kind === "existing_issue"
    ? `#${t.issue_number} ${d.issue_catalog.find((i) => i.number === t.issue_number)?.title ?? ""}`
    : (d.bookmarks_worth_their_own_issues.find((p) => p.id === t.proposal_id)
        ?.title ?? t.proposal_id);
export const targetUrl = (t: Target, d: Dataset) =>
  t.kind === "existing_issue"
    ? d.issue_catalog.find((i) => i.number === t.issue_number)?.url
    : d.bookmarks_worth_their_own_issues.find((p) => p.id === t.proposal_id)
        ?.created_issue_url;
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
export function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function normalizedUrl(url: string) {
  const value = safeUrl(url);
  if (!value) throw new Error("Use a valid HTTP(S) URL.");
  const u = new URL(value);
  for (const key of [...u.searchParams.keys()])
    if (
      /^utm_/i.test(key) ||
      ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key)
    )
      u.searchParams.delete(key);
  return u.href;
}
export type Queue =
  | "all"
  | "unreviewed"
  | "corrections"
  | "existing"
  | "proposals"
  | "alternatives"
  | "links"
  | "duplicates"
  | "deferred"
  | "pending"
  | "completed";
export const queues: { id: Queue; label: string }[] = [
  { id: "all", label: "All bookmarks" },
  { id: "unreviewed", label: "Unreviewed" },
  { id: "corrections", label: "Category corrections" },
  { id: "existing", label: "Existing issue suggestions" },
  { id: "proposals", label: "New-issue seeds" },
  { id: "alternatives", label: "Paired alternatives" },
  { id: "links", label: "Link follow-up" },
  { id: "duplicates", label: "Duplicates & mirrors" },
  { id: "deferred", label: "Deferred" },
  { id: "pending", label: "Reviewed, awaiting placement" },
  { id: "completed", label: "Completed" },
];
export function inQueue(b: Bookmark, queue: Queue, d: Dataset) {
  const recs = d.references_for_existing_issues.filter(
    (r) => r.bookmark_id === b.id,
  );
  switch (queue) {
    case "unreviewed":
      return b.processing.review_status === "unreviewed";
    case "corrections":
      return (
        b.classification.status === "pending" &&
        b.classification.correction_kind === "reassign"
      );
    case "existing":
      return recs.length > 0;
    case "proposals":
      return d.bookmarks_worth_their_own_issues.some((p) =>
        p.seed_bookmark_ids.includes(b.id),
      );
    case "alternatives":
      return recs.some((r) => r.alternative_proposal_id);
    case "links":
      return (
        !!b.source_review.historical_link_check?.requires_recheck ||
        !!b.source_review.latest_link_check?.requires_recheck
      );
    case "duplicates":
      return (
        !!b.duplicate_review.possible_duplicate_of ||
        !!b.duplicate_review.content_mirror_group ||
        b.duplicate_review.status === "confirmed" ||
        d.duplicate_groups.some((g) => g.bookmark_ids.includes(b.id))
      );
    case "deferred":
      return b.processing.disposition === "defer";
    case "pending":
      return (
        b.processing.review_status === "decided" &&
        b.processing.disposition === "attach" &&
        !isComplete(b)
      );
    case "completed":
      return isComplete(b);
    default:
      return true;
  }
}
export function searchBookmark(b: Bookmark, q: string, d: Dataset) {
  const destinations = d.references_for_existing_issues
    .filter((r) => r.bookmark_id === b.id)
    .map(
      (r) =>
        `#${r.issue_number} ${d.issue_catalog.find((i) => i.number === r.issue_number)?.title}`,
    );
  const proposals = d.bookmarks_worth_their_own_issues
    .filter((p) => p.seed_bookmark_ids.includes(b.id))
    .map((p) => p.title);
  return [
    b.display_title,
    b.url,
    ...b.tags,
    b.original.note,
    b.original.excerpt,
    b.processing.user_notes,
    ...destinations,
    ...proposals,
    ...b.processing.selected_targets.map((t) => targetLabel(t, d)),
  ]
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());
}
function escapeLabel(s: string) {
  return s.replace(/[\\`*_[\]<>]/g, "\\$&").replace(/[\r\n]+/g, " ");
}
export function referenceDrafts(d: Dataset) {
  const seen = new Set<string>();
  const groups = new Map<
    string,
    { label: string; url?: string | null; lines: string[] }
  >();
  for (const b of d.bookmarks)
    if (
      b.processing.disposition === "attach" &&
      b.processing.review_status === "decided"
    )
      for (const t of b.processing.selected_targets) {
        if (t.placement_status !== "pending") continue;
        const key = targetKey(t, d),
          url = safeUrl(b.url);
        if (!url) continue;
        const identity = `${key}|${normalizedUrl(url)}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        if (!groups.has(key))
          groups.set(key, {
            label: targetLabel(t, d),
            url: targetUrl(t, d),
            lines: [],
          });
        const line = `- [${escapeLabel(b.display_title)}](<${url.replace(/[<>]/g, (c) => encodeURIComponent(c))}>)${t.note ? ` — ${escapeLabel(t.note)}` : ""}`;
        if (!groups.get(key)!.lines.includes(line))
          groups.get(key)!.lines.push(line);
      }
  return [...groups].map(([key, group]) => ({
    key,
    ...group,
    markdown: group.lines.join("\n"),
  }));
}
