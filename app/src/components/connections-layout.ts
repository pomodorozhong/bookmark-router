import { forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { connectionLinks, type ConnectionGraph } from "../domain/connections";
import type { GraphLayout } from "../domain/model";

export interface ConnectionNode extends SimulationNodeDatum { id: string; tag: boolean }

/** A dragged node only needs to move its connected cluster; other clusters stay anchored. */
export function movingConnectionIds(graph: ConnectionGraph, showTags: boolean, anchor: string): Set<string> {
  const bookmark = graph.neighbors.has(anchor) ? anchor : graph.members.get(anchor)?.[0];
  const ids = new Set(graph.components.find((piece) => bookmark && piece.includes(bookmark)) ?? []);
  if (showTags) for (const [tag, members] of graph.members)
    if (members.some((id) => ids.has(id))) ids.add(tag);
  return ids;
}

/** Node area above the minimum corresponds to the number of bookmarks split off. */
export function splitNodeSize(count: number, maximum: number): number {
  return Math.sqrt(16 ** 2 + (46 ** 2 - 16 ** 2) * (maximum > 0 ? Math.max(0, Math.min(1, count / maximum)) : 0));
}

export function seedConnections(graph: ConnectionGraph, showTags: boolean, saved?: GraphLayout): GraphLayout["positions"] {
  const ids = [...graph.bookmarks.map((b) => b.id), ...(showTags ? [...graph.members.keys()] : [])];
  return Object.fromEntries(ids.map((id, i) => {
    const previous = saved?.positions[id];
    const angle = i * Math.PI * (3 - Math.sqrt(5)), radius = 25 * Math.sqrt(i);
    return [id, { x: previous?.x ?? Math.cos(angle) * radius, y: previous?.y ?? Math.sin(angle) * radius, pinned: previous?.pinned ?? false }];
  }));
}

/** The same force model powers live dragging, explicit layout, and reduced-motion settling. */
export function connectionSimulation(graph: ConnectionGraph, showTags: boolean, positions: GraphLayout["positions"], radius?: (id: string) => number) {
  const nodes: ConnectionNode[] = Object.entries(positions).map(([id, p]) => ({ id, tag: graph.members.has(id), x: p.x, y: p.y, ...(p.pinned ? { fx: p.x, fy: p.y } : {}) }));
  const edges = connectionLinks(graph, showTags).map((e) => ({ source: e.source, target: e.target, weight: e.tagIds.length }));
  return forceSimulation(nodes).stop()
    .force("links", forceLink<ConnectionNode, typeof edges[number]>(edges).id((n) => n.id)
      .distance((e) => showTags ? 100 : 90 / Math.sqrt(e.weight)).strength((e) => showTags ? 0.5 : Math.min(0.85, 0.15 * e.weight)))
    .force("charge", forceManyBody<ConnectionNode>().strength((n) => n.tag ? -380 : -170))
    .force("collide", forceCollide<ConnectionNode>().radius((n) => radius?.(n.id) ?? (n.tag ? 52 : 28)))
    .alphaDecay(0.035).velocityDecay(0.45);
}

/** Settle synchronously, so reduced motion and background tabs produce the same finished layout. */
export function arrangeConnections(graph: ConnectionGraph, showTags: boolean, saved?: GraphLayout, reset = false): GraphLayout["positions"] {
  const positions = seedConnections(graph, showTags, saved);
  const simulation = connectionSimulation(graph, showTags, positions);
  const nodes = simulation.nodes();
  for (const node of nodes)
    if (saved?.positions[node.id] && !reset) { node.fx = node.x; node.fy = node.y; }
  if (reset || nodes.some((n) => !saved?.positions[n.id])) {
    simulation.tick(260);
  }
  simulation.stop();
  return Object.fromEntries(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0, pinned: saved?.positions[n.id]?.pinned ?? false }]));
}
