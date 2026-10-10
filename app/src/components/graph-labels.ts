/** Label fit is evaluated in screen pixels, independently of world coordinates. */
export function tagLabelOutside(size: number, zoom: number, textWidth: number, wasOutside?: boolean) {
  const available = size * zoom;
  const required = Math.max(26, textWidth + 12);
  // A four-pixel dead band prevents labels oscillating at a zoom threshold.
  return available < required + (wasOutside === true ? 4 : wasOutside === false ? -4 : 0);
}
