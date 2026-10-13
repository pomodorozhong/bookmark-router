export type Point = readonly [number, number];

// Gives each unplaced node a start position beside a linked node that already
// has one, so new records begin near their tags instead of in a detached grid.
// Nodes with no placed neighbor start around `center`. Order follows links, so
// a new tag and its new bubbles end up together.
export function placeNear(
  ids: string[],
  placed: Map<string, Point>,
  memberships: { bubbleId: string; tagId: string }[],
  center: Point,
): Map<string, Point> {
  const result = new Map<string, Point>();
  const known = new Map(placed);
  const pending = [...ids];
  const neighbors = (id: string) =>
    memberships
      .filter((m) => m.bubbleId === id || m.tagId === id)
      .map((m) => (m.bubbleId === id ? m.tagId : m.bubbleId));
  while (pending.length) {
    const index = pending.findIndex((id) => neighbors(id).some((n) => known.has(n)));
    const [id] = pending.splice(index === -1 ? 0 : index, 1);
    const anchor = neighbors(id).map((n) => known.get(n)).find(Boolean) ?? center;
    const k = result.size + 1,
      r = 60 + 6 * Math.sqrt(k);
    const point = [anchor[0] + r * Math.cos(k * 2.39996), anchor[1] + r * Math.sin(k * 2.39996)] as const;
    result.set(id, point);
    known.set(id, point);
  }
  return result;
}
