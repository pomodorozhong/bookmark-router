import { useEffect, useMemo, useRef, useState } from "react";
import { TriageScreen } from "./components/TriageScreen";
import { AgentMenu, CollectionMenu, MoreMenu, type LocalAgentStatus } from "./components/AppMenus";
import { Toast, type ToastMessage } from "./components/Toast";
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
  type Workspace,
  type Geometry,
} from "./domain/model";
import { WorkspaceStore } from "./domain/storage";
import { ConflictError, type Command } from "./domain/commands";
import { undoConflicts } from "./domain/import-commands";
import { RecordEditor } from "./components/RecordEditor";
import { TagTypesDialog } from "./components/TagTypesDialog";
import { Dialog, DialogHeader } from "./components/Dialog";
import { Icon, type IconName } from "./components/Icon";
import { AgentReviewDialog } from "./components/AgentReviewDialog";
import { AgentInputError, AgentReviewSession } from "./domain/agent-review";
import { ensureDocumentWebMcpContext, registerAgentTools } from "./agent/webmcp";
import { connectLocalRelay, installLocalAgentRuntime } from "./agent/local-relay";
import { readCopyFormat, type CopyContext } from "./copy-settings";
import { useThumbnails } from "./use-thumbnails";
import { setFindOnline } from "./thumbnail-settings";
const store = new WorkspaceStore();
const loadReviewMedia = (id: string) => store.media(id);
const localAgentPreferenceKey = "bookmark-tag-local-agent-enabled";
function activeCollection() {
  try {
    return localStorage.getItem("bookmark-tag-active");
  } catch {
    return null;
  }
}
function rememberCollection(id: string) {
  try {
    localStorage.setItem("bookmark-tag-active", id);
  } catch {
    /* IndexedDB content still persists when preferences are unavailable. */
  }
}
function localAgentPreference() {
  try {
    return localStorage.getItem(localAgentPreferenceKey) === "true";
  } catch {
    return false;
  }
}
function rememberLocalAgent(enabled: boolean) {
  try {
    localStorage.setItem(localAgentPreferenceKey, String(enabled));
  } catch {
    /* The connection can still be enabled for this tab when preferences are unavailable. */
  }
}
const fieldLabels: Record<Field, string> = {
  title: "Title",
  description: "Description",
  url: "URL",
  mediaUrl: "Media URL",
  status: "Status",
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
    [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false),
    [collections, setCollections] = useState<Workspace[]>([]),
    [geometry, setGeometry] = useState<Geometry>(),
    [editing, setEditing] = useState<string>(),
    [history, setHistory] = useState(false),
    [undoBatch, setUndoBatch] = useState<string>(),
    [toast, setToast] = useState<ToastMessage>(),
    [deleting, setDeleting] = useState<Workspace>(),
    [tagTypesOpen, setTagTypesOpen] = useState(false),
    [promptKind, setPromptKind] = useState<"collection" | "tag">(),
    [promptValue, setPromptValue] = useState("");
  const [nextUndo, setNextUndo] = useState<Awaited<ReturnType<WorkspaceStore["nextUndo"]>>>();
  const [, renderAgentReview] = useState(0);
  const [agentSession] = useState(() => new AgentReviewSession(() => renderAgentReview((v) => v + 1)));
  const [agentReviewOpen, setAgentReviewOpen] = useState(false);
  const [agentAvailability, setAgentAvailability] = useState<"checking" | "available" | "unavailable" | "failed">("checking");
  const [localAgentEnabled, setLocalAgentEnabled] = useState(() => localAgentPreference());
  const [localAgentStatus, setLocalAgentStatus] = useState<LocalAgentStatus>(() => localAgentPreference() ? "searching" : "off");
  const [agentError, setAgentError] = useState("");
  const agentApplying = useRef(false), switchingCollection = useRef(false);
  const copyContext = useRef<CopyContext | undefined>(undefined);
  const toastId = useRef(0);
  const notify = (text: string, undo?: () => void) => setToast({ id: ++toastId.current, text, undo });
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>(
      {},
    ),
    [typeMapping, setTypeMapping] = useState<Record<string, string>>({}),
    [invalidAcknowledged, setInvalidAcknowledged] = useState(false),
    [reviewTarget, setReviewTarget] = useState<Workspace>();
  const submitting = useRef(false),
    workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [confirmThumbnails, setConfirmThumbnails] = useState(false);
  const thumbnails = useThumbnails(store, workspace.id, loaded, (next) => {
    if (!switchingCollection.current && next.id === workspaceRef.current.id && next.revision >= workspaceRef.current.revision) {
      workspaceRef.current = next;
      setWorkspace(next);
    }
  });
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
          if (w.bookmarks.length) setScreen("workspace");
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
      const id = workspaceRef.current.id;
      void store.get(id).then((w) => {
        if (w && id === workspaceRef.current.id && !switchingCollection.current && (w.revision > workspaceRef.current.revision
          || (w.revision === workspaceRef.current.revision && JSON.stringify(w.bookmarks.map((b) => b.thumbnail)) !== JSON.stringify(workspaceRef.current.bookmarks.map((b) => b.thumbnail))))) {
          const edited = w.revision > workspaceRef.current.revision;
          workspaceRef.current = w;
          if (edited) agentSession.refresh(w);
          setWorkspace(w);
          void store.nextUndo(w.id).then(setNextUndo);
          if (edited) notify("This collection changed in another tab. Review pending changes again.");
        }
      }).catch((e) => setError("Unable to refresh local storage: " + String(e)));
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [loaded]);
  useEffect(() => { agentSession.refresh(workspace); }, [workspace, agentSession]);
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    let stopRelay: (() => void) | undefined;
    const host = { session: agentSession, getCopyContext: () => copyContext.current, getCopyFormat: readCopyFormat, getWorkspace: async () => {
      const id = workspaceRef.current.id;
      if (switchingCollection.current) throw new AgentInputError("The collection is switching. Read it again when ready.", "collection_switching");
      const latest = await store.get(id);
      if (switchingCollection.current || id !== workspaceRef.current.id) throw new AgentInputError("The active collection changed. Read it again.", "collection_switching");
      if (!latest) throw new ConflictError("The active collection is no longer available.");
      if (latest.revision < workspaceRef.current.revision) return workspaceRef.current;
      if (latest.revision > workspaceRef.current.revision) {
        setWorkspace(latest);
        void store.nextUndo(id).then(setNextUndo);
      }
      return latest;
    } };
    async function setupAgentConnection() {
      setAgentAvailability("checking");
      let agentContext = ensureDocumentWebMcpContext();
      if (localAgentEnabled) {
        setLocalAgentStatus("starting");
        agentContext = await installLocalAgentRuntime();
      } else {
        setLocalAgentStatus("off");
      }
      const handle = await registerAgentTools(host, agentContext, controller.signal);
      if (controller.signal.aborted) return;
      setAgentAvailability(handle.available ? "available" : "unavailable");
      if (!localAgentEnabled) return;
      try {
        if (!agentContext) throw new Error("The local agent context is unavailable.");
        stopRelay = connectLocalRelay(agentContext, controller.signal, (status) => {
          if (!controller.signal.aborted) setLocalAgentStatus(status);
        });
      } catch {
        if (!controller.signal.aborted) setLocalAgentStatus("failed");
      }
    }
    void setupAgentConnection().catch(() => {
      if (!controller.signal.aborted) {
        setAgentAvailability("failed");
        if (localAgentEnabled) setLocalAgentStatus("failed");
      }
    });
    return () => {
      controller.abort();
      stopRelay?.();
    };
  }, [loaded, agentSession, localAgentEnabled]);
  async function openWorkspace(w: Workspace) {
    if (agentApplying.current || switchingCollection.current) return;
    switchingCollection.current = true;
    try {
      const latest = await store.get(w.id);
      if (!latest) throw new ConflictError("This collection is no longer available.");
      const layout = await store.getGeometry(w.id), undo = await store.nextUndo(w.id);
      if (w.id !== workspaceRef.current.id) {
        agentSession.reset();
        setAgentReviewOpen(false);
        setAgentError("");
      }
      workspaceRef.current = latest;
      setGeometry(layout);
      setWorkspace(latest);
      rememberCollection(w.id);
      setNextUndo(undo);
      setToast(undefined);
      setScreen("workspace");
    } finally { switchingCollection.current = false; }
  }
  async function publish(w: Workspace) {
    agentSession.refresh(w);
    workspaceRef.current = w;
    setWorkspace(w);
    const entry = await store.nextUndo(w.id);
    setNextUndo(entry);
    setCollections(await store.list());
    return entry;
  }
  async function save(command: Command | Command[], label?: string) {
    if (agentApplying.current || switchingCollection.current) throw new AgentInputError("Wait for the collection to finish saving.", "review_busy");
    try {
      const current = await store.command(workspace.id, workspace.revision, command, label);
      const entry = await publish(current);
      // Every saved change can be undone from its toast.
      if (entry?.revision === current.revision) notify(entry.label, () => void undoRef.current());
    } catch (e) {
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
      throw e;
    }
  }
  async function applyAgentBatch(reviewedRevision?: number) {
    const proposal = agentSession.current;
    if (!proposal || submitting.current || busy || switchingCollection.current) return;
    submitting.current = true;
    agentApplying.current = true;
    setBusy(true);
    setAgentError("");
    try {
      const latest = await store.get(workspaceRef.current.id);
      if (!latest) throw new ConflictError("The active collection is no longer available.");
      const saved = await agentSession.apply(proposal.id, latest, store.command.bind(store), reviewedRevision === undefined ? undefined : { reviewedRevision });
      const entry = await publish(saved);
      setAgentReviewOpen(false);
      notify(entry?.label ?? "Agent batch applied", () => void undoRef.current());
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : String(e));
      const latest = await store.get(workspaceRef.current.id).catch(() => undefined);
      if (latest) await publish(latest);
    } finally {
      agentApplying.current = false;
      submitting.current = false;
      setBusy(false);
    }
  }
  async function openAgentReview() {
    if (busy || agentApplying.current || switchingCollection.current) return;
    const id = workspaceRef.current.id;
    setAgentError("");
    try {
      const latest = await store.get(id);
      if (switchingCollection.current || id !== workspaceRef.current.id) return;
      if (!latest) throw new ConflictError("The active collection is no longer available.");
      if (latest.revision >= workspaceRef.current.revision) {
        agentSession.refresh(latest);
        workspaceRef.current = latest;
        setWorkspace(latest);
        void store.nextUndo(id).then(setNextUndo);
      }
    } catch (e) { setAgentError(e instanceof Error ? e.message : String(e)); }
    setAgentReviewOpen(true);
  }
  async function undoLastAction() {
    if (!nextUndo || nextUndo.revision !== workspace.revision || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await store.undoLast(workspace.id, workspace.revision, nextUndo.id);
      await publish(next);
      notify(`Undid: ${nextUndo.label}`);
    } catch (e) {
      setError(String(e));
      const latest = await store.get(workspace.id);
      if (latest) await publish(latest);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const undoRef = useRef(undoLastAction);
  undoRef.current = undoLastAction;
  const undoAvailable = Boolean(nextUndo && nextUndo.revision === workspace.revision);
  // Cmd/Ctrl+Z undoes the last saved change anywhere outside a text field or dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      if ((e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      void undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function deleteCollection(target: Workspace) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await store.remove(target.id);
      let rest = await store.list();
      if (!rest.length) {
        await store.create(emptyWorkspace());
        rest = await store.list();
      }
      setCollections(rest);
      if (target.id === workspace.id) {
        const next = rest.find((w) => w.id !== target.id)!;
        await openWorkspace(next);
        if (!next.bookmarks.length) setScreen("import");
      }
      setDeleting(undefined);
      notify(`Deleted: ${target.name}`);
    } catch (e) {
      setError(String(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
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
  async function backup(id = workspace.id) {
    try {
      const data = await store.backup(id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "bookmark-tag-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Backup downloaded. Stored thumbnails and uploaded media are bundled; remote media remains linked.");
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
        notify("Backup restored into a new collection.");
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
        notify(
          `${selectedRows.length} source rows applied: ${next.bookmarks.length - workspace.bookmarks.length} new bookmarks and ${selectedRows.filter((c) => choices[c.row] === "merge").length} merges.`,
          () => void undoRef.current(),
        );
      }
      setStep(0);
      setParsed(undefined);
      setReviewTarget(undefined);
      if (!workspace.bookmarks.length) void navigator.storage?.persist?.().catch(() => {});
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
      notify(changed.length ? `Import undone · ${changed.length} edited ${changed.length === 1 ? "bookmark" : "bookmarks"} kept` : "Import undone");
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
  // In the triage screen the message sits over the graph; an error outranks it and stays until closed.
  const shown: ToastMessage | undefined = screen === "workspace" && error ? { id: -1, text: error, error: true } : toast;
  const toastElement = shown && <Toast key={shown.id} toast={shown} onClose={() => (shown.error ? setError("") : setToast(undefined))} />;
  const undoButton = (
    <button className="header-undo" aria-label="Undo" disabled={!undoAvailable || busy} onClick={() => void undoLastAction()}
      title={undoAvailable ? `Undo: ${nextUndo!.label} (⌘Z)` : "Nothing to undo"}>
      <Icon name="undo" size={15} /><span className="header-undo-label">Undo</span>
    </button>
  );
  const agentProposal = agentSession.current;
  const agentPending = Boolean(agentSession.pending);
  const agentMenu = <AgentMenu pending={agentPending} busy={busy} onReview={() => void openAgentReview()} localAgentEnabled={localAgentEnabled} localAgentStatus={localAgentStatus}
    onLocalAgentChange={(enabled) => { rememberLocalAgent(enabled); setLocalAgentEnabled(enabled); setLocalAgentStatus(enabled ? "starting" : "off"); }} />;
  function restoreBackup() {
    setScreen("import");
    setFormat("json");
    setStep(0);
    setText("");
    setFilename("");
  }
  const collectionMenu = (
    <CollectionMenu workspace={workspace} collections={collections} onOpen={(w) => void openWorkspace(w).catch((e) => setError(String(e)))} onDelete={setDeleting}
      onNew={() => { setPromptKind("collection"); setPromptValue(""); }} />
  );
  const moreMenu = (
    <MoreMenu
      onAddBookmark={() => setScreen("import")}
      onAddTag={() => { setPromptKind("tag"); setPromptValue(""); }}
      onTagTypes={() => setTagTypesOpen(true)}
      onHistory={() => setHistory(true)}
      onDownload={() => void backup()}
      onRestore={restoreBackup}
      onDelete={() => setDeleting(workspace)}
      thumbnailsOnline={thumbnails.enabled}
      thumbnailStatus={thumbnails.status}
      onThumbnails={() => thumbnails.enabled ? setFindOnline(false) : setConfirmThumbnails(true)}
    />
  );
  return (
    <div
      className={`app-shell ${screen === "workspace" ? "workspace-mode" : "import-mode"}`}
    >
      <main className="main-area">
        {screen === "import" && (
          <header className="topbar">
            {collectionMenu}
            <span className="topbar-end">{undoButton}{agentMenu}{moreMenu}</span>
          </header>
        )}
        {screen === "import" && toastElement}
        {screen === "import" ? (
          <div className="import-page">
            <button className="back-link" onClick={() => setScreen("workspace")}>
              <Icon name="arrow-left" size={15} /> Back to {workspace.name}
            </button>
            <div className="page-heading">
              <div className="eyebrow">START WITH YOUR OWN DATA</div>
              <h1>Bring your collection in.</h1>
              <p>
                Links, notes, or a whole export. Review everything before it
                becomes a bookmark.
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
                    <h2>Connect columns to bookmark fields</h2>
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
                    ? `${parsed.restore.workspace.bookmarks.length} bookmarks and ${parsed.restore.media.length} bundled media files. A new collection will be created; the current collection is kept.`
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
                      history lets you undo these changes. Bookmarks edited after
                      import are kept when you undo.
                    </div>
                  </>
                )}
                <p className="subtle">Nothing is saved until you confirm.</p>
              </section>
            )}
            <footer className="wizard-footer">
              <div className="wizard-footer-start">
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
              </div>
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
          <TriageScreen
            key={workspace.id}
            workspace={workspace}
            onCopyContext={(context) => { copyContext.current = context; }}
            geometry={geometry}
            onGeometry={(g) => {
              setGeometry(g);
              void store.saveGeometry(g).catch((e) => setError("Unable to save graph positions: " + String(e)));
            }}
            save={save}
            loadMedia={loadReviewMedia}
            onThumbnail={thumbnails.find}
            toast={toastElement}
            notify={notify}
            onEdit={setEditing}
            onImport={() => setScreen("import")}
            onTagTypes={() => setTagTypesOpen(true)}
            onError={setError}
            headerStart={collectionMenu}
            headerEnd={<>{undoButton}{agentMenu}{moreMenu}</>}
          />
        )}
      </main>
      {confirmThumbnails && <Dialog labelledBy="thumbnails-title" className="prompt-modal" onClose={() => setConfirmThumbnails(false)}>
        <DialogHeader id="thumbnails-title" label="Thumbnails" title="Find thumbnails online?" onClose={() => setConfirmThumbnails(false)} />
        <p>This fills in missing thumbnails for the active collection and continues when you open another collection. Stored thumbnails and attached images are skipped.</p>
        <p>Bookmark links, image links, or domains may be sent to YouTube, FxTwitter, GitHub, wsrv.nl, Microlink, Raindrop, Google, and DuckDuckGo. The search stops at the first image found.</p>
        <p>Images are stored on this device and included in backups. Microlink allows 25 lookups a day; remaining bookmarks wait for another day. You can turn this off from More actions.</p>
        <footer>
          <button onClick={() => setConfirmThumbnails(false)}>Cancel</button>
          <button className="primary" onClick={() => { setConfirmThumbnails(false); setFindOnline(true); }}>Turn on and find</button>
        </footer>
      </Dialog>}
      {agentReviewOpen && <AgentReviewDialog proposal={agentProposal} proposals={agentSession.batches} workspace={workspace} availability={agentAvailability} busy={busy} error={agentError} loadMedia={loadReviewMedia}
        onApply={() => void applyAgentBatch()}
        onApplyAnyway={(revision) => void applyAgentBatch(revision)}
        onSetAside={() => { if (agentProposal && !busy) { agentSession.setAside(agentProposal.id); setAgentError(""); notify("Batch set aside. Nothing saved; you can apply it later."); } }}
        onSelect={(id) => { if (!busy) { agentSession.select(id); setAgentError(""); } }}
        onClose={() => setAgentReviewOpen(false)} />}
      {editing && (
        <RecordEditor
          key={editing}
          workspace={workspace}
          id={editing}
          onSave={save}
          onClose={() => setEditing(undefined)}
          onNewType={() => setTagTypesOpen(true)}
        />
      )}
      {tagTypesOpen && <TagTypesDialog workspace={workspace} save={save} onClose={() => setTagTypesOpen(false)} />}
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
      {deleting && (
        <Dialog labelledBy="delete-title" className="delete-modal" onClose={() => { if (!busy) setDeleting(undefined); }}>
          <DialogHeader id="delete-title" label="Collection" title={<>Delete “{deleting.name}”?</>} disabled={busy} onClose={() => setDeleting(undefined)} />
          <p>This removes it from this device and can't be undone:</p>
          <ul>
            <li>{deleting.bookmarks.length} bookmarks and {deleting.tags.length} tags</li>
            <li>Their images, notes, and import history</li>
            <li>Graph positions and pins</li>
          </ul>
          <div className="delete-backup">
            <span>Keep a copy you can restore later.</span>
            <button onClick={() => void backup(deleting.id)}><Icon name="download" size={15} /> Download backup</button>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setDeleting(undefined)}>Cancel</button>
            <button className="danger" disabled={busy} onClick={() => void deleteCollection(deleting)}>
              <Icon name="trash" size={15} /> {busy ? "Deleting…" : "Delete collection"}
            </button>
          </footer>
        </Dialog>
      )}
      {history && !undoBatch && (
        <Dialog labelledBy="history-title" onClose={() => setHistory(false)}>
            <DialogHeader id="history-title" label="Import" title="Import history" onClose={() => setHistory(false)} />
            <p>
              Undo an import to remove new bookmarks and restore merged bookmarks
              to their previous values. Bookmarks edited after import and imported
              tags are kept.
            </p>
            {!workspace.batches.length && <p>No imports yet.</p>}
            {workspace.batches.map((b) => (
              <article key={b.id}>
                <strong>{b.source}</strong>
                <p>
                  {b.bookmarkIds.length} affected bookmarks ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </p>
                <button onClick={() => setUndoBatch(b.id)}>Review import undo</button>
              </article>
            ))}
        </Dialog>
      )}
      {undoBatch &&
        (() => {
          const b = workspace.batches.find((b) => b.id === undoBatch);
          if (!b) return null;
          const changed = undoConflicts(workspace, b);
          return (
            <Dialog labelledBy="undo-title" onClose={() => { if (!busy) setUndoBatch(undefined); }}>
                <DialogHeader id="undo-title" label="Import" title="Undo this import?" disabled={busy} onClose={() => setUndoBatch(undefined)} />
                <p>
                  {b.bookmarkIds.length - changed.length} unchanged bookmarks will
                  be affected. New bookmarks will be removed; merged bookmarks will
                  return to their values and tags from before this import.
                  Imported tags will remain available.
                </p>
                {changed.length > 0 && (
                  <div className="notice">
                    <strong>Bookmarks to keep</strong>
                    {changed.map((b) => (
                      <p key={b.id}>{b.title}</p>
                    ))}
                    <p>These bookmarks were edited after import. Undo will keep their current values and tags.</p>
                  </div>
                )}
                <ul>
                  {b.bookmarkIds
                    .filter((id) => !changed.some((c) => c.id === id))
                    .map((id) => (
                      <li key={id}>
                        {workspace.bookmarks.find((b) => b.id === id)?.title}
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
        <DialogHeader id="prompt-title" label={kind === "collection" ? "Collection" : "Tag"} title={`Create a ${kind}`} disabled={submitting} onClose={onClose} />
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
          {kind === "collection" ? "A new collection starts empty and stays on this device." : "Add it to bookmarks from the Tags section of the bookmark panel."}
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
  const existing = workspace.bookmarks.find((b) => b.id === c.duplicate?.id);
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
              ? `Same URL as ${c.duplicate.kind === "workspace" ? "existing bookmark" : "source row " + c.duplicate.row}: “${c.duplicate.title}”`
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
