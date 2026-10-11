import { Circle as GCircle, Path as GPath, type Group } from "@antv/g";
import { BaseNode, ExtensionCategory, register, type BaseNodeStyleProps } from "@antv/g6";
import type { Direction, TagStyle } from "../domain/model";
import { tagGeometry } from "./tag-shapes";

export interface TagNodeStyleProps extends BaseNodeStyleProps {
  tagStyle?: TagStyle;
  points?: Direction;
}
type Attributes = Required<TagNodeStyleProps>;

// A G6 node drawn as a flat tag (see tag-shapes.ts). `size` is the tag's longer side;
// the icon sits off-center and tilts along a diagonal tag.
class TagNode extends BaseNode<TagNodeStyleProps> {
  protected tagOutline(attributes: Attributes) {
    return tagGeometry(attributes.tagStyle ?? "price-tag", this.getSize(attributes)[0], attributes.points);
  }
  protected drawKeyShape(attributes: Attributes, container: Group) {
    const { tagStyle, points, ...style } = this.getKeyStyle(attributes) as Record<string, unknown>;
    void tagStyle, void points;
    return this.upsert("key", GPath, { ...style, d: this.tagOutline(attributes).d, fillRule: "evenodd" }, container);
  }
  protected getHaloStyle(attributes: Attributes) {
    const style = super.getHaloStyle(attributes);
    return style && { ...style, d: this.tagOutline(attributes).d, fillRule: "evenodd" as const };
  }
  protected drawIconShape(attributes: Attributes, container: Group) {
    super.drawIconShape(attributes, container);
    const icon = this.getShape("icon");
    if (!icon) return;
    const { icon: [x, y], iconAngle } = this.tagOutline(attributes);
    icon.setLocalPosition(x, y);
    icon.setLocalEulerAngles(iconAngle);
  }
  render(attributes = this.parsedAttributes as Attributes, container: Group = this as unknown as Group) {
    super.render(attributes, container);
    // The shipping tag's lighter ring around its hole.
    const ring = this.tagOutline(attributes).ring;
    this.upsert("ring", GCircle,
      ring ? { cx: ring.at[0], cy: ring.at[1], r: ring.r, fill: "#fff", fillOpacity: 0.28 * Number(attributes.fillOpacity ?? 1), pointerEvents: "none" } : false,
      container);
  }
}

register(ExtensionCategory.NODE, "tag-shape", TagNode);
