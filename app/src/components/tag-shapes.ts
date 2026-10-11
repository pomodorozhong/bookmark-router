import type { Appearance, Direction, TagStyle } from "../domain/model";

// Flat tag outlines with the hole cut through (fill-rule evenodd), shared by the graph
// node and the editor preview. A tag's size is its longer side, as a circle's is its
// width, so switching a type between a circle and a tag keeps its weight.

type Point = readonly [number, number];
// Absolute path commands; every point is turned with the tag.
type Segment = ["M" | "L", Point] | ["Q", Point, Point] | ["A", number, Point] | ["Z"];

export const tagStyles: TagStyle[] = ["price-tag", "rounded-tag", "shipping-tag", "hang-tag"];
// Clockwise from up, in degrees.
const directionAngles: Record<Direction, number> = {
  up: 0, "up-right": 45, right: 90, "down-right": 135, down: 180, "down-left": 225, left: 270, "up-left": 315,
};
export const directions = Object.keys(directionAngles) as Direction[];

export function isTagStyle(shape: Appearance["shape"]): shape is TagStyle {
  return (tagStyles as string[]).includes(shape);
}
/** Where the hole end points when a tag sets no direction. */
export function defaultPoints(shape: TagStyle): Direction {
  return shape === "hang-tag" ? "up" : "left";
}

const hole = ([x, y]: Point, r: number): Segment[] => [["M", [x + r, y]], ["A", r, [x - r, y]], ["A", r, [x + r, y]], ["Z"]];

// Each outline is drawn pointing its default way (side tags left, the hang tag up),
// centered on 0,0, with where its icon sits.
function outline(shape: TagStyle, s: number): { segments: Segment[]; icon: Point; ring?: { at: Point; r: number }; extent?: Point[] } {
  if (shape === "hang-tag") {
    const h = s, w = s * 0.72, x = w / 2, y = h / 2, c = w * 0.32, r = h * 0.06;
    return {
      segments: [["M", [-x, -y + c]], ["L", [-x + c, -y]], ["L", [x - c, -y]], ["L", [x, -y + c]], ["L", [x, y - r]], ["Q", [x, y], [x - r, y]],
        ["L", [-x + r, y]], ["Q", [-x, y], [-x, y - r]], ["Z"], ...hole([0, -y + c * 0.95], w * 0.12)],
      icon: [0, h * 0.1],
    };
  }
  const w = s, h = s / 1.6, x0 = -w / 2, x1 = w / 2, y = h / 2;
  if (shape === "rounded-tag") {
    const p = h * 0.46;
    return {
      segments: [["M", [x0 + h * 0.06, h * 0.07]], ["Q", [x0 - h * 0.02, 0], [x0 + h * 0.06, -h * 0.07]], ["L", [x0 + p - h * 0.06, -y + h * 0.04]],
        ["Q", [x0 + p, -y], [x0 + p + h * 0.1, -y]], ["L", [x1 - y, -y]], ["A", y, [x1 - y, y]], ["L", [x0 + p + h * 0.1, y]],
        ["Q", [x0 + p, y], [x0 + p - h * 0.06, y - h * 0.04]], ["Z"], ...hole([x0 + p * 0.9, 0], h * 0.11)],
      icon: [h * 0.2, 0],
      // The rounded tip and the arc's far side, which no end point reaches.
      extent: [[x0 + h * 0.02, 0], [x1, 0]],
    };
  }
  const r = shape === "shipping-tag" ? h * 0.08 : h * 0.16;
  const right: Segment[] = [["L", [x1 - r, -y]], ["Q", [x1, -y], [x1, -y + r]], ["L", [x1, y - r]], ["Q", [x1, y], [x1 - r, y]]];
  if (shape === "shipping-tag") {
    const c = h * 0.3, at: Point = [x0 + h * 0.34, 0];
    return {
      segments: [["M", [x0, -y + c]], ["L", [x0 + c, -y]], ...right, ["L", [x0 + c, y]], ["L", [x0, y - c]], ["Z"], ...hole(at, h * 0.1)],
      icon: [h * 0.22, 0],
      ring: { at, r: h * 0.17 },
    };
  }
  // The hole end comes to a rounded point, with softened shoulders.
  const p = h * 0.42, len = Math.hypot(p, y), ux = p / len, uy = y / len, k = h * 0.16, j = h * 0.06;
  return {
    segments: [["M", [x0 + k * ux, -k * uy]], ["L", [x0 + p - j * ux, -y + j * uy]], ["Q", [x0 + p, -y], [x0 + p + j, -y]], ...right,
      ["L", [x0 + p + j, y]], ["Q", [x0 + p, y], [x0 + p - j * ux, y - j * uy]], ["L", [x0 + k * ux, k * uy]], ["Q", [x0, 0], [x0 + k * ux, -k * uy]], ["Z"],
      ...hole([x0 + p * 0.95, 0], h * 0.11)],
    icon: [h * 0.22, 0],
    // The rounded point's tip, which no end point reaches.
    extent: [[x0 + (k * ux) / 2, 0]],
  };
}

export interface TagGeometry {
  /** SVG path data, already turned. */
  d: string;
  icon: Point;
  /** Icon rotation in degrees: along a diagonal tag, upright otherwise. */
  iconAngle: number;
  ring?: { at: Point; r: number };
  /** Width and height of the turned outline's bounding box. */
  box: Point;
  /** The outer edge as a polygon (curves sampled, hole left out), for where links meet it. */
  contour: Point[];
}

// The outer outline as points: everything before the first close, with curves sampled.
// Its only arcs are half circles (the rounded tag's end), drawn clockwise.
function contourOf(segments: Segment[]): Point[] {
  const points: Point[] = [];
  for (const s of segments) {
    if (s[0] === "Z") break;
    if (s[0] === "M" || s[0] === "L") { points.push(s[1]); continue; }
    const from = points[points.length - 1]!;
    if (s[0] === "Q") {
      for (let k = 1; k <= 4; k++) {
        const u = k / 4, v = 1 - u;
        points.push([v * v * from[0] + 2 * u * v * s[1][0] + u * u * s[2][0], v * v * from[1] + 2 * u * v * s[1][1] + u * u * s[2][1]]);
      }
    } else {
      const [, r, end] = s as ["A", number, Point];
      const c: Point = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2];
      const start = Math.atan2(from[1] - c[1], from[0] - c[0]);
      for (let k = 1; k <= 8; k++) points.push([c[0] + r * Math.cos(start + (Math.PI * k) / 8), c[1] + r * Math.sin(start + (Math.PI * k) / 8)]);
    }
  }
  return points;
}

/** Where a ray from the center toward `toward` leaves the contour, or undefined if it never does. */
export function exitPoint(contour: Point[], toward: Point): Point | undefined {
  let best: number | undefined;
  for (const [i, a] of contour.entries()) {
    const b = contour[(i + 1) % contour.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const denom = toward[0] * ey - toward[1] * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (a[0] * ey - a[1] * ex) / denom, u = (a[0] * toward[1] - a[1] * toward[0]) / denom;
    if (t > 0 && u >= 0 && u <= 1 && (best === undefined || t < best)) best = t;
  }
  return best === undefined ? undefined : [toward[0] * best, toward[1] * best];
}

export function tagGeometry(shape: TagStyle, size: number, points: Direction = defaultPoints(shape)): TagGeometry {
  const { segments, icon, ring, extent = [] } = outline(shape, size);
  const turn = ((directionAngles[points] - directionAngles[defaultPoints(shape)]) * Math.PI) / 180;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const t = ([x, y]: Point): Point => [x * cos - y * sin, x * sin + y * cos];
  const n = (v: number) => Math.round(v * 100) / 100;
  const xy = (p: Point) => { const [x, y] = t(p); return `${n(x)} ${n(y)}`; };
  const d = segments.map((s) =>
    s[0] === "Z" ? "Z" : s[0] === "Q" ? `Q${xy(s[1])} ${xy(s[2])}` : s[0] === "A" ? `A${n(s[1])} ${n(s[1])} 0 0 1 ${xy(s[2])}` : `${s[0]}${xy(s[1])}`).join("");
  // End points only: control points can lie outside the curve.
  const ends = segments.flatMap((s) => (s[0] === "M" || s[0] === "L" ? [s[1]] : s[0] === "Q" ? [s[2]] : []));
  const corners = [...ends, ...extent].map(t);
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const tilt = { "up-left": 45, "down-right": 45, "up-right": -45, "down-left": -45 } as Partial<Record<Direction, number>>;
  return {
    d,
    icon: t(icon),
    iconAngle: tilt[points] ?? 0,
    ring: ring && { at: t(ring.at), r: ring.r },
    box: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
    contour: contourOf(segments).map(t),
  };
}
