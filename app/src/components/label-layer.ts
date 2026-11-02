import { Label, type Element, type LabelStyleProps } from "@antv/g6";
import type { DisplayObject, Group } from "@antv/g";

type Entry = { source: Label; copy: Label; style: Record<string, unknown>; matrix: number[] };

/** Paint accepted labels above every node without changing their collision bounds. */
export class LabelLayer {
  private entries = new Map<Element, Entry>();

  constructor(private root: Group) {}

  show(element: Element) {
    const source = element.getShape<Label>("label");
    if (!source || element.destroyed) return;
    let entry = this.entries.get(element);
    if (!entry || entry.source !== source) {
      this.hide(element);
      const copy = new Label({ id: `label-layer:${element.id}`, style: { text: "", zIndex: 0 } });
      this.root.appendChild(copy);
      entry = { source, copy, style: {}, matrix: [] };
      this.entries.set(element, entry);
    }
    this.syncEntry(entry);
    entry.copy.toFront();
  }

  hide(element: Element) {
    this.entries.get(element)?.copy.destroy();
    this.entries.delete(element);
  }

  sync(hidden: Iterable<Element> = []) {
    for (const [element, entry] of this.entries) {
      if (element.destroyed || !element.isVisible() || element.getShape("label") !== entry.source) this.hide(element);
      else this.syncEntry(entry);
    }
    // A silent layout update can also reveal labels rejected by collision filtering.
    for (const element of hidden) {
      if (!element.destroyed) this.hideSource(element.getShape<Label>("label"));
    }
  }

  private syncEntry(entry: Entry) {
    const { source, copy } = entry;
    // Keep the source attached to its node: G6 owns its bounds and lifecycle.
    // The overlay uses the same styles, including dimming, but its own draw order.
    const { zIndex: _zIndex, ...attributes } = source.attributes;
    const style = { ...attributes, visibility: "visible", pointerEvents: "none", backgroundPointerEvents: "none" } satisfies Partial<LabelStyleProps>;
    const changed = Object.entries(style).some(([key, value]) => entry.style[key] !== value);
    if (changed) {
      copy.update(style);
      entry.style = style;
    }
    const matrix = source.getWorldTransform();
    if (changed || entry.matrix.some((value, i) => value !== matrix[i])) {
      copy.setLocalTransform(matrix);
      entry.matrix = Array.from(matrix);
    }
    this.hideSource(source);
  }

  private hideSource(source?: Label) {
    // G6 disables inherited CSS visibility, so hide the text and backing too.
    source?.forEach((node) => {
      const shape = node as DisplayObject;
      if (shape.style.visibility !== "hidden") shape.style.visibility = "hidden";
    });
  }

  destroy() {
    for (const [element, entry] of this.entries) {
      if (!entry.source.destroyed) entry.source.forEach((shape) => { (shape as DisplayObject).style.visibility = "visible"; });
      this.hide(element);
    }
  }
}
