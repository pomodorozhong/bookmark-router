// One-off conversion of the prototype tracker (`bookmarks-working.json`) into a
// restorable backup. Decided and suggested groupings both become memberships
// (user decision, October 11, 2026); each suggestion's reason is kept as a note.
import {
  emptyWorkspace,
  isWebUrl,
  validateWorkspace,
  type Backup,
  type Bookmark,
  type SourceNote,
  type Tag,
  type TagType,
} from "./model";

interface PrototypeBookmark {
  id: string;
  original: Record<string, string>;
  display_title: string;
  url: string;
  classification: {
    proposed_category_id: string | null;
    approved_category_id: string | null;
    proposed_secondary_category_ids?: string[];
    approved_secondary_category_ids?: string[];
    reason?: string;
  };
  source_review?: {
    historical_link_check?: {
      status: string;
      note?: string;
      observed_on?: string;
    } | null;
  };
  duplicate_review?: { status: string; possible_duplicate_of?: string | null };
  triage?: { suggested_next_action: string; reason?: string };
  processing?: {
    selected_targets?: { issue_number?: number; confirmation_url?: string }[];
  };
}
export interface Prototype {
  metadata: { title: string };
  category_review: {
    categories: { id: string; label: string; group: string }[];
  };
  issue_catalog: {
    number: number;
    title: string;
    url: string;
    body_snapshot: string;
  }[];
  references_for_existing_issues: {
    bookmark_id: string;
    issue_number: number;
    label: string;
    reason: string;
    recommendation: string;
    presence: string;
  }[];
  bookmarks_worth_their_own_issues: {
    id: string;
    title: string;
    rationale: string;
    questions: string[];
    seed_bookmark_ids: string[];
    approved_seed_bookmark_ids: string[];
    created_issue_url?: string | null;
  }[];
  duplicate_groups: {
    bookmark_ids: string[];
    proposed_canonical_bookmark_id: string;
    reason: string;
  }[];
  bookmarks: PrototypeBookmark[];
  node_progress: Record<string, string>;
}

const statusIds: Record<string, string> = {
  pending: "pending",
  "in-progress": "in-progress",
  done: "done",
  dropped: "dropped",
};
const humanize = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

export function convertPrototype(data: Prototype, now: string): Backup {
  const workspace = emptyWorkspace(data.metadata.title);
  const meta = { revision: 0, createdAt: now, updatedAt: now };
  const status = (key: string) => statusIds[data.node_progress[key]] ?? "pending";
  const types: TagType[] = [
    { id: "type:existing-issue", name: "Existing issue", appearance: { color: "#0f766e", size: 72, shape: "price-tag" } },
    { id: "type:proposal-issue", name: "Proposal issue", appearance: { color: "#b45309", size: 64, shape: "rounded-tag" } },
    { id: "type:topic", name: "Topic", appearance: { color: "#475569", size: 52, shape: "hang-tag" } },
  ];
  const issueTag = (n: number) => `issue:${n}`;
  const tags: Tag[] = [
    ...data.issue_catalog.map((issue) => ({
      ...meta,
      id: issueTag(issue.number),
      name: `#${issue.number} ${issue.title}`,
      description: issue.body_snapshot,
      url: issue.url,
      typeId: "type:existing-issue",
      statusId: status(issueTag(issue.number)),
      appearance: {},
    })),
    ...data.bookmarks_worth_their_own_issues.map((p) => ({
      ...meta,
      id: `proposal:${p.id}`,
      name: p.title,
      description: [p.rationale, ...p.questions.map((q) => `• ${q}`)].join("\n"),
      url: p.created_issue_url ?? undefined,
      typeId: "type:proposal-issue",
      statusId: status(`proposal:${p.id}`),
      appearance: {},
    })),
    ...data.category_review.categories.map((c) => ({
      ...meta,
      id: `topic:${c.id}`,
      name: c.label,
      description: c.group,
      typeId: "type:topic",
      statusId: status(`topic:${c.id}`),
      appearance: {},
    })),
  ];
  const tagIds = new Set(tags.map((t) => t.id));
  const titles = new Map(data.bookmarks.map((b) => [b.id, b.display_title || b.url]));
  const notes = new Map<string, SourceNote[]>();
  const note = (bookmarkId: string, label: string, text: string) =>
    notes.set(bookmarkId, [...(notes.get(bookmarkId) ?? []), { label, text }]);
  const links = new Set<string>();
  const link = (bookmarkId: string, tagId: string) => {
    if (tagIds.has(tagId)) links.add(JSON.stringify([`bookmark:${bookmarkId}`, tagId]));
  };

  for (const b of data.bookmarks) {
    const c = b.classification;
    const topic = c.approved_category_id ?? c.proposed_category_id;
    if (topic) link(b.id, `topic:${topic}`);
    for (const id of new Set([...(c.approved_secondary_category_ids ?? []), ...(c.proposed_secondary_category_ids ?? [])]))
      link(b.id, `topic:${id}`);
    if (!c.approved_category_id && c.proposed_category_id && c.reason)
      note(b.id, "Why this topic", c.reason);
    for (const target of b.processing?.selected_targets ?? [])
      if (target.issue_number && target.confirmation_url) link(b.id, issueTag(target.issue_number));
    const check = b.source_review?.historical_link_check;
    if (check && check.status !== "available")
      note(b.id, `Link check: ${humanize(check.status)}`, [check.note, check.observed_on && `Observed ${check.observed_on}.`].filter(Boolean).join(" "));
    if (b.triage && b.triage.suggested_next_action !== "review")
      note(b.id, `Suggested next: ${humanize(b.triage.suggested_next_action)}`, b.triage.reason ?? "");
  }
  for (const r of data.references_for_existing_issues) {
    link(r.bookmark_id, issueTag(r.issue_number));
    note(r.bookmark_id, `Why #${r.issue_number}`, `${r.label}: ${r.reason}`);
  }
  for (const p of data.bookmarks_worth_their_own_issues) {
    for (const id of new Set([...p.approved_seed_bookmark_ids, ...p.seed_bookmark_ids]))
      link(id, `proposal:${p.id}`);
  }
  for (const group of data.duplicate_groups)
    for (const id of group.bookmark_ids)
      for (const other of group.bookmark_ids)
        if (other !== id)
          note(id, other === group.proposed_canonical_bookmark_id ? "Possible duplicate (keep the other)" : "Possible duplicate", `${titles.get(other)} — ${group.reason}`);

  const bookmarks: Bookmark[] = data.bookmarks.map((b) => {
    const o = b.original;
    const cover = o.cover && isWebUrl(o.cover) ? o.cover : undefined;
    return {
      ...meta,
      id: `bookmark:${b.id}`,
      title: b.display_title || b.url,
      description: [o.note, o.excerpt].filter(Boolean).join("\n\n"),
      url: b.url || undefined,
      asset: cover ? { kind: "image", source: "remote", url: cover } : undefined,
      statusId: status(`bookmark:${b.id}`),
      missingTitle: !b.display_title || undefined,
      notes: notes.get(b.id),
      source: { name: "Raindrop", fields: { ...o } },
    };
  });

  workspace.tagTypes = types;
  workspace.tags = tags;
  workspace.bookmarks = bookmarks;
  workspace.memberships = [...links].map((pair) => {
    const [bookmarkId, tagId] = JSON.parse(pair) as [string, string];
    return { id: `${bookmarkId}|${tagId}`, bookmarkId, tagId };
  });
  validateWorkspace(workspace);
  return { format: "bookmark-tag", version: 2, workspace, media: [] };
}
