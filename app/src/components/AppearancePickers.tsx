import { useRef } from "react";
import { Icon } from "./Icon";
import { NodePreview } from "./NodePreview";
import { defaultPoints, isTagStyle, tagStyles } from "./tag-shapes";
import type { Appearance, Direction } from "../domain/model";

// Preset tag colors, dark enough for a white icon. Custom picks anything else.
export const tagPalette: Array<[name: string, color: string]> = [
  ["Teal", "#0f766e"], ["Green", "#15803d"], ["Blue", "#1d4ed8"], ["Indigo", "#4338ca"], ["Violet", "#7e22ce"], ["Pink", "#be185d"],
  ["Red", "#b91c1c"], ["Orange", "#c2410c"], ["Amber", "#b45309"], ["Olive", "#4d7c0f"], ["Slate", "#475569"],
];
const styleNames: Record<Appearance["shape"], string> = {
  "price-tag": "Price", "rounded-tag": "Rounded", "shipping-tag": "Shipping", "hang-tag": "Hang",
  circle: "Circle", "rounded-square": "Rounded square", diamond: "Diamond",
};
const styleOrder: Appearance["shape"][] = [...tagStyles, "circle", "rounded-square", "diamond"];

/** Preset swatches, with the last swatch opening the system picker for any other color. */
export function ColorPicker({ value, onChange, disabled, used = [], label = "Color" }: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Colors other types already use; their swatches get a dot. */
  used?: string[];
  label?: string;
}) {
  const custom = useRef<HTMLInputElement>(null);
  const known = tagPalette.some(([, c]) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="color-picker" role="radiogroup" aria-label={label}>
      {tagPalette.map(([name, color]) => {
        const on = color.toLowerCase() === value.toLowerCase(), taken = used.some((u) => u.toLowerCase() === color);
        return (
          <button key={color} type="button" role="radio" aria-checked={on} aria-label={name} disabled={disabled} className="swatch-button"
            title={`${name}${taken ? " (used by another type)" : ""}`} style={{ background: color }} onClick={() => onChange(color)}>
            {on && <Icon name="check" size={15} strokeWidth={3} />}
            {taken && <i className="swatch-used" />}
          </button>
        );
      })}
      <button type="button" role="radio" aria-checked={!known} aria-label="Custom color" title={known ? "Custom color…" : `Custom ${value}`} disabled={disabled}
        className={`swatch-button custom ${known ? "" : "picked"}`} style={known ? undefined : { background: value }} onClick={() => custom.current?.click()}>
        {known ? <span className="swatch-plus">+</span> : <Icon name="check" size={15} strokeWidth={3} />}
      </button>
      <input ref={custom} className="swatch-input" type="color" tabIndex={-1} aria-hidden="true" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** The seven node styles as small drawings: four tags, then circle, rounded square, and diamond. */
export function StylePicker({ value, onChange, disabled }: { value: Appearance; onChange: (patch: Partial<Appearance>) => void; disabled?: boolean }) {
  return (
    <div className="style-picker" role="radiogroup" aria-label="Style">
      {styleOrder.map((shape) => (
        <button key={shape} type="button" role="radio" aria-checked={value.shape === shape} disabled={disabled} title={styleNames[shape]}
          onClick={() => onChange({
            shape,
            // A tag keeps its direction among side tags; switching to or from the hang tag starts from that style's own.
            points: isTagStyle(shape) && isTagStyle(value.shape) && (shape === "hang-tag") === (value.shape === "hang-tag") ? value.points : undefined,
          })}>
          <NodePreview appearance={{ ...value, shape, size: 30, icon: undefined, color: "#536b62", points: undefined }} box={34} />
          <span>{styleNames[shape]}</span>
        </button>
      ))}
    </div>
  );
}

const compass: Array<Direction | null> = ["up-left", "up", "up-right", "left", null, "right", "down-left", "down", "down-right"];
const arrows: Record<Direction, string> = { up: "↑", "up-right": "↗", right: "→", "down-right": "↘", down: "↓", "down-left": "↙", left: "←", "up-left": "↖" };

/** Which way a tag style's hole end points, as a 3×3 compass around a live preview. */
export function PointsPicker({ value, onChange, disabled }: { value: Appearance; onChange: (points: Direction) => void; disabled?: boolean }) {
  const tag = isTagStyle(value.shape);
  const points = tag ? value.points ?? defaultPoints(value.shape as Parameters<typeof defaultPoints>[0]) : undefined;
  return (
    <div className="points-picker" role="radiogroup" aria-label="Direction the hole end points">
      {compass.map((d) =>
        d === null ? (
          <span key="mid" className="points-preview"><NodePreview appearance={{ ...value, size: 30, icon: undefined }} box={34} /></span>
        ) : (
          <button key={d} type="button" role="radio" aria-checked={points === d} aria-label={d.replace("-", " ")} disabled={disabled || !tag} onClick={() => onChange(d)}>
            {arrows[d]}
          </button>
        ))}
    </div>
  );
}
