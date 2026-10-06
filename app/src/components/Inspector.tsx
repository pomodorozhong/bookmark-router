import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Pin,
  Save,
  Star,
  Undo2,
  X,
} from "lucide-react";
import type { Bookmark, BookmarkPatch, Dataset, Target } from "../data/types";
import {
  domain,
  isComplete,
  safeUrl,
  targetKey,
  targetLabel,
  targetUrl,
  today,
} from "../data/selectors";
export function Inspector({
  bookmark: b,
  data,
  save,
  undo,
  close,
  navigate,
  pinned,
  pin,
  onDirty,
}: {
  bookmark: Bookmark;
  data: Dataset;
  save: (id: string, patch: BookmarkPatch) => Promise<boolean>;
  undo: (id: string) => Promise<boolean>;
  close: () => void;
  navigate: (direction: number) => void;
  pinned: boolean;
  pin: () => void;
  onDirty: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState<Bookmark>(() => structuredClone(b)),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [destination, setDestination] = useState("");
  const [tagText, setTagText] = useState(b.tags.join(", "));
  useEffect(() => {
    if (!dirty) {
      setDraft(structuredClone(b));
      setTagText(b.tags.join(", "));
    }
  }, [b, dirty]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(change: (b: Bookmark) => void) {
    const next = structuredClone(draft);
    change(next);
    setDraft(next);
    setDirty(true);
  }
  const patchOf = (next: Bookmark): BookmarkPatch => ({
    display_title: next.display_title,
    url: next.url,
    tags: next.tags,
    favorite: next.favorite,
    classification: {
      approved_category_id: next.classification.approved_category_id,
      approved_secondary_category_ids:
        next.classification.approved_secondary_category_ids,
      status: next.classification.status,
    },
    processing: {
      review_status: next.processing.review_status,
      disposition: next.processing.disposition,
      selected_targets: next.processing.selected_targets,
      user_notes: next.processing.user_notes,
      defer_reason: next.processing.defer_reason,
    },
    duplicate_review: {
      confirmed_duplicate_of: next.duplicate_review.confirmed_duplicate_of,
      status: next.duplicate_review.status,
    },
    source_review: {
      strength: next.source_review.strength,
      note: next.source_review.note,
      latest_link_check: next.source_review.latest_link_check,
    },
  });
  async function commit(next = draft) {
    setBusy(true);
    try {
      const ok = await save(b.id, patchOf(next));
      if (ok) setDirty(false);
      return ok;
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    const next = structuredClone(draft);
    next.classification.approved_category_id =
      next.classification.approved_category_id ??
      next.classification.proposed_category_id;
    next.classification.status =
      next.classification.approved_category_id ===
      next.classification.proposed_category_id
        ? "approved"
        : "revised";
    setDraft(next);
    setDirty(true);
    await commit(next);
  }
  function selectTarget(kind: Target["kind"], id: string) {
    edit((next) => {
      const target: Target = {
        ...(kind === "existing_issue"
          ? { kind, issue_number: Number(id) }
          : { kind, proposal_id: id }),
        placement_status: "pending",
        confirmation_url: null,
        confirmed_on: null,
        note: "",
      };
      if (
        !next.processing.selected_targets.some(
          (t) => targetKey(t, data) === targetKey(target, data),
        )
      )
        next.processing.selected_targets.push(target);
      next.processing.disposition = "attach";
      if (next.processing.review_status === "unreviewed")
        next.processing.review_status = "reviewing";
    });
  }
  const recs = data.references_for_existing_issues.filter(
      (r) => r.bookmark_id === b.id,
    ),
    proposals = data.bookmarks_worth_their_own_issues.filter((p) =>
      p.seed_bookmark_ids.includes(b.id),
    );
  const section = "border-b border-slate-100 px-6 py-5";
  return (
    <aside
      className="inspector flex min-h-0 w-[390px] shrink-0 flex-col border-l border-slate-200 bg-white"
      aria-label="Bookmark inspector"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <span className="eyebrow">BOOKMARK DETAILS</span>
        <div className="flex gap-1">
          <button
            onClick={pin}
            className={pinned ? "text-emerald-700" : ""}
            title={pinned ? "Unpin bubble" : "Pin bubble"}
            aria-label={pinned ? "Unpin bubble" : "Pin bubble"}
          >
            <Pin size={16} />
          </button>
          <button onClick={close} aria-label="Close inspector">
            <X size={17} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className={section}>
          <div className="mb-3 flex items-center gap-2">
            <span className="pill">{domain(draft.url)}</span>
            <span
              className={`pill ${isComplete(b) ? "!bg-emerald-50 !text-emerald-700" : ""}`}
            >
              {isComplete(b) ? "Complete" : b.processing.review_status}
            </span>
            <button
              aria-label="Toggle favorite"
              aria-pressed={draft.favorite}
              onClick={() =>
                edit((b) => {
                  b.favorite = !b.favorite;
                })
              }
              className="ml-auto"
            >
              <Star
                size={16}
                fill={draft.favorite ? "#d7a050" : "none"}
                stroke={draft.favorite ? "#d7a050" : "currentColor"}
              />
            </button>
          </div>
          <label className="field-label" htmlFor="bookmark-title">
            Title
          </label>
          <textarea
            id="bookmark-title"
            rows={2}
            className="title-input"
            value={draft.display_title}
            onChange={(e) =>
              edit((b) => {
                b.display_title = e.target.value;
              })
            }
          />
          <label className="field-label mt-3" htmlFor="bookmark-url">
            Source URL
          </label>
          <input
            id="bookmark-url"
            value={draft.url}
            onChange={(e) =>
              edit((b) => {
                b.url = e.target.value;
              })
            }
          />
          {safeUrl(draft.url) && (
            <a
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-800"
              href={safeUrl(draft.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source <ExternalLink size={13} />
            </a>
          )}
          <label className="field-label mt-4" htmlFor="tags">
            Tags, separated by commas
          </label>
          <input
            id="tags"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              edit((b) => {
                b.tags = [
                  ...new Set(
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  ),
                ];
              });
            }}
          />
        </section>
        <section className={section}>
          <h2 className="section-title">
            <span className="step">1</span>Review topic
          </h2>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {draft.classification.reason}
          </p>
          <label className="field-label mt-3" htmlFor="primary-topic">
            Primary topic
          </label>
          <select
            id="primary-topic"
            value={
              draft.classification.approved_category_id ??
              draft.classification.proposed_category_id
            }
            onChange={(e) =>
              edit((b) => {
                b.classification.approved_category_id = e.target.value;
                b.classification.status = "revised";
                b.classification.approved_secondary_category_ids =
                  b.classification.approved_secondary_category_ids.filter(
                    (id) => id !== e.target.value,
                  );
              })
            }
          >
            {data.category_review.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <details className="mt-3 text-sm">
            <summary className="text-slate-600">Secondary topics</summary>
            <div className="mt-2 grid gap-2">
              {data.category_review.categories
                .filter(
                  (c) =>
                    c.id !==
                    (draft.classification.approved_category_id ??
                      draft.classification.proposed_category_id),
                )
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.classification.approved_secondary_category_ids.includes(
                        c.id,
                      )}
                      onChange={(e) =>
                        edit((b) => {
                          b.classification.approved_secondary_category_ids = e
                            .target.checked
                            ? [
                                ...b.classification
                                  .approved_secondary_category_ids,
                                c.id,
                              ]
                            : b.classification.approved_secondary_category_ids.filter(
                                (id) => id !== c.id,
                              );
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
            </div>
          </details>
          <button
            className="primary mt-4 w-full"
            disabled={busy}
            onClick={approve}
          >
            <Check size={15} />
            {b.classification.status === "pending"
              ? "Approve topic"
              : "Save topic approval"}
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Topic approval does not confirm placement.
          </p>
        </section>
        <section className={section}>
          <h2 className="section-title">
            <span className="step">2</span>Choose a destination
          </h2>
          <label className="field-label mt-4" htmlFor="disposition">
            Disposition
          </label>
          <select
            id="disposition"
            value={draft.processing.disposition}
            onChange={(e) =>
              edit((b) => {
                b.processing.disposition = e.target
                  .value as Bookmark["processing"]["disposition"];
                if (b.processing.disposition !== "attach")
                  b.processing.selected_targets = [];
                if (
                  b.processing.review_status === "decided" &&
                  b.processing.disposition === "undecided"
                )
                  b.processing.review_status = "reviewing";
              })
            }
          >
            {["undecided", "attach", "keep", "skip", "duplicate", "defer"].map(
              (v) => (
                <option key={v} value={v}>
                  {
                    (
                      {
                        undecided: "Undecided",
                        attach: "Attach to issue",
                        keep: "Keep as resource",
                        skip: "Skip",
                        duplicate: "Duplicate",
                        defer: "Defer",
                      } as Record<string, string>
                    )[v]
                  }
                </option>
              ),
            )}
          </select>
          {draft.processing.disposition === "defer" && (
            <>
              <label className="field-label mt-3" htmlFor="defer-reason">
                Reason for deferring
              </label>
              <textarea
                id="defer-reason"
                value={draft.processing.defer_reason ?? ""}
                onChange={(e) =>
                  edit((b) => {
                    b.processing.defer_reason = e.target.value;
                  })
                }
              />
            </>
          )}
          {draft.processing.disposition === "duplicate" && (
            <>
              <label className="field-label mt-3" htmlFor="canonical">
                Canonical bookmark
              </label>
              <select
                id="canonical"
                value={draft.duplicate_review.confirmed_duplicate_of ?? ""}
                onChange={(e) =>
                  edit((b) => {
                    b.duplicate_review.confirmed_duplicate_of =
                      e.target.value || null;
                    b.duplicate_review.status = e.target.value
                      ? "confirmed"
                      : "pending";
                  })
                }
              >
                <option value="">Choose canonical bookmark</option>
                {data.bookmarks
                  .filter((x) => x.id !== b.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.display_title}
                    </option>
                  ))}
              </select>
            </>
          )}
          {!draft.classification.approved_category_id && (
            <p className="mt-3 text-xs text-amber-700">
              Approve a topic before attaching or keeping a bookmark.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {recs.map((r) => {
              const issue = data.issue_catalog.find(
                (i) => i.number === r.issue_number,
              )!;
              const selected = draft.processing.selected_targets.some(
                (t) => targetKey(t, data) === `issue:${r.issue_number}`,
              );
              return (
                <div
                  key={r.id}
                  className="destination-card border-blue-100 bg-blue-50/40"
                >
                  <span className="eyebrow !text-blue-700">
                    EXISTING ISSUE · {issue.state}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold">
                    #{issue.number} {issue.title}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {r.reason}
                  </p>
                  {r.caveat && (
                    <p className="mt-2 text-xs text-amber-700">{r.caveat}</p>
                  )}
                  <details className="mt-2 text-xs text-slate-500">
                    <summary>Provenance & presence</summary>
                    <p className="mt-2">
                      {r.origin.replaceAll("_", " ")} ·{" "}
                      {r.presence.replaceAll("_", " ")}
                    </p>
                  </details>
                  <button
                    className="secondary mt-3 w-full"
                    disabled={
                      selected || !draft.classification.approved_category_id
                    }
                    onClick={() =>
                      selectTarget("existing_issue", String(issue.number))
                    }
                  >
                    {selected ? "Selected" : "Select issue"}
                  </button>
                </div>
              );
            })}
            {proposals.map((p) => {
              const selected = draft.processing.selected_targets.some(
                (t) =>
                  targetKey(t, data) ===
                  (p.created_issue_number
                    ? `issue:${p.created_issue_number}`
                    : `proposal:${p.id}`),
              );
              return (
                <div
                  key={p.id}
                  className="destination-card border-amber-100 bg-amber-50/50"
                >
                  <span className="eyebrow !text-amber-700">
                    NEW PROPOSAL · {p.status}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold">{p.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {p.rationale}
                  </p>
                  <details className="mt-2 text-xs text-slate-500">
                    <summary>Scope, seeds & overlap</summary>
                    <p className="mt-2">{p.overlap_with_existing_issues}</p>
                    <ul className="mt-2 list-disc pl-4">
                      {p.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      {p.seed_bookmark_ids.length} seed sources
                    </p>
                  </details>
                  <button
                    className="secondary mt-3 w-full"
                    disabled={
                      selected ||
                      p.status === "rejected" ||
                      !draft.classification.approved_category_id
                    }
                    onClick={() => selectTarget("proposed_issue", p.id)}
                  >
                    {selected ? "Selected" : "Select proposal"}
                  </button>
                </div>
              );
            })}
          </div>
          {!recs.length && !proposals.length && (
            <p className="mt-3 text-sm text-slate-500">
              No destination suggestions. Browse the catalog below or keep this
              as a resource.
            </p>
          )}
          <label className="field-label mt-4" htmlFor="other-destination">
            Browse every destination
          </label>
          <div className="flex gap-2">
            <select
              id="other-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Choose an issue or proposal</option>
              <optgroup label="Existing issues">
                {data.issue_catalog.map((i) => (
                  <option key={i.number} value={`issue:${i.number}`}>
                    #{i.number} {i.title} · {i.state}
                  </option>
                ))}
              </optgroup>
              <optgroup label="New proposals">
                {data.bookmarks_worth_their_own_issues
                  .filter((p) => p.status !== "rejected")
                  .map((p) => (
                    <option key={p.id} value={`proposal:${p.id}`}>
                      {p.title}
                    </option>
                  ))}
              </optgroup>
            </select>
            <button
              className="secondary"
              disabled={
                !destination || !draft.classification.approved_category_id
              }
              onClick={() => {
                const [kind, ...id] = destination.split(":");
                selectTarget(
                  kind === "issue" ? "existing_issue" : "proposed_issue",
                  id.join(":"),
                );
              }}
            >
              Add
            </button>
          </div>
        </section>
        <section className={section}>
          <h2 className="section-title">
            <span className="step">3</span>Confirm each placement{" "}
            <span className="ml-auto text-xs text-slate-400">
              {draft.processing.selected_targets.length}
            </span>
          </h2>
          {!draft.processing.selected_targets.length && (
            <p className="mt-3 text-sm text-slate-400">
              Select a destination to track its placement.
            </p>
          )}
          {draft.processing.selected_targets.map((t, index) => (
            <div
              key={targetKey(t, data)}
              className="mt-4 rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">{targetLabel(t, data)}</h3>
                <button
                  aria-label={`Remove ${targetLabel(t, data)}`}
                  onClick={() =>
                    edit((b) => {
                      b.processing.selected_targets.splice(index, 1);
                      if (!b.processing.selected_targets.length) {
                        b.processing.disposition = "undecided";
                        b.processing.review_status = "reviewing";
                      }
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
              <label
                className="field-label mt-3"
                htmlFor={`target-note-${index}`}
              >
                Placement reason
              </label>
              <textarea
                id={`target-note-${index}`}
                rows={2}
                value={t.note}
                onChange={(e) =>
                  edit((b) => {
                    b.processing.selected_targets[index].note = e.target.value;
                  })
                }
              />
              <label
                className="field-label mt-3"
                htmlFor={`placement-${index}`}
              >
                Placement status
              </label>
              <select
                id={`placement-${index}`}
                value={t.placement_status}
                disabled={!targetUrl(t, data)}
                onChange={(e) =>
                  edit((b) => {
                    const x = b.processing.selected_targets[index];
                    x.placement_status = e.target
                      .value as Target["placement_status"];
                    x.confirmation_url =
                      x.placement_status === "pending"
                        ? null
                        : (targetUrl(x, data) ?? null);
                    x.confirmed_on =
                      x.placement_status === "pending" ? null : today();
                  })
                }
              >
                <option value="pending">Pending</option>
                <option value="added">Added</option>
                <option value="already_present">Already present</option>
              </select>
              {!targetUrl(t, data) && (
                <p className="mt-2 text-xs text-amber-700">
                  Register the proposal's GitHub issue before confirming
                  placement.
                </p>
              )}
              {t.placement_status !== "pending" && (
                <>
                  <label
                    className="field-label mt-3"
                    htmlFor={`confirm-url-${index}`}
                  >
                    Confirmation URL
                  </label>
                  <input
                    id={`confirm-url-${index}`}
                    value={t.confirmation_url ?? ""}
                    onChange={(e) =>
                      edit((b) => {
                        b.processing.selected_targets[index].confirmation_url =
                          e.target.value;
                      })
                    }
                  />
                  <label
                    className="field-label mt-3"
                    htmlFor={`confirm-date-${index}`}
                  >
                    Confirmed on
                  </label>
                  <input
                    type="date"
                    id={`confirm-date-${index}`}
                    value={t.confirmed_on ?? ""}
                    onChange={(e) =>
                      edit((b) => {
                        b.processing.selected_targets[index].confirmed_on =
                          e.target.value;
                      })
                    }
                  />
                </>
              )}
            </div>
          ))}
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Preparing or copying a reference never confirms its placement.
          </p>
        </section>
        <section className={section}>
          <label className="field-label" htmlFor="working-notes">
            Working notes{" "}
            {draft.processing.disposition === "skip"
              ? "(include skip reason)"
              : ""}
          </label>
          <textarea
            id="working-notes"
            rows={3}
            value={draft.processing.user_notes}
            onChange={(e) =>
              edit((b) => {
                b.processing.user_notes = e.target.value;
              })
            }
          />
          <button
            className="primary mt-4 w-full"
            disabled={busy || draft.processing.disposition === "undecided"}
            onClick={() => {
              const next = structuredClone(draft);
              next.processing.review_status = "decided";
              setDraft(next);
              setDirty(true);
              void commit(next);
            }}
          >
            Save review decision
          </button>
        </section>
        <section className={section}>
          <details>
            <summary className="text-sm font-medium">
              Original source & provenance
            </summary>
            <div className="mt-3 space-y-3 text-xs leading-5 text-slate-500">
              <p>Original category: {b.original.category}</p>
              <p className="whitespace-pre-wrap">
                {b.original.note || "No original note."}
              </p>
              <p className="whitespace-pre-wrap">{b.original.excerpt}</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(b.original, null, 2)}
              </pre>
            </div>
          </details>
          <details className="mt-4">
            <summary className="text-sm font-medium">
              Source & dated link observations
            </summary>
            <label className="field-label mt-3" htmlFor="source-strength">
              Source assessment
            </label>
            <select
              id="source-strength"
              value={draft.source_review.strength}
              onChange={(e) =>
                edit((b) => {
                  b.source_review.strength = e.target.value;
                })
              }
            >
              {[
                "thin_research_lead",
                "research_lead",
                "reference_resource",
                "requires_content_review",
                "firsthand_case",
                "secondary_analysis",
              ].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <label className="field-label mt-3" htmlFor="source-note">
              Assessment notes
            </label>
            <textarea
              id="source-note"
              value={draft.source_review.note}
              onChange={(e) =>
                edit((b) => {
                  b.source_review.note = e.target.value;
                })
              }
            />
            {[
              b.source_review.historical_link_check,
              b.source_review.latest_link_check,
            ]
              .filter(Boolean)
              .map((c, i) => (
                <p key={i} className="mt-3 text-xs leading-5 text-amber-800">
                  {c!.observed_on} · {c!.status.replaceAll("_", " ")}
                  <br />
                  {c!.note}
                </p>
              ))}
            {!draft.source_review.latest_link_check ? (
              <button
                className="secondary mt-3"
                onClick={() =>
                  edit((b) => {
                    b.source_review.latest_link_check = {
                      status: "not_checked",
                      resolved_url: null,
                      note: "",
                      observed_on: today(),
                      origin: "user",
                      requires_recheck: true,
                    };
                  })
                }
              >
                Record a new link observation
              </button>
            ) : (
              <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
                <label className="field-label">
                  Observation status
                  <select
                    value={draft.source_review.latest_link_check.status}
                    onChange={(e) =>
                      edit((b) => {
                        b.source_review.latest_link_check!.status =
                          e.target.value;
                      })
                    }
                  >
                    {[
                      "available",
                      "redirected",
                      "redirected_to_homepage",
                      "not_found",
                      "access_restricted",
                      "rate_limited",
                      "compromised",
                      "not_checked",
                      "error",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Observed on
                  <input
                    type="date"
                    value={draft.source_review.latest_link_check.observed_on}
                    onChange={(e) =>
                      edit((b) => {
                        b.source_review.latest_link_check!.observed_on =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Resolved URL
                  <input
                    value={
                      draft.source_review.latest_link_check.resolved_url ?? ""
                    }
                    onChange={(e) =>
                      edit((b) => {
                        b.source_review.latest_link_check!.resolved_url =
                          e.target.value || null;
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Observation notes
                  <textarea
                    value={draft.source_review.latest_link_check.note}
                    onChange={(e) =>
                      edit((b) => {
                        b.source_review.latest_link_check!.note =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={
                      draft.source_review.latest_link_check.requires_recheck
                    }
                    onChange={(e) =>
                      edit((b) => {
                        b.source_review.latest_link_check!.requires_recheck =
                          e.target.checked;
                      })
                    }
                  />
                  Needs follow-up
                </label>
              </div>
            )}
          </details>
          <details className="mt-4">
            <summary className="text-sm font-medium">
              Duplicates & history ({b.history.length})
            </summary>
            <p className="mt-3 text-xs text-slate-500">
              {b.duplicate_review.possible_duplicate_of
                ? `Possible duplicate: ${b.duplicate_review.possible_duplicate_of}`
                : "No suggested duplicate."}
            </p>
            {data.duplicate_groups
              .filter((g) => g.bookmark_ids.includes(b.id))
              .map((g) => (
                <p key={g.id} className="mt-2 text-xs text-slate-500">
                  {g.reason}
                </p>
              ))}
            {(b.duplicate_review.possible_duplicate_of ||
              b.duplicate_review.content_mirror_group) && (
              <button
                className="secondary mt-3"
                onClick={() =>
                  edit((b) => {
                    b.duplicate_review.status = "rejected";
                    b.duplicate_review.confirmed_duplicate_of = null;
                    if (b.processing.disposition === "duplicate") {
                      b.processing.disposition = "undecided";
                      b.processing.review_status = "reviewing";
                    }
                  })
                }
              >
                Reject suggested duplicate relationship
              </button>
            )}
            {[...b.history]
              .reverse()
              .slice(0, 20)
              .map((h) => (
                <p key={h.id} className="mt-2 text-xs text-slate-500">
                  {new Date(h.at).toLocaleString()} · {h.action} · {h.field}
                </p>
              ))}
            <button
              className="secondary mt-3"
              disabled={
                busy || dirty || !b.history.some((h) => h.action === "edit")
              }
              onClick={async () => {
                setBusy(true);
                try {
                  if (await undo(b.id)) setDirty(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Undo2 size={13} />
              Undo last save
            </button>
          </details>
        </section>
      </div>
      <div className="border-t border-slate-200 px-5 py-3">
        <div className="mb-3 flex items-center justify-between">
          <span
            className={`text-xs ${dirty ? "text-amber-700" : "text-slate-400"}`}
            role="status"
          >
            {busy ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            className="secondary"
            disabled={busy || !dirty}
            onClick={() => void commit()}
          >
            <Save size={13} />
            Save changes
          </button>
        </div>
        <div className="flex justify-between">
          <button
            className="text-xs"
            disabled={dirty || busy}
            title={dirty ? "Save edits before navigating" : ""}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={14} />
            Previous
          </button>
          <button
            className="text-xs"
            disabled={dirty || busy}
            onClick={() => navigate(1)}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
