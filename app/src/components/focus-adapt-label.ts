import { AutoAdaptLabel, ExtensionCategory, register, type AutoAdaptLabelOptions } from "@antv/g6";

type Element = { id: string; getShape(name: string): { getRenderBounds(): { intersects(other: unknown): boolean } } };
type Detect = (elements: Element[]) => { show: Element[]; hide: Element[] };

export interface FocusAdaptLabelOptions extends AutoAdaptLabelOptions {
  /** IDs whose labels always show, such as the hovered or selected node. */
  focusIds?: () => string[];
}

// G6's auto-adapt-label hides any label not fully inside the view, even the
// hovered one near the edge. Focused labels always show, hide what they overlap,
// and come first so they are brought to the front last.
class FocusAdaptLabel extends AutoAdaptLabel {
  constructor(context: ConstructorParameters<typeof AutoAdaptLabel>[0], options: FocusAdaptLabelOptions) {
    super(context, options);
    const self = this as unknown as { detectLabelCollision: Detect };
    const detect = self.detectLabelCollision;
    self.detectLabelCollision = (elements) => {
      const ids = new Set(options.focusIds?.() ?? []);
      const result = detect(elements);
      const focused = elements.filter((e) => ids.has(e.id));
      if (!focused.length) return result;
      const bounds = focused.map((e) => e.getShape("label").getRenderBounds());
      const covered = (e: Element) => bounds.some((b) => b.intersects(e.getShape("label").getRenderBounds()));
      const others = result.show.filter((e) => !ids.has(e.id));
      return {
        show: [...focused, ...others.filter((e) => !covered(e))],
        hide: [...result.hide.filter((e) => !ids.has(e.id)), ...others.filter(covered)],
      };
    };
  }
}

register(ExtensionCategory.BEHAVIOR, "focus-adapt-label", FocusAdaptLabel);
