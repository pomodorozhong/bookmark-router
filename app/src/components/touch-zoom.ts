type Point = readonly [number, number];

/** Native pointer pinch uses one starting zoom, so moves never compound their scale. */
export function installTouchZoom(surface: HTMLElement, getZoom: () => number,
  zoomTo: (zoom: number, center: Point) => void, onStart: () => void = () => {}) {
  const points = new Map<number, Point>();
  let start: { distance: number; zoom: number; center: Point } | undefined;
  let blockClick = false;
  const begin = () => {
    const [a, b] = [...points.values()];
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    start = distance > 0 ? { distance, zoom: getZoom(), center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] } : undefined;
  };
  const down = (event: PointerEvent) => {
    if (!points.size) blockClick = false;
    if (event.pointerType !== "touch") return;
    points.set(event.pointerId, [event.clientX, event.clientY]);
    if (points.size < 2) return;
    begin(); blockClick = true; onStart();
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const move = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, [event.clientX, event.clientY]);
    if (points.size < 2) return;
    if (!start) begin();
    if (start) {
      const [a, b] = [...points.values()];
      const ratio = Math.hypot(b[0] - a[0], b[1] - a[1]) / start.distance;
      zoomTo(Math.max(0.15, Math.min(4, start.zoom * ratio)), start.center);
    }
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const end = (event: PointerEvent) => {
    points.delete(event.pointerId);
    if (points.size < 2) start = undefined;
    else begin();
    // Let G6 finish the first pointer's pending drag/brush state.
  };
  const click = (event: MouseEvent) => {
    if (blockClick) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const reset = () => { points.clear(); start = undefined; blockClick = false; };
  surface.addEventListener("pointerdown", down, { capture: true, passive: false });
  surface.addEventListener("pointermove", move, { capture: true, passive: false });
  surface.addEventListener("pointerup", end, true);
  surface.addEventListener("pointercancel", end, true);
  surface.addEventListener("click", click, true);
  window.addEventListener("blur", reset);
  return () => {
    surface.removeEventListener("pointerdown", down, true);
    surface.removeEventListener("pointermove", move, true);
    surface.removeEventListener("pointerup", end, true);
    surface.removeEventListener("pointercancel", end, true);
    surface.removeEventListener("click", click, true);
    window.removeEventListener("blur", reset);
    reset();
  };
}
