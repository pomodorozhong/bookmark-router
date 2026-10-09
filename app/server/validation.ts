import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Dataset } from "../src/data/types";
import { safeUrl, targetKey } from "../src/data/selectors";
import { nodeIds } from "../src/data/progress";
const schema = JSON.parse(
  readFileSync(new URL("../../bookmarks.schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);
export function validateDataset(value: unknown): asserts value is Dataset {
  if (!validateSchema(value))
    throw new Error(ajv.errorsText(validateSchema.errors, { separator: "\n" }));
  const d = value as Dataset;
  const validNodeIds = nodeIds(d);
  for (const id of Object.keys(d.node_progress ?? {}))
    if (!validNodeIds.has(id)) throw new Error(`Unknown progress node: ${id}`);
  const errors: string[] = [];
  const assert = (condition: unknown, message: string) => {
    if (!condition) errors.push(message);
  };
  const unique = (list: (string | number)[], name: string) => {
    assert(new Set(list).size === list.length, `Duplicate ${name} IDs`);
    return new Set(list);
  };
  const bookmarks = unique(
    d.bookmarks.map((b) => b.id),
    "bookmark",
  );
  const categories = unique(
    d.category_review.categories.map((c) => c.id),
    "category",
  );
  const issues = unique(
    d.issue_catalog.map((i) => i.number),
    "issue",
  );
  const proposals = unique(
    d.bookmarks_worth_their_own_issues.map((p) => p.id),
    "proposal",
  );
  const groups = unique(
    d.duplicate_groups.map((g) => g.id),
    "duplicate group",
  );
  unique(
    d.references_for_existing_issues.map((r) => r.id),
    "recommendation",
  );
  assert(
    d.bookmarks.length === d.metadata.source.row_count,
    "Source row count must match bookmark count",
  );
  for (const i of d.issue_catalog) {
    assert(
      !!safeUrl(i.url) &&
        new URL(i.url).pathname.endsWith(`/issues/${i.number}`),
      `Issue #${i.number}: invalid issue URL`,
    );
  }
  for (const r of d.references_for_existing_issues) {
    assert(
      bookmarks.has(r.bookmark_id) && issues.has(r.issue_number),
      `${r.id}: missing bookmark or issue`,
    );
    assert(
      !r.alternative_proposal_id || proposals.has(r.alternative_proposal_id),
      `${r.id}: missing alternative proposal`,
    );
  }
  for (const p of d.bookmarks_worth_their_own_issues) {
    assert(
      p.seed_bookmark_ids.every((id) => bookmarks.has(id)),
      `${p.id}: missing seed bookmark`,
    );
    assert(
      p.related_issue_numbers.every((n) => issues.has(n)),
      `${p.id}: missing related issue`,
    );
    assert(
      p.approved_seed_bookmark_ids.every((id) =>
        p.seed_bookmark_ids.includes(id),
      ),
      `${p.id}: approved seed is not a seed`,
    );
    const issue = d.issue_catalog.find(
      (i) => i.number === p.created_issue_number,
    );
    assert(
      (p.created_issue_number === null) === (p.created_issue_url === null),
      `${p.id}: incomplete created issue identity`,
    );
    assert(
      p.status !== "created" || !!issue,
      `${p.id}: created proposal needs an issue`,
    );
    assert(
      !p.created_issue_number || (!!issue && issue.url === p.created_issue_url),
      `${p.id}: created identity must match catalog`,
    );
  }
  for (const g of d.duplicate_groups)
    assert(
      g.bookmark_ids.every((id) => bookmarks.has(id)) &&
        g.bookmark_ids.includes(g.proposed_canonical_bookmark_id),
      `${g.id}: invalid duplicate group`,
    );
  for (const b of d.bookmarks) {
    const c = b.classification,
      p = b.processing,
      du = b.duplicate_review;
    const label = (s: string) => `${b.id}: ${s}`;
    assert(b.original.id === b.id, label("original ID differs"));
    assert(!!safeUrl(b.url), label("URL must use HTTP(S)"));
    assert(
      [
        c.proposed_category_id,
        ...c.proposed_secondary_category_ids,
        ...c.approved_secondary_category_ids,
      ].every((id) => categories.has(id)),
      label("missing category"),
    );
    assert(
      !c.approved_category_id || categories.has(c.approved_category_id),
      label("missing approved category"),
    );
    assert(
      c.status === "pending"
        ? c.approved_category_id === null &&
            c.approved_secondary_category_ids.length === 0
        : !!c.approved_category_id,
      label("category status contradicts approval"),
    );
    assert(
      !c.approved_category_id ||
        !c.approved_secondary_category_ids.includes(c.approved_category_id),
      label("primary category repeated as secondary"),
    );
    assert(
      p.review_status !== "decided" || p.disposition !== "undecided",
      label("decided requires a disposition"),
    );
    assert(
      !["attach", "keep"].includes(p.disposition) || !!c.approved_category_id,
      label("approve a primary topic first"),
    );
    assert(
      p.disposition !== "attach" || p.selected_targets.length > 0,
      label("attachment needs at least one target"),
    );
    assert(
      p.disposition === "attach" || p.selected_targets.length === 0,
      label("only attachments may have selected targets"),
    );
    assert(
      p.disposition !== "skip" || !!p.user_notes.trim(),
      label("skip requires a reason in working notes"),
    );
    assert(
      p.disposition !== "defer" || !!p.defer_reason?.trim(),
      label("defer requires a reason"),
    );
    assert(
      !du.possible_duplicate_of || bookmarks.has(du.possible_duplicate_of),
      label("missing possible duplicate"),
    );
    assert(
      !du.content_mirror_group || groups.has(du.content_mirror_group),
      label("missing mirror group"),
    );
    assert(
      !du.confirmed_duplicate_of ||
        (bookmarks.has(du.confirmed_duplicate_of) && du.status === "confirmed"),
      label("invalid confirmed duplicate"),
    );
    assert(
      p.disposition !== "duplicate" ||
        (du.status === "confirmed" && !!du.confirmed_duplicate_of),
      label("duplicate requires a confirmed canonical bookmark"),
    );
    const visited = new Set([b.id]);
    let canonical = du.confirmed_duplicate_of;
    while (canonical) {
      if (visited.has(canonical)) {
        errors.push(label("duplicate cycle"));
        break;
      }
      visited.add(canonical);
      canonical =
        d.bookmarks.find((x) => x.id === canonical)?.duplicate_review
          .confirmed_duplicate_of ?? null;
    }
    const resolved = new Set<string>();
    for (const t of p.selected_targets) {
      const proposal =
        t.kind === "proposed_issue"
          ? d.bookmarks_worth_their_own_issues.find(
              (x) => x.id === t.proposal_id,
            )
          : null;
      assert(
        t.kind === "existing_issue" ? issues.has(t.issue_number) : !!proposal,
        label("missing destination"),
      );
      assert(
        !proposal || proposal.status !== "rejected",
        label("reassign rejected proposal target"),
      );
      const key = targetKey(t, d);
      assert(!resolved.has(key), label("duplicate resolved destination"));
      resolved.add(key);
      if (t.placement_status !== "pending") {
        assert(
          !!t.confirmed_on &&
            !!t.confirmation_url &&
            !!safeUrl(t.confirmation_url),
          label("confirmed placement needs URL and date"),
        );
        assert(
          !proposal || !!proposal.created_issue_number,
          label("register proposal issue before confirming"),
        );
      } else
        assert(
          t.confirmation_url === null && t.confirmed_on === null,
          label("pending target cannot carry confirmation"),
        );
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}
