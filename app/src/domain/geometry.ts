import type { Geometry, GraphLayout } from "./model";

export type GraphView = "tags" | "connections" | "connections-tags";

export function graphLayout(geometry: Geometry | undefined, view: GraphView): GraphLayout | undefined {
  return view === "tags" ? geometry : geometry?.connections?.[view === "connections" ? "direct" : "tags"];
}

/** Each canvas only owns its layout. Persisting it must retain all other arrangements. */
export function withGraphLayout(geometry: Geometry | undefined, workspaceId: string, view: GraphView, layout: GraphLayout): Geometry {
  const previous = geometry?.workspaceId === workspaceId ? geometry : { workspaceId, positions: {} };
  const own = { positions: layout.positions, viewport: layout.viewport };
  return view === "tags" ? { ...previous, ...own }
    : { ...previous, connections: { ...previous.connections, [view === "connections" ? "direct" : "tags"]: own } };
}

/** Treat backup geometry as untrusted input, including optional layouts. */
export function validateGraphLayout(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup geometry.");
  const layout = value as GraphLayout;
  if (!layout.positions || typeof layout.positions !== "object" || Array.isArray(layout.positions)) throw new Error("Invalid backup geometry.");
  for (const pos of Object.values(layout.positions))
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || typeof pos.pinned !== "boolean") throw new Error("Invalid node position.");
  const v = layout.viewport;
  if (v !== undefined && (!v || !Number.isFinite(v.zoom) || v.zoom < 0.15 || v.zoom > 4 || !Number.isFinite(v.x) || !Number.isFinite(v.y)
    || (v.anchor !== undefined && v.anchor !== "center"))) throw new Error("Invalid viewport.");
}
