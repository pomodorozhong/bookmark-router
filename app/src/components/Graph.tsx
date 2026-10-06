import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { deriveGraph, settle, type Position } from "../data/graph";
import { domain, isComplete } from "../data/selectors";
import type { Dataset } from "../data/types";
export type View = { x: number; y: number; scale: number };
type Props = {
  data: Dataset;
  lens: "proposed" | "approved";
  visible: Set<string>;
  selected: string[];
  focus: string | null;
  mode: "select" | "pan";
  allEdges: boolean;
  positions: Record<string, Position>;
  view: View | null;
  onPositions: (p: Record<string, Position>) => void;
  onView: (v: View) => void;
  onSelect: (id: string, multi?: boolean) => void;
  onEdge: (label: string) => void;
};
const colors = {
  bookmark: "#fff",
  topic: "#d7ede6",
  issue: "#dfe8fb",
  proposal: "#f8e6c8",
};
const strokes = {
  bookmark: "#88949e",
  topic: "#3c8a73",
  issue: "#557bbb",
  proposal: "#b58945",
};
function wrapLabel(text: string) {
  const lines = [""];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last].length && lines[last].length + word.length > 32)
      lines.push(word);
    else lines[last] += (lines[last] ? " " : "") + word;
  }
  return lines;
}
export function Graph(p: Props) {
  const graph = useMemo(() => deriveGraph(p.data, p.lens), [p.data, p.lens]);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });
  const [gesture, setGesture] = useState(false);
  const drag = useRef<{
    id?: string;
    x: number;
    y: number;
    origin: View;
    position?: Position;
    moved: boolean;
  } | null>(null);
  const v = p.view ?? { x: size.w / 2, y: size.h / 2, scale: 0.65 };
  const positions = p.positions;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    if (svg.current) observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (graph.nodes.some((n) => !positions[n.id]))
      p.onPositions(settle(graph.nodes, graph.edges, positions));
  }, [graph]); // Dataset changes seed only new nodes; existing geometry is fixed.
  const matches = new Set(
    [...p.visible]
      .map((id) => `bookmark:${id}`)
      .concat(p.selected.filter((id) => id.startsWith("bookmark:"))),
  );
  const relevant = graph.edges.filter((e) => matches.has(e.source));
  const hubIds = new Set(relevant.map((e) => e.target));
  const shown = graph.nodes
    .filter(
      (n) => matches.has(n.id) || hubIds.has(n.id) || p.selected.includes(n.id),
    )
    .map((n) =>
      n.kind === "bookmark"
        ? n
        : {
            ...n,
            count: new Set(
              relevant.filter((e) => e.target === n.id).map((e) => e.source),
            ).size,
          },
    );
  const shownIds = new Set(shown.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) => shownIds.has(e.source) && shownIds.has(e.target),
  );
  const neighbor = new Set(p.selected);
  edges
    .filter(
      (e) => p.selected.includes(e.source) || p.selected.includes(e.target),
    )
    .forEach((e) => {
      neighbor.add(e.source);
      neighbor.add(e.target);
    });
  const focused = p.selected.length > 0;
  const overviewPoints = shown.map((n) => positions[n.id]).filter(Boolean);
  const overviewX = overviewPoints.length
    ? Math.min(...overviewPoints.map((p) => p.x)) - 100
    : -100;
  const overviewY = overviewPoints.length
    ? Math.min(...overviewPoints.map((p) => p.y)) - 100
    : -100;
  const overviewW = overviewPoints.length
    ? Math.max(...overviewPoints.map((p) => p.x)) - overviewX + 100
    : 200;
  const overviewH = overviewPoints.length
    ? Math.max(...overviewPoints.map((p) => p.y)) - overviewY + 100
    : 200;
  const zoom = (factor: number, x = size.w / 2, y = size.h / 2) => {
    const scale = Math.max(0.08, Math.min(3.2, v.scale * factor));
    p.onView({
      x: x - ((x - v.x) * scale) / v.scale,
      y: y - ((y - v.y) * scale) / v.scale,
      scale,
    });
  };
  function fit() {
    const pts = shown.map((n) => positions[n.id]).filter(Boolean);
    if (!pts.length) return;
    const minX = Math.min(...pts.map((n) => n.x)) - 110,
      maxX = Math.max(...pts.map((n) => n.x)) + 110;
    const minY = Math.min(...pts.map((n) => n.y)) - 110,
      maxY = Math.max(...pts.map((n) => n.y)) + 110;
    const scale = Math.max(
      0.08,
      Math.min(
        1,
        (size.w - 90) / (maxX - minX),
        (size.h - 120) / (maxY - minY),
      ),
    );
    p.onView({
      x: size.w / 2 - ((minX + maxX) / 2) * scale,
      y: size.h / 2 - ((minY + maxY) / 2) * scale,
      scale,
    });
  }
  const initialFit = useRef(false);
  useEffect(() => {
    if (!p.view && Object.keys(positions).length && !initialFit.current) {
      initialFit.current = true;
      fit();
    }
  }, [positions, size]);
  const labelRects: { x: number; y: number; w: number; h: number }[] = [];
  const canLabel = (
    x: number,
    y: number,
    w: number,
    h: number,
    force: boolean,
  ) => {
    const rect = { x, y, w, h };
    if (
      !force &&
      labelRects.some(
        (r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y,
      )
    )
      return false;
    labelRects.push(rect);
    return true;
  };
  const sorted = [...shown].sort(
    (a, b) =>
      Number(p.selected.includes(b.id)) - Number(p.selected.includes(a.id)) ||
      Number(a.kind === "bookmark") - Number(b.kind === "bookmark"),
  );
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden graph-surface">
      <svg
        ref={svg}
        className={`h-full w-full touch-none ${p.mode === "pan" || gesture ? "cursor-grab" : ""}`}
        aria-label="Force-directed bookmark graph"
        onWheel={(e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          zoom(
            Math.exp(-e.deltaY * 0.0015),
            e.clientX - r.left,
            e.clientY - r.top,
          );
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (
            e.target !== e.currentTarget &&
            !(e.target as Element).classList.contains("graph-background")
          )
            return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            origin: v,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          setGesture(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (d.id && d.position)
            p.onPositions({
              ...positions,
              [d.id]: {
                ...d.position,
                x: d.position.x + dx / v.scale,
                y: d.position.y + dy / v.scale,
              },
            });
          else
            p.onView({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (d?.id && !d.moved) p.onSelect(d.id, e.shiftKey);
          drag.current = null;
          setGesture(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setGesture(false);
        }}
      >
        <rect
          className="graph-background"
          width="100%"
          height="100%"
          fill="transparent"
        />
        <g transform={`translate(${v.x},${v.y}) scale(${v.scale})`}>
          {edges.map((e) => {
            const a = positions[e.source],
              b = positions[e.target];
            if (!a || !b) return null;
            const active =
              p.selected.includes(e.source) || p.selected.includes(e.target);
            if (!p.allEdges && focused && !active) return null;
            return (
              <g
                key={e.id}
                opacity={
                  focused && !active ? 0.16 : e.kind === "topic" ? 0.36 : 0.68
                }
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.kind === "selected" ? "#455e71" : "#708795"}
                  strokeWidth={e.kind === "selected" ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={
                    e.kind === "topic"
                      ? "1 5"
                      : e.kind === "suggestion"
                        ? "5 5"
                        : undefined
                  }
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={12 / v.scale}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={active ? 0 : -1}
                  aria-label={e.label}
                  onClick={() => p.onEdge(e.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") p.onEdge(e.label);
                  }}
                >
                  <title>{e.label}</title>
                </line>
                {e.kind === "selected" && active && v.scale > 0.65 && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 8}
                    fontSize={10 / v.scale}
                    fill="#40596b"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {sorted.map((n) => {
            const pt = positions[n.id];
            if (!pt) return null;
            const selected = p.selected.includes(n.id),
              hub = n.kind !== "bookmark";
            const b =
              n.kind === "bookmark"
                ? p.data.bookmarks.find((b) => `bookmark:${b.id}` === n.id)
                : undefined;
            const detailed = !hub && v.scale >= 1.15,
              label = hub
                ? n.label
                : n.label.length > 29
                  ? n.label.slice(0, 28) + "…"
                  : n.label;
            const radius = hub
              ? Math.max(n.radius, 16 / v.scale)
              : Math.max(n.radius, 5 / v.scale);
            const font = 12 / v.scale;
            const lines =
              v.scale >= 1.15
                ? wrapLabel(n.label)
                : [label.length > 38 ? label.slice(0, 37) + "…" : label];
            const showLabel =
              (hub || v.scale >= 0.65 || selected) &&
              canLabel(
                pt.x * v.scale + v.x - 90,
                pt.y * v.scale + v.y + radius * v.scale + 10,
                180,
                lines.length * 16 + (hub || detailed ? 20 : 0),
                selected || hub,
              );
            return (
              <g
                key={n.id}
                transform={`translate(${pt.x},${pt.y})`}
                className="graph-node cursor-pointer"
                opacity={focused && !neighbor.has(n.id) ? 0.38 : 1}
                role="button"
                tabIndex={0}
                aria-label={`${n.kind}: ${n.label}${b ? `, ${b.processing.review_status}` : ""}`}
                data-node-id={n.id}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    p.onSelect(n.id, e.shiftKey);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (p.mode === "pan") {
                    drag.current = {
                      x: e.clientX,
                      y: e.clientY,
                      origin: v,
                      moved: false,
                    };
                  } else {
                    drag.current = {
                      id: n.id,
                      x: e.clientX,
                      y: e.clientY,
                      origin: v,
                      position: pt,
                      moved: false,
                    };
                  }
                  svg.current?.setPointerCapture(e.pointerId);
                  setGesture(true);
                }}
              >
                <title>{`${n.label}\n${n.subtitle}${hub ? `\n${n.count} related bookmarks` : ""}${pt.pinned ? "\nPinned" : ""}`}</title>
                {selected && (
                  <circle
                    r={radius + 5 / v.scale}
                    fill="none"
                    stroke="#153f37"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  r={radius}
                  fill={colors[n.kind]}
                  stroke={selected ? "#174f43" : strokes[n.kind]}
                  strokeWidth={selected ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
                {hub ? (
                  <>
                    {v.scale >= 0.65 && (
                      <text
                        textAnchor="middle"
                        y={-4 / v.scale}
                        fontSize={9 / v.scale}
                        fontWeight="600"
                        fill={strokes[n.kind]}
                      >
                        {n.kind === "topic"
                          ? "TOPIC"
                          : n.kind === "issue"
                            ? "ISSUE"
                            : "PROPOSAL"}
                      </text>
                    )}
                    <text
                      textAnchor="middle"
                      y={(v.scale >= 0.65 ? 14 : 4) / v.scale}
                      fontSize={12 / v.scale}
                      fontWeight="600"
                      fill="#314557"
                    >
                      {n.count}
                    </text>
                  </>
                ) : (
                  <>
                    {(v.scale >= 0.45 || selected || isComplete(b!)) && (
                      <text
                        textAnchor="middle"
                        y={4 / v.scale}
                        fontSize={12 / v.scale}
                        fill={isComplete(b!) ? "#278367" : "#788690"}
                      >
                        {isComplete(b!) ? "✓" : b?.favorite ? "★" : "·"}
                      </text>
                    )}
                    {pt.pinned && (
                      <circle
                        cx={radius * 0.7}
                        cy={-radius * 0.7}
                        r={3 / v.scale}
                        fill="#174f43"
                      />
                    )}
                  </>
                )}
                {showLabel && (
                  <>
                    <text
                      textAnchor="middle"
                      y={radius + font + 9 / v.scale}
                      fontSize={font}
                      fill="#344b56"
                      fontWeight={hub || selected ? 600 : 400}
                      paintOrder="stroke"
                      stroke="#f7f9fa"
                      strokeWidth={4 / v.scale}
                      strokeLinejoin="round"
                    >
                      {lines.map((line, index) => (
                        <tspan key={index} x={0} dy={index ? 16 / v.scale : 0}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    {hub && v.scale >= 0.65 && (
                      <text
                        textAnchor="middle"
                        y={radius + font + (9 + lines.length * 16) / v.scale}
                        fontSize={9 / v.scale}
                        fill="#7b8790"
                      >
                        {n.subtitle}
                      </text>
                    )}
                  </>
                )}
                {detailed && showLabel && (
                  <text
                    textAnchor="middle"
                    y={radius + (26 + lines.length * 16) / v.scale}
                    fontSize={10 / v.scale}
                    fill="#75818b"
                  >
                    {domain(b!.url)} · {b!.processing.review_status}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!shown.some((n) => n.kind === "bookmark") && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="font-semibold">No bookmarks match</h2>
            <p className="mt-2 text-sm text-slate-500">
              Try another queue or clear your filters.
            </p>
          </div>
        </div>
      )}
      <div className="absolute bottom-5 left-5 hidden rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-500 sm:flex gap-4">
        <span>··· Topic</span>
        <span>– – Suggested</span>
        <span>━━ Selected</span>
      </div>
      <div className="absolute bottom-5 right-5 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
        >
          <Minus size={16} />
        </button>
        <span className="w-14 text-center text-xs tabular-nums">
          {Math.round(v.scale * 100)}%
        </span>
        <button title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={16} />
        </button>
        <span className="mx-1 h-5 border-l border-slate-200" />
        <button title="Fit graph" aria-label="Fit graph" onClick={fit}>
          <Maximize size={16} />
        </button>
        <button
          title="Re-layout unpinned nodes"
          aria-label="Re-layout unpinned nodes"
          onClick={() => {
            p.onPositions(settle(graph.nodes, graph.edges, positions, true));
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <button
        className="absolute right-5 bottom-21 rounded-lg border border-slate-200 bg-white/90 p-2"
        title="Graph overview — click to fit"
        aria-label="Graph overview, fit all visible nodes"
        onClick={fit}
      >
        <svg
          width="110"
          height="70"
          viewBox={`${overviewX} ${overviewY} ${overviewW} ${overviewH}`}
          aria-hidden="true"
        >
          {shown.map(
            (n) =>
              positions[n.id] && (
                <circle
                  key={n.id}
                  cx={positions[n.id].x}
                  cy={positions[n.id].y}
                  r={((n.kind === "bookmark" ? 2 : 4) * overviewW) / 110}
                  fill={strokes[n.kind]}
                />
              ),
          )}
          <rect
            x={-v.x / v.scale}
            y={-v.y / v.scale}
            width={size.w / v.scale}
            height={size.h / v.scale}
            fill="none"
            stroke="#344b56"
            strokeWidth={overviewW / 110}
          />
        </svg>
      </button>
    </div>
  );
}
