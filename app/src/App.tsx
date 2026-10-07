import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Filter,
  Hand,
  LayoutGrid,
  List,
  Move,
  MousePointer2,
  Network,
  Search,
  Settings2,
  Eye,
  ListTree,
  X,
} from "lucide-react";
import type {
  Bookmark,
  BookmarkPatch,
  Dataset,
  Issue,
  Proposal,
} from "./data/types";
import {
  domain,
  inQueue,
  isComplete,
  queues,
  searchBookmark,
  type Queue,
} from "./data/selectors";
import { Graph, type View } from "./components/Graph";
import { HubList } from "./components/HubList";
import { ProgressSelect } from "./components/ProgressSelect";
import { ProgressFilters } from "./components/ProgressFilters";
import {
  matchesProgress,
  nodeProgress,
  progressLabels,
  readProgressFilter,
  progressStatuses,
  type ProgressFilter,
} from "./data/progress";
import { LayoutTuning } from "./components/LayoutTuning";
import { ZoomTuning } from "./components/ZoomTuning";
import {
  zoomDetailDefaults,
  readZoomDetails,
  type ZoomDetails,
} from "./data/zoom-details";
import { Inspector } from "./components/Inspector";
import {
  Drafts,
  IssueBoard,
  RegisterIssue,
  Modal,
  Progress,
  ProposalBoard,
} from "./components/Boards";
import {
  deriveGraph,
  bookmarksLinkedToHubTypes,
  hubTypes,
  readHubTypes,
  type HubType,
  graphVisibility,
  graphLayoutDefaults,
  readGraphLayoutSettings,
  type GraphLayoutSettings,
  type Position,
} from "./data/graph";
type Envelope = { data: Dataset; hash: string; token?: string };
type Preferences = {
  hubTypes: HubType[];
  bubbleProgress: ProgressFilter;
  hubProgress: ProgressFilter;
  hiddenHubs: string[];
  revealedHubs: string[];
  highlightedHubs: string[];
  zoomDetails: ZoomDetails;
  layoutSettings: GraphLayoutSettings;
  hubPerimeterSeeded: boolean;
  positions: Record<string, Position>;
  view: View | null;
  selection: string[];
  queue: Queue;
  lens: "proposed" | "approved";
  allEdges: boolean;
  filters: boolean;
  topic: string;
  focus: string | null;
  list: boolean;
  search: string;
  original: string;
  source: string;
  disposition: string;
  favorite: boolean;
};
const defaults: Preferences = {
  hubTypes: [...hubTypes],
  bubbleProgress: [...progressStatuses],
  hubProgress: [...progressStatuses],
  hiddenHubs: [],
  revealedHubs: [],
  highlightedHubs: [],
  zoomDetails: zoomDetailDefaults,
  layoutSettings: graphLayoutDefaults,
  hubPerimeterSeeded: false,
  positions: {},
  view: null,
  selection: [],
  queue: "unreviewed",
  lens: "proposed",
  allEdges: true,
  filters: false,
  topic: "",
  focus: null,
  list: false,
  search: "",
  original: "",
  source: "",
  disposition: "",
  favorite: false,
};
function readPrefs(id: string): Preferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(`bookmark-router:${id}`) ?? "null",
    );
    if (!stored || typeof stored !== "object") return defaults;
    const positions = Object.fromEntries(
      Object.entries(stored.positions ?? {}).filter(
        ([, p]) =>
          p &&
          typeof p === "object" &&
          Number.isFinite((p as Position).x) &&
          Number.isFinite((p as Position).y),
      ),
    );
    const zoomDetails = readZoomDetails(stored.zoomDetails);
    const v = stored.view;
    const view =
      v &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y) &&
      Number.isFinite(v.scale) &&
      v.scale >= 0.08 &&
      v.scale <= zoomDetails.maxZoom
        ? v
        : null;
    return {
      ...defaults,
      hubTypes: readHubTypes(stored.hubTypes),
      bubbleProgress: readProgressFilter(stored.bubbleProgress),
      hubProgress: readProgressFilter(stored.hubProgress),
      hiddenHubs: Array.isArray(stored.hiddenHubs)
        ? stored.hiddenHubs.filter((id: unknown) => typeof id === "string")
        : [],
      revealedHubs: Array.isArray(stored.revealedHubs)
        ? stored.revealedHubs.filter((id: unknown) => typeof id === "string")
        : [],
      highlightedHubs: Array.isArray(stored.highlightedHubs)
        ? stored.highlightedHubs.filter((id: unknown) => typeof id === "string")
        : [],
      zoomDetails,
      layoutSettings: readGraphLayoutSettings(stored.layoutSettings),
      hubPerimeterSeeded: stored.hubPerimeterSeeded === true,
      positions: positions as Record<string, Position>,
      view,
      selection: Array.isArray(stored.selection)
        ? stored.selection.filter((s: unknown) => typeof s === "string")
        : [],
      queue: queues.some((q) => q.id === stored.queue)
        ? stored.queue
        : defaults.queue,
      lens: stored.lens === "approved" ? "approved" : "proposed",
      allEdges: typeof stored.allEdges === "boolean" ? stored.allEdges : true,
      filters: !!stored.filters,
      topic: typeof stored.topic === "string" ? stored.topic : "",
      focus: typeof stored.focus === "string" ? stored.focus : null,
      list: !!stored.list,
      search: typeof stored.search === "string" ? stored.search : "",
      original: typeof stored.original === "string" ? stored.original : "",
      source: typeof stored.source === "string" ? stored.source : "",
      disposition:
        typeof stored.disposition === "string" ? stored.disposition : "",
      favorite: !!stored.favorite,
    };
  } catch {
    return defaults;
  }
}
export default function App() {
  const [data, setData] = useState<Dataset | null>(null),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [topicPreview, setTopicPreview] = useState<{
    id: string;
    classification: Bookmark["classification"];
  } | null>(null);
  const graphData = useMemo(
    () =>
      data && topicPreview
        ? {
            ...data,
            bookmarks: data.bookmarks.map((b) =>
              b.id === topicPreview.id
                ? { ...b, classification: topicPreview.classification }
                : b,
            ),
          }
        : data,
    [data, topicPreview],
  );
  const [search, setSearch] = useState(""),
    [mode, setMode] = useState<"select" | "pan">("select"),
    [board, setBoard] = useState<
      "progress" | "issues" | "proposals" | "drafts" | "settings" | null
    >(null),
    [actions, setActions] = useState(false),
    [zoomTuning, setZoomTuning] = useState(false),
    [layoutTuning, setLayoutTuning] = useState(false),
    [hubList, setHubList] = useState(false),
    [savingHubProgress, setSavingHubProgress] = useState(false);
  const [original, setOriginal] = useState(""),
    [source, setSource] = useState(""),
    [disposition, setDisposition] = useState(""),
    [favorite, setFavorite] = useState(false),
    [imported, setImported] = useState<Dataset | null>(null),
    [importPreview, setImportPreview] = useState("");
  const envelope = useRef<Envelope | null>(null),
    token = useRef(""),
    dirty = useRef(false),
    snapshot = useRef<string[]>([]);
  const preference = (patch: Partial<Preferences>) =>
    setPrefs((p) => ({ ...p, ...patch }));
  const returnContext = useRef<Preferences | null>(null);
  async function load(initial = false) {
    try {
      const res = await fetch("/api/dataset");
      const value = await res.json();
      if (!res.ok) throw new Error(value.error);
      envelope.current = value;
      token.current = value.token;
      setData(value.data);
      if (initial) {
        const pref = readPrefs(value.data.dataset_id);
        const ids = new Set(
          deriveGraph(value.data, pref.lens).nodes.map((n) => n.id),
        );
        pref.selection = pref.selection.filter((id) => ids.has(id));
        if (pref.focus && !ids.has(pref.focus)) pref.focus = null;
        if (
          pref.topic &&
          !value.data.category_review.categories.some(
            (c: { id: string }) => c.id === pref.topic,
          )
        )
          pref.topic = "";
        setPrefs(pref);
        setSearch(pref.search);
        setOriginal(pref.original);
        setSource(pref.source);
        setDisposition(pref.disposition);
        setFavorite(pref.favorite);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem(
          `bookmark-router:${data.dataset_id}`,
          JSON.stringify({
            ...prefs,
            search,
            original,
            source,
            disposition,
            favorite,
          }),
        );
      } catch {
        setNotice(
          "View preferences could not be saved in this browser. Bookmark decisions still save to disk.",
        );
      }
    }
  }, [
    prefs,
    data?.dataset_id,
    search,
    original,
    source,
    disposition,
    favorite,
  ]);
  async function request(path: string, body: object, method = "POST") {
    try {
      const latest = envelope.current!;
      const res = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": token.current,
        },
        body: JSON.stringify({
          revision: latest.data.metadata.revision,
          hash: latest.hash,
          ...body,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (result.data) {
        envelope.current = result;
        setData(result.data);
      }
      setError("");
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  const save = async (id: string, patch: BookmarkPatch) =>
    !!(await request(`/api/bookmarks/${id}`, { patch }, "PATCH"));
  const updateProposal = async (id: string, patch: Partial<Proposal>) =>
    !!(await request(`/api/proposals/${id}`, { patch }, "PATCH"));
  const registerIssue = async (issue: Issue) =>
    !!(await request("/api/catalog/issues", { issue }));
  const graph = useMemo(
    () =>
      graphData ? deriveGraph(graphData, prefs.lens) : { nodes: [], edges: [] },
    [graphData, prefs.lens],
  );
  const linkedBookmarks = useMemo(
    () => bookmarksLinkedToHubTypes(graph, prefs.hubTypes),
    [graph, prefs.hubTypes],
  );
  const matching = useMemo(
    () =>
      data?.bookmarks.filter((b) => {
        if (!linkedBookmarks.has(`bookmark:${b.id}`)) return false;
        if (
          !matchesProgress(
            nodeProgress(data, `bookmark:${b.id}`),
            prefs.bubbleProgress,
          )
        )
          return false;
        if (!inQueue(b, prefs.queue, data) || !searchBookmark(b, search, data))
          return false;
        if (prefs.topic) {
          const c = b.classification;
          const topics =
            prefs.lens === "proposed"
              ? [c.proposed_category_id, ...c.proposed_secondary_category_ids]
              : [c.approved_category_id, ...c.approved_secondary_category_ids];
          if (!topics.includes(prefs.topic)) return false;
        }
        if (
          prefs.focus &&
          !graph.edges.some(
            (e) => e.source === `bookmark:${b.id}` && e.target === prefs.focus,
          )
        )
          return false;
        return (
          (!original || b.original.category === original) &&
          (!source || b.source_type === source) &&
          (!disposition || b.processing.disposition === disposition) &&
          (!favorite || b.favorite)
        );
      }) ?? [],
    [
      data,
      prefs.queue,
      prefs.bubbleProgress,
      prefs.topic,
      prefs.focus,
      prefs.lens,
      search,
      original,
      source,
      disposition,
      favorite,
      graph,
      linkedBookmarks,
    ],
  );
  const filterSignature = JSON.stringify([
    prefs.hubTypes,
    prefs.bubbleProgress,
    prefs.hubProgress,
    prefs.queue,
    prefs.topic,
    prefs.focus,
    prefs.lens,
    search,
    original,
    source,
    disposition,
    favorite,
  ]);
  const previousFilterSignature = useRef(filterSignature);
  const [filterRevision, setFilterRevision] = useState(0);
  useEffect(() => {
    if (previousFilterSignature.current === filterSignature) return;
    previousFilterSignature.current = filterSignature;
    setFilterRevision((revision) => revision + 1);
  }, [filterSignature]);
  useEffect(() => {
    snapshot.current = matching.map((b) => b.id);
  }, [matching]);
  function select(id: string, multi = false) {
    if (
      dirty.current &&
      !window.confirm("Discard unsaved inspector changes and change selection?")
    )
      return false;
    dirty.current = false;
    preference({
      selection: multi
        ? prefs.selection.includes(id)
          ? prefs.selection.filter((n) => n !== id)
          : [...prefs.selection, id]
        : [id],
    });
    return true;
  }
  function toggleHubSelection(id: string) {
    if (prefs.selection.includes(id)) {
      select(id, true);
      return;
    }
    if (!select(id)) return;
    preference({
      hiddenHubs: prefs.hiddenHubs.filter((hubId) => hubId !== id),
      revealedHubs: [...new Set([...prefs.revealedHubs, id])],
    });
  }
  function navigate(direction: number) {
    const current = prefs.selection[0]?.replace("bookmark:", "");
    const ids = snapshot.current.filter((id) =>
      data?.bookmarks.some((b) => b.id === id),
    );
    const index = ids.indexOf(current);
    if (ids.length)
      select(`bookmark:${ids[(index + direction + ids.length) % ids.length]}`);
  }
  function focus(id: string) {
    returnContext.current = {
      ...prefs,
      search,
      original,
      source,
      disposition,
      favorite,
    };
    resetFilters();
    preference({
      bubbleProgress: prefs.bubbleProgress,
      hubProgress: prefs.hubProgress,
      hubTypes: prefs.hubTypes,
    });
    preference({ focus: id, selection: [id], queue: "all", topic: "" });
    setBoard(null);
  }
  function clearFocus() {
    const previous = returnContext.current;
    if (previous) {
      preference({ ...previous, positions: prefs.positions });
      setSearch(previous.search);
      setOriginal(previous.original);
      setSource(previous.source);
      setDisposition(previous.disposition);
      setFavorite(previous.favorite);
      returnContext.current = null;
    } else preference({ focus: null });
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || board) return;
      if (hubList) {
        setHubList(false);
        return;
      }
      if (zoomTuning) {
        setZoomTuning(false);
        return;
      }
      if (layoutTuning) {
        setLayoutTuning(false);
        return;
      }
      if (!prefs.selection.length) return;
      if (
        dirty.current &&
        !window.confirm("Discard unsaved inspector changes?")
      )
        return;
      dirty.current = false;
      preference({ selection: [] });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [prefs.selection, hubList, zoomTuning, layoutTuning, board]);
  const { shownHubs } = graphVisibility(
    graph,
    new Set(matching.map((b) => b.id)),
    prefs.selection,
    prefs.hiddenHubs,
    prefs.revealedHubs,
    prefs.bubbleProgress,
    prefs.hubProgress,
    readProgressFilter(prefs.queue === "completed" ? "done" : prefs.queue),
    prefs.hubTypes,
  );
  const selected = data?.bookmarks.find(
    (b) =>
      prefs.selection.length === 1 && `bookmark:${b.id}` === prefs.selection[0],
  );
  const hub = graph.nodes.find(
    (n) =>
      prefs.selection.length === 1 &&
      n.id === prefs.selection[0] &&
      n.kind !== "bookmark",
  );
  const selectedBookmarks =
    data?.bookmarks.filter((b) =>
      prefs.selection.includes(`bookmark:${b.id}`),
    ) ?? [];
  const groups = [
    ...new Set(data?.category_review.categories.map((c) => c.group) ?? []),
  ];
  const complete =
    data?.bookmarks.filter((b) => isComplete(b, data)).length ?? 0;
  const resetFilters = () => {
    preference({
      queue: "all",
      topic: "",
      focus: null,
      bubbleProgress: [...progressStatuses],
      hubProgress: [...progressStatuses],
      hubTypes: [...hubTypes],
    });
    setSearch("");
    setOriginal("");
    setSource("");
    setDisposition("");
    setFavorite(false);
  };
  if (!data)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <Network className="mx-auto mb-4 text-emerald-700" size={32} />
          <h1 className="text-xl font-semibold">Bookmark Router</h1>
          <p role="status" className="mt-3 text-sm text-slate-500">
            {loading ? "Loading your bookmarks…" : error}
          </p>
          {!loading && (
            <button className="primary mt-4" onClick={() => void load(true)}>
              Retry
            </button>
          )}
        </div>
      </main>
    );
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-[76px] shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-800 text-white">
            <Network size={21} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-800">
              Bookmark Router
            </h1>
            <p className="hidden text-[11px] text-slate-400 sm:block">
              A home for every reference
            </p>
          </div>
        </div>
        <div className="relative hidden w-[min(28vw,380px)] sm:block">
          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            aria-label="Search bookmarks and issues"
            className="!bg-slate-50 !pl-9 !text-xs"
            placeholder="Search bookmarks, notes, or issue #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            className="hidden text-xs text-slate-500 sm:inline-flex"
            onClick={() => setBoard("progress")}
          >
            <span className="size-2 rounded-full bg-emerald-600" />
            <span className="font-semibold text-slate-700">
              {complete} / {data.bookmarks.length}
            </span>{" "}
            complete
          </button>
          <button
            className="secondary"
            aria-label="Progress"
            onClick={() => setBoard("progress")}
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Progress</span>
          </button>
          <div className="relative">
            <button
              className="primary !px-3 !py-2"
              aria-expanded={actions}
              onClick={() => setActions(!actions)}
            >
              Actions
              <ChevronDown size={14} />
            </button>
            {actions && (
              <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {[
                  { id: "issues", label: "Existing issue board" },
                  { id: "proposals", label: "New-issue proposals" },
                  { id: "drafts", label: "Prepare references" },
                  { id: "settings", label: "Import / export & view" },
                ].map((a) => (
                  <button
                    className="w-full justify-start text-xs"
                    key={a.id}
                    onClick={() => {
                      setBoard(a.id as typeof board);
                      setActions(false);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-800"
        >
          <span className="whitespace-pre-line">{error}</span>
          <button className="secondary shrink-0" onClick={() => void load()}>
            Reload dataset
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2 text-xs"
        >
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <nav
          className="z-20 flex w-14 shrink-0 flex-col items-center gap-3 border-r border-slate-200 bg-white pt-5"
          aria-label="Canvas tools"
        >
          {[
            {
              id: "select",
              label: "Select bubbles",
              icon: MousePointer2,
              active: mode === "select",
              click: () => setMode("select"),
            },
            {
              id: "pan",
              label: "Pan canvas",
              icon: Hand,
              active: mode === "pan",
              click: () => setMode("pan"),
            },
            {
              id: "filters",
              label: "Toggle filters",
              icon: Filter,
              active: prefs.filters,
              click: () => {
                const open = !prefs.filters;
                preference({ filters: open });
                if (open) setHubList(false);
              },
            },
            {
              id: "hubs",
              label: "Hub list",
              icon: ListTree,
              active: hubList,
              click: () => {
                const open = !hubList;
                setHubList(open);
                if (open) preference({ filters: false });
                setZoomTuning(false);
                setLayoutTuning(false);
              },
            },
          ].map((t) => (
            <button
              key={t.id}
              title={t.label}
              aria-label={t.label}
              aria-pressed={t.active}
              className={
                t.active ? "!bg-emerald-50 text-emerald-800" : "text-slate-400"
              }
              onClick={t.click}
            >
              <t.icon size={18} />
            </button>
          ))}
          <div className="mt-auto mb-4 flex flex-col items-center gap-3">
            <button
              className={`${zoomTuning ? "!bg-emerald-50 text-emerald-800" : "text-slate-400"}`}
              title="Zoom detail tuning"
              aria-label="Zoom detail tuning"
              aria-pressed={zoomTuning}
              onClick={() => {
                setZoomTuning((open) => !open);
                setHubList(false);
                setLayoutTuning(false);
              }}
            >
              <Eye size={18} />
            </button>
            <button
              className={`${layoutTuning ? "!bg-emerald-50 text-emerald-800" : "text-slate-400"}`}
              title="Graph layout tuning"
              aria-label="Graph layout tuning"
              aria-pressed={layoutTuning}
              onClick={() => {
                setLayoutTuning((open) => !open);
                setHubList(false);
                setZoomTuning(false);
              }}
            >
              <Move size={18} />
            </button>
            <button
              className="text-slate-400"
              title="Settings"
              aria-label="Settings"
              onClick={() => setBoard("settings")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </nav>
        {prefs.filters && (
          <aside
            className="filter-drawer w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-5"
            aria-label="Bookmark filters"
          >
            <div className="mb-5 flex justify-between">
              <h2 className="text-sm font-semibold">Review queues</h2>
              <button
                className="!p-0 text-slate-400"
                aria-label="Close filters"
                onClick={() => preference({ filters: false })}
              >
                <X size={15} />
              </button>
            </div>
            <div className="relative mb-4 sm:hidden">
              <input
                aria-label="Search bookmarks"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {[
              {
                label: "",
                entries: queues.filter(
                  (q) =>
                    ![
                      "pending",
                      "in_progress",
                      "completed",
                      "dropped",
                    ].includes(q.id),
                ),
              },
              {
                label: "Progress queues",
                entries: queues.filter((q) =>
                  ["pending", "in_progress", "completed", "dropped"].includes(
                    q.id,
                  ),
                ),
              },
            ].map(({ label, entries }) => (
              <section
                key={label}
                className={label ? "mt-4 border-t border-slate-100 pt-4" : ""}
              >
                {label && <h3 className="eyebrow mb-2">{label}</h3>}
                <div className="space-y-1">
                  {entries.map((q) => (
                    <button
                      key={q.id}
                      className={`w-full justify-between !px-3 !py-2.5 !text-xs ${prefs.queue === q.id ? "!bg-emerald-50 font-medium text-emerald-800" : "text-slate-500"}`}
                      onClick={() => {
                        if (prefs.queue === q.id)
                          setFilterRevision((revision) => revision + 1);
                        else preference({ queue: q.id });
                      }}
                    >
                      <span>{q.label}</span>
                      <span className="text-[10px] tabular-nums opacity-60">
                        {
                          data.bookmarks.filter((b) => inQueue(b, q.id, data))
                            .length
                        }
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <div className="my-5 border-t border-slate-100" />
            <section aria-label="Progress filter" className="mb-5">
              <h3 className="eyebrow">Progress filter</h3>
              <ProgressFilters
                label="Bubble progress"
                value={prefs.bubbleProgress}
                onChange={(bubbleProgress) => preference({ bubbleProgress })}
              />
              <ProgressFilters
                label="Hub progress"
                value={prefs.hubProgress}
                onChange={(hubProgress) => preference({ hubProgress })}
              />
            </section>
            <label className="field-label">
              Topic lens
              <select
                value={prefs.lens}
                onChange={(e) =>
                  preference({ lens: e.target.value as Preferences["lens"] })
                }
              >
                <option value="proposed">Proposed topics</option>
                <option value="approved">Approved topics</option>
              </select>
            </label>
            <label className="field-label mt-4">
              Topic
              <select
                value={prefs.topic}
                onChange={(e) => preference({ topic: e.target.value })}
              >
                <option value="">All topics</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {data.category_review.categories
                      .filter((c) => c.group === g)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <details className="mt-5 text-xs text-slate-500">
              <summary>More filters</summary>
              <label className="field-label mt-3">
                Original category
                <select
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                >
                  <option value="">All original categories</option>
                  {data.category_review.original_distribution.map((c) => (
                    <option key={c.category}>{c.category}</option>
                  ))}
                </select>
              </label>
              <label className="field-label mt-3">
                Destination hub
                <select
                  value={prefs.focus ?? ""}
                  onChange={(e) =>
                    preference({ focus: e.target.value || null })
                  }
                >
                  <option value="">All destinations</option>
                  {graph.nodes
                    .filter((n) => n.kind === "issue" || n.kind === "proposal")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label mt-3">
                Source type
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">All sources</option>
                  {[...new Set(data.bookmarks.map((b) => b.source_type))].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field-label mt-3">
                Disposition
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                >
                  <option value="">Every disposition</option>
                  {[
                    "undecided",
                    "attach",
                    "keep",
                    "skip",
                    "duplicate",
                    "defer",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                />
                Favorites only
              </label>
            </details>
            <button
              className="mt-5 w-full text-xs text-slate-400"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </aside>
        )}
        {hubList && (
          <HubList
            hubs={graph.nodes.filter((n) => n.kind !== "bookmark")}
            shown={shownHubs}
            progress={prefs.hubProgress}
            onProgress={(hubProgress) => preference({ hubProgress })}
            kinds={prefs.hubTypes}
            onKinds={(hubTypes) => preference({ hubTypes })}
            highlighted={prefs.highlightedHubs}
            selected={prefs.selection}
            toggleSelection={toggleHubSelection}
            toggleVisible={(id) => {
              const hide = shownHubs.has(id);
              preference({
                hiddenHubs: hide
                  ? [...prefs.hiddenHubs, id]
                  : prefs.hiddenHubs.filter((n) => n !== id),
                revealedHubs: hide
                  ? prefs.revealedHubs.filter((n) => n !== id)
                  : [...new Set([...prefs.revealedHubs, id])],
                highlightedHubs: hide
                  ? prefs.highlightedHubs.filter((n) => n !== id)
                  : prefs.highlightedHubs,
                selection: hide
                  ? prefs.selection.filter((n) => n !== id)
                  : prefs.selection,
              });
            }}
            toggleHighlight={(id) => {
              const remove = prefs.highlightedHubs.includes(id);
              preference({
                highlightedHubs: remove
                  ? prefs.highlightedHubs.filter((n) => n !== id)
                  : [...prefs.highlightedHubs, id],
                ...(!remove
                  ? {
                      hiddenHubs: prefs.hiddenHubs.filter((n) => n !== id),
                      revealedHubs: [...new Set([...prefs.revealedHubs, id])],
                    }
                  : {}),
              });
            }}
            close={() => setHubList(false)}
          />
        )}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-[87px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4 sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  Your bookmarks, connected
                </h2>
                <span className="pill hidden sm:inline-flex">
                  {prefs.lens} topics
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {matching.length}{" "}
                {matching.length === 1 ? "bookmark" : "bookmarks"} ·{" "}
                {queues.find((q) => q.id === prefs.queue)?.label}
                {prefs.focus ? " · focused hub" : ""}{" "}
                <span className="hidden lg:inline">
                  · select a bubble to review
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                  aria-label="Graph view"
                  aria-pressed={!prefs.list}
                  className={!prefs.list ? "!bg-slate-100" : ""}
                  onClick={() => preference({ list: false })}
                >
                  <Network size={15} />
                </button>
                <button
                  aria-label="Compact list view"
                  aria-pressed={prefs.list}
                  className={prefs.list ? "!bg-slate-100" : ""}
                  onClick={() => preference({ list: true })}
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>
          {prefs.focus && (
            <div className="flex items-center justify-between bg-white px-5 py-2 text-xs text-slate-500">
              <span>
                Focused on{" "}
                {graph.nodes.find((n) => n.id === prefs.focus)?.label}
              </span>
              <button className="!py-1 text-xs" onClick={clearFocus}>
                Clear focus
                <X size={12} />
              </button>
            </div>
          )}
          {prefs.list ? (
            <div
              className="min-h-0 flex-1 overflow-y-auto bg-white p-4"
              aria-label="Compact bookmark navigation"
            >
              <div className="mx-auto max-w-3xl">
                {matching.map((b) => (
                  <button
                    key={b.id}
                    className={`mb-2 w-full justify-between gap-4 rounded-xl border p-4 text-left ${prefs.selection.includes(`bookmark:${b.id}`) ? "border-emerald-300 bg-emerald-50" : "border-slate-100"}`}
                    onClick={(e) => select(`bookmark:${b.id}`, e.shiftKey)}
                  >
                    <span>
                      <span className="block text-sm font-medium">
                        {b.display_title}
                      </span>
                      <span className="mt-2 block text-xs text-slate-400">
                        {domain(b.url)} ·{" "}
                        {
                          data.category_review.categories.find(
                            (c) =>
                              c.id === b.classification.proposed_category_id,
                          )?.label
                        }
                      </span>
                    </span>
                    <span className="pill shrink-0">
                      {progressLabels[nodeProgress(data, `bookmark:${b.id}`)]}
                    </span>
                  </button>
                ))}
                {!matching.length && (
                  <p className="p-8 text-center text-sm text-slate-400">
                    No bookmarks match. Clear your filters or choose another
                    queue.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Graph
              data={graphData!}
              bubbleProgress={prefs.bubbleProgress}
              bubbleQueueProgress={readProgressFilter(
                prefs.queue === "completed" ? "done" : prefs.queue,
              )}
              hubProgress={prefs.hubProgress}
              hubTypes={prefs.hubTypes}
              zoomDetails={prefs.zoomDetails}
              hiddenHubs={prefs.hiddenHubs}
              revealedHubs={prefs.revealedHubs}
              highlightedHubs={prefs.highlightedHubs}
              lens={prefs.lens}
              filterRevision={filterRevision}
              visible={new Set(matching.map((b) => b.id))}
              selected={prefs.selection}
              focus={prefs.focus}
              mode={mode}
              allEdges={prefs.allEdges}
              onToggleAllEdges={() => preference({ allEdges: !prefs.allEdges })}
              layoutSettings={prefs.layoutSettings}
              hubPerimeterSeeded={prefs.hubPerimeterSeeded}
              positions={prefs.positions}
              view={prefs.view}
              onPositions={(positions, hubPerimeterSeeded) =>
                preference({
                  positions,
                  ...(hubPerimeterSeeded ? { hubPerimeterSeeded: true } : {}),
                })
              }
              onView={(view) => preference({ view })}
              onSelect={select}
              onEdge={setNotice}
            />
          )}
          <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Local dataset · revision {data.metadata.revision}
            </span>
            <span>
              {prefs.list
                ? "Shift-click for multiple selection"
                : "Scroll to zoom · drag to arrange · shift-select multiple"}
            </span>
          </footer>
        </section>
        {selected && (
          <Inspector
            key={selected.id}
            bookmark={selected}
            onTopicPreview={setTopicPreview}
            data={data}
            save={save}
            undo={async (id) =>
              !!(await request(`/api/bookmarks/${id}/undo`, {}))
            }
            close={() => {
              if (
                !dirty.current ||
                window.confirm("Discard unsaved inspector changes?")
              ) {
                dirty.current = false;
                preference({ selection: [] });
              }
            }}
            navigate={navigate}
            pinned={!!prefs.positions[`bookmark:${selected.id}`]?.pinned}
            pin={() => {
              const id = `bookmark:${selected.id}`,
                p = prefs.positions[id];
              if (p)
                preference({
                  positions: {
                    ...prefs.positions,
                    [id]: { ...p, pinned: !p.pinned },
                  },
                });
            }}
            onDirty={(value) => {
              dirty.current = value;
            }}
          />
        )}
        {hub && (
          <aside className="inspector w-[340px] border-l border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <span className="eyebrow">{hub.kind.toUpperCase()} HUB</span>
              <button
                aria-label="Close hub details"
                onClick={() => preference({ selection: [] })}
              >
                <X size={17} />
              </button>
            </div>
            <h2 className="mt-5 text-xl font-semibold">{hub.label}</h2>
            <span
              className={`pill mt-3 ${hub.progress === "done" ? "!bg-emerald-50 !text-emerald-700" : hub.progress === "dropped" ? "!bg-rose-50 !text-rose-700" : ""}`}
            >
              {progressLabels[hub.progress]}
            </span>
            <ProgressSelect
              value={hub.progress}
              disabled={savingHubProgress}
              onChange={async (progress) => {
                if (!progress) return;
                setSavingHubProgress(true);
                try {
                  await request(
                    `/api/nodes/${encodeURIComponent(hub.id)}/progress`,
                    { progress },
                    "PATCH",
                  );
                } finally {
                  setSavingHubProgress(false);
                }
              }}
            />
            <p className="mt-3 text-sm text-slate-500">
              {hub.subtitle} · {hub.count} related bookmarks
            </p>
            <button
              className="primary mt-6 w-full"
              onClick={() => {
                focus(hub.id);
              }}
            >
              Focus related bookmarks
              <ArrowUpRight size={14} />
            </button>
            {hub.kind !== "topic" && (
              <button
                className="secondary mt-3 w-full"
                onClick={() =>
                  setBoard(hub.kind === "issue" ? "issues" : "proposals")
                }
              >
                Open {hub.kind === "issue" ? "issue" : "proposal"} board
              </button>
            )}
            <button
              className="secondary mt-3 w-full"
              onClick={() => {
                const pt = prefs.positions[hub.id];
                if (pt)
                  preference({
                    positions: {
                      ...prefs.positions,
                      [hub.id]: { ...pt, pinned: !pt.pinned },
                    },
                  });
              }}
            >
              {prefs.positions[hub.id]?.pinned ? "Unpin hub" : "Pin hub"}
            </button>
            <p className="mt-6 text-xs leading-5 text-slate-400">
              Hubs attract related bookmarks. Moving a hub changes layout only.
            </p>
          </aside>
        )}
        {selectedBookmarks.length > 1 && (
          <aside className="inspector w-[330px] border-l border-slate-200 bg-white p-6">
            <div className="flex justify-between">
              <h2 className="font-semibold">
                {selectedBookmarks.length} bookmarks selected
              </h2>
              <button
                onClick={() => preference({ selection: [] })}
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Approve each bookmark's proposed topic. Progress updates to
              reflect the review workflow.
            </p>
            <button
              className="primary mt-5 w-full"
              onClick={async () => {
                await request("/api/bookmarks/bulk-topic", {
                  ids: selectedBookmarks.map((b) => b.id),
                });
              }}
            >
              Approve proposed topics
            </button>
            <p className="mt-5 text-xs text-slate-400">
              Select one bookmark to choose destinations and confirm its
              placements.
            </p>
          </aside>
        )}
      </div>
      {zoomTuning && (
        <ZoomTuning
          value={prefs.zoomDetails}
          zoom={prefs.view?.scale ?? 1}
          onChange={(zoomDetails) => preference({ zoomDetails })}
          close={() => setZoomTuning(false)}
        />
      )}
      {layoutTuning && (
        <LayoutTuning
          value={prefs.layoutSettings}
          onApply={(layoutSettings) => preference({ layoutSettings })}
          close={() => setLayoutTuning(false)}
        />
      )}
      {board && (
        <Modal
          title={
            {
              progress: "Review & placement progress",
              issues: "Existing issues",
              proposals: "New-issue proposals",
              drafts: "Reference drafts",
              settings: "Dataset & view settings",
            }[board]
          }
          close={() => setBoard(null)}
        >
          {board === "progress" && (
            <Progress
              data={data}
              navigate={(queue) => {
                preference({ queue, focus: null });
                setBoard(null);
              }}
            />
          )}
          {board === "issues" && <IssueBoard data={data} focus={focus} />}
          {board === "proposals" && (
            <ProposalBoard
              data={data}
              update={updateProposal}
              register={registerIssue}
              focus={focus}
            />
          )}
          {board === "drafts" && <Drafts data={data} />}
          {board === "settings" && (
            <div className="space-y-7">
              <section>
                <h3 className="font-semibold">Portable working dataset</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {data.bookmarks.length} bookmarks · {data.dataset_id} ·
                  revision {data.metadata.revision}
                </p>
                <a
                  className="secondary mt-4"
                  href="/api/export"
                  download="bookmarks.json"
                >
                  Download complete JSON
                </a>
              </section>
              <RegisterIssue data={data} register={registerIssue} />
              <section>
                <h3 className="font-semibold">Import a dataset</h3>
                <p className="mt-2 mb-3 text-sm text-slate-500">
                  Preview and validate before replacing the working file. A
                  backup is created when you confirm.
                </p>
                <input
                  aria-label="Import JSON file"
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImported(null);
                    setImportPreview("");
                    try {
                      const candidate = JSON.parse(await file.text());
                      const result = await request("/api/import", {
                        data: candidate,
                        confirm: false,
                      });
                      if (result) {
                        setImported(candidate);
                        setImportPreview(
                          `${result.preview.count} bookmarks · ${result.preview.dataset_id}`,
                        );
                      }
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
                {imported && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm">Preview: {importPreview}</p>
                    <button
                      className="primary mt-3"
                      onClick={async () => {
                        if (
                          await request("/api/import", {
                            data: imported,
                            confirm: true,
                          })
                        ) {
                          setImported(null);
                          dirty.current = false;
                          setPrefs({ ...defaults });
                          setSearch("");
                          setOriginal("");
                          setSource("");
                          setDisposition("");
                          setFavorite(false);
                          setBoard(null);
                        }
                      }}
                    >
                      Confirm replacement
                    </button>
                  </div>
                )}
              </section>
              <section>
                <h3 className="font-semibold">Canvas preferences</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Positions, pins, layout physics, zoom, and filters are saved
                  in this browser, separately from bookmark decisions.
                </p>
                <button
                  className="secondary mt-4"
                  onClick={() => {
                    setPrefs({ ...defaults });
                    setSearch("");
                    setOriginal("");
                    setSource("");
                    setDisposition("");
                    setFavorite(false);
                    setNotice(
                      "Canvas preferences reset. Bookmark decisions are unchanged.",
                    );
                    setBoard(null);
                  }}
                >
                  Reset view preferences
                </button>
              </section>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
