import { useMemo, useState } from "react";
import { builtInCopyPresets, composeCopy, defaultCopyOptions } from "../domain/copy";
import type { Bubble, CopyField, CopyPreset, Workspace } from "../domain/model";
import { Dialog } from "./Dialog";
import { Icon, IconButton } from "./Icon";

const fieldLabels: Record<CopyField, string> = {
  title: "Title",
  url: "URL",
  description: "Description",
  assetUrl: "Asset URL / filename",
  status: "Status",
  tags: "Tags",
};
const allFields = Object.keys(fieldLabels) as CopyField[];

export function CopyComposerDialog({
  workspace,
  tagId,
  currentBubbleIds,
  presets,
  onSavePreset,
  onDeletePreset,
  onClose,
}: {
  workspace: Workspace;
  tagId: string;
  currentBubbleIds: string[];
  presets: CopyPreset[];
  onSavePreset: (preset: CopyPreset) => Promise<void>;
  onDeletePreset: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const tag = workspace.tags.find((item) => item.id === tagId);
  const linked = useMemo(
    () =>
      workspace.memberships
        .filter((membership) => membership.tagId === tagId)
        .map((membership) => workspace.bubbles.find((bubble) => bubble.id === membership.bubbleId))
        .filter((bubble): bubble is Bubble => Boolean(bubble)),
    [workspace, tagId],
  );
  const availablePresets = [...builtInCopyPresets, ...presets];
  const [fields, setFields] = useState<CopyField[]>(defaultCopyOptions.fields);
  const [separator, setSeparator] = useState(defaultCopyOptions.separator);
  const [format, setFormat] = useState<CopyPreset["format"]>(defaultCopyOptions.format);
  const [template, setTemplate] = useState("");
  const [scope, setScope] = useState<CopyPreset["scope"]>("all");
  const [sort, setSort] = useState<CopyPreset["sort"]>(defaultCopyOptions.sort);
  const [presetId, setPresetId] = useState(builtInCopyPresets[0].id);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const selectedBubbles = scope === "all"
    ? linked
    : linked.filter((bubble) => currentBubbleIds.includes(bubble.id));
  const output = useMemo(
    () => composeCopy(selectedBubbles, workspace, { fields, separator, format, template, sort }),
    [selectedBubbles, workspace, fields, separator, format, template, sort],
  );
  const activePreset = availablePresets.find((preset) => preset.id === presetId);
  const isBuiltInPreset = builtInCopyPresets.some((preset) => preset.id === presetId);

  function loadPreset(id: string) {
    const preset = availablePresets.find((item) => item.id === id);
    setPresetId(id);
    if (!preset) {
      setPresetName("");
      setFields(defaultCopyOptions.fields);
      setSeparator(defaultCopyOptions.separator);
      setFormat(defaultCopyOptions.format);
      setTemplate("");
      setScope("all");
      setSort(defaultCopyOptions.sort);
      return;
    }
    setPresetName(builtInCopyPresets.some((item) => item.id === preset.id) ? "" : preset.name);
    setFields([...preset.fields]);
    setSeparator(preset.separator);
    setFormat(preset.format);
    setTemplate(preset.template ?? "");
    setScope(preset.scope);
    setSort(preset.sort);
  }

  function toggleField(field: CopyField) {
    setFields((current) =>
      current.includes(field)
        ? current.length === 1 ? current : current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  function moveField(index: number, offset: -1 | 1) {
    const next = [...fields], target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  async function savePreset() {
    if (busy || !presetName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const preset: CopyPreset = {
        id: presetId && !isBuiltInPreset ? presetId : crypto.randomUUID(),
        name: presetName.trim(),
        fields,
        separator,
        format,
        template: template || undefined,
        scope,
        sort,
      };
      await onSavePreset(preset);
      setPresetId(preset.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset() {
    if (!presetId || isBuiltInPreset || busy) return;
    setBusy(true);
    setError("");
    try {
      await onDeletePreset(presetId);
      loadPreset(builtInCopyPresets[0].id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    setError("");
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was unavailable. Select the preview and copy it manually.");
    }
  }

  if (!tag) return null;
  return (
    <Dialog labelledBy="copy-title" onClose={() => { if (!busy) onClose(); }} className="copy-dialog">
      <div className="modal-heading">
        <div>
          <div className="eyebrow">COPY COMPOSER</div>
          <h2 id="copy-title">Copy bubbles from “{tag.name}”</h2>
        </div>
        <IconButton label="Close copy composer" icon="close" size={17} disabled={busy} onClick={onClose} />
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="copy-result">
        <div className="copy-result-heading">
          <div>
            <div className="eyebrow">READY TO COPY</div>
            <h3>{selectedBubbles.length} bubble{selectedBubbles.length === 1 ? "" : "s"}</h3>
            <p className="subtle">{activePreset ? `Using ${activePreset.name}` : "Using custom settings"}</p>
          </div>
          <button className="primary copy-result-button" aria-label="Copy generated text" disabled={!output || busy} onClick={() => void copyOutput()}>
            <Icon name="copy" size={15} />{copied ? "Copied" : "Copy text"}
          </button>
        </div>
        <pre className="copy-preview">{output || "No matching bubbles produce output with these settings."}</pre>
      </section>
      <fieldset className="status-scope copy-scope"><legend>Source bubbles</legend><label><input type="radio" name="copy-scope" checked={scope === "all"} onChange={() => setScope("all")} />All linked bubbles ({linked.length})</label><label><input type="radio" name="copy-scope" checked={scope === "current"} onChange={() => setScope("current")} />Current view ({selectedBubbles.length})</label></fieldset>
      <details className="copy-options-disclosure">
        <summary><span>Customize copy</span><span className="subtle">Preset, fields, format, and source</span><Icon name="chevron-down" size={16} /></summary>
        <div className="copy-options-content">
          <div className="saved-view-row">
            <label>Preset
              <select aria-label="Copy preset" value={presetId} onChange={(event) => loadPreset(event.target.value)}>
                <option value="">Custom settings</option>
                <optgroup label="Quick presets">
                  {builtInCopyPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </optgroup>
                {presets.length > 0 && <optgroup label="Your presets">
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </optgroup>}
              </select>
            </label>
            <label>Preset name
              <input aria-label="Preset name" value={presetName} placeholder="e.g. Weekly update" onChange={(event) => setPresetName(event.target.value)} />
            </label>
          </div>
          <section className="copy-fields">
            <div className="section-heading"><div><h3>Fields and order</h3><p className="subtle">Unavailable values are omitted. Local media uses its filename.</p></div></div>
            {fields.map((field, index) => <div className="copy-field-row" key={field}><label><input type="checkbox" checked onChange={() => toggleField(field)} />{fieldLabels[field]}</label><span><button aria-label={`Move ${fieldLabels[field]} up`} disabled={index === 0} onClick={() => moveField(index, -1)}>↑</button><button aria-label={`Move ${fieldLabels[field]} down`} disabled={index === fields.length - 1} onClick={() => moveField(index, 1)}>↓</button></span></div>)}
            <div className="copy-optional-fields"><strong>Add fields</strong>{allFields.filter((field) => !fields.includes(field)).map((field) => <label key={field}><input type="checkbox" checked={false} onChange={() => toggleField(field)} />{fieldLabels[field]}</label>)}</div>
          </section>
          <div className="copy-options-grid">
            <label>Format<select value={format} onChange={(event) => setFormat(event.target.value as CopyPreset["format"])}><option value="plain">Plain text</option><option value="markdown">Markdown</option></select></label>
            <label>Field separator<input aria-label="Field separator" value={separator === "\n" ? "\\n" : separator} onChange={(event) => setSeparator(event.target.value === "\\n" ? "\n" : event.target.value)} /></label>
            <label>Order<select value={sort} onChange={(event) => setSort(event.target.value as CopyPreset["sort"])}><option value="title">Title</option><option value="createdAt">Created</option><option value="status">Status</option></select></label>
          </div>
          <label>Template <span className="subtle">optional: &#123;&#123;title&#125;&#125;, &#123;&#123;url&#125;&#125;, &#123;&#123;description&#125;&#125;, &#123;&#123;assetUrl&#125;&#125;, &#123;&#123;status&#125;&#125;, &#123;&#123;tags&#125;&#125;</span><textarea aria-label="Copy template" placeholder="{{title}}\n{{url}}\n{{description}}" value={template} onChange={(event) => setTemplate(event.target.value)} /></label>
          <footer className="copy-options-footer">
            {presetId && !isBuiltInPreset && <button disabled={busy} onClick={() => void deletePreset()}>Delete preset</button>}
            <button disabled={busy || !presetName.trim()} onClick={() => void savePreset()}>{busy ? "Saving…" : presetId && !isBuiltInPreset ? "Update preset" : "Save as preset"}</button>
          </footer>
        </div>
      </details>
      <footer>
        <button disabled={busy} onClick={onClose}>Close</button>
      </footer>
    </Dialog>
  );
}
