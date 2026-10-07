import test from "node:test";
import assert from "node:assert/strict";
import {
  captureLayoutPositions,
  createLayoutGraph,
  settle,
  CENTER_ID,
  type Node,
  type Position,
} from "../src/data/graph";

for (const kind of ["topic", "bookmark"] as const) {
  test(`${kind} pin changes survive a live layout snapshot and re-layout`, () => {
    const node: Node = {
      id: `${kind}:test`,
      kind,
      label: "Test",
      subtitle: "",
      count: 0,
      radius: kind === "topic" ? 46 : 21,
      progress: "pending",
    };
    for (const pinned of [true, false]) {
      const saved: Record<string, Position> = {
        [node.id]: { x: 10, y: 20, pinned },
        hidden: { x: 30, y: 40, pinned: true },
      };
      const graph = createLayoutGraph([node], [], saved);
      // Simulate clicking Pin/Unpin before the running graph receives it.
      graph.mergeNodeAttributes(node.id, {
        x: 100,
        y: -200,
        pinned: !pinned,
      });
      const positions = captureLayoutPositions(graph, saved);
      assert.deepEqual(positions[node.id], { x: 100, y: 200, pinned });
      assert.deepEqual(positions.hidden, saved.hidden);
      assert.ok(!(CENTER_ID in positions));
      assert.deepEqual(saved[node.id], { x: 10, y: 20, pinned });

      const restarted = createLayoutGraph([node], [], positions);
      assert.equal(restarted.getNodeAttribute(node.id, "fixed"), pinned);
      const result = settle([node], [], positions, true);
      assert.equal(result[node.id].pinned, pinned);
      if (pinned) assert.deepEqual(result[node.id], positions[node.id]);
      else assert.notDeepEqual(result[node.id], positions[node.id]);
    }
  });
}
