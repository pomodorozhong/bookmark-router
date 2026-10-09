export type ProgressStatus = "pending" | "in_progress" | "done" | "dropped";
export type Placement = "pending" | "added" | "already_present";
export type Target = (
  | { kind: "existing_issue"; issue_number: number }
  | { kind: "proposed_issue"; proposal_id: string }
) & {
  placement_status: Placement;
  confirmation_url: string | null;
  confirmed_on: string | null;
  note: string;
};
export type Category = { id: string; label: string; group: string };
export type Issue = {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  body_snapshot: string;
  github_updated_at: string;
  snapshot_on: string;
  scope: string;
};
export type Proposal = {
  id: string;
  title: string;
  rationale: string;
  questions: string[];
  seed_bookmark_ids: string[];
  overlap_with_existing_issues: string;
  related_issue_numbers: number[];
  suggested_labels: string[];
  origin: string;
  status: "suggested" | "approved" | "created" | "rejected";
  approved_seed_bookmark_ids: string[];
  created_issue_number: number | null;
  created_issue_url: string | null;
  user_notes: string;
};
export type Recommendation = {
  id: string;
  bookmark_id: string;
  issue_number: number;
  label: string;
  reason: string;
  caveat: string | null;
  origin: string;
  recommendation: string;
  presence: string;
  alternative_proposal_id: string | null;
};
export type LinkCheck = {
  status: string;
  resolved_url: string | null;
  note: string;
  observed_on: string;
  origin: string;
  requires_recheck: boolean;
};
export type Bookmark = {
  id: string;
  original: Record<string, string>;
  display_title: string;
  url: string;
  normalized_url: string;
  tags: string[];
  favorite: boolean;
  source_type: string;
  classification: {
    proposed_category_id: string;
    proposed_secondary_category_ids: string[];
    correction_kind: string;
    origin: string;
    reason: string;
    approved_category_id: string | null;
    approved_secondary_category_ids: string[];
    status: "pending" | "approved" | "revised";
  };
  source_review: {
    strength: string;
    note: string;
    historical_link_check: LinkCheck | null;
    latest_link_check: LinkCheck | null;
  };
  duplicate_review: {
    possible_duplicate_of: string | null;
    confirmed_duplicate_of: string | null;
    content_mirror_group: string | null;
    status: "pending" | "no_known_duplicate" | "confirmed" | "rejected";
  };
  triage: { suggested_next_action: string; reason: string; priority: string };
  processing: {
    review_status: "unreviewed" | "reviewing" | "decided";
    disposition:
      "undecided" | "attach" | "keep" | "skip" | "duplicate" | "defer";
    selected_targets: Target[];
    user_notes: string;
    defer_reason: string | null;
    updated_at: string | null;
  };
  history: {
    id: string;
    at: string;
    action: string;
    field: string | null;
    previous_value: unknown;
    new_value: unknown;
    note: string;
  }[];
};
export type Dataset = {
  node_progress?: Record<string, ProgressStatus>;
  schema_version: string;
  dataset_id: string;
  metadata: {
    title: string;
    created_on: string;
    timezone: string;
    repository: string;
    revision: number;
    updated_at: string | null;
    source: { row_count: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  category_review: {
    categories: Category[];
    original_distribution: { category: string; count: number }[];
    [key: string]: unknown;
  };
  workflow: unknown;
  issue_catalog: Issue[];
  references_for_existing_issues: Recommendation[];
  bookmarks_worth_their_own_issues: Proposal[];
  duplicate_groups: {
    id: string;
    kind: string;
    bookmark_ids: string[];
    proposed_canonical_bookmark_id: string;
    reason: string;
    status: string;
  }[];
  bookmarks: Bookmark[];
};
export type BookmarkPatch = Partial<
  Pick<Bookmark, "display_title" | "url" | "tags" | "favorite">
> & {
  progress?: ProgressStatus;
  classification?: Partial<Bookmark["classification"]>;
  processing?: Partial<Bookmark["processing"]>;
  duplicate_review?: Partial<Bookmark["duplicate_review"]>;
  source_review?: Partial<Bookmark["source_review"]>;
};
