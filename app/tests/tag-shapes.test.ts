import { test } from "node:test";
import assert from "node:assert/strict";
import { exitPoint, tagGeometry } from "../src/components/tag-shapes";
import { emptyWorkspace, validateWorkspace } from "../src/domain/model";

const close = (actual: readonly number[], expected: number[]) =>
  assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 0.6), `${actual} ≈ ${expected}`);

test("a tag's size is its longer side, and turning it swaps its box", () => {
  close(tagGeometry("price-tag", 80).box, [80, 50]);
  close(tagGeometry("price-tag", 80, "up").box, [50, 80]);
  close(tagGeometry("rounded-tag", 80, "right").box, [79, 50]); // its rounded tip stops just short
  close(tagGeometry("hang-tag", 80).box, [57.6, 80]);
  close(tagGeometry("hang-tag", 80, "left").box, [80, 57.6]);
});

test("the icon tilts 45° along a diagonal tag and stays upright otherwise", () => {
  assert.equal(tagGeometry("price-tag", 80, "left").iconAngle, 0);
  assert.equal(tagGeometry("price-tag", 80, "up").iconAngle, 0);
  assert.equal(tagGeometry("price-tag", 80, "up-left").iconAngle, 45);
  assert.equal(tagGeometry("hang-tag", 80, "down-right").iconAngle, 45);
  assert.equal(tagGeometry("price-tag", 80, "up-right").iconAngle, -45);
  assert.equal(tagGeometry("shipping-tag", 80, "down-left").iconAngle, -45);
  // The icon sits toward the end without the hole: right of center when the hole points left.
  assert.ok(tagGeometry("price-tag", 80, "left").icon[0] > 0);
  assert.ok(tagGeometry("price-tag", 80, "right").icon[0] < 0);
});

test("workspaces accept tag styles and directions, and reject unknown directions", () => {
  const w = emptyWorkspace();
  w.tagTypes = [{ id: "t", name: "Issue", appearance: { color: "#0f766e", size: 64, shape: "hang-tag", points: "up-left" } }];
  validateWorkspace(w);
  (w.tagTypes[0].appearance as { points: string }).points = "north";
  assert.throws(() => validateWorkspace(w), /unknown tag direction/);
});

test("links meet a tag's outline, not its bounding box", () => {
  // A price tag 80 wide pointing left: its tip is at x = -40, straight left of center.
  const left = tagGeometry("price-tag", 80, "left");
  close(exitPoint(left.contour, [-100, 0])!, [-40, 0]);
  // Toward the top-left corner of the box, the slanted edge is reached well inside it.
  const corner = exitPoint(left.contour, [-40, -25])!;
  assert.ok(Math.hypot(...corner) < Math.hypot(40, 25) - 5);
  // Turned to point up, the tip is straight above.
  close(exitPoint(tagGeometry("price-tag", 80, "up").contour, [0, -100])!, [0, -40]);
  // The rounded tag's round end reaches the full half width.
  close(exitPoint(tagGeometry("rounded-tag", 80, "left").contour, [100, 0])!, [40, 0]);
});
