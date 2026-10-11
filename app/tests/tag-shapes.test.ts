import { test } from "node:test";
import assert from "node:assert/strict";
import { tagGeometry } from "../src/components/tag-shapes";
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
