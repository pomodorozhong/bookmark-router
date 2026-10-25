export type Point = readonly [number, number];

// Gives each unplaced node a start position among the linked nodes that
// already have one, so new records begin near their tags instead of in a detached grid.
// Nodes with no placed neighbor start around `center`. Order follows links, so
// a new tag and its new bookmarks end up together. With `radius`, each node
// walks outward until it is clear of every other node, so none lands on another.
export function placeNear(
  ids: string[],
  placed: Map<string, Point>,
  memberships: { bookmarkId: string; tagId: string }[],
  center: Point,
  radius?: (id: string) => number,
): Map<string, Point> {
  const result = new Map<string, Point>();
  const known = new Map(placed);
  const pending = [...ids];
  const neighbors = (id: string) =>
    memberships
      .filter((m) => m.bookmarkId === id || m.tagId === id)
      .map((m) => (m.bookmarkId === id ? m.tagId : m.bookmarkId));
  while (pending.length) {
    const index = pending.findIndex((id) => neighbors(id).some((n) => known.has(n)));
    const [id] = pending.splice(index === -1 ? 0 : index, 1);
    // Start from the middle of the node's placed neighbors.
    const near = neighbors(id).map((n) => known.get(n)).filter((p): p is Point => Boolean(p));
    const anchor: Point = near.length
      ? [near.reduce((sum, p) => sum + p[0], 0) / near.length, near.reduce((sum, p) => sum + p[1], 0) / near.length]
      : center;
    const k = result.size + 1;
    const at = (step: number) => {
      const r = radius ? 50 + 15 * Math.sqrt(step) : 60 + 6 * Math.sqrt(k);
      return [anchor[0] + r * Math.cos((k + step) * 2.39996), anchor[1] + r * Math.sin((k + step) * 2.39996)] as const;
    };
    const free = (p: Point) => [...known].every(([other, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= radius!(id) + radius!(other));
    let step = 0, point = at(step);
    while (radius && !free(point) && step < 5000) point = at(++step);
    result.set(id, point);
    known.set(id, point);
  }
  return result;
}
