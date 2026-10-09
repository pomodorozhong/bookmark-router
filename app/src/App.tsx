import { useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./components/GraphCanvas";
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
  type Workspace,
  type Geometry,
} from "./domain/model";
import { WorkspaceStore } from "./domain/storage";
import { ConflictError, type Command } from "./domain/commands";
import { undoConflicts } from "./domain/import-commands";
import { AssetPreview } from "./components/AssetPreview";
import { RecordEditor } from "./components/RecordEditor";
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
  { id: "urls", label: "Paste links", hint: "One URL per line", icon: "↗" },
  { id: "csv", label: "CSV / TSV", hint: "Map your own columns", icon: "▤" },
  {
    id: "html",
    label: "Bookmark HTML",
    hint: "Browser bookmark exports",
    icon: "⌘",
  },
  {
    id: "json",
    label: "Workspace JSON",
    hint: "Versioned portable backup",
    icon: "{}",
  },
];
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
    [query, setQuery] = useState(""),
    [list, setList] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(true);
  const [loaded, setLoaded] = useState(false),
    [collections, setCollections] = useState<Workspace[]>([]),
    [geometry, setGeometry] = useState<Geometry>(),
    [editing, setEditing] = useState<string>(),
    [history, setHistory] = useState(false),
    [undoBatch, setUndoBatch] = useState<string>(),
    [notice, setNotice] = useState("");
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>(
      {},
    ),
    [typeMapping, setTypeMapping] = useState<Record<string, string>>({}),
    [invalidAcknowledged, setInvalidAcknowledged] = useState(false),
    [reviewTarget, setReviewTarget] = useState<Workspace>();
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const submitting = useRef(false),
    workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  useEffect(() => {
    let active = true;
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
          setLoaded(true);
          if (w.bubbles.length) setScreen("workspace");
        }
      })
      .catch((e) => setError("Unable to open local storage: " + String(e)));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const refresh = () => {
      void store.get(workspaceRef.current.id).then((w) => {
        if (w && w.revision !== workspaceRef.current.revision) {
          setWorkspace(w);
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
    setSelected(undefined);
    setQuery("");
    setScreen("workspace");
  }
  async function publish(w: Workspace) {
    setWorkspace(w);
    setCollections(await store.list());
  }
  async function save(command: Command) {
    try {
      const next = await store.command(
        workspace.id,
        workspace.revision,
        command,
      );
      await publish(next);
    } catch (e) {
      const latest = await store.get(workspace.id);
      if (latest) setWorkspace(latest);
      throw e;
    }
  }
  async function createCollection() {
    const name = window.prompt("Collection name");
    if (!name?.trim()) return;
    try {
      const w = emptyWorkspace(name.trim());
      await store.create(w);
      setCollections(await store.list());
      await openWorkspace(w);
    } catch (e) {
      setError(String(e));
    }
  }
  async function createTag() {
    const name = window.prompt("New tag name");
    if (!name) return;
    try {
      await save({ type: "tag.create", name });
    } catch (e) {
      setError(String(e));
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
          `${selectedRows.length} source rows applied: ${next.bubbles.length - workspace.bubbles.length} new bubbles and ${selectedRows.filter((c) => choices[c.row] === "merge").length} merges. Undo is available in Import history.`,
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
          setWorkspace(latest);
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
      setNotice("Import undone. Later edits and imported tags were kept.");
    } catch (e) {
      setError(String(e));
      const latest = await store.get(workspace.id);
      if (latest) setWorkspace(latest);
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
        {panelOpen ? "‹" : "☰"}
      </button>
      <aside id="left-panel" className={`sidebar ${panelOpen ? "" : "hidden"}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("import");
          }}
        >
          <span className="brand-mark">◉</span> Bubble & Tag
        </a>
        {screen === "workspace" && (
          <section className="sidebar-workspace">
            <p>
              {workspace.bubbles.length} bubbles · {workspace.tags.length} tags
            </p>
          </section>
        )}
        <div className="sidebar-section">WORKSPACE</div>
        <button
          className={screen === "workspace" ? "nav active" : "nav"}
          onClick={() => setScreen("workspace")}
        >
          ◎ <span>Collection</span>
          <span className="nav-count">{workspace.bubbles.length}</span>
        </button>
        <button
          className={screen === "import" ? "nav active" : "nav"}
          onClick={() => setScreen("import")}
        >
          ↓ <span>Import</span>
        </button>
        <div className="sidebar-section mt-8">SAMPLE SOURCES</div>
        <button className="nav" onClick={() => loadSample("bookmarks")}>
          ↗ <span>Bookmark sample</span>
        </button>
        <button className="nav" onClick={() => loadSample("reading")}>
          ▧ <span>Reading & writing</span>
        </button>
        <div className="sidebar-section">COLLECTIONS & RECOVERY</div>
        <select
          aria-label="Collection"
          value={workspace.id}
          onChange={(e) => {
            const w = collections.find((w) => w.id === e.target.value);
            if (w) void openWorkspace(w);
          }}
        >
          {collections.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button className="nav" onClick={() => void createCollection()}>
          + <span>New collection</span>
        </button>
        <button className="nav" onClick={() => void backup()}>
          ↓ <span>Download backup</span>
        </button>
        <button className="nav" onClick={() => setHistory(true)}>
          ↶ <span>Import history</span>
        </button>
        <button className="nav" onClick={() => void createTag()}>
          + <span>New tag</span>
        </button>
        <div className="sidebar-footer">
          <span className="local-dot" />
          Local-first
          <br />
          <span className="subtle">Saved on this device</span>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span>
            {screen === "import" ? "Import a collection" : workspace.name}
          </span>
          <span className="badge">Browser-local collection</span>
        </header>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              ×
            </button>
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
                  <span>{i < step ? "✓" : i + 1}</span>
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
                      <span className="source-icon">{s.icon}</span>
                      <strong>{s.label}</strong>
                      <span>{s.hint}</span>
                    </button>
                  ))}
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Paste data or select a file</h2>
                    <label className="file-label">
                      Choose file
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
                  <span>Try it first with a sample.</span>
                  <button
                    className="text-button"
                    onClick={() => loadSample("bookmarks")}
                  >
                    Bookmarks with duplicates ↗
                  </button>
                  <button
                    className="text-button"
                    onClick={() => loadSample("reading")}
                  >
                    URL-less reading list ↗
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
                    This is a full workspace backup. Phase 2 will restore its
                    media, styles, memberships, and saved views into a new
                    workspace. This design shows its bubbles for review only.
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
                <span className="confirm-icon">◎</span>
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
                      history can restore previous values. Later edits are
                      protected during undo.
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
                {step > 0 ? "← Back" : "Clear source"}
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
                      ? "Read source →"
                      : step === 1
                        ? "Review records →"
                        : "Continue →"}
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
                      ? "Confirm restore →"
                      : "Confirm import →"}
                </button>
              )}
            </footer>
          </div>
        ) : (
          <div className="workspace-page">
            <div className="workspace-toolbar">
              <input
                aria-label="Search bubbles"
                placeholder="Search bubbles…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="workspace-actions">
                <button
                  onClick={() => setInspectorOpen((v) => !v)}
                  aria-pressed={inspectorOpen}
                >
                  Details
                </button>
                <div className="segmented">
                  <button
                    className={!list ? "active" : ""}
                    onClick={() => setList(false)}
                  >
                    Graph
                  </button>
                  <button
                    className={list ? "active" : ""}
                    onClick={() => setList(true)}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>
            <div className="workspace-grid">
              <div className={list ? "hidden" : "graph-area"}>
                <GraphCanvas
                  ref={graphRef}
                  onPinsChanged={setPinnedIds}
                  workspace={workspace}
                  selected={selected}
                  onSelect={(id) => {
                    setSelected(id);
                    setInspectorOpen(true);
                  }}
                  query={query}
                  geometry={geometry}
                  onGeometry={(g) => {
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
                  {workspace.bubbles
                    .filter((b) =>
                      `${b.title} ${b.description} ${b.url ?? ""}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((b) => (
                      <button
                        className="list-item"
                        key={b.id}
                        onClick={() => {
                          setSelected(b.id);
                          setInspectorOpen(true);
                        }}
                      >
                        <strong>{b.title}</strong>
                        <span>{b.description}</span>
                        <span className="badge">
                          {
                            workspace.statuses.find((s) => s.id === b.statusId)
                              ?.label
                          }
                        </span>
                      </button>
                    ))}
                </section>
              )}
              <aside className={`inspector ${inspectorOpen ? "" : "hidden"}`}>
                <button
                  className="inspector-close"
                  aria-label="Close details"
                  onClick={() => setInspectorOpen(false)}
                >
                  ×
                </button>
                <div className="eyebrow">
                  {selectedTag ? "TAG DETAILS" : "BUBBLE DETAILS"}
                </div>
                {selectedRecord ? (
                  <>
                    <h2 className="detail-title" title={selectedRecord.title}>
                      {selectedRecord.title}
                    </h2>
                    <span className="badge">
                      {
                        workspace.statuses.find(
                          (s) => s.id === selectedRecord.statusId,
                        )?.label
                      }
                    </span>
                    <p>{selectedRecord.description || "No description yet."}</p>
                    {selectedRecord.asset && (
                      <AssetPreview
                        asset={selectedRecord.asset}
                        load={(id) => store.media(id)}
                      />
                    )}
                    {selectedRecord.url && isWebUrl(selectedRecord.url) && (
                      <a
                        href={selectedRecord.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source ↗
                      </a>
                    )}
                    {selectedRecord.url && !isWebUrl(selectedRecord.url) && (
                      <p className="url-warning">
                        {selectedRecord.url}
                        <span className="url-warning-label">Not a link</span>
                      </p>
                    )}
                    <h3 className="mt-6 mb-3">Linked tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {workspace.memberships
                        .filter((m) => m.bubbleId === selectedRecord.id)
                        .map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setSelected(m.tagId)}
                          >
                            {workspace.tags.find((t) => t.id === m.tagId)?.name}
                          </button>
                        ))}
                    </div>
                  </>
                ) : selectedTag ? (
                  <>
                    <h2 className="detail-title" title={selectedTag.name}>
                      {selectedTag.name}
                    </h2>
                    <span className="badge">
                      {
                        workspace.statuses.find(
                          (s) => s.id === selectedTag.statusId,
                        )?.label
                      }
                    </span>
                    {selectedTag.description && (
                      <p>{selectedTag.description}</p>
                    )}
                    {selectedTag.url && isWebUrl(selectedTag.url) && (
                      <a
                        href={selectedTag.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source ↗
                      </a>
                    )}
                    {selectedTag.url && !isWebUrl(selectedTag.url) && (
                      <p className="url-warning">
                        {selectedTag.url}
                        <span className="url-warning-label">Not a link</span>
                      </p>
                    )}
                    {selectedTag.typeId && (
                      <p className="subtle">
                        Type:{" "}
                        {
                          workspace.tagTypes.find(
                            (t) => t.id === selectedTag.typeId,
                          )?.name
                        }
                      </p>
                    )}
                    <p>
                      {
                        workspace.memberships.filter(
                          (m) => m.tagId === selectedTag.id,
                        ).length
                      }{" "}
                      linked bubbles
                    </p>
                    {workspace.memberships
                      .filter((m) => m.tagId === selectedTag.id)
                      .map((m) => (
                        <button
                          className="linked-item"
                          title={
                            workspace.bubbles.find((b) => b.id === m.bubbleId)
                              ?.title
                          }
                          key={m.id}
                          onClick={() => setSelected(m.bubbleId)}
                        >
                          {
                            workspace.bubbles.find((b) => b.id === m.bubbleId)
                              ?.title
                          }
                        </button>
                      ))}
                  </>
                ) : (
                  <>
                    <h2>Select a bubble or tag</h2>
                    <p>Inspect its information and follow its connections.</p>
                    <div className="empty-illustration">◯ — ◉</div>
                    <p className="subtle">
                      Items with several tags appear once. Unlinked bubbles
                      remain in the collection.
                    </p>
                  </>
                )}
                {(selectedRecord || selectedTag) && (
                  <button
                    aria-pressed={pinnedIds.includes(selected!)}
                    onClick={() => graphRef.current?.setPinned(
                      selected!, !pinnedIds.includes(selected!),
                    )}
                  >
                    {pinnedIds.includes(selected!) ? "Unpin node" : "Pin node"}
                  </button>
                )}
                {(selectedRecord || selectedTag) && (
                  <button onClick={() => setEditing(selected!)}>
                    Edit {selectedTag ? "tag" : "bubble"}
                  </button>
                )}
                {selectedRecord && (
                  <>
                    <h3 className="mt-6">Manage linked tags</h3>
                    {workspace.tags.map((t) => (
                      <label className="membership-option" key={t.id}>
                        <input
                          type="checkbox"
                          checked={workspace.memberships.some(
                            (m) =>
                              m.bubbleId === selectedRecord.id &&
                              m.tagId === t.id,
                          )}
                          onChange={(e) =>
                            void save({
                              type: "membership.set",
                              bubbleId: selectedRecord.id,
                              tagId: t.id,
                              linked: e.target.checked,
                            }).catch((e) => setError(String(e)))
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </>
                )}
                <div className="inspector-note">
                  Changes are saved on this device. Download a backup to keep an
                  independent copy.
                </div>
              </aside>
            </div>
          </div>
        )}
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
      {history && !undoBatch && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <h2 id="history-title">Import history</h2>
            <p>
              Undo restores merged values and removes unchanged imported
              bubbles. Tags are kept for reuse.
            </p>
            {!workspace.batches.length && <p>No imports yet.</p>}
            {workspace.batches.map((b) => (
              <article key={b.id}>
                <strong>{b.source}</strong>
                <p>
                  {b.bubbleIds.length} affected bubbles ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </p>
                <button onClick={() => setUndoBatch(b.id)}>Review undo</button>
              </article>
            ))}
            <footer>
              <button onClick={() => setHistory(false)}>Close</button>
            </footer>
          </section>
        </div>
      )}
      {undoBatch &&
        (() => {
          const b = workspace.batches.find((b) => b.id === undoBatch);
          if (!b) return null;
          const changed = undoConflicts(workspace, b);
          return (
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="undo-title"
              >
                <h2 id="undo-title">Confirm import undo</h2>
                <p>
                  {b.bubbleIds.length - changed.length} unchanged bubbles will
                  be removed or restored to their previous values.
                </p>
                {changed.length > 0 && (
                  <div className="notice">
                    <strong>Keep these later edits</strong>
                    {changed.map((b) => (
                      <p key={b.id}>{b.title}</p>
                    ))}
                    <p>These records changed after import and will be kept.</p>
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
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void undo()}
                  >
                    Undo unchanged records
                  </button>
                </footer>
              </section>
            </div>
          );
        })()}
    </div>
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
