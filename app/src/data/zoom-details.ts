export const zoomDetailDefaults = {
  maxZoom: 6.2,
  bookmarkTitle: { start: 1, end: 2 },
  bookmarkSubtitle: { start: 2, end: 3 },
  bookmarkSymbol: { start: 5, end: 6 },
  hubTitle: { start: 1, end: 3 },
  hubType: { start: 0.1, end: 0.2 },
  hubSubtitle: { start: 3, end: 3.5 },
};
export type ZoomDetails = typeof zoomDetailDefaults;
export type ZoomDetailKey = Exclude<keyof ZoomDetails, "maxZoom">;
export function readZoomDetails(value: unknown): ZoomDetails {
  const result = structuredClone(zoomDetailDefaults);
  if (!value || typeof value !== "object") return result;
  const maxZoom = (value as { maxZoom?: unknown }).maxZoom;
  if (
    typeof maxZoom === "number" &&
    Number.isFinite(maxZoom) &&
    maxZoom >= 0.09 &&
    maxZoom <= 100
  )
    result.maxZoom = maxZoom;
  for (const key of Object.keys(result).filter(
    (key) => key !== "maxZoom",
  ) as ZoomDetailKey[]) {
    const pair = (value as Record<string, unknown>)[key];
    const { start, end } = (pair && typeof pair === "object" ? pair : {}) as {
      start?: unknown;
      end?: unknown;
    };
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0.08 &&
      end <= 100 &&
      end > start
    )
      result[key] = { start, end };
    result[key].end = Math.min(result[key].end, result.maxZoom);
    result[key].start = Math.min(result[key].start, result[key].end - 0.01);
  }
  return result;
}
