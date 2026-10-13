import { isWebUrl, type Bubble, type Filter, type Workspace } from "./model";

export interface DistanceMatch {
  distance: number;
  path: string[];
}

function linkedTags(bubble: Bubble, workspace: Workspace) {
  const tagIds = workspace.memberships
    .filter((membership) => membership.bubbleId === bubble.id)
    .map((membership) => membership.tagId);
  return workspace.tags.filter((tag) => tagIds.includes(tag.id));
}

export function distanceMatches(
  workspace: Workspace,
  tagIds: string[],
): Map<string, DistanceMatch> {
  const adjacency = new Map<string, string[]>();
  for (const membership of workspace.memberships) {
    const bubbleNeighbors = adjacency.get(membership.bubbleId) ?? [];
    bubbleNeighbors.push(membership.tagId);
    adjacency.set(membership.bubbleId, bubbleNeighbors);
    const tagNeighbors = adjacency.get(membership.tagId) ?? [];
    tagNeighbors.push(membership.bubbleId);
    adjacency.set(membership.tagId, tagNeighbors);
  }
  const queue: Array<{ id: string; distance: number; path: string[] }> = [],
    seen = new Map<string, DistanceMatch>();
  for (const tagId of tagIds) {
    if (!workspace.tags.some((tag) => tag.id === tagId)) continue;
    queue.push({ id: tagId, distance: 0, path: [tagId] });
    seen.set(tagId, { distance: 0, path: [tagId] });
  }
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const neighbor of adjacency.get(current.id) ?? []) {
      if (seen.has(neighbor)) continue;
      const next = {
        distance: current.distance + 1,
        path: [...current.path, neighbor],
      };
      seen.set(neighbor, next);
      queue.push({ id: neighbor, ...next });
    }
  }
  return new Map(
    workspace.bubbles.flatMap((bubble) => {
      const match = seen.get(bubble.id);
      return match ? [[bubble.id, match] as const] : [];
    }),
  );
}

function matchesLeaf(
  filter: Filter,
  bubble: Bubble,
  workspace: Workspace,
  distanceCache: Map<string, Map<string, DistanceMatch>>,
): boolean {
  const tags = linkedTags(bubble, workspace);
  if (filter.op === "text") {
    const value = filter.value.trim().toLowerCase();
    if (!value) return true;
    return `${bubble.title} ${bubble.description} ${bubble.url ?? ""}`
      .toLowerCase()
      .includes(value);
  }
  if (filter.op === "url") {
    const value = filter.value.trim().toLowerCase();
    if (!value) return true;
    if (filter.mode === "domain" && isWebUrl(bubble.url ?? "")) {
      return new URL(bubble.url!).hostname.toLowerCase().includes(value);
    }
    return (bubble.url ?? "").toLowerCase().includes(value);
  }
  if (filter.op === "status") return filter.ids.includes(bubble.statusId);
  if (filter.op === "tags") {
    return filter.mode === "all"
      ? filter.ids.every((id) => tags.some((tag) => tag.id === id))
      : filter.ids.some((id) => tags.some((tag) => tag.id === id));
  }
  if (filter.op === "tag-type")
    return tags.some((tag) => tag.typeId && filter.ids.includes(tag.typeId));
  if (filter.op === "tag-status")
    return tags.some((tag) => filter.ids.includes(tag.statusId));
  if (filter.op === "asset")
    return filter.present
      ? Boolean(bubble.asset && (!filter.kind || bubble.asset.kind === filter.kind))
      : !bubble.asset || Boolean(filter.kind && bubble.asset.kind !== filter.kind);
  if (filter.op === "date") {
    const timestamp = Date.parse(bubble[filter.field]);
    return (
      (filter.from === undefined || timestamp >= Date.parse(filter.from)) &&
      (filter.to === undefined || timestamp <= Date.parse(filter.to))
    );
  }
  if (filter.op === "distance") {
    const key = JSON.stringify([...filter.tagIds].sort());
    const matches =
      distanceCache.get(key) ??
      (() => {
        const result = distanceMatches(workspace, filter.tagIds);
        distanceCache.set(key, result);
        return result;
      })();
    return (matches.get(bubble.id)?.distance ?? Infinity) <= filter.hops;
  }
  if (filter.op === "missing") {
    return filter.field === "title"
      ? Boolean(bubble.missingTitle || !bubble.title.trim())
      : filter.field === "description"
        ? !bubble.description.trim()
        : filter.field === "url"
          ? !bubble.url
          : !bubble.asset;
  }
  if (filter.op === "no-tags") return tags.length === 0;
  if (filter.op === "batch") return bubble.importBatchId === filter.id;
  if (filter.op === "same-tag") {
    return tags.some(
      (tag) =>
        (filter.name === undefined || tag.name.toLowerCase().includes(filter.name.toLowerCase())) &&
        (filter.typeId === undefined || tag.typeId === filter.typeId) &&
        (filter.statusId === undefined || tag.statusId === filter.statusId),
    );
  }
  return false;
}

export function matchesFilter(
  filter: Filter,
  bubble: Bubble,
  workspace: Workspace,
  distanceCache = new Map<string, Map<string, DistanceMatch>>(),
): boolean {
  if (filter.op === "all")
    return filter.rules.every((rule) =>
      matchesFilter(rule, bubble, workspace, distanceCache),
    );
  if (filter.op === "any")
    return filter.rules.length === 0 || filter.rules.some((rule) =>
      matchesFilter(rule, bubble, workspace, distanceCache),
    );
  if (filter.op === "not")
    return !matchesFilter(filter.rule, bubble, workspace, distanceCache);
  return matchesLeaf(filter, bubble, workspace, distanceCache);
}

export function filterBubbles(workspace: Workspace, filter: Filter): Bubble[] {
  const distanceCache = new Map<string, Map<string, DistanceMatch>>();
  return workspace.bubbles.filter((bubble) =>
    matchesFilter(filter, bubble, workspace, distanceCache),
  );
}

function tagName(id: string, workspace: Workspace) {
  return workspace.tags.find((tag) => tag.id === id)?.name ?? "Unknown tag";
}

export function filterSummary(filter: Filter, workspace: Workspace): string {
  if (filter.op === "all" || filter.op === "any") {
    if (!filter.rules.length) return filter.op === "all" ? "All bubbles" : "Any condition";
    return `${filter.op === "all" ? "All" : "Any"} (${filter.rules.map((rule) => filterSummary(rule, workspace)).join(" · ")})`;
  }
  if (filter.op === "not") return `Not ${filterSummary(filter.rule, workspace)}`;
  if (filter.op === "text") return `Text contains “${filter.value || "…"}”`;
  if (filter.op === "url") return `${filter.mode === "domain" ? "Domain" : "URL"} contains “${filter.value || "…"}”`;
  if (filter.op === "status") return `Status: ${filter.ids.map((id) => workspace.statuses.find((status) => status.id === id)?.label ?? id).join(", ")}`;
  if (filter.op === "tags") return `${filter.mode === "all" ? "All tags" : "Any tag"}: ${filter.ids.map((id) => tagName(id, workspace)).join(", ")}`;
  if (filter.op === "tag-type") return `Tag type: ${filter.ids.map((id) => workspace.tagTypes.find((type) => type.id === id)?.name ?? id).join(", ")}`;
  if (filter.op === "tag-status") return `Linked tag status: ${filter.ids.map((id) => workspace.statuses.find((status) => status.id === id)?.label ?? id).join(", ")}`;
  if (filter.op === "asset") return `${filter.present ? "Has" : "No"} ${filter.kind ?? "asset"}`;
  if (filter.op === "date") return `${filter.field === "createdAt" ? "Created" : "Updated"} in selected range`;
  if (filter.op === "distance") return `Within ${filter.hops} hop${filter.hops === 1 ? "" : "s"} of ${filter.tagIds.map((id) => tagName(id, workspace)).join(", ")}`;
  if (filter.op === "missing") return `Missing ${filter.field}`;
  if (filter.op === "no-tags") return "No linked tags";
  if (filter.op === "batch") return `Import: ${workspace.batches.find((batch) => batch.id === filter.id)?.source ?? "selected batch"}`;
  if (filter.op === "same-tag")
    return `Same linked tag${filter.name ? ` named “${filter.name}”` : ""}`;
  return "Filter";
}

export function pathSummary(path: string[], workspace: Workspace): string {
  return path
    .map((id) =>
      workspace.tags.find((tag) => tag.id === id)?.name ??
      workspace.bubbles.find((bubble) => bubble.id === id)?.title ??
      id,
    )
    .join(" → ");
}
