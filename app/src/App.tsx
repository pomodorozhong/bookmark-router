import { useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./components/GraphCanvas";
import { WorkspaceFeedback } from "./components/WorkspaceFeedback";
import {
  fields,
  guessMapping,
  previewImport,
  type Candidate,
  type Field,
  type Format,
  type Mapping,
  type ParsedImport,
} from "./domain/imports";
import { bookmarkSample, readingSample } from "./domain/samples";
import {
  emptyWorkspace,
  isWebUrl,
  type CopyPreset,
  type Filter,
  type SavedView,
  type Workspace,
  type Geometry,
} from "./domain/model";
import { filterBubbles } from "./domain/filters";
import { composeCopy, defaultCopyOptions } from "./domain/copy";
import { WorkspaceStore } from "./domain/storage";
import { ConflictError, type Command } from "./domain/commands";
import { undoConflicts } from "./domain/import-commands";
import { AssetPreview } from "./components/AssetPreview";
import { RecordEditor } from "./components/RecordEditor";
import { usePanelFocus } from "./components/usePanelFocus";
import { Dialog } from "./components/Dialog";
import { Icon, IconButton, type IconName } from "./components/Icon";
import { StatusPropagationDialog } from "./components/StatusPropagationDialog";
import { BulkStatusDialog } from "./components/BulkStatusDialog";
import { FilterDialog } from "./components/FilterDialog";
import { CopyComposerDialog } from "./components/CopyComposerDialog";
import { MediaUploadDialog } from "./components/MediaUploadDialog";
const store = new WorkspaceStore();
function activeCollection() {
  try {
    return localStorage.getItem("bubble-tag-active");
  } catch {
    return null;
  }
}
function rememberCollection(id: string) {
  try {
    localStorage.setItem("bubble-tag-active", id);
  } catch {
    /* IndexedDB content still persists when preferences are unavailable. */
  }
}
const fieldLabels: Record<Field, string> = {
  title: "Title",
  description: "Description",
  url: "URL",
  mediaUrl: "Media URL",
  status: "Action status",
  tags: "Tags",
  tagType: "Tag type",
};
const steps = ["Source", "Map fields", "Review", "Confirm"];
const sources = [
  { id: "urls", label: "Paste links", hint: "One URL per line", icon: "external" },
  { id: "csv", label: "CSV / TSV", hint: "Map your own columns", icon: "file" },
  {
    id: "html",
    label: "Bookmark HTML",
    hint: "Browser bookmark exports",
    icon: "bookmark",
  },
  {
    id: "json",
    label: "Workspace JSON",
    hint: "Versioned portable backup",
    icon: "json",
  },
] satisfies Array<{ id: string; label: string; hint: string; icon: IconName }>;
export default function App() {
  const [screen, setScreen] = useState<"import" | "workspace">("import"),
    [step, setStep] = useState(0),
    [text, setText] = useState(""),
    [filename, setFilename] = useState(""),
    [format, setFormat] = useState<Format>("auto");
  const [parsed, setParsed] = useState<ParsedImport>(),
    [mapping, setMapping] = useState<Mapping>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [delimiter, setDelimiter] = useState("|"),
    [commonTags, setCommonTags] = useState(""),
    [initialStatus, setInitialStatus] = useState("Pending");
  const [workspace, setWorkspace] = useState(() => emptyWorkspace());
  const [choices, setChoices] = useState<
      Record<number, "skip" | "keep" | "merge">
    >({}),
    [excluded, setExcluded] = useState<Set<number>>(new Set()),
    [selected, setSelected] = useState<string>(),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [list, setList] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(true),
    [manageMemberships, setManageMemberships] = useState(false);
  const [loaded, setLoaded] = useState(false),
    [collections, setCollections] = useState<Workspace[]>([]),
    [geometry, setGeometry] = useState<Geometry>(),
    [editing, setEditing] = useState<string>(),
    [history, setHistory] = useState(false),
    [undoBatch, setUndoBatch] = useState<string>(),
    [notice, setNotice] = useState(""),
    [promptKind, setPromptKind] = useState<"collection" | "tag">(),
    [promptValue, setPromptValue] = useState("");
  const [statusDialogTag, setStatusDialogTag] = useState<string>(),
    [nextUndo, setNextUndo] = useState<Awaited<ReturnType<WorkspaceStore["nextUndo"]>>>(),
    [undoMessage, setUndoMessage] = useState<string>(),
    [filterDialogOpen, setFilterDialogOpen] = useState(false),
    [copyDialogTag, setCopyDialogTag] = useState<string>(),
    [bulkStatusOpen, setBulkStatusOpen] = useState(false),
    [mediaDialogOpen, setMediaDialogOpen] = useState(false),
    [activeFilter, setActiveFilter] = useState<Filter>({ op: "all", rules: [] }),
    [hiddenTagIds, setHiddenTagIds] = useState<string[]>([]),
    [viewSort, setViewSort] = useState<SavedView["sort"]>("title"),
    [activeViewId, setActiveViewId] = useState<string>();
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>(
      {},
    ),
    [typeMapping, setTypeMapping] = useState<Record<string, string>>({}),
    [invalidAcknowledged, setInvalidAcknowledged] = useState(false),
    [reviewTarget, setReviewTarget] = useState<Workspace>();
  const graphRef = useRef<GraphCanvasHandle>(null);
  const collectionPickerRef = useRef<HTMLDivElement>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  usePanelFocus(panelOpen && loaded, "#left-panel", 820, () => setPanelOpen(false));
  usePanelFocus(inspectorOpen && screen === "workspace", ".inspector", 600, () => setInspectorOpen(false));
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const submitting = useRef(false),
    workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  useEffect(() => {
    if (!collectionMenuOpen) return;
    collectionPickerRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!collectionPickerRef.current?.contains(event.target as Node)) {
        setCollectionMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setCollectionMenuOpen(false);
        collectionPickerRef.current?.querySelector<HTMLElement>(".collection-select")?.focus();
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const options = Array.from(collectionPickerRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
        const current = options.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [collectionMenuOpen]);
  useEffect(() => {
    let active = true;
    const storageTimeout = window.setTimeout(() => {
      if (active) setError("Local storage is taking longer than expected. Close other pages for this app and reload. If it still waits, restart the browser.");
    }, 10000);
    void store
      .list()
      .then(async (all) => {
        let w = all.find((w) => w.id === activeCollection()) ?? all[0];
        if (!w) {
          w = emptyWorkspace();
          await store.create(w);
          all = [w];
        }
        if (active) {
          setWorkspace(w);
          setCollections(all);
          setGeometry(await store.getGeometry(w.id));
          setNextUndo(await store.nextUndo(w.id));
          setError("");
          setLoaded(true);
          if (w.bubbles.length) setScreen("workspace");
        }
      })
      .catch((e) => { if (active) setError("Unable to open local storage: " + String(e)); })
      .finally(() => window.clearTimeout(storageTimeout));
    return () => {
      active = false;
      window.clearTimeout(storageTimeout);
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const refresh = () => {
      void store.get(workspaceRef.current.id).then((w) => {
        if (w && w.revision !== workspaceRef.current.revision) {
          setWorkspace(w);
          void store.nextUndo(w.id).then(setNextUndo);
          setUndoMessage(undefined);
          setNotice(
            "This collection changed in another tab. Review pending changes again.",
          );
        }
      });
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [loaded]);
  async function openWorkspace(w: Workspace) {
    setGeometry(await store.getGeometry(w.id));
    setWorkspace(w);
    rememberCollection(w.id);
    setCollectionMenuOpen(false);
    setSelected(undefined);
    setSelectedIds([]);
    setManageMemberships(false);
    setStatusDialogTag(undefined);
    setNextUndo(await store.nextUndo(w.id));
    setUndoMessage(undefined);
    setFilterDialogOpen(false);
    setCopyDialogTag(undefined);
    setBulkStatusOpen(false);
    setMediaDialogOpen(false);
    setActiveFilter({ op: "all", rules: [] });
    setHiddenTagIds([]);
    setViewSort("title");
    setActiveViewId(undefined);
    setQuery("");
    setScreen("workspace");
  }
  async function publish(w: Workspace) {
    setWorkspace(w);
    setNextUndo(await store.nextUndo(w.id));
    setCollections(await store.list());
  }
  async function save(command: Command | Command[]) {
    try {
      const current = await store.command(workspace.id, workspace.revision, command);
      await publish(current);
      setUndoMessage(undefined);
    } catch (e) {
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
      throw e;
    }
  }
  async function undoLastAction() {
    if (!nextUndo || nextUndo.revision !== workspace.revision || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await store.undoLast(workspace.id, workspace.revision, nextUndo.id);
      await publish(next);
      setUndoMessage(`Undid: ${nextUndo.label}`);
      setSelectedIds((ids) => ids.filter((id) => [...next.bubbles, ...next.tags].some((record) => record.id === id)));
      if (selected && ![...next.bubbles, ...next.tags].some((record) => record.id === selected)) setSelected(undefined);
      setActiveFilter({ op: "all", rules: [] });
      setHiddenTagIds([]);
      setActiveViewId(undefined);
      setViewSort("title");
    } catch (e) {
      setError(String(e));
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function saveView(view: SavedView) {
    await save({ type: "view.upsert", view });
    setActiveViewId(view.id);
    setNotice(`Saved view “${view.name}”.`);
  }
  async function deleteView(id: string) {
    await save({ type: "view.remove", id });
    if (activeViewId === id) setActiveViewId(undefined);
    setNotice("Saved view deleted.");
  }
  async function savePreset(preset: CopyPreset) {
    await save({ type: "copy-preset.upsert", preset });
    setNotice(`Saved copy preset “${preset.name}”.`);
  }
  async function deletePreset(id: string) {
    await save({ type: "copy-preset.remove", id });
    setNotice("Copy preset deleted.");
  }
  async function copyBubble(id: string) {
    const bubble = workspace.bubbles.find((item) => item.id === id);
    if (!bubble) return;
    const output = composeCopy([bubble], workspace, defaultCopyOptions);
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setNotice(`Copied “${bubble.title}”.`);
    } catch {
      setError("Clipboard access was unavailable. Open the source link or copy the text manually.");
    }
  }
  async function attachMedia(
    assignments: Array<{
      bubbleId: string;
      expectedRecordRevision: number;
      asset: import("./domain/model").Asset;
    }>,
    files: Array<{ id: string; filename: string; mime: string; blob: Blob }>,
  ) {
    try {
      const next = await store.attachMedia(
        workspace.id,
        workspace.revision,
        assignments,
        files,
      );
      await publish(next);
      setUndoMessage(undefined);
      setNotice(`Attached ${files.length} local media file${files.length === 1 ? "" : "s"}.`);
    } catch (e) {
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
      throw e;
    }
  }
  function selectRecord(id: string, additive = false) {
    setSelected(id);
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id];
    });
    setInspectorOpen(true);
    setManageMemberships(false);
  }
  function toggleBubbleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
    setSelected(id);
  }
  function clearSelection() {
    setSelectedIds([]);
  }
  async function createCollection(name: string) {
    if (!name?.trim()) return;
    try {
      const w = emptyWorkspace(name.trim());
      await store.create(w);
      setCollections(await store.list());
      await openWorkspace(w);
    } catch (e) {
      throw e;
    }
  }
  async function createTag(name: string) {
    if (!name) return;
    try {
      await save({ type: "tag.create", name });
    } catch (e) {
      throw e;
    }
  }
  async function backup() {
    try {
      const data = await store.backup(workspace.id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "bubble-tag-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Backup downloaded. Remote media remains linked; uploaded media is bundled.",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function commit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (parsed?.restore) {
        const next = await store.restore(parsed.restore);
        setCollections(await store.list());
        await openWorkspace(next);
        setNotice("Backup restored into a new collection.");
      } else if (preview) {
        const next = await store.import(workspace.id, {
          type: "import.commit",
          expectedRevision: preview.workspaceRevision,
          preview,
          decisions: preview.candidates.map((c) => ({
            row: c.row,
            action:
              c.errors.length || excluded.has(c.row)
                ? "skip"
                : c.duplicate || c.repeatedRow
                  ? (choices[c.row] ?? "skip")
                  : "keep",
          })),
          statusMapping,
          typeMapping,
          source: filename || "Pasted " + parsed?.format,
        });
        await publish(next);
        await openWorkspace(next);
        setNotice(
          `${selectedRows.length} source rows applied: ${next.bubbles.length - workspace.bubbles.length} new bubbles and ${selectedRows.filter((c) => choices[c.row] === "merge").length} merges. Use Undo to reverse this import.`,
        );
      }
      setStep(0);
      setParsed(undefined);
      setReviewTarget(undefined);
    } catch (e) {
      setError(String(e));
      if (e instanceof ConflictError) {
        const latest = await store.get(workspace.id);
        if (latest) {
          await publish(latest);
          setReviewTarget(latest);
          setStep(2);
          setChoices({});
          setInvalidAcknowledged(false);
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function undo() {
    if (!undoBatch || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const batch = workspace.batches.find((b) => b.id === undoBatch)!;
      const changed = undoConflicts(workspace, batch);
      const next = await store.undo(
        workspace.id,
        workspace.revision,
        batch.id,
        changed.map((b) => b.id),
      );
      await publish(next);
      setUndoBatch(undefined);
      setUndoMessage(changed.length ? `Import undone · ${changed.length} edited ${changed.length === 1 ? "bubble" : "bubbles"} kept` : "Import undone");
    } catch (e) {
      setError(String(e));
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const worker = useRef<Worker | null>(null),
    request = useRef(0);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, step]);
  useEffect(() => {
    const w = new Worker(new URL("./import.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  const importTarget = reviewTarget ?? workspace;
  const preview = useMemo(
    () =>
      parsed && mapping
        ? previewImport(parsed, mapping, importTarget, {
            delimiter,
            commonTags,
            initialStatus,
          })
        : undefined,
    [parsed, mapping, importTarget, delimiter, commonTags, initialStatus],
  );
  const selectedRows =
    preview?.candidates.filter(
      (c) =>
        !c.errors.length &&
        !excluded.has(c.row) &&
        ((!c.duplicate && !c.repeatedRow) ||
          (choices[c.row] && choices[c.row] !== "skip")),
    ) ?? [];
  const duplicates =
    preview?.candidates.filter((c) => c.duplicate || c.repeatedRow) ?? [];
  const invalid = preview?.candidates.filter((c) => c.errors.length) ?? [];
  const matchingBubbles = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    return filterBubbles(workspace, activeFilter).filter((bubble) =>
      !queryValue ||
      `${bubble.title} ${bubble.description} ${bubble.url ?? ""}`
        .toLowerCase()
        .includes(queryValue),
    );
  }, [workspace, activeFilter, query]);
  const visibleBubbles = useMemo(() => {
    const sorted = [...matchingBubbles];
    sorted.sort((left, right) => {
      if (viewSort === "createdAt") return left.createdAt.localeCompare(right.createdAt);
      if (viewSort === "status") {
        const leftStatus = workspace.statuses.find((status) => status.id === left.statusId)?.label ?? "";
        const rightStatus = workspace.statuses.find((status) => status.id === right.statusId)?.label ?? "";
        return leftStatus.localeCompare(rightStatus) || left.title.localeCompare(right.title);
      }
      return left.title.localeCompare(right.title);
    });
    return sorted;
  }, [matchingBubbles, viewSort, workspace.statuses]);
  const selectedBubbleIds = selectedIds.filter((id) =>
    workspace.bubbles.some((bubble) => bubble.id === id),
  );
  const selectedNodeIds = selectedIds.filter((id) =>
    workspace.bubbles.some((bubble) => bubble.id === id) ||
    workspace.tags.some((tag) => tag.id === id),
  );
  const filterActive =
    activeViewId !== undefined ||
    hiddenTagIds.length > 0 ||
    viewSort !== "title" ||
    !(activeFilter.op === "all" && activeFilter.rules.length === 0);
  const selectedRecord = workspace.bubbles.find((b) => b.id === selected),
    selectedTag = workspace.tags.find((t) => t.id === selected);
  function loadSample(kind: "bookmarks" | "reading") {
    request.current++;
    setBusy(false);
    setScreen("import");
    setReviewTarget(undefined);
    setText(kind === "bookmarks" ? bookmarkSample : readingSample);
    setFormat(kind === "bookmarks" ? "csv" : "tsv");
    setFilename(
      kind === "bookmarks" ? "bookmarks-sample.csv" : "reading-sample.tsv",
    );
    setParsed(undefined);
    setMapping(undefined);
    setStep(0);
    setError("");
    setChoices({});
    setExcluded(new Set());
    setSelected(undefined);
  }
  async function parseSource() {
    const w = worker.current;
    if (!w) return;
    setBusy(true);
    setError("");
    const id = ++request.current;
    w.onmessage = (
      e: MessageEvent<{ id: number; parsed?: ParsedImport; error?: string }>,
    ) => {
      if (e.data.id !== request.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else if (e.data.parsed) {
        setParsed(e.data.parsed);
        setMapping(guessMapping(e.data.parsed.headers));
        setChoices({});
        setExcluded(new Set());
        setReviewTarget(workspaceRef.current);
        setStatusMapping({});
        setTypeMapping({});
        setInvalidAcknowledged(false);
        setStep(e.data.parsed.restore ? 3 : 1);
      }
    };
    w.onerror = () => {
      setBusy(false);
      setError("The import parser stopped. Try selecting the source again.");
    };
    w.postMessage({ id, text, format, filename });
  }
  async function fileChanged(file?: File) {
    if (!file) return;
    request.current++;
    setBusy(false);
    try {
      setText(await file.text());
      setFilename(file.name);
      setFormat("auto");
      setError("");
    } catch {
      setError("Unable to read this file.");
    }
  }
  if (!loaded)
    return (
      <main className="panel">
        <h1>Opening your collection…</h1>
        {error && <div role="alert">{error}</div>}
      </main>
    );
  const workspaceFeedback = <WorkspaceFeedback
    message={undoMessage}
    actionLabel={nextUndo?.label}
    undoAvailable={Boolean(nextUndo && nextUndo.revision === workspace.revision)}
    busy={busy}
    onUndo={() => void undoLastAction()}
  />;
  return (
    <div
      className={`app-shell ${screen === "workspace" ? "workspace-mode" : "import-mode"} ${panelOpen ? "panel-open" : "panel-closed"}`}
    >
      <button
        className="panel-toggle"
        aria-label={panelOpen ? "Retract left panel" : "Open left panel"}
        aria-expanded={panelOpen}
        aria-controls="left-panel"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <Icon name={panelOpen ? "chevron-left" : "menu"} size={18} />
      </button>
      <aside id="left-panel" className={`sidebar ${panelOpen ? "" : "hidden"}`}>
        <IconButton className="sidebar-close" label="Close navigation" icon="close" onClick={() => setPanelOpen(false)} />
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("import");
            if (window.innerWidth <= 820) setPanelOpen(false);
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Bubble &amp; Tag</span>
        </a>
        <section className="collection-context">
          <div className="sidebar-section">COLLECTION</div>
          <div className="collection-picker" ref={collectionPickerRef}>
            <button
              type="button"
              className="collection-select"
              aria-label="Collection"
              aria-haspopup="listbox"
              aria-expanded={collectionMenuOpen}
              aria-controls="collection-menu"
              onClick={() => setCollectionMenuOpen((open) => !open)}
            >
              <span className="collection-select-name">{workspace.name}</span>
              <Icon name="chevron-down" size={15} />
            </button>
            {collectionMenuOpen && (
              <div
                id="collection-menu"
                className="collection-menu"
                role="listbox"
                aria-label="Collections"
              >
                {collections.map((w) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={w.id === workspace.id}
                    className={`collection-option ${w.id === workspace.id ? "selected" : ""}`}
                    key={w.id}
                    onClick={() => void openWorkspace(w)}
                  >
                    <span className="collection-option-copy">
                      <strong>{w.name}</strong>
                      <span>{w.bubbles.length} bubbles · {w.tags.length} tags</span>
                    </span>
                    {w.id === workspace.id && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton className="new-collection" label="New collection" icon="plus" onClick={() => { setPromptKind("collection"); setPromptValue(""); }} />
          <p className="collection-count">
            <span>{workspace.bubbles.length} bubbles</span>
            <span>{workspace.tags.length} tags</span>
          </p>
        </section>

        <button
          className={screen === "workspace" ? "nav active" : "nav"}
          onClick={() => { setScreen("workspace"); if (window.innerWidth <= 820) setPanelOpen(false); }}
        >
          <Icon name="collection" /> <span>Collection</span>
        </button>
        <button
          className={screen === "import" ? "nav active" : "nav"}
          onClick={() => { setScreen("import"); if (window.innerWidth <= 820) setPanelOpen(false); }}
        >
          <Icon name="import" /> <span>Import</span>
        </button>
        <div className="sidebar-divider" />
        <button className="nav" onClick={() => { setPromptKind("tag"); setPromptValue(""); }}>
          <Icon name="tag" /> <span>New tag</span>
        </button>
        <div className="sidebar-utilities">
        <div className="sidebar-section">COLLECTION TOOLS</div>
        <button className="nav" onClick={() => {
          setScreen("import");
          if (window.innerWidth <= 820) setPanelOpen(false);
          setFormat("json");
          setStep(0);
          setText("");
          setFilename("");
        }}>
          <Icon name="upload" /> <span>Restore backup</span>
        </button>
        <button className="nav" onClick={() => void backup()}>
          <Icon name="download" /> <span>Download backup</span>
        </button>
        <button className="nav" onClick={() => setHistory(true)}>
          <Icon name="history" /> <span>Import history</span>
        </button>
        </div>
        <div className="sidebar-footer">
          <span className="subtle">Changes are saved on this device.</span>
        </div>
      </aside>
      {panelOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setPanelOpen(false)} />}
      <main className="main-area" onClick={() => { if (window.innerWidth <= 820) setPanelOpen(false); }}>
        <header className="topbar">
          <span>
            {screen === "import" ? "Import a collection" : workspace.name}
          </span>
          <span className="badge">Browser-local collection</span>
        </header>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <IconButton label="Dismiss notice" icon="close" onClick={() => setNotice("")} />
          </div>
        )}
        {screen === "workspace" && error && (
          <div className="toast alert" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {screen === "import" ? (
          <div className="import-page">
            <div className="page-heading">
              <div className="eyebrow">START WITH YOUR OWN DATA</div>
              <h1>Bring your collection in.</h1>
              <p>
                Links, notes, or a whole export. Review everything before it
                becomes a bubble.
              </p>
            </div>
            <ol className="steps">
              {steps.map((label, i) => (
                <li
                  key={label}
                  className={
                    i === step ? "current" : i < step ? "complete" : ""
                  }
                >
                  <span>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {step === 0 && (
              <>
                <div className="source-grid">
                  {sources.map((s) => (
                    <button
                      key={s.id}
                      className={`source-card ${format === s.id || (s.id === "csv" && format === "tsv") ? "chosen" : ""}`}
                      onClick={() => setFormat(s.id as Format)}
                    >
                      <span className="source-icon"><Icon name={s.icon} size={22} /></span>
                      <strong>{s.label}</strong>
                      <span>{s.hint}</span>
                    </button>
                  ))}
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Paste data or select a file</h2>
                      <p className="panel-kicker">Your source is processed and saved only on this device.</p>
                    </div>
                    <label className="file-picker">
                      <Icon name="upload" size={16} />
                      <span>Choose file</span>
                      <input
                        aria-label="Choose import file"
                        type="file"
                        accept=".csv,.tsv,.html,.htm,.json,.txt"
                        onChange={(e) => void fileChanged(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  <textarea
                    className="source-text"
                    aria-label="Import data"
                    placeholder={
                      "https://example.com/an-interesting-article\nhttps://example.com/a-useful-tool"
                    }
                    value={text}
                    onChange={(e) => {
                      request.current++;
                      setBusy(false);
                      setText(e.target.value);
                      setFilename("");
                    }}
                  />
                  <div className="flex justify-between items-center gap-3 flex-wrap">
                    <label className="inline-label">
                      Format
                      <select
                        aria-label="Import format"
                        value={format}
                        onChange={(e) => setFormat(e.target.value as Format)}
                      >
                        {["auto", "urls", "csv", "tsv", "html", "json"].map(
                          (f) => (
                            <option key={f} value={f}>
                              {f === "auto"
                                ? "Detect automatically"
                                : f.toUpperCase()}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <span className="subtle">
                      {filename || "No file selected"} · processed on this
                      device
                    </span>
                  </div>
                </section>
                <div className="sample-callout">
                  <span>Need an example?</span>
                  <button
                    className="text-button"
                    onClick={() => loadSample("bookmarks")}
                  >
                    <span>Bookmarks with duplicates</span><Icon name="arrow-right" size={14} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => loadSample("reading")}
                  >
                    <span>URL-less reading list</span><Icon name="arrow-right" size={14} />
                  </button>
                </div>
              </>
            )}
            {step === 1 && parsed && mapping && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Connect columns to bubble fields</h2>
                    <p className="subtle">
                      Detected {parsed.format.toUpperCase()} ·{" "}
                      {parsed.rows.length} records. Unmapped fields stay empty.
                    </p>
                  </div>
                </div>
                {parsed.restore && (
                  <div className="notice">
                    Restore creates a new collection with the backup’s media, memberships, styles, and saved positions.
                  </div>
                )}
                <div className="mapping-grid">
                  {fields.map((field) => (
                    <label key={field}>
                      {fieldLabels[field]}
                      <select
                        aria-label={`Map ${fieldLabels[field]}`}
                        value={mapping[field]}
                        onChange={(e) =>
                          setMapping({ ...mapping, [field]: e.target.value })
                        }
                      >
                        <option value="">Not mapped</option>
                        {parsed.headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="import-options">
                  <label>
                    Tag separator
                    <input
                      aria-label="Tag separator"
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value)}
                    />
                  </label>
                  <label>
                    Common tags
                    <input
                      aria-label="Common tags"
                      placeholder="Reading|Research"
                      value={commonTags}
                      onChange={(e) => setCommonTags(e.target.value)}
                    />
                  </label>
                  <label>
                    Initial status
                    <select
                      value={initialStatus}
                      onChange={(e) => setInitialStatus(e.target.value)}
                    >
                      {workspace.statuses.map((s) => (
                        <option key={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <h3 className="mt-6 mb-3">Sample records</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Source row</th>
                        {parsed.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 3).map((r) => (
                        <tr key={r.row}>
                          <td>{r.row}</td>
                          {parsed.headers.map((h) => (
                            <td key={h}>{r.values[h] || <em>Empty</em>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {step === 2 && preview && (
              <>
                <div className="stats-row">
                  <div>
                    <strong>{selectedRows.length}</strong>
                    <span>Selected records</span>
                  </div>
                  <div>
                    <strong>{duplicates.length}</strong>
                    <span>Duplicate candidates</span>
                  </div>
                  <div>
                    <strong>{invalid.length}</strong>
                    <span>Invalid rows</span>
                  </div>
                  <div>
                    <strong>{preview.newTags.length}</strong>
                    <span>New tags</span>
                  </div>
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Review what will be added</h2>
                    <span className="subtle">
                      Duplicate URLs are skipped by default
                    </span>
                  </div>
                  {preview.unknownStatuses.length > 0 && (
                    <div className="notice">
                      {preview.unknownStatuses.map((label) => (
                        <label key={label}>
                          Status: {label}
                          <select
                            aria-label={`Resolve status ${label}`}
                            value={statusMapping[label] ?? ""}
                            onChange={(e) =>
                              setStatusMapping({
                                ...statusMapping,
                                [label]: e.target.value,
                              })
                            }
                          >
                            <option value="">Choose mapping</option>
                            {workspace.statuses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                            <option value="__create__">
                              Create “{label}” (active)
                            </option>
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {preview.unknownTypes.length > 0 && (
                    <div className="notice">
                      {preview.unknownTypes.map((label) => (
                        <label key={label}>
                          Tag type: {label}
                          <select
                            aria-label={`Resolve tag type ${label}`}
                            value={typeMapping[label] ?? ""}
                            onChange={(e) =>
                              setTypeMapping({
                                ...typeMapping,
                                [label]: e.target.value,
                              })
                            }
                          >
                            <option value="">Choose mapping</option>
                            {workspace.tagTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                            <option value="__create__">Create “{label}”</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {preview.newTags.length > 0 && (
                    <p className="subtle mb-4">
                      Tags to create: {preview.newTags.join(" · ")}
                    </p>
                  )}
                  <div className="review-items">
                    {invalid.length > 0 && (
                      <label className="notice">
                        <input
                          type="checkbox"
                          checked={invalidAcknowledged}
                          onChange={(e) =>
                            setInvalidAcknowledged(e.target.checked)
                          }
                        />{" "}
                        Exclude all {invalid.length} invalid rows listed below
                      </label>
                    )}
                    {preview.candidates.map((c) => (
                      <ReviewRow
                        key={c.row}
                        candidate={c}
                        earlier={preview.candidates.find(
                          (p) => p.row === c.duplicate?.row,
                        )}
                        workspace={importTarget}
                        excluded={excluded.has(c.row)}
                        choice={choices[c.row] ?? "skip"}
                        onChoice={(choice) =>
                          setChoices({ ...choices, [c.row]: choice })
                        }
                        onExclude={(value) =>
                          setExcluded((old) => {
                            const next = new Set(old);
                            if (value) next.add(c.row);
                            else next.delete(c.row);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
            {step === 3 && (
              <section className="panel confirmation">
                <span className="confirm-icon"><Icon name="collection" size={36} /></span>
                <h2>
                  {parsed?.restore
                    ? "Restore this backup?"
                    : "Confirm your import"}
                </h2>
                <p>
                  {parsed?.restore
                    ? `${parsed.restore.workspace.bubbles.length} bubbles and ${parsed.restore.media.length} bundled media files. A new collection will be created; the current collection is kept.`
                    : `Apply ${selectedRows.length} reviewed source records to ${workspace.name}.`}
                </p>
                {!parsed?.restore && (
                  <>
                    <p>
                      {
                        selectedRows.filter((c) => choices[c.row] === "merge")
                          .length
                      }{" "}
                      merges ·{" "}
                      {preview!.candidates.length - selectedRows.length} skipped
                      or excluded rows
                    </p>
                    <div className="notice text-left">
                      Merges replace supplied titles, nonempty descriptions,
                      mapped statuses and supplied media, and add tags. Import
                      history lets you undo these changes. Bubbles edited after
                      import are kept when you undo.
                    </div>
                  </>
                )}
                <p className="subtle">Nothing is saved until you confirm.</p>
              </section>
            )}
            <footer className="wizard-footer">
              <button
                onClick={() => {
                  if (parsed?.restore) {
                    setStep(0);
                    setParsed(undefined);
                  } else if (step > 0) setStep(step - 1);
                  else {
                    setText("");
                    setParsed(undefined);
                    setMapping(undefined);
                    setError("");
                  }
                }}
              >
                {step > 0 ? <><Icon name="arrow-left" size={15} /> Back</> : <><Icon name="close" size={15} /> Clear source</>}
              </button>
              <span className="subtle">
                Your original file stays unchanged.
              </span>
              {step < 3 && (
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (step === 0 && !text.trim()) ||
                    (step === 2 &&
                      (!selectedRows.length ||
                        (invalid.length > 0 && !invalidAcknowledged) ||
                        selectedRows.some(
                          (c) =>
                            (!workspace.statuses.some(
                              (s) => s.label === c.status,
                            ) &&
                              !statusMapping[c.status]) ||
                            (c.tagType &&
                              !workspace.tagTypes.some(
                                (t) => t.name === c.tagType,
                              ) &&
                              !typeMapping[c.tagType]),
                        )))
                  }
                  onClick={() =>
                    step === 0 ? void parseSource() : setStep(step + 1)
                  }
                >
                  {busy
                    ? "Reading source…"
                    : step === 0
                      ? <><span>Read source</span><Icon name="arrow-right" size={15} /></>
                      : step === 1
                        ? <><span>Review records</span><Icon name="arrow-right" size={15} /></>
                        : <><span>Continue</span><Icon name="arrow-right" size={15} /></>}
                </button>
              )}
              {step === 3 && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void commit()}
                >
                  {busy
                    ? "Saving…"
                    : parsed?.restore
                      ? "Confirm restore"
                      : "Confirm import"}
                </button>
              )}
            </footer>
          </div>
        ) : (
          <div className="workspace-page">
            <div className="workspace-toolbar">
              <div className="search-field">
                <Icon name="search" size={17} />
                <input
                  aria-label="Search bubbles"
                  placeholder="Search bubbles…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <IconButton
                    label="Clear search"
                    icon="close"
                    size={15}
                    className="search-clear"
                    onClick={() => setQuery("")}
                  />
                )}
              </div>
              <div className="workspace-actions">
                <button
                  className={`toolbar-button ${filterActive ? "active" : ""}`}
                  aria-label="Filters"
                  onClick={() => setFilterDialogOpen(true)}
                  aria-pressed={filterDialogOpen || filterActive}
                >
                  <Icon name="filter" size={16} /> <span>Filters</span>
                  {filterActive && <span className="toolbar-count">{matchingBubbles.length}</span>}
                </button>
                <button
                  className="toolbar-button" aria-label="Details"
                  onClick={() => setInspectorOpen((v) => !v)}
                  aria-pressed={inspectorOpen}
                >
                  <Icon name="info" size={16} /> <span>Details</span>
                </button>
                <div className="segmented">
                  <button
                    aria-label="Graph" className={!list ? "active" : ""}
                    onClick={() => setList(false)}
                    aria-pressed={!list}
                  >
                    <Icon name="graph" size={15} /> <span>Graph</span>
                  </button>
                  <button
                    aria-label="List" className={list ? "active" : ""}
                    onClick={() => setList(true)}
                    aria-pressed={list}
                  >
                    <Icon name="list" size={15} /> <span>List</span>
                  </button>
                </div>
              </div>
            </div>
            {filterActive && (
              <div className="active-filter-bar" role="status">
                <span><Icon name="filter" size={14} /> {activeViewId ? `Saved view: ${workspace.views.find((view) => view.id === activeViewId)?.name ?? "selected"}` : "Custom filter"} · {matchingBubbles.length} matching bubbles</span>
                <button onClick={() => { setActiveFilter({ op: "all", rules: [] }); setHiddenTagIds([]); setViewSort("title"); setActiveViewId(undefined); setQuery(""); }}>Clear view</button>
              </div>
            )}
            {selectedNodeIds.length > 0 && (
              <div className="selection-bar" role="toolbar" aria-label="Selected node actions">
                <strong>{selectedNodeIds.length} selected</strong>
                <button onClick={() => {
                  if (selectedBubbleIds.length > 0) setBulkStatusOpen(true);
                  else if (selectedTag) setStatusDialogTag(selectedTag.id);
                }}><Icon name="refresh" size={14} /> Change status</button>
                <button className="text-button" onClick={clearSelection}>Clear selection</button>
              </div>
            )}
            <div className={`workspace-grid ${list ? "list-mode" : ""} ${inspectorOpen ? "inspector-open" : ""}`}>
              <div className={list ? "hidden" : "graph-area"}>
                <GraphCanvas
                  ref={graphRef}
                  onImport={() => setScreen("import")}
                  onClearSearch={() => setQuery("")}
                  onShowList={() => setList(true)}
                  onPinsChanged={setPinnedIds}
                  workspace={workspace}
                  selected={selected}
                  onSelect={(id) => selectRecord(id)}
                  query=""
                  matchingBubbleIds={visibleBubbles.map((bubble) => bubble.id)}
                  filtering={filterActive || Boolean(query.trim())}
                  hiddenTagIds={hiddenTagIds}
                  feedback={workspaceFeedback}
                  geometry={geometry}
                  onGeometry={(g) => {
                    setGeometry(g);
                    void store
                      .saveGeometry(g)
                      .catch((e) =>
                        setError(
                          "Unable to save graph positions: " + String(e),
                        ),
                      );
                  }}
                />
              </div>
              {list && (
                <section className="panel list-panel">
                  {visibleBubbles.map((b) => (
                    <div className={`list-item-row ${selectedIds.includes(b.id) ? "checked" : ""}`} key={b.id}>
                      <label className="list-select" aria-label={`Select ${b.title}`}>
                        <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleBubbleSelection(b.id)} />
                      </label>
                      <button
                        aria-pressed={selected === b.id}
                        className={`list-item ${selected === b.id ? "selected" : ""}`}
                        onClick={() => selectRecord(b.id)}
                      >
                        <span className="list-item-main">
                          <strong>{b.title}</strong>
                          <span>{b.description || "No description"}</span>
                        </span>
                        <span className="badge">
                          {
                            workspace.statuses.find((s) => s.id === b.statusId)
                              ?.label
                          }
                        </span>
                      </button>
                    </div>
                  ))}
                  {!workspace.bubbles.length && (
                    <div className="list-empty">
                      <Icon name="collection" size={24} />
                      <strong>Your collection is empty</strong>
                      <span>Import links, notes, or a backup to begin.</span>
                      <button className="primary" onClick={() => { setScreen("import"); if (window.innerWidth <= 820) setPanelOpen(false); }}>Open Import</button>
                    </div>
                  )}
                  {workspace.bubbles.length > 0 && !visibleBubbles.length && (
                    <div className="list-empty">
                      <Icon name="search" size={24} />
                      <strong>No matching bubbles</strong>
                      <span>Try a different search or clear the filter.</span>
                      <button onClick={() => { setQuery(""); setActiveFilter({ op: "all", rules: [] }); setHiddenTagIds([]); setViewSort("title"); setActiveViewId(undefined); }}>Clear filters</button>
                    </div>
                  )}
                </section>
              )}
              <aside className={`inspector ${inspectorOpen ? "" : "hidden"}`}>
                <div className="detail-header">
                  <div className="detail-header-copy">
                    <div className="eyebrow">
                      {selectedTag ? "TAG DETAILS" : selectedRecord ? "BUBBLE DETAILS" : "DETAILS"}
                    </div>
                    {selectedRecord ? (
                      <h2 className="detail-title" title={selectedRecord.title}>{selectedRecord.title}</h2>
                    ) : selectedTag ? (
                      <h2 className="detail-title" title={selectedTag.name}>{selectedTag.name}</h2>
                    ) : (
                      <h2 className="detail-title">Select an item</h2>
                    )}
                  </div>
                  <div className="detail-header-actions">
                    {(selectedRecord || selectedTag) && <>
                      <IconButton label="Edit record" icon="edit" onClick={() => setEditing(selected!)} />
                      <IconButton label={pinnedIds.includes(selected!) ? "Unpin record" : "Pin record"} icon="pin" aria-pressed={pinnedIds.includes(selected!)} onClick={() => graphRef.current?.setPinned(selected!, !pinnedIds.includes(selected!))} />
                    </>}
                  <IconButton label="Close details" icon="close" size={17} className="inspector-close" onClick={() => setInspectorOpen(false)} />
                  </div>
                </div>
                {selectedRecord || selectedTag ? (
                  <>
                    <section className="detail-section detail-overview">
                      <div className="detail-meta">
                        <span className="badge">
                          {workspace.statuses.find((s) => s.id === (selectedRecord ?? selectedTag)?.statusId)?.label}
                        </span>
                        {selectedTag?.typeId && (
                          <span className="detail-type">
                            {workspace.tagTypes.find((t) => t.id === selectedTag.typeId)?.name}
                          </span>
                        )}
                      </div>
                      {selectedTag && (
                        <div className="detail-actions">
                          <button className="section-toggle" onClick={() => setCopyDialogTag(selectedTag.id)}>
                            <Icon name="copy" size={14} /> Compose copy
                          </button>
                        </div>
                      )}
                      {selectedRecord && (
                        <div className="detail-actions">
                          <button className="section-toggle" onClick={() => void copyBubble(selectedRecord.id)}>
                            <Icon name="copy" size={14} /> Copy
                          </button>
                          <button className="section-toggle status-action" onClick={() => { setSelectedIds([selectedRecord.id]); setMediaDialogOpen(true); }}>
                            <Icon name="upload" size={14} /> Attach media
                          </button>
                        </div>
                      )}
                      <p>{selectedRecord?.description || selectedTag?.description || "No description yet."}</p>
                      {selectedRecord?.asset && <AssetPreview asset={selectedRecord.asset} load={(id) => store.media(id)} />}
                      {(selectedRecord?.url || selectedTag?.url) && isWebUrl((selectedRecord ?? selectedTag)!.url! as string) && (
                        <a className="detail-link" href={(selectedRecord ?? selectedTag)!.url!} target="_blank" rel="noreferrer">
                          <Icon name="external" size={14} /> Open source
                        </a>
                      )}
                      {(selectedRecord?.url || selectedTag?.url) && !isWebUrl((selectedRecord ?? selectedTag)!.url! as string) && (
                        <p className="url-warning">
                          {(selectedRecord ?? selectedTag)!.url}
                          <span className="url-warning-label">Not a link</span>
                        </p>
                      )}
                    </section>
                    <section className="detail-section connection-section">
                      <div className="section-heading">
                        <div>
                          <h3>Connections</h3>
                          <p className="subtle">
                            {selectedRecord
                              ? `${workspace.memberships.filter((m) => m.bubbleId === selectedRecord.id).length} linked tags`
                              : `${workspace.memberships.filter((m) => m.tagId === selectedTag!.id).length} linked bubbles`}
                          </p>
                        </div>
                        {selectedRecord && (
                          <button className="section-toggle" onClick={() => setManageMemberships((v) => !v)} aria-pressed={manageMemberships}>
                            <Icon name="tag" size={14} /> {manageMemberships ? "Done" : "Manage tags"}
                          </button>
                        )}
                      </div>
                      {selectedRecord && manageMemberships ? (
                        <div className="membership-list">
                          {workspace.tags.map((t) => (
                            <label className="membership-option" key={t.id}>
                              <input
                                type="checkbox"
                                checked={workspace.memberships.some((m) => m.bubbleId === selectedRecord.id && m.tagId === t.id)}
                                onChange={(e) => void save({ type: "membership.set", bubbleId: selectedRecord.id, tagId: t.id, linked: e.target.checked }).catch((e) => setError(String(e)))}
                              />
                              <span>{t.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : selectedRecord ? (
                        <div className="connection-chips">
                          {workspace.memberships.filter((m) => m.bubbleId === selectedRecord.id).map((m) => (
                            <button className="connection-chip" key={m.id} onClick={() => selectRecord(m.tagId)}>
                              <Icon name="tag" size={13} /> {workspace.tags.find((t) => t.id === m.tagId)?.name}
                            </button>
                          ))}
                          {!workspace.memberships.some((m) => m.bubbleId === selectedRecord.id) && <span className="empty-inline">No linked tags yet.</span>}
                        </div>
                      ) : (
                        <div className="connection-list">
                          {workspace.memberships.filter((m) => m.tagId === selectedTag!.id).map((m) => {
                            const bubble = workspace.bubbles.find((b) => b.id === m.bubbleId);
                            return bubble ? <button className="linked-item" title={bubble.title} key={m.id} onClick={() => selectRecord(bubble.id)}><span>{bubble.title}</span><Icon name="chevron-right" size={14} /></button> : null;
                          })}
                          {!workspace.memberships.some((m) => m.tagId === selectedTag!.id) && <span className="empty-inline">No linked bubbles yet.</span>}
                        </div>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="detail-empty">
                    <div className="empty-illustration"><Icon name="collection" size={30} /></div>
                    <p>Inspect an item to see its information and connections.</p>
                    <span className="subtle">Select a bubble or tag in the graph or list.</span>
                  </div>
                )}
              </aside>
            </div>
            {list && <div className="list-feedback-bar">{workspaceFeedback}</div>}
          </div>
        )}
        {screen === "import" && <div className="import-undo-bar">{workspaceFeedback}</div>}
      </main>
      {editing && (
        <RecordEditor
          key={editing}
          workspace={workspace}
          id={editing}
          onSave={save}
          onClose={() => setEditing(undefined)}
        />
      )}
      {statusDialogTag && workspace.tags.some((tag) => tag.id === statusDialogTag) && (
        <StatusPropagationDialog
          workspace={workspace}
          tag={workspace.tags.find((tag) => tag.id === statusDialogTag)!}
          onSave={save}
          onClose={() => setStatusDialogTag(undefined)}
        />
      )}
      {filterDialogOpen && (
        <FilterDialog
          workspace={workspace}
          initialFilter={activeFilter}
          initialHiddenTagIds={hiddenTagIds}
          initialSort={viewSort}
          initialViewId={activeViewId}
          onApply={(filter, hidden, sort, viewId) => {
            setActiveFilter(filter);
            setHiddenTagIds(hidden);
            setViewSort(sort);
            setActiveViewId(viewId);
          }}
          onSaveView={saveView}
          onDeleteView={deleteView}
          onClose={() => setFilterDialogOpen(false)}
        />
      )}
      {bulkStatusOpen && selectedBubbleIds.length > 0 && (
        <BulkStatusDialog
          workspace={workspace}
          bubbleIds={selectedBubbleIds}
          onSave={save}
          onClose={() => setBulkStatusOpen(false)}
        />
      )}
      {mediaDialogOpen && selectedBubbleIds.length > 0 && (
        <MediaUploadDialog
          workspace={workspace}
          bubbleIds={selectedBubbleIds}
          onAttach={attachMedia}
          onClose={() => setMediaDialogOpen(false)}
        />
      )}
      {copyDialogTag && workspace.tags.some((tag) => tag.id === copyDialogTag) && (
        <CopyComposerDialog
          workspace={workspace}
          tagId={copyDialogTag}
          currentBubbleIds={visibleBubbles.map((bubble) => bubble.id)}
          presets={workspace.settings.copyPresets ?? []}
          onSavePreset={savePreset}
          onDeletePreset={deletePreset}
          onClose={() => setCopyDialogTag(undefined)}
        />
      )}
      {promptKind && (
        <PromptModal
          kind={promptKind}
          value={promptValue}
          onChange={setPromptValue}
          onClose={() => setPromptKind(undefined)}
          onSubmit={async () => {
            const value = promptValue.trim();
            if (!value) return;
            if (promptKind === "collection") await createCollection(value);
            else await createTag(value);
            setPromptKind(undefined);
            setPromptValue("");
          }}
        />
      )}
      {history && !undoBatch && (
        <Dialog labelledBy="history-title" onClose={() => setHistory(false)}>
            <h2 id="history-title">Import history</h2>
            <p>
              Undo an import to remove new bubbles and restore merged bubbles
              to their previous values. Bubbles edited after import and imported
              tags are kept.
            </p>
            {!workspace.batches.length && <p>No imports yet.</p>}
            {workspace.batches.map((b) => (
              <article key={b.id}>
                <strong>{b.source}</strong>
                <p>
                  {b.bubbleIds.length} affected bubbles ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </p>
                <button onClick={() => setUndoBatch(b.id)}>Review import undo</button>
              </article>
            ))}
            <footer>
                <button onClick={() => setHistory(false)}><Icon name="close" size={15} /> Close</button>
            </footer>
        </Dialog>
      )}
      {undoBatch &&
        (() => {
          const b = workspace.batches.find((b) => b.id === undoBatch);
          if (!b) return null;
          const changed = undoConflicts(workspace, b);
          return (
            <Dialog labelledBy="undo-title" onClose={() => { if (!busy) setUndoBatch(undefined); }}>
                <h2 id="undo-title">Undo this import?</h2>
                <p>
                  {b.bubbleIds.length - changed.length} unchanged bubbles will
                  be affected. New bubbles will be removed; merged bubbles will
                  return to their values and tags from before this import.
                  Imported tags will remain available.
                </p>
                {changed.length > 0 && (
                  <div className="notice">
                    <strong>Bubbles to keep</strong>
                    {changed.map((b) => (
                      <p key={b.id}>{b.title}</p>
                    ))}
                    <p>These bubbles were edited after import. Undo will keep their current values and tags.</p>
                  </div>
                )}
                <ul>
                  {b.bubbleIds
                    .filter((id) => !changed.some((c) => c.id === id))
                    .map((id) => (
                      <li key={id}>
                        {workspace.bubbles.find((b) => b.id === id)?.title}
                      </li>
                    ))}
                </ul>
                <footer>
                  <button
                    disabled={busy}
                    onClick={() => setUndoBatch(undefined)}
                  >
                    <Icon name="close" size={15} /> Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void undo()}
                  >
                    <Icon name="history" size={15} /> {busy ? "Undoing import…" : "Undo import"}
                  </button>
                </footer>
            </Dialog>
          );
        })()}
    </div>
  );
}
function PromptModal({
  kind,
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  kind: "collection" | "tag";
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState("");
  const pending = useRef(false);
  async function submit() {
    if (!value.trim() || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setFailure("");
    try { await onSubmit(); } catch (error) { setFailure(String(error)); }
    finally { pending.current = false; setSubmitting(false); }
  }
  return (
    <Dialog className="prompt-modal" labelledBy="prompt-title" onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">NEW {kind === "collection" ? "COLLECTION" : "TAG"}</div>
            <h2 id="prompt-title">Create a {kind}</h2>
          </div>
          <IconButton label="Close dialog" icon="close" size={17} disabled={submitting} onClick={onClose} />
        </div>
        {failure && <div className="alert" role="alert">{failure}</div>}
        <label>
          {kind === "collection" ? "Collection name" : "Tag name"}
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={kind === "collection" ? "e.g. Work research" : "e.g. Read later"}
          />
        </label>
        <p className="subtle">
          {kind === "collection" ? "A new collection starts empty and stays on this device." : "You can connect this tag to bubbles from Details."}
        </p>
        <footer>
          <button type="button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting || !value.trim()}><Icon name="check" size={15} /> Create</button>
        </footer>
      </form>
    </Dialog>
  );
}
function ReviewRow({
  candidate: c,
  earlier,
  workspace,
  excluded,
  choice,
  onChoice,
  onExclude,
}: {
  candidate: Candidate;
  earlier?: Candidate;
  workspace: Workspace;
  excluded: boolean;
  choice: "skip" | "keep" | "merge";
  onChoice: (v: "skip" | "keep" | "merge") => void;
  onExclude: (v: boolean) => void;
}) {
  const existing = workspace.bubbles.find((b) => b.id === c.duplicate?.id);
  return (
    <article
      className={`review-row ${c.errors.length ? "invalid" : c.urlWarning ? "has-warning" : ""}`}
    >
      <div className="row-main">
        <label className="row-checkbox">
          <input
            type="checkbox"
            aria-label={`Include row ${c.row}`}
            checked={
              !excluded &&
              !c.errors.length &&
              (!(c.duplicate || c.repeatedRow) || choice !== "skip")
            }
            disabled={!!c.errors.length}
            onChange={(e) => {
              onExclude(!e.target.checked);
              if (c.duplicate || c.repeatedRow)
                onChoice(e.target.checked ? "keep" : "skip");
            }}
          />
          <span className="subtle">Row {c.row}</span>
        </label>
        <div className="min-w-0 flex-1">
          <strong>{c.title}</strong>
          {c.missingTitle && <span className="badge warning-badge ml-2">Title missing</span>}
          <p className={`row-url ${c.urlWarning ? "url-warning" : ""}`}>
            {c.url || "No URL · allowed"}
            {c.urlWarning && (
              <span className="url-warning-label">{c.urlWarning}</span>
            )}
          </p>
          <p className="row-description">{c.description || "No description"}</p>
          <div className="flex gap-2 flex-wrap mt-2">
            {c.tags.map((t) => (
              <span className="tag-chip" key={t}>
                {t}
              </span>
            ))}
            <span className="badge">{c.status}</span>
          </div>
        </div>
      </div>
      {c.errors.length > 0 && (
        <p className="row-error">Excluded: {c.errors.join(" ")}</p>
      )}
      {(c.duplicate || c.repeatedRow) && (
        <div className="duplicate-panel">
          <p>
            {c.duplicate
              ? `Same URL as ${c.duplicate.kind === "workspace" ? "existing bubble" : "source row " + c.duplicate.row}: “${c.duplicate.title}”`
              : `Repeated source row ${c.repeatedRow}`}
          </p>
          <div className="flex gap-4 flex-wrap mt-3">
            {(["skip", "keep", "merge"] as const).map((action) => (
              <label key={action}>
                <input
                  type="radio"
                  name={`duplicate-${c.row}`}
                  checked={choice === action}
                  disabled={action === "merge" && !c.duplicate}
                  onChange={() => onChoice(action)}
                />
                {action === "skip"
                  ? "Skip"
                  : action === "keep"
                    ? "Keep both"
                    : "Merge"}
              </label>
            ))}
          </div>
          {choice === "merge" && (
            <div className="merge-preview">
              <strong>Proposed replacement fields</strong>
              <p>
                Title: {existing?.title ?? c.duplicate?.title} →{" "}
                {c.missingTitle ? (existing?.title ?? earlier?.title) : c.title}
              </p>
              <p>
                Description:{" "}
                {existing?.description ?? earlier?.description ?? "Empty"} →{" "}
                {c.description || "keep existing value"}
              </p>
              <p>
                Status:{" "}
                {existing
                  ? workspace.statuses.find((s) => s.id === existing.statusId)
                      ?.label
                  : earlier?.status}{" "}
                → {c.status}
              </p>
              <p>Media: {c.mediaUrl || "keep existing value"}</p>
              <p>Tags: add {c.tags.join(", ") || "none"}</p>
              <span className="subtle">
                Also replace mapped status and supplied media; keep the existing
                URL and add imported tags. Empty descriptions and missing titles
                keep existing values.
              </span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
