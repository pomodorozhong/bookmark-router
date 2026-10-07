import Graphology from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { Dataset, ProgressStatus } from "./types";
import {
  nodeProgress,
  matchesProgress,
  progressStatuses,
  type ProgressFilter,
} from "./progress";
import { targetKey } from "./selectors";
export type Node = {
  id: string;
  kind: "bookmark" | "topic" | "issue" | "proposal";
  label: string;
  subtitle: string;
  count: number;
  radius: number;
  progress: ProgressStatus;
};
export type Edge = {
  id: string;
  source: string;
  target: string;
  kind: "topic" | "suggestion" | "selected";
  label: string;
};
export type Position = { x: number; y: number; pinned?: boolean };
export function deriveGraph(d: Dataset, lens: "proposed" | "approved") {
  const nodes: Node[] = [],
    edges = new Map<string, Edge>();
  const add = (
    id: string,
    kind: Node["kind"],
    label: string,
    subtitle: string,
  ) =>
    nodes.push({
      id,
      kind,
      label,
      subtitle,
      count: 0,
      radius: kind === "bookmark" ? 21 : 46,
      progress: nodeProgress(d, id),
    });
  d.category_review.categories.forEach((c) =>
    add(`topic:${c.id}`, "topic", c.label, "Topic"),
  );
  if (lens === "approved")
    add("topic:unapproved", "topic", "Awaiting topic approval", "Unapproved");
  d.issue_catalog.forEach((i) =>
    add(
      `issue:${i.number}`,
      "issue",
      `#${i.number} ${i.title}`,
      i.state === "OPEN" ? "Existing issue · open" : "Existing issue · closed",
    ),
  );
  d.bookmarks_worth_their_own_issues
    .filter((p) => !p.created_issue_number)
    .forEach((p) =>
      add(`proposal:${p.id}`, "proposal", p.title, `Proposal · ${p.status}`),
    );
  const link = (
    source: string,
    target: string,
    kind: Edge["kind"],
    label: string,
  ) => {
    const id = `${source}|${target}`;
    if (!edges.has(id) || kind === "selected")
      edges.set(id, { id, source, target, kind, label });
  };
  for (const b of d.bookmarks) {
    const source = `bookmark:${b.id}`;
    add(source, "bookmark", b.display_title, b.processing.review_status);
    const c = b.classification;
    const topics =
      lens === "proposed"
        ? c.approved_category_id
          ? [c.approved_category_id, ...c.approved_secondary_category_ids]
          : [c.proposed_category_id, ...c.proposed_secondary_category_ids]
        : [
            c.approved_category_id ?? "unapproved",
            ...c.approved_secondary_category_ids,
          ];
    topics.forEach((t) => link(source, `topic:${t}`, "topic", `${lens} topic`));
    d.references_for_existing_issues
      .filter((r) => r.bookmark_id === b.id)
      .forEach((r) =>
        link(
          source,
          `issue:${r.issue_number}`,
          "suggestion",
          `${r.reason}${r.caveat ? ` · ${r.caveat}` : ""} · ${r.origin} · ${r.presence}`,
        ),
      );
    d.bookmarks_worth_their_own_issues
      .filter(
        (p) => p.seed_bookmark_ids.includes(b.id) && p.status !== "rejected",
      )
      .forEach((p) =>
        link(
          source,
          p.created_issue_number
            ? `issue:${p.created_issue_number}`
            : `proposal:${p.id}`,
          "suggestion",
          p.rationale,
        ),
      );
    b.processing.selected_targets.forEach((t) =>
      link(
        source,
        targetKey(t, d),
        "selected",
        `Placement: ${t.placement_status.replace("_", " ")}`,
      ),
    );
  }
  for (const e of edges.values()) {
    const hub = nodes.find((n) => n.id === e.target);
    if (hub) hub.count++;
  }
  return { nodes, edges: [...edges.values()] };
}
export function graphVisibility(
  graph: { nodes: Node[]; edges: Edge[] },
  visible: Set<string>,
  selected: string[],
  hiddenHubs: string[],
  revealedHubs: string[],
  bubbleProgress: ProgressFilter,
  hubProgress: ProgressFilter,
  bubbleQueueProgress: ProgressFilter = progressStatuses,
) {
  const matchingBubbles = new Set(
    graph.nodes
      .filter(
        (n) =>
          n.kind === "bookmark" &&
          matchesProgress(n.progress, bubbleProgress) &&
          matchesProgress(n.progress, bubbleQueueProgress),
      )
      .map((n) => n.id),
  );
  const matches = new Set(
    [...visible]
      .map((id) => `bookmark:${id}`)
      .concat(selected)
      .filter((id) => matchingBubbles.has(id)),
  );
  const relevant = graph.edges.filter((e) => matches.has(e.source));
  const hubs = new Set(relevant.map((e) => e.target));
  const nodes = graph.nodes.filter((n) =>
    n.kind === "bookmark"
      ? matches.has(n.id)
      : matchesProgress(n.progress, hubProgress) &&
        !hiddenHubs.includes(n.id) &&
        (hubs.has(n.id) ||
          selected.includes(n.id) ||
          revealedHubs.includes(n.id)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    relevant,
    shownHubs: new Set(
      nodes.filter((n) => n.kind !== "bookmark").map((n) => n.id),
    ),
  };
}
export type GraphLayoutSettings = {
  scalingRatio: number;
  gravity: number;
  slowDown: number;
  iterations: number;
  settleDurationMs: number;
  overlapGap: number;
  overlapPasses: number;
  adjustSizes: boolean;
  barnesHutOptimize: boolean;
  edgeWeightsEnabled: boolean;
  edgeWeightInfluence: number;
};
export const graphLayoutDefaults: GraphLayoutSettings = {
  scalingRatio: 40,
  gravity: 5,
  slowDown: 15,
  iterations: 5000,
  settleDurationMs: 3050,
  overlapGap: 0,
  overlapPasses: 0,
  adjustSizes: true,
  barnesHutOptimize: true,
  edgeWeightsEnabled: true,
  edgeWeightInfluence: 3,
};
export function readGraphLayoutSettings(value: unknown): GraphLayoutSettings {
  if (!value || typeof value !== "object") return { ...graphLayoutDefaults };
  const stored = value as Record<string, unknown>;
  const number = (
    key: keyof GraphLayoutSettings,
    minimum: number,
    maximum: number,
    integer = false,
  ) => {
    const candidate = stored[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate))
      return graphLayoutDefaults[key] as number;
    const bounded = Math.max(minimum, Math.min(maximum, candidate));
    return integer ? Math.round(bounded) : bounded;
  };
  // Upgrade the prior default for graph preferences already saved per dataset.
  const storedIterations =
    stored.iterations === 180
      ? graphLayoutDefaults.iterations
      : number("iterations", 20, 10000, true);
  return {
    scalingRatio: number("scalingRatio", 1, 200),
    gravity: number("gravity", 0, 5),
    slowDown: number("slowDown", 0.5, 50),
    iterations: storedIterations,
    settleDurationMs: number("settleDurationMs", 250, 10000, true),
    overlapGap: number("overlapGap", 0, 60),
    overlapPasses: number("overlapPasses", 0, 20, true),
    adjustSizes:
      typeof stored.adjustSizes === "boolean"
        ? stored.adjustSizes
        : graphLayoutDefaults.adjustSizes,
    barnesHutOptimize:
      typeof stored.barnesHutOptimize === "boolean"
        ? stored.barnesHutOptimize
        : graphLayoutDefaults.barnesHutOptimize,
    edgeWeightsEnabled:
      typeof stored.edgeWeightsEnabled === "boolean"
        ? stored.edgeWeightsEnabled
        : graphLayoutDefaults.edgeWeightsEnabled,
    edgeWeightInfluence: number("edgeWeightInfluence", 0, 3),
  };
}
// Shared by the initial layout and the live worker. Physics uses world units;
// Sigma handles camera movement separately from this simulation.
export function forceSettingsFor(settings: GraphLayoutSettings) {
  return {
    adjustSizes: settings.adjustSizes,
    barnesHutOptimize: settings.barnesHutOptimize,
    scalingRatio: settings.scalingRatio,
    gravity: settings.gravity,
    slowDown: settings.slowDown,
    edgeWeightInfluence: settings.edgeWeightInfluence,
  };
}
// Keep the default settings export for callers that use the baseline layout.
export const forceSettings = forceSettingsFor(graphLayoutDefaults);
// Fixed world-space spacing, shared by seeding and live physics. Camera zoom
// and label visibility never alter these collision envelopes.
export function collisionRadius(kind: Node["kind"], radius: number) {
  return kind === "bookmark" ? Math.max(30, radius) : Math.max(80, radius);
}
export const CENTER_ID = "layout:center";
// Hidden anchor edges supply restoring attraction for otherwise orphaned hubs.
export function syncHubAnchors(graph: Graphology) {
  const hubs = graph
    .nodes()
    .filter(
      (id) =>
        id !== CENTER_ID && graph.getNodeAttribute(id, "kind") !== "bookmark",
    );
  if (!hubs.length) {
    if (graph.hasNode(CENTER_ID)) graph.dropNode(CENTER_ID);
    return;
  }
  graph.mergeNode(CENTER_ID, {
    x: 0,
    y: 0,
    size: 0,
    fixed: true,
    hidden: true,
  });
  for (const id of hubs)
    graph.mergeEdgeWithKey(`anchor:${id}`, CENTER_ID, id, {
      weight: 0.3,
      hidden: true,
      anchor: true,
    });
}
export function linkedNodeIds(graph: Graphology, selected: string[]) {
  const ids = new Set(
    selected.filter((id) => id !== CENTER_ID && graph.hasNode(id)),
  );
  for (const id of [...ids])
    graph.forEachNeighbor(id, (neighbor) => {
      if (neighbor !== CENTER_ID) ids.add(neighbor);
    });
  return [...ids];
}
// Project overlapping collision envelopes apart without moving pinned or
// dragged nodes. The worker reads these corrected positions for its next tick.
export function separateOverlaps(
  graph: Graphology,
  passes = graphLayoutDefaults.overlapPasses,
  gap = graphLayoutDefaults.overlapGap,
) {
  if (passes <= 0) return;
  const nodes = graph
    .filterNodes((id, a) => id !== CENTER_ID && !a.hidden)
    .map((id) => ({ id, ...graph.getNodeAttributes(id) })) as {
    id: string;
    x: number;
    y: number;
    size: number;
    fixed?: boolean;
  }[];
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        if (a.fixed && b.fixed) continue;
        let dx = b.x - a.x,
          dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = a.size + b.size + gap;
        if (distance >= minimum) continue;
        if (distance < 0.000001) {
          const angle = (i + j + 1) * 2.399963;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const shift =
          (minimum - Math.hypot(b.x - a.x, b.y - a.y) + 0.001) /
          (a.fixed || b.fixed ? 1 : 2);
        if (!a.fixed) {
          a.x -= (dx / distance) * shift;
          a.y -= (dy / distance) * shift;
        }
        if (!b.fixed) {
          b.x += (dx / distance) * shift;
          b.y += (dy / distance) * shift;
        }
        changed = true;
      }
    if (!changed) break;
  }
  for (const n of nodes)
    if (!n.fixed) graph.mergeNodeAttributes(n.id, { x: n.x, y: n.y });
}
export function placeMostLinkedHubsOnPerimeter(
  nodes: Node[],
  edges: Edge[],
  positions: Record<string, Position>,
  gap: number,
  temporarilyPinned: string[] = [],
): Record<string, Position> {
  const hubIds = new Set(
    nodes.filter((node) => node.kind !== "bookmark").map((node) => node.id),
  );
  const counts = new Map<string, number>();
  edges.forEach((edge) => {
    if (hubIds.has(edge.target))
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  });
  const hubs = nodes
    .filter((node) => hubIds.has(node.id))
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  if (!hubs.length) return positions;

  const temporaryPins = new Set(temporarilyPinned);
  const movableHubs = hubs.filter(
    (node) => !positions[node.id]?.pinned && !temporaryPins.has(node.id),
  );
  if (!movableHubs.length) return positions;
  const movableHubIds = new Set(movableHubs.map((node) => node.id));
  const movableLinks = new Set<string>();
  edges.forEach((edge) => {
    const neighborId = movableHubIds.has(edge.target)
      ? edge.source
      : movableHubIds.has(edge.source)
        ? edge.target
        : null;
    const position = neighborId ? positions[neighborId] : undefined;
    if (
      neighborId &&
      !hubIds.has(neighborId) &&
      position &&
      !position.pinned &&
      !temporaryPins.has(neighborId)
    )
      movableLinks.add(neighborId);
  });
  const movingIds = new Set([...movableHubIds, ...movableLinks]);
  const maxHubSize = Math.max(
    ...movableHubs.map((node) => collisionRadius(node.kind, node.radius)),
  );
  const otherEdge = Math.max(
    0,
    ...nodes
      .filter((node) => !movingIds.has(node.id))
      .map((node) => {
        const position = positions[node.id];
        return position
          ? Math.hypot(position.x, position.y) +
              collisionRadius(node.kind, node.radius)
          : 0;
      }),
  );
  const minimumRadius =
    hubs.length === 1
      ? maxHubSize
      : (maxHubSize * 2 + gap) / (2 * Math.sin(Math.PI / hubs.length));
  const radius = Math.max(otherEdge + maxHubSize + gap, minimumRadius);

  let next = positions;
  const movedHubs: {
    node: Node;
    from: Position;
    dx: number;
    dy: number;
  }[] = [];
  hubs.forEach((node, index) => {
    if (!movableHubIds.has(node.id)) return;
    const from = positions[node.id] ?? { x: 0, y: 0 };
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / hubs.length;
    const x = Math.cos(angle) * radius;
    const y = -Math.sin(angle) * radius;
    movedHubs.push({ node, from, dx: x - from.x, dy: y - from.y });
    if (next === positions) next = { ...positions };
    next[node.id] = {
      ...from,
      x,
      y,
    };
  });

  // A link shared by multiple perimeter hubs can only move with one cluster.
  // Keep it with the hub it was already closest to before positioning.
  const linkMoves = new Map<
    string,
    { dx: number; dy: number; distance: number }
  >();
  movedHubs.forEach(({ node, from, dx, dy }) => {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    edges.forEach((edge) => {
      const neighborId =
        edge.target === node.id
          ? edge.source
          : edge.source === node.id
            ? edge.target
            : null;
      if (!neighborId || hubIds.has(neighborId)) return;
      const position = positions[neighborId];
      if (!position || position.pinned || temporaryPins.has(neighborId)) return;
      const distance = Math.hypot(position.x - from.x, position.y - from.y);
      const existing = linkMoves.get(neighborId);
      if (!existing || distance < existing.distance)
        linkMoves.set(neighborId, { dx, dy, distance });
    });
  });
  linkMoves.forEach(({ dx, dy }, id) => {
    const position = positions[id];
    if (next === positions) next = { ...positions };
    next[id] = { ...position, x: position.x + dx, y: position.y + dy };
  });
  return next;
}
export function createLayoutGraph(
  nodes: Node[],
  edges: Edge[],
  saved: Record<string, Position> = {},
  reset = false,
) {
  const graph = new Graphology();
  nodes.forEach((n, i) => {
    const p = saved[n.id];
    const retained = p && (!reset || p.pinned);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const distance = 45 * Math.sqrt(i + 1);
    graph.addNode(n.id, {
      ...n,
      x: retained ? p.x : Math.cos(angle) * distance,
      y: retained ? -p.y || 0 : Math.sin(angle) * distance,
      size: collisionRadius(n.kind, n.radius),
      fixed: !!p?.pinned,
    });
  });
  edges.forEach((e) => {
    if (graph.hasNode(e.source) && graph.hasNode(e.target))
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        ...e,
        weight: e.kind === "selected" ? 2 : 1,
      });
  });
  syncHubAnchors(graph);
  return graph;
}
export function settle(
  nodes: Node[],
  edges: Edge[],
  saved: Record<string, Position> = {},
  reset = false,
  settings: GraphLayoutSettings = graphLayoutDefaults,
  temporarilyPinned: string[] = [],
): Record<string, Position> {
  const graph = createLayoutGraph(nodes, edges, saved, reset);
  const temporaryPins = new Set(temporarilyPinned);
  // Seed only new nodes during ordinary data changes. Explicit re-layout frees
  // existing unpinned nodes; live dragging also frees all unpinned neighbors.
  graph.forEachNode((id) => {
    if (saved[id] && (!reset || saved[id].pinned || temporaryPins.has(id))) {
      if (reset && temporaryPins.has(id) && !saved[id].pinned)
        graph.mergeNodeAttributes(id, { x: saved[id].x, y: -saved[id].y });
      graph.setNodeAttribute(id, "fixed", true);
    }
  });
  if (graph.order)
    forceAtlas2.assign(graph, {
      iterations: settings.iterations,
      settings: forceSettingsFor(settings),
      getEdgeWeight: settings.edgeWeightsEnabled ? "weight" : null,
    });
  separateOverlaps(graph, settings.overlapPasses, settings.overlapGap);
  return Object.fromEntries(
    graph
      .filterNodes((id) => id !== CENTER_ID)
      .map((id) => {
        const a = graph.getNodeAttributes(id);
        return [
          id,
          {
            x: saved[id] && (!reset || saved[id].pinned) ? saved[id].x : a.x,
            y: saved[id] && (!reset || saved[id].pinned) ? saved[id].y : -a.y,
            pinned: !!saved[id]?.pinned,
          },
        ];
      }),
  );
}
