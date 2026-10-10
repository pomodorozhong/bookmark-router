import { useState } from "react";
import type { Filter, Workspace } from "../domain/model";
import { Icon } from "./Icon";

type LeafKind =
  | "text"
  | "url"
  | "status"
  | "tags"
  | "tag-type"
  | "tag-status"
  | "asset"
  | "date"
  | "distance"
  | "missing"
  | "no-tags"
  | "batch"
  | "same-tag";

function newLeaf(kind: LeafKind, workspace: Workspace): Filter {
  if (kind === "text") return { op: "text", value: "" };
  if (kind === "url") return { op: "url", value: "", mode: "contains" };
  if (kind === "status") return { op: "status", ids: workspace.statuses.slice(0, 1).map((status) => status.id) };
  if (kind === "tags") return { op: "tags", ids: workspace.tags.slice(0, 1).map((tag) => tag.id), mode: "any" };
  if (kind === "tag-type") return { op: "tag-type", ids: workspace.tagTypes.slice(0, 1).map((type) => type.id) };
  if (kind === "tag-status") return { op: "tag-status", ids: workspace.statuses.slice(0, 1).map((status) => status.id) };
  if (kind === "asset") return { op: "asset", present: true };
  if (kind === "date") return { op: "date", field: "createdAt" };
  if (kind === "distance") return { op: "distance", tagIds: workspace.tags.slice(0, 1).map((tag) => tag.id), hops: 1 };
  if (kind === "missing") return { op: "missing", field: "description" };
  if (kind === "no-tags") return { op: "no-tags" };
  if (kind === "batch") return { op: "batch", id: workspace.batches[0]?.id ?? "" };
  return { op: "same-tag", name: "" };
}

function labelFor(filter: Filter): string {
  if (filter.op === "all") return "All conditions";
  if (filter.op === "any") return "Any condition";
  if (filter.op === "not") return "Not";
  if (filter.op === "text") return "Bubble text";
  if (filter.op === "url") return "URL / domain";
  if (filter.op === "status") return "Bubble status";
  if (filter.op === "tags") return "Specific tag";
  if (filter.op === "tag-type") return "Tag type";
  if (filter.op === "tag-status") return "Linked tag status";
  if (filter.op === "asset") return "Asset";
  if (filter.op === "date") return "Date";
  if (filter.op === "distance") return "Tag distance";
  if (filter.op === "missing") return "Missing field";
  if (filter.op === "no-tags") return "No linked tags";
  if (filter.op === "batch") return "Import batch";
  return "Same linked tag";
}

function CheckboxOptions({
  values,
  selected,
  onChange,
}: {
  values: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="filter-checkboxes">
      {values.map((value) => (
        <label key={value.id}>
          <input
            type="checkbox"
            checked={selected.includes(value.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, value.id]
                  : selected.filter((id) => id !== value.id),
              )
            }
          />
          {value.label}
        </label>
      ))}
    </div>
  );
}

export function FilterBuilder({
  filter,
  workspace,
  onChange,
}: {
  filter: Filter;
  workspace: Workspace;
  onChange: (filter: Filter) => void;
}) {
  return (
    <div className="filter-builder">
      <FilterNode
        filter={filter}
        workspace={workspace}
        depth={0}
        onChange={onChange}
      />
    </div>
  );
}

function FilterNode({
  filter,
  workspace,
  depth,
  onChange,
  onRemove,
}: {
  filter: Filter;
  workspace: Workspace;
  depth: number;
  onChange: (filter: Filter) => void;
  onRemove?: () => void;
}) {
  const [newKind, setNewKind] = useState<LeafKind | "">("");
  const add = (kind: LeafKind | "") => {
    if (!kind) return;
    if (filter.op !== "all" && filter.op !== "any") return;
    onChange({ ...filter, rules: [...filter.rules, newLeaf(kind, workspace)] });
    setNewKind("");
  };
  if (filter.op === "all" || filter.op === "any") {
    return (
      <section className={`filter-group depth-${Math.min(depth, 3)}`}>
        <div className="filter-group-heading">
          <select
            aria-label="Filter group operator"
            value={filter.op}
            onChange={(event) =>
              onChange({ ...filter, op: event.target.value as "all" | "any" })
            }
          >
            <option value="all">All</option>
            <option value="any">Any</option>
          </select>
          <span className="subtle">of these conditions</span>
          {onRemove && (
            <button className="filter-remove" onClick={onRemove} aria-label="Remove filter group">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <div className="filter-rules">
          {filter.rules.map((rule, index) => (
            <FilterNode
              key={index}
              filter={rule}
              workspace={workspace}
              depth={depth + 1}
              onChange={(next) =>
                onChange({
                  ...filter,
                  rules: filter.rules.map((current, currentIndex) =>
                    currentIndex === index ? next : current,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...filter,
                  rules: filter.rules.filter((_, currentIndex) => currentIndex !== index),
                })
              }
            />
          ))}
        </div>
        <div className="filter-add-row">
          <select
            aria-label="Add filter condition"
            value={newKind}
            onChange={(event) => {
              const kind = event.target.value as LeafKind | "";
              setNewKind(kind);
              add(kind);
            }}
          >
            <option value="">Add condition…</option>
            <option value="text">Bubble text</option>
            <option value="url">URL or domain</option>
            <option value="status">Bubble status</option>
            <option value="tags">Specific tag</option>
            <option value="tag-type">Tag type</option>
            <option value="tag-status">Linked tag status</option>
            <option value="asset">Asset</option>
            <option value="date">Date</option>
            <option value="distance">Tag distance</option>
            <option value="missing">Missing field</option>
            <option value="no-tags">No linked tags</option>
            <option value="batch">Import batch</option>
            <option value="same-tag">Same linked tag</option>
          </select>
          <button
            onClick={() =>
              onChange({
                ...filter,
                rules: [...filter.rules, { op: "all", rules: [] }],
              })
            }
          >
            + All group
          </button>
          <button
            onClick={() =>
              onChange({
                ...filter,
                rules: [...filter.rules, { op: "any", rules: [] }],
              })
            }
          >
            + Any group
          </button>
          <button
            onClick={() =>
              onChange({
                ...filter,
                rules: [...filter.rules, { op: "not", rule: { op: "text", value: "" } }],
              })
            }
          >
            + Not
          </button>
        </div>
      </section>
    );
  }
  if (filter.op === "not") {
    return (
      <section className={`filter-group filter-not depth-${Math.min(depth, 3)}`}>
        <div className="filter-group-heading">
          <strong>Not</strong>
          {onRemove && <button className="filter-remove" onClick={onRemove} aria-label="Remove not filter"><Icon name="close" size={14} /></button>}
        </div>
        <FilterNode filter={filter.rule} workspace={workspace} depth={depth + 1} onChange={(rule) => onChange({ op: "not", rule })} />
      </section>
    );
  }
  return (
    <div className="filter-leaf">
      <div className="filter-leaf-heading">
        <strong>{labelFor(filter)}</strong>
        {onRemove && <button className="filter-remove" onClick={onRemove} aria-label={`Remove ${labelFor(filter)}`}><Icon name="close" size={14} /></button>}
      </div>
      {filter.op === "text" && (
        <input aria-label="Filter text" value={filter.value} placeholder="title, note, or URL" onChange={(event) => onChange({ ...filter, value: event.target.value })} />
      )}
      {filter.op === "url" && (
        <div className="filter-inline">
          <select aria-label="URL filter mode" value={filter.mode} onChange={(event) => onChange({ ...filter, mode: event.target.value as "contains" | "domain" })}>
            <option value="contains">URL contains</option>
            <option value="domain">Domain contains</option>
          </select>
          <input aria-label="URL filter value" value={filter.value} placeholder="example.com" onChange={(event) => onChange({ ...filter, value: event.target.value })} />
        </div>
      )}
      {filter.op === "status" && (
        <CheckboxOptions values={workspace.statuses.map((status) => ({ id: status.id, label: status.label }))} selected={filter.ids} onChange={(ids) => onChange({ ...filter, ids })} />
      )}
      {filter.op === "tags" && (
        <>
          <select aria-label="Tag filter mode" value={filter.mode ?? "any"} onChange={(event) => onChange({ ...filter, mode: event.target.value as "any" | "all" })}>
            <option value="any">Any selected tag</option>
            <option value="all">All selected tags</option>
          </select>
          <CheckboxOptions values={workspace.tags.map((tag) => ({ id: tag.id, label: tag.name }))} selected={filter.ids} onChange={(ids) => onChange({ ...filter, ids })} />
        </>
      )}
      {filter.op === "tag-type" && <CheckboxOptions values={workspace.tagTypes.map((type) => ({ id: type.id, label: type.name }))} selected={filter.ids} onChange={(ids) => onChange({ ...filter, ids })} />}
      {filter.op === "tag-status" && <CheckboxOptions values={workspace.statuses.map((status) => ({ id: status.id, label: status.label }))} selected={filter.ids} onChange={(ids) => onChange({ ...filter, ids })} />}
      {filter.op === "asset" && (
        <div className="filter-inline">
          <select aria-label="Asset presence" value={filter.present ? "has" : "missing"} onChange={(event) => onChange({ ...filter, present: event.target.value === "has" })}>
            <option value="has">Has</option>
            <option value="missing">Does not have</option>
          </select>
          <select aria-label="Asset kind" value={filter.kind ?? "any"} onChange={(event) => onChange({ ...filter, kind: event.target.value === "any" ? undefined : event.target.value as "image" | "video" | "audio" })}>
            <option value="any">Any media</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </div>
      )}
      {filter.op === "date" && (
        <div className="filter-inline filter-date">
          <select aria-label="Date filter field" value={filter.field} onChange={(event) => onChange({ ...filter, field: event.target.value as "createdAt" | "updatedAt" })}>
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
          </select>
          <input aria-label="Date filter from" type="date" value={filter.from?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...filter, from: event.target.value || undefined })} />
          <input aria-label="Date filter to" type="date" value={filter.to?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...filter, to: event.target.value || undefined })} />
        </div>
      )}
      {filter.op === "distance" && (
        <>
          <CheckboxOptions values={workspace.tags.map((tag) => ({ id: tag.id, label: tag.name }))} selected={filter.tagIds} onChange={(tagIds) => onChange({ ...filter, tagIds })} />
          <label className="filter-number">Within <input aria-label="Distance hops" type="number" min="0" max="20" value={filter.hops} onChange={(event) => onChange({ ...filter, hops: Math.max(0, Number(event.target.value) || 0) })} /> hops</label>
        </>
      )}
      {filter.op === "missing" && <select aria-label="Missing field" value={filter.field} onChange={(event) => onChange({ ...filter, field: event.target.value as "title" | "description" | "url" | "asset" })}><option value="title">Title</option><option value="description">Description</option><option value="url">URL</option><option value="asset">Asset</option></select>}
      {filter.op === "batch" && <select aria-label="Import batch" value={filter.id} onChange={(event) => onChange({ ...filter, id: event.target.value })}>{workspace.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.source}</option>)}</select>}
      {filter.op === "same-tag" && (
        <div className="filter-inline filter-same-tag">
          <input aria-label="Same tag name" placeholder="Tag name contains" value={filter.name ?? ""} onChange={(event) => onChange({ ...filter, name: event.target.value || undefined })} />
          <select aria-label="Same tag type" value={filter.typeId ?? ""} onChange={(event) => onChange({ ...filter, typeId: event.target.value || undefined })}><option value="">Any type</option>{workspace.tagTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          <select aria-label="Same tag status" value={filter.statusId ?? ""} onChange={(event) => onChange({ ...filter, statusId: event.target.value || undefined })}><option value="">Any status</option>{workspace.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
        </div>
      )}
      {filter.op === "no-tags" && <span className="subtle">Matches bubbles with no membership.</span>}
    </div>
  );
}
