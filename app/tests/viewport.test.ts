import test from "node:test";
import assert from "node:assert/strict";
import { fitLabelledPoints } from "../src/data/viewport";

test("filter fit uses node geometry when selected-node labels exceed the narrow canvas", () => {
  const points = [
    { x: 90, y: 150, radius: 6, labelWidth: 250, subtitleWidth: 100, lines: 1 },
    {
      x: 160,
      y: 230,
      radius: 16,
      labelWidth: 180,
      subtitleWidth: 150,
      lines: 2,
    },
  ];
  const width = 260;
  const result = fitLabelledPoints(points, width, 500, 1, 1 / 6.2, 12.5);
  assert.ok(result.ratio < 1, "zoom in to the matching nodes");
  const factor = 1 / result.ratio;
  const horizontalSpan = 70 * factor + (6 + 16) * Math.sqrt(factor) + 14;
  assert.ok(horizontalSpan <= width - 48 + 0.000001);
  assert.ok(Number.isFinite(result.center.x));
  assert.ok(Number.isFinite(result.center.y));
  // A long subtitle is equally impossible to fit by zooming out.
  const subtitle = points.map((p) => ({
    ...p,
    labelWidth: 100,
    subtitleWidth: 400,
  }));
  assert.deepEqual(
    fitLabelledPoints(subtitle, width, 500, 1, 1 / 6.2, 12.5),
    result,
  );
});

test("fitting a single selected node with an oversized title still allows maximum zoom", () => {
  const result = fitLabelledPoints(
    [
      {
        x: 150,
        y: 200,
        radius: 6,
        labelWidth: 300,
        subtitleWidth: 120,
        lines: 1,
      },
    ],
    260,
    500,
    1,
    1 / 6.2,
    12.5,
  );
  assert.ok(Math.abs(result.ratio - 1 / 6.2) < 1e-9);
});
