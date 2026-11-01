import assert from "node:assert/strict";
import { test } from "node:test";
import { Group } from "@antv/g";
import { Circle, type Label } from "@antv/g6";
import { LabelLayer } from "../src/components/label-layer";

// Exercise real G6 shapes without browser font measurement. Backings, collision
// bounds and pointer input are checked in the browser with the copied collection.
function node(id: string) {
  return new Circle({ id, style: { x: 25, y: 30, size: 40, labelText: id, labelBackground: false } });
}

test("accepted labels render separately in priority order without detaching their sources", () => {
  const root = new Group(), layer = new LabelLayer(root), a = node("a"), b = node("b");
  try {
    layer.show(b);
    layer.show(a);
    const [back, front] = root.children as Label[];
    assert.ok(Number.isFinite(Number(front.style.zIndex)));
    assert.ok(Number(front.style.zIndex) > Number(back.style.zIndex));
    assert.equal(a.getShape("label").parentNode, a);
    assert.equal(a.getShape("label").isVisible(), false);
    assert.equal(front.isVisible(), true);
    assert.equal(front.attributes.pointerEvents, "none");
    assert.equal(front.attributes.backgroundPointerEvents, "none");
    layer.hide(a);
    assert.equal(root.children.length, 1);
    assert.equal(a.getShape("label").parentNode, a);
    layer.show(a);
    assert.equal(root.children.length, 2);
  } finally { layer.destroy(); a.destroy(); b.destroy(); root.destroy(); }
});

test("labels follow node motion and style changes without rerunning collision selection", () => {
  const root = new Group(), main = new Group(), layer = new LabelLayer(root), a = node("a");
  main.appendChild(a);
  try {
    layer.show(a);
    const copy = root.children[0] as Label;
    main.setPosition(100, 200);
    a.update({ x: 60, y: 70, labelText: "Renamed", labelFill: "red", opacity: 0.25 });
    layer.sync();
    const source = a.getShape<Label>("label");
    assert.equal(root.children[0], copy);
    assert.deepEqual(Array.from(copy.getWorldTransform()), Array.from(source.getWorldTransform()));
    assert.equal(copy.attributes.text, "Renamed");
    assert.equal(copy.attributes.fill, "red");
    assert.equal(copy.attributes.opacity, source.attributes.opacity);
    assert.equal(source.isVisible(), false);
    assert.equal(copy.isVisible(), true);
  } finally { layer.destroy(); main.destroy(); root.destroy(); }
});

test("removed, replaced and hidden labels leave no stale overlay", () => {
  const root = new Group(), layer = new LabelLayer(root), a = node("a");
  try {
    layer.show(a);
    const old = root.children[0];
    a.update({ label: false });
    layer.sync();
    assert.equal(root.children.length, 0);
    assert.equal(old.destroyed, true);
    a.update({ label: true });
    layer.show(a);
    assert.notEqual(root.children[0], old);
    a.style.visibility = "hidden";
    layer.sync();
    assert.equal(root.children.length, 0);
    a.style.visibility = "visible";
    layer.show(a);
    layer.destroy();
    assert.equal(root.children.length, 0);
    assert.equal(a.getShape("label").isVisible(), true);
    layer.show(a);
    a.destroy();
    layer.sync();
    assert.equal(root.children.length, 0);
  } finally { layer.destroy(); if (!a.destroyed) a.destroy(); root.destroy(); }
});

test("silent layout updates cannot reveal labels rejected by collision filtering", () => {
  const root = new Group(), layer = new LabelLayer(root), a = node("a");
  try {
    layer.show(a);
    layer.hide(a);
    a.update({ x: 50, visibility: "visible" });
    assert.equal(a.getShape("label").isVisible(), true);
    layer.sync([a]);
    assert.equal(a.getShape("label").isVisible(), false);
    assert.equal(root.children.length, 0);
  } finally { layer.destroy(); a.destroy(); root.destroy(); }
});
