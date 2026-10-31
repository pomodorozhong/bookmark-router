import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installTouchZoom } from "../src/components/touch-zoom";

const originalWindow = globalThis.window;
globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
after(() => { globalThis.window = originalWindow; });
function gesture() {
  const surface = new EventTarget() as HTMLElement;
  let zoom = 1, starts = 0;
  const draws: Array<{ zoom: number; center: readonly [number, number] }> = [];
  const stop = installTouchZoom(surface, () => zoom, (next, center) => { zoom = next; draws.push({ zoom, center }); }, () => starts++);
  const send = (type: string, id = 1, x = 0, y = 0, pointerType = "touch") => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: x, clientY: y, pointerType });
    surface.dispatchEvent(event); return event;
  };
  return { send, stop, draws, get zoom() { return zoom; }, get starts() { return starts; } };
}
test("two touch pointers zoom relative to the gesture start without compounding moves", () => {
  const g = gesture();
  try {
    assert.equal(g.send("pointerdown", 1, 100, 50).defaultPrevented, false);
    assert.equal(g.send("pointerdown", 2, 200, 50).defaultPrevented, true);
    g.send("pointermove", 2, 250, 50); assert.equal(g.zoom, 1.5);
    g.send("pointermove", 2, 300, 50); assert.equal(g.zoom, 2);
    assert.deepEqual(g.draws.at(-1)!.center, [150, 50]); assert.equal(g.starts, 1);
    g.send("pointerup", 1); g.send("pointerup", 2);
    assert.equal(g.send("click").defaultPrevented, true, "a pinch must not become a graph click");
    g.send("pointerdown", 1, 100, 50);
    assert.equal(g.send("click").defaultPrevented, false, "the next interaction can click normally");
  } finally { g.stop(); }
});
test("pinch clamps zoom and cancellation, blur and cleanup reset the gesture", () => {
  const g = gesture();
  g.send("pointerdown", 1, 0); g.send("pointerdown", 2, 100);
  g.send("pointermove", 2, 10000); assert.equal(g.zoom, 4);
  g.send("pointermove", 2, 1); assert.equal(g.zoom, 0.15);
  g.send("pointercancel", 2); const count = g.draws.length;
  g.send("pointermove", 1, 200); assert.equal(g.draws.length, count);
  window.dispatchEvent(new Event("blur"));
  g.send("pointerdown", 3, 100); g.send("pointerdown", 4, 200);
  g.send("pointermove", 4, 300); assert.equal(g.zoom, 0.3);
  g.stop(); g.send("pointermove", 4, 400); assert.equal(g.zoom, 0.3);
});
test("mouse and single-touch moves retain the existing drag and click paths", () => {
  const g = gesture();
  try {
    g.send("pointerdown", 1, 0, 0, "mouse");g.send("pointerdown", 2, 100, 0, "mouse");
    assert.equal(g.send("pointermove", 2, 200, 0, "mouse").defaultPrevented, false);
    g.send("pointerdown", 3, 50); assert.equal(g.send("pointermove", 3, 80).defaultPrevented, false);
    assert.equal(g.draws.length, 0); assert.equal(g.starts, 0);
  } finally { g.stop(); }
});
