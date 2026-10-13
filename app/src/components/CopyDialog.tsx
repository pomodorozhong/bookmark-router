import { useState } from "react";
import { Dialog } from "./Dialog";
import { IconButton } from "./Icon";
import type { Bubble, Workspace } from "../domain/model";
import { copyFields, copyPresets, formatCopy } from "../domain/triage";

export type CopyScope = "selection" | "list" | "current";
const separators: Array<[string, string]> = [["\n", "New line"], ["\n\n", "Blank line"], [", ", "Comma"], [" ", "Space"]];
const previewLimit = 40;

// The template is remembered on this device, not per collection.
function remembered(): { template: string; separator: string } {
  try {
    const saved = JSON.parse(localStorage.getItem("bubble-tag-copy") ?? "null");
    if (typeof saved?.template === "string" && typeof saved?.separator === "string") return saved;
  } catch { /* fall back to the first preset */ }
  return copyPresets[0];
}
function remember(value: { template: string; separator: string }) {
  try { localStorage.setItem("bubble-tag-copy", JSON.stringify(value)); } catch { /* copy still works */ }
}

export function CopyDialog({ workspace, scopes, initialScope, onClose, onCopied }: {
  workspace: Workspace;
  scopes: Record<CopyScope, Bubble[] | undefined>;
  initialScope: CopyScope;
  onClose: () => void;
  onCopied: (count: number) => void;
}) {
  const [{ template, separator }, setFormat] = useState(remembered);
  const [scope, setScope] = useState<CopyScope>(initialScope);
  const [failure, setFailure] = useState("");
  const items = scopes[scope] ?? [];
  const update = (next: { template: string; separator: string }) => { setFormat(next); remember(next); };
  const labels: Record<CopyScope, string> = {
    selection: `Selected (${scopes.selection?.length ?? 0})`,
    list: `This list (${scopes.list?.length ?? 0})`,
    current: "Current bookmark",
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(formatCopy(items, workspace, template, separator));
      onCopied(items.length);
    } catch {
      setFailure("The clipboard is unavailable. Select the preview text and copy it manually.");
    }
  }
  return (
    <Dialog labelledBy="copy-title" onClose={onClose} className="copy-modal">
      <div className="modal-heading">
        <h2 id="copy-title">Copy {items.length} bookmark{items.length === 1 ? "" : "s"}</h2>
        <IconButton label="Close" icon="close" onClick={onClose} />
      </div>
      <div className="copy-presets" role="group" aria-label="Presets">
        {copyPresets.map((preset) => (
          <button key={preset.name} aria-pressed={preset.template === template && preset.separator === separator}
            onClick={() => update(preset)}>{preset.name}</button>
        ))}
      </div>
      <label>Template
        <textarea rows={2} spellCheck={false} value={template} onChange={(e) => update({ template: e.target.value, separator })} />
      </label>
      <p className="copy-fields">Fields: {copyFields.map((f) => <code key={f}>{`{${f}}`}</code>)}</p>
      <div className="copy-options">
        <label>Between items
          <select value={JSON.stringify(separator)} onChange={(e) => update({ template, separator: JSON.parse(e.target.value) })}>
            {separators.map(([value, label]) => <option key={label} value={JSON.stringify(value)}>{label}</option>)}
          </select>
        </label>
        <label>Bookmarks
          <select value={scope} onChange={(e) => setScope(e.target.value as CopyScope)}>
            {(Object.keys(labels) as CopyScope[]).map((key) => (
              <option key={key} value={key} disabled={!scopes[key]?.length}>{labels[key]}</option>
            ))}
          </select>
        </label>
      </div>
      <pre className="copy-preview" aria-label="Preview">
        {formatCopy(items.slice(0, previewLimit), workspace, template, separator)}{items.length > previewLimit ? "\n…" : ""}
      </pre>
      {failure && <p className="url-warning" role="alert">{failure}</p>}
      <div className="copy-footer">
        <span className="subtle">{scope === "current" ? "" : "Same order as the queue"}</span>
        <button className="primary" disabled={!items.length} onClick={() => void copy()}>Copy text</button>
      </div>
    </Dialog>
  );
}
