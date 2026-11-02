import { AutoAdaptLabel, ExtensionCategory, GraphEvent, register, type AutoAdaptLabelOptions, type Element } from "@antv/g6";
import { CanvasEvent } from "@antv/g";
import { LabelLayer } from "./label-layer";

type Detect = (elements: Element[]) => { show: Element[]; hide: Element[] };

export interface FocusAdaptLabelOptions extends AutoAdaptLabelOptions {
  /** IDs whose labels always show, such as the hovered or selected node. */
  focusIds?: () => string[];
  /** Retain existing label visibility during motion instead of repeating collision detection. */
  paused?: () => boolean;
}

// G6's auto-adapt-label hides any label not fully inside the view, even the
// hovered one near the edge. Focused labels always show, hide what they overlap,
// and come first so they are brought to the front last.
class FocusAdaptLabel extends AutoAdaptLabel {
  private labelLayer: LabelLayer;
  private syncLabels: () => void;

  constructor(context: ConstructorParameters<typeof AutoAdaptLabel>[0], options: FocusAdaptLabelOptions) {
    super(context, options);
    this.labelLayer = new LabelLayer(context.canvas.getRoot("label"));
    const self = this as unknown as {
      detectLabelCollision: Detect;
      onToggleVisibility: (event: unknown) => void;
      onTransform: (event: unknown) => void;
      showLabel: (element: Element) => void;
      hideLabel: (element: Element) => void;
      hiddenElements: Map<string, Element>;
    };
    // G6 force layout has silent draws that bypass AFTER_DRAW. Sync before the
    // main canvas paints as well, without repeating collision selection per frame.
    this.syncLabels = () => this.labelLayer.sync(self.hiddenElements.values());
    context.canvas.getLayer("main").addEventListener(CanvasEvent.BEFORE_RENDER, this.syncLabels);
    const show = self.showLabel, hide = self.hideLabel;
    self.showLabel = (element) => { show(element); this.labelLayer.show(element); };
    self.hideLabel = (element) => { hide(element); this.labelLayer.hide(element); };
    const toggle = self.onToggleVisibility, transform = self.onTransform;
    self.onToggleVisibility = (event) => {
      if (!options.paused?.()) toggle(event);
      // Connections retains visibility during motion, but labels still follow nodes.
      this.syncLabels();
    };
    context.graph.off(GraphEvent.AFTER_TRANSFORM, transform);
    self.onTransform = (event) => { if (!options.paused?.()) transform(event); };
    context.graph.on(GraphEvent.AFTER_TRANSFORM, self.onTransform);
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

  destroy() {
    this.context.canvas.getLayer("main").removeEventListener(CanvasEvent.BEFORE_RENDER, this.syncLabels);
    this.labelLayer.destroy();
    super.destroy();
  }
}

register(ExtensionCategory.BEHAVIOR, "focus-adapt-label", FocusAdaptLabel);
