import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import type { Dataset } from "./types";
import { targetKey } from "./selectors";
export type Node = SimulationNodeDatum & {
  id: string;
  kind: "bookmark" | "topic" | "issue" | "proposal";
  label: string;
  subtitle: string;
  count: number;
  radius: number;
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
        ? [c.proposed_category_id, ...c.proposed_secondary_category_ids]
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
export function settle(
  nodes: Node[],
  edges: Edge[],
  saved: Record<string, Position> = {},
  reset = false,
) {
  const copy = nodes.map((n) => {
    const p = saved[n.id];
    return {
      ...n,
      ...(p && (!reset || p.pinned)
        ? { x: p.x, y: p.y, fx: p.x, fy: p.y }
        : {}),
    };
  });
  const links = edges.map((e) => ({ source: e.source, target: e.target }));
  const simulation = forceSimulation(copy)
    .stop()
    .force(
      "charge",
      forceManyBody<Node>().strength((n) =>
        n.kind === "bookmark" ? -180 : -1000,
      ),
    )
    .force(
      "link",
      forceLink<Node, { source: string | Node; target: string | Node }>(links)
        .id((n) => n.id)
        .distance(120)
        .strength(0.25),
    )
    .force(
      "collision",
      forceCollide<Node>()
        .radius((n) => n.radius + 17)
        .iterations(2),
    )
    .force("x", forceX<Node>(0).strength(0.018))
    .force("y", forceY<Node>(0).strength(0.018));
  simulation.tick(360);
  simulation.stop();
  return Object.fromEntries(
    copy.map((n) => [
      n.id,
      { x: n.x ?? 0, y: n.y ?? 0, pinned: !!saved[n.id]?.pinned },
    ]),
  );
}
