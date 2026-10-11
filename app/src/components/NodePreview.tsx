import type { Appearance } from "../domain/model";

/** A small drawing of a tag's node, matching how the graph renders the appearance. */
export function NodePreview({ appearance: a, box = 52 }: { appearance: Appearance; box?: number }) {
  const r = Math.min(a.size, box * 0.9) / 2, c = box / 2;
  return (
    <svg className="node-preview" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {a.shape === "circle" && <circle cx={c} cy={c} r={r} fill={a.color} />}
      {a.shape === "rounded-square" && <rect x={c - r} y={c - r} width={r * 2} height={r * 2} rx={Math.min(14, r * 0.4)} fill={a.color} />}
      {a.shape === "diamond" && <path d={`M${c} ${c - r}L${c + r} ${c}L${c} ${c + r}L${c - r} ${c}Z`} fill={a.color} />}
      {a.icon && <text x={c} y={c} dy="0.35em" textAnchor="middle" fontSize={Math.round(r * 0.84)} fontWeight={600} fill="#fff">{a.icon}</text>}
    </svg>
  );
}
