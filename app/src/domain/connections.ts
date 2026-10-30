import type { Bookmark, Workspace } from "./model";
import { tagVisible, triageQueue, type TriageFilter, type TriageTab } from "./triage";

export interface ConnectionEdge { source: string; target: string; sharedTagIds: string[] }
export interface ConnectionGraph {
  bookmarks: Bookmark[];
  neighbors: Map<string, Set<string>>;
  edges: ConnectionEdge[];
  /** Only eligible tags with members in this scope. These are display context, never candidates. */
  members: Map<string, string[]>;
  components: string[][];
}
export interface Candidate {
  id: string;
  degree: number;
  separation: number;
  before: number;
  pieces: string[][];
}

/** Survivors split away from the largest remaining piece; processing the candidate does not count. */
export function splitOffCount(candidate: Candidate): number {
  const sizes = candidate.pieces.map((piece) => piece.length);
  return sizes.reduce((sum, size) => sum + size, 0) - Math.max(0, ...sizes);
}

export function components(neighbors: ConnectionGraph["neighbors"], ids: Iterable<string> = neighbors.keys(), removed?: string): string[][] {
  const unseen = new Set(ids);
  if (removed) unseen.delete(removed);
  const result: string[][] = [];
  while (unseen.size) {
    const piece = [unseen.values().next().value!];
    unseen.delete(piece[0]);
    for (let i = 0; i < piece.length; i++)
      for (const id of neighbors.get(piece[i]) ?? [])
        if (unseen.delete(id)) piece.push(id);
    result.push(piece);
  }
  return result.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Project the scoped bookmark/tag memberships into one undirected edge per bookmark pair. */
export function connectionGraph(workspace: Workspace, options: { filter: TriageFilter; tab: TriageTab; selection?: ReadonlySet<string> }): ConnectionGraph {
  const bookmarks = triageQueue(workspace, options);
  const neighbors = new Map(bookmarks.map((b) => [b.id, new Set<string>()]));
  const eligible = new Set(workspace.tags.filter((t) => tagVisible(t, options.filter)).map((t) => t.id));
  const memberships = new Map<string, Set<string>>();
  for (const m of workspace.memberships) {
    if (!neighbors.has(m.bookmarkId) || !eligible.has(m.tagId)) continue;
    if (!memberships.has(m.tagId)) memberships.set(m.tagId, new Set());
    memberships.get(m.tagId)!.add(m.bookmarkId);
  }
  const members = new Map([...memberships].map(([id, ids]) => [id, [...ids].sort()]));
  const pairs = new Map<string, ConnectionEdge>();
  for (const [tagId, ids] of members)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const source = ids[i], target = ids[j], key = JSON.stringify([source, target]);
        const edge = pairs.get(key) ?? { source, target, sharedTagIds: [] };
        edge.sharedTagIds.push(tagId);
        pairs.set(key, edge);
        neighbors.get(source)!.add(target);
        neighbors.get(target)!.add(source);
      }
  return { bookmarks, neighbors, members, edges: [...pairs.values()], components: components(neighbors) };
}

/** Count pairs of surviving bookmarks that lose their connecting path, excluding the candidate. */
export function rankConnections(graph: ConnectionGraph): Candidate[] {
  const cluster = new Map(graph.components.flatMap((piece) => piece.map((id) => [id, piece] as const)));
  const candidates = graph.bookmarks.map((b) => {
    const own = cluster.get(b.id)!;
    const pieces = components(graph.neighbors, own, b.id);
    let seen = 0, separation = 0;
    for (const piece of pieces) { separation += seen * piece.length; seen += piece.length; }
    return { id: b.id, degree: graph.neighbors.get(b.id)!.size, separation, before: own.length, pieces };
  });
  const created = new Map(graph.bookmarks.map((b) => [b.id, Date.parse(b.createdAt)]));
  return candidates.sort((a, b) => b.separation - a.separation || b.degree - a.degree || created.get(a.id)! - created.get(b.id)! || a.id.localeCompare(b.id));
}

/** Shortest bookmark hops; displaying tag nodes does not add intermediate trace steps. */
export function traceConnections(graph: ConnectionGraph, root: string): Map<string, number> {
  if (!graph.neighbors.has(root)) return new Map();
  const distances = new Map([[root, 0]]), queue = [root];
  for (let i = 0; i < queue.length; i++)
    for (const id of graph.neighbors.get(queue[i])!)
      if (!distances.has(id)) { distances.set(id, distances.get(queue[i])! + 1); queue.push(id); }
  return distances;
}

export function impactText(candidate: Candidate): string {
  if (!candidate.degree) return "No connections in this view.";
  if (!candidate.separation) return `Removes ${candidate.degree} connection${candidate.degree === 1 ? "" : "s"}; this step won’t split the cluster.`;
  return `Splits ${candidate.before} into ${candidate.pieces.map((p) => p.length).join(" + ")} bookmarks.`;
}

/** Presentation edges are deliberately separate from analysis. Tag mode never draws projected links. */
export function connectionLinks(graph: ConnectionGraph, showTags: boolean): Array<{ id: string; source: string; target: string; tagIds: string[] }> {
  return showTags
    ? [...graph.members].flatMap(([tagId, ids]) => ids.map((id) => ({ id: JSON.stringify([id, tagId]), source: id, target: tagId, tagIds: [tagId] })))
    : graph.edges.map((e) => ({ id: JSON.stringify([e.source, e.target]), source: e.source, target: e.target, tagIds: e.sharedTagIds }));
}
