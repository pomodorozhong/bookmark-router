import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Download, X } from "lucide-react";
import type { Dataset, Issue, Proposal } from "../data/types";
import {
  isComplete,
  queues,
  inQueue,
  referenceDrafts,
  safeUrl,
  targetKey,
  today,
  type Queue,
} from "../data/selectors";
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const elements = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary",
              ),
            ].filter((el) => el.getClientRects().length);
            const first = elements[0],
              last = elements.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-7 py-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={close} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        <div className="overflow-y-auto p-7">{children}</div>
      </section>
    </div>
  );
}
export function Progress({
  data,
  navigate,
}: {
  data: Dataset;
  navigate: (q: Queue) => void;
}) {
  const complete = data.bookmarks.filter(isComplete),
    reviewed = data.bookmarks.filter(
      (b) => b.processing.review_status === "decided",
    );
  const targets = data.bookmarks.flatMap((b) => b.processing.selected_targets);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "BOOKMARKS COMPLETED",
            value: `${complete.length} / ${data.bookmarks.length}`,
          },
          {
            label: "REVIEW DECISIONS",
            value: `${reviewed.length} / ${data.bookmarks.length}`,
          },
          {
            label: "PLACEMENTS CONFIRMED",
            value: `${targets.filter((t) => t.placement_status !== "pending").length} / ${targets.length}`,
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 p-5">
            <p className="eyebrow">{c.label}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
        Completed:{" "}
        {complete.filter((b) => b.processing.disposition === "attach").length}{" "}
        attached ·{" "}
        {complete.filter((b) => b.processing.disposition === "keep").length}{" "}
        kept ·{" "}
        {complete.filter((b) => b.processing.disposition === "skip").length}{" "}
        skipped ·{" "}
        {
          complete.filter((b) => b.processing.disposition === "duplicate")
            .length
        }{" "}
        duplicates
      </div>
      <h3 className="mt-7 mb-3 font-semibold">Continue reviewing</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {queues
          .filter((q) =>
            [
              "unreviewed",
              "pending",
              "proposals",
              "duplicates",
              "deferred",
              "completed",
            ].includes(q.id),
          )
          .map((q) => (
            <button
              key={q.id}
              className="secondary justify-between !p-4"
              onClick={() => navigate(q.id)}
            >
              {q.label}
              <span>
                {data.bookmarks.filter((b) => inQueue(b, q.id, data)).length}
                <ArrowUpRight size={14} className="ml-2 inline" />
              </span>
            </button>
          ))}
      </div>
      <p className="mt-5 text-sm text-slate-500">
        {
          data.bookmarks_worth_their_own_issues.filter(
            (p) => !p.created_issue_number && p.status !== "rejected",
          ).length
        }{" "}
        unresolved proposals. A bookmark with any pending placement remains
        incomplete.
      </p>
    </>
  );
}
export function IssueBoard({
  data,
  focus,
}: {
  data: Dataset;
  focus: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.issue_catalog.map((i) => {
        const accepted = data.bookmarks.flatMap((b) =>
          b.processing.selected_targets
            .filter((t) => targetKey(t, data) === `issue:${i.number}`)
            .map((t) => ({ b, t })),
        );
        const suggested = new Set(
          data.references_for_existing_issues
            .filter(
              (r) =>
                r.issue_number === i.number &&
                !accepted.some((a) => a.b.id === r.bookmark_id),
            )
            .map((r) => r.bookmark_id),
        );
        return (
          <button
            key={i.number}
            className="block rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300"
            onClick={() => focus(`issue:${i.number}`)}
          >
            <span className="eyebrow !text-blue-700">
              #{i.number} · {i.state}
            </span>
            <h3 className="mt-2 text-base font-semibold">{i.title}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="pill">
                {
                  accepted.filter((a) => a.t.placement_status === "pending")
                    .length
                }{" "}
                pending
              </span>
              <span className="pill">
                {
                  accepted.filter((a) => a.t.placement_status !== "pending")
                    .length
                }{" "}
                confirmed
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {suggested.size} unaccepted suggestions
            </p>
          </button>
        );
      })}
    </div>
  );
}
export function Drafts({ data }: { data: Dataset }) {
  const [copied, setCopied] = useState(""),
    [error, setError] = useState("");
  const drafts = referenceDrafts(data);
  return (
    <>
      {!drafts.length && (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
          No accepted, pending placements yet. Approve a topic, choose targets,
          and save a review decision first.
        </p>
      )}
      {drafts.map((g) => (
        <section
          key={g.key}
          className="mb-5 rounded-xl border border-slate-200 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{g.label}</h3>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(g.markdown);
                  setCopied(g.key);
                } catch {
                  setError(
                    "Clipboard unavailable. Select and copy the preview text.",
                  );
                }
              }}
            >
              {copied === g.key ? <Check size={14} /> : <Copy size={14} />}Copy
              Markdown
            </button>
          </div>
          <textarea
            className="mt-4 !font-mono text-xs"
            aria-label={`Markdown for ${g.label}`}
            readOnly
            rows={Math.min(10, g.lines.length * 2 + 1)}
            value={g.markdown}
          />
          {g.url && (
            <a
              href={safeUrl(g.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-blue-700"
            >
              Open destination <ArrowUpRight size={13} />
            </a>
          )}
        </section>
      ))}
      {error && (
        <p role="alert" className="text-sm text-amber-700">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-400">
        Copying does not confirm placement. Confirm each target in its bookmark
        inspector after adding the reference.
      </p>
    </>
  );
}
export function RegisterIssue({
  data,
  register,
}: {
  data: Dataset;
  register: (issue: Issue) => Promise<boolean>;
}) {
  const [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [state, setState] = useState<Issue["state"]>("OPEN"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const value = safeUrl(url),
        match = value && new URL(value).pathname.match(/\/issues\/(\d+)$/);
      if (!value || !match || new URL(value).hostname !== "github.com")
        throw new Error("Enter a GitHub issue URL ending in /issues/NUMBER.");
      if (!title.trim()) throw new Error("Enter the exact issue title.");
      if (
        await register({
          number: Number(match[1]),
          title: title.trim(),
          url: value,
          state,
          labels: [],
          body_snapshot: "",
          github_updated_at: new Date().toISOString(),
          snapshot_on: today(),
          scope: "user_added_issue",
        })
      ) {
        setSaved(true);
        setUrl("");
        setTitle("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3 className="font-semibold">Register another existing issue</h3>
      <p className="mt-2 mb-3 text-sm text-slate-500">
        Add its identity to the local catalog, then select it from a bookmark
        inspector.
      </p>
      <label className="field-label">
        Exact issue title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field-label mt-3">
        Issue URL
        <input
          placeholder={data.issue_catalog[0]?.url}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="field-label mt-3">
        Issue state
        <select
          value={state}
          onChange={(e) => setState(e.target.value as Issue["state"])}
        >
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
      </label>
      <button
        className="secondary mt-3"
        disabled={busy || !url || !title}
        onClick={() => void submit()}
      >
        Register issue
      </button>
      {saved && (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          Issue registered.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function ProposalBoard({
  data,
  update,
  register,
  focus,
}: {
  data: Dataset;
  update: (id: string, patch: Partial<Proposal>) => Promise<boolean>;
  register: (issue: Issue) => Promise<boolean>;
  focus: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.bookmarks_worth_their_own_issues.map((p) => (
        <div key={p.id} className="rounded-xl border border-slate-200 p-5">
          <span className="eyebrow !text-amber-700">PROPOSAL · {p.status}</span>
          <h3 className="mt-2 font-semibold">{p.title}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-500">{p.rationale}</p>
          <p className="mt-3 text-xs text-slate-400">
            {p.seed_bookmark_ids.length} seeds ·{" "}
            {p.approved_seed_bookmark_ids.length} approved
          </p>
          <div className="mt-4 flex gap-2">
            <button className="secondary" onClick={() => setEditing(p.id)}>
              Review proposal
            </button>
            <button
              className="text-xs"
              onClick={() =>
                focus(
                  p.created_issue_number
                    ? `issue:${p.created_issue_number}`
                    : `proposal:${p.id}`,
                )
              }
            >
              Show in graph
              <ArrowUpRight size={13} />
            </button>
          </div>
          {editing === p.id && (
            <Modal
              title="Review new-issue proposal"
              close={() => setEditing(null)}
            >
              <ProposalEditor
                proposal={p}
                data={data}
                update={update}
                register={register}
              />
            </Modal>
          )}
        </div>
      ))}
    </div>
  );
}
function ProposalEditor({
  proposal,
  data,
  update,
  register,
}: {
  proposal: Proposal;
  data: Dataset;
  update: (id: string, patch: Partial<Proposal>) => Promise<boolean>;
  register: (issue: Issue) => Promise<boolean>;
}) {
  const [p, setP] = useState(structuredClone(proposal)),
    [url, setUrl] = useState(proposal.created_issue_url ?? ""),
    [issueTitle, setIssueTitle] = useState(proposal.title),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const text = `# ${p.title}\n\n${p.rationale}\n\n## Questions\n${p.questions.map((q) => `- ${q}`).join("\n")}\n\n## References\n${p.approved_seed_bookmark_ids
    .map((id) => data.bookmarks.find((b) => b.id === id)!)
    .map(
      (b) =>
        `- [${b.display_title.replace(/[\[\]\\]/g, "\\$&")}](<${safeUrl(b.url)}>)`,
    )
    .join("\n")}`;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const ok = await update(p.id, {
        title: p.title,
        questions: p.questions,
        user_notes: p.user_notes,
        status: p.status,
        approved_seed_bookmark_ids: p.approved_seed_bookmark_ids,
      });
      setSaved(ok);
    } finally {
      setBusy(false);
    }
  }
  async function registerCreated() {
    setError("");
    setBusy(true);
    try {
      const parsed = safeUrl(url),
        match = parsed && new URL(parsed).pathname.match(/\/issues\/(\d+)$/);
      if (!parsed || !match)
        throw new Error(
          "Enter the GitHub issue URL, ending in /issues/NUMBER.",
        );
      const number = Number(match[1]),
        existing = data.issue_catalog.find((i) => i.number === number);
      if (existing && existing.url !== parsed)
        throw new Error(
          "This issue number is already registered with another URL.",
        );
      if (
        !existing &&
        !(await register({
          number,
          title: issueTitle,
          url: parsed,
          state: "OPEN",
          labels: p.suggested_labels,
          body_snapshot: "",
          github_updated_at: new Date().toISOString(),
          snapshot_on: today(),
          scope: "user_added_issue",
        }))
      )
        return;
      const ok = await update(p.id, {
        created_issue_number: number,
        created_issue_url: parsed,
        status: "created",
      });
      if (ok) {
        setP({
          ...p,
          created_issue_number: number,
          created_issue_url: parsed,
          status: "created",
        });
        setSaved(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label className="field-label">
        Proposal title
        <input
          value={p.title}
          onChange={(e) => {
            setP({ ...p, title: e.target.value });
            setSaved(false);
          }}
        />
      </label>
      <p className="my-4 text-sm text-slate-500">
        {p.overlap_with_existing_issues}
      </p>
      <label className="field-label">
        Questions, one per line
        <textarea
          rows={4}
          value={p.questions.join("\n")}
          onChange={(e) => {
            setP({
              ...p,
              questions: e.target.value.split("\n").filter(Boolean),
            });
            setSaved(false);
          }}
        />
      </label>
      <h3 className="mt-5 mb-3 font-semibold">Seed sources</h3>
      <div className="max-h-52 space-y-3 overflow-auto rounded-xl border border-slate-200 p-4">
        {p.seed_bookmark_ids.map((id) => {
          const b = data.bookmarks.find((b) => b.id === id)!;
          return (
            <label key={id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={p.approved_seed_bookmark_ids.includes(id)}
                onChange={(e) => {
                  setP({
                    ...p,
                    approved_seed_bookmark_ids: e.target.checked
                      ? [...p.approved_seed_bookmark_ids, id]
                      : p.approved_seed_bookmark_ids.filter((x) => x !== id),
                  });
                  setSaved(false);
                }}
              />
              <span>{b.display_title}</span>
            </label>
          );
        })}
      </div>
      <label className="field-label mt-4">
        Notes
        <textarea
          value={p.user_notes}
          onChange={(e) => {
            setP({ ...p, user_notes: e.target.value });
            setSaved(false);
          }}
        />
      </label>
      <label className="field-label mt-4">
        Approval
        <select
          value={p.status}
          onChange={(e) => {
            setP({ ...p, status: e.target.value as Proposal["status"] });
            setSaved(false);
          }}
        >
          <option value="suggested">Suggested</option>
          <option value="approved">Approved</option>
          {p.created_issue_number && <option value="created">Created</option>}
          <option value="rejected">
            Rejected — reassign affected bookmarks
          </option>
        </select>
      </label>
      <button
        className="primary mt-4"
        disabled={busy}
        onClick={() => void save()}
      >
        {saved ? "Saved" : "Save proposal"}
      </button>
      <h3 className="mt-7 mb-3 font-semibold">Issue body preview</h3>
      <textarea rows={8} className="!font-mono text-xs" readOnly value={text} />
      <button
        className="secondary mt-3"
        onClick={() => {
          const blob = new Blob([text], { type: "text/markdown" }),
            a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${p.id}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        <Download size={14} />
        Download draft
      </button>
      <p className="mt-2 text-xs text-slate-400">
        Seed approval and draft export do not select bookmark destinations or
        confirm placements.
      </p>
      <h3 className="mt-7 mb-3 font-semibold">Register the created issue</h3>
      <label className="field-label">
        Issue title
        <input
          value={issueTitle}
          onChange={(e) => setIssueTitle(e.target.value)}
        />
      </label>
      <label className="field-label mt-3">
        GitHub issue URL
        <input
          placeholder={`https://github.com/${data.metadata.repository}/issues/123`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <button
        className="secondary mt-3"
        disabled={busy || !url || !!p.created_issue_number}
        onClick={() => void registerCreated()}
      >
        {p.created_issue_number
          ? `Registered as #${p.created_issue_number}`
          : "Register issue"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
