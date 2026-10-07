import test from "node:test";
import assert from "node:assert/strict";
import {
  bookmarksLinkedToHubTypes,
  graphVisibility,
  hubTypes,
  readHubTypes,
  type Node,
  type Edge,
  type HubType,
} from "../src/data/graph";
import { progressStatuses } from "../src/data/progress";

const nodes: Node[] = [
  ...hubTypes.map((kind) => ({
    id: `${kind}:hub`,
    kind,
    label: kind,
    subtitle: "",
    count: 0,
    radius: 46,
    progress: "pending" as const,
  })),
  ...["topic", "issue", "proposal", "mixed"].map((id) => ({
    id: `bookmark:${id}`,
    kind: "bookmark" as const,
    label: id,
    subtitle: "",
    count: 0,
    radius: 21,
    progress: "pending" as const,
  })),
];
const edges: Edge[] = [
  ...hubTypes.map((kind) => ({
    id: kind,
    source: `bookmark:${kind}`,
    target: `${kind}:hub`,
    kind: "topic" as const,
    label: "",
  })),
  ...["topic", "issue"].map((kind) => ({
    id: `mixed:${kind}`,
    source: "bookmark:mixed",
    target: `${kind}:hub`,
    kind: "topic" as const,
    label: "",
  })),
];
const graph = { nodes, edges };
const visible = new Set(["topic", "issue", "proposal", "mixed"]);

test("hub types hide unchecked hubs and bubbles with no link to a checked type", () => {
  const view = (types: HubType[]) =>
    graphVisibility(
      graph,
      visible,
      nodes.map((n) => n.id),
      [],
      hubTypes.map((kind) => `${kind}:hub`),
      progressStatuses,
      progressStatuses,
      progressStatuses,
      types,
    );
  const topic = view(["topic"]);
  assert.deepEqual(
    topic.nodes.map((n) => n.id),
    ["topic:hub", "bookmark:topic", "bookmark:mixed"],
  );
  assert.deepEqual([...topic.shownHubs], ["topic:hub"]);
  assert.deepEqual(
    topic.edges.map((e) => e.id),
    ["topic", "mixed:topic"],
  );
  // The same relationship filter also drives the compact bookmark list.
  assert.deepEqual(
    [...bookmarksLinkedToHubTypes(graph, ["topic"])],
    ["bookmark:topic", "bookmark:mixed"],
  );
  assert.deepEqual(
    view(["issue", "proposal"]).nodes.map((n) => n.id),
    [
      "issue:hub",
      "proposal:hub",
      "bookmark:issue",
      "bookmark:proposal",
      "bookmark:mixed",
    ],
  );
  assert.equal(view([]).nodes.length, 0);
  assert.equal(view([]).edges.length, 0);
  assert.equal(view(hubTypes).nodes.length, nodes.length);
});

test("hub type relationships stay independent of hub progress and visibility", () => {
  const result = graphVisibility(
    graph,
    visible,
    [],
    ["topic:hub"],
    [],
    progressStatuses,
    ["done"],
    progressStatuses,
    ["topic"],
  );
  assert.deepEqual(
    result.nodes.map((n) => n.id),
    ["bookmark:topic", "bookmark:mixed"],
  );
  assert.equal(result.edges.length, 0);
});

test("hub type preferences restore multiple or empty selections and default older preferences", () => {
  assert.deepEqual(readHubTypes(undefined), hubTypes);
  assert.deepEqual(readHubTypes(["proposal", "issue", "proposal", "invalid"]), [
    "issue",
    "proposal",
  ]);
  assert.deepEqual(readHubTypes([]), []);
  assert.deepEqual(
    readHubTypes(JSON.parse(JSON.stringify(["topic", "proposal"]))),
    ["topic", "proposal"],
  );
});
