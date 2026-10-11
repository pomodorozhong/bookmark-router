/** Label fit is evaluated in screen pixels, independently of world coordinates. */
export function tagLabelOutside(size: number, zoom: number, textWidth: number, wasOutside?: boolean) {
  const available = size * zoom;
  const required = Math.max(26, textWidth + 12);
  // A four-pixel dead band prevents labels oscillating at a zoom threshold.
  return available < required + (wasOutside === true ? 4 : wasOutside === false ? -4 : 0);
}

/** Below this zoom, bubble titles are hidden except for the selected or hovered bubble. */
export const bubbleLabelMinZoom = 0.6;

/** Images show with a bubble's title from this zoom, when a 25px bubble is about 10px on screen. */
export const bubbleImageMinZoom = 0.4;
