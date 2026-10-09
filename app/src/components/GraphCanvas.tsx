import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  Graph,
  GraphEvent,
  NodeEvent,
  type IElementEvent,
  type NodeData,
} from "@antv/g6";
import {
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
} from "d3-force";
import { appearanceFor, type Geometry, type Workspace } from "../domain/model";
export interface GraphCanvasHandle {
  setPinned(id: string, pinned: boolean): void;
}
export function GraphCanvas({
  ref,
  onPinsChanged,
  workspace,
  selected,
  onSelect,
  query,
  geometry,
  onGeometry,
}: {
  ref?: Ref<GraphCanvasHandle>;
  onPinsChanged: (ids: string[]) => void;
  workspace: Workspace;
  selected?: string;
  onSelect: (id: string) => void;
  query: string;
  geometry?: Geometry;
  onGeometry: (geometry: Geometry) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    graph = useRef<Graph | null>(null),
    onSelectRef = useRef(onSelect),
    renderedGraph = useRef<Graph | null>(null);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  type ForceNode = SimulationNodeDatum & { id: string };
  const simulation = useRef<
      Simulation<ForceNode, SimulationLinkDatum<ForceNode>> | undefined
    >(undefined),
    pins = useRef(new Set<string>()),
    frozen = useRef(false),
    dragging = useRef(new Set<string>()),
    saveRef = useRef(onGeometry);
  saveRef.current = onGeometry;
  const pinsChangedRef = useRef(onPinsChanged);
  pinsChangedRef.current = onPinsChanged;
  function refreshPins() {
    pinsChangedRef.current([...pins.current]);
    const g = graph.current;
    if (!g || renderedGraph.current !== g) return;
    g.updateNodeData(
      g.getNodeData().map((n) => ({
        id: n.id,
        style: { badge: pins.current.has(n.id) },
      })),
    );
    void g.draw().catch((e) => setError(String(e)));
  }
  useImperativeHandle(ref, () => ({
    setPinned(id, pinned) {
      const g = graph.current;
      if (!g || renderedGraph.current !== g) return;
      if (pinned) pins.current.add(id);
      else pins.current.delete(id);
      const node = simulation.current?.nodes().find((n) => n.id === id);
      if (node) {
        const data = g.getNodeData(id);
        node.fx = pinned ? Number(data.style?.x ?? node.x ?? 0) : null;
        node.fy = pinned ? Number(data.style?.y ?? node.y ?? 0) : null;
      }
      refreshPins();
      persist();
    },
  }));
  const tagSizes = useRef(new Map<string, number>());
  tagSizes.current = new Map(
    workspace.tags.map((t) => [t.id, appearanceFor(t, workspace).size]),
  );
  function persist() {
    const g = graph.current;
    if (!g) return;
    const positions: Geometry["positions"] = {};
    for (const n of g.getNodeData())
      positions[n.id] = {
        x: Number(n.style?.x ?? 0),
        y: Number(n.style?.y ?? 0),
        pinned: pins.current.has(n.id),
      };
    const [width, height] = g.getSize();
    const [x, y] = g.getCanvasByViewport([width / 2, height / 2]);
    saveRef.current({
      workspaceId: workspace.id,
      positions,
      viewport: { zoom: g.getZoom(), x, y, anchor: "center" },
    });
  }

  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Placing your collection…"),
    [retry, setRetry] = useState(0),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!container.current) return;
    let canceled = false,
      timer: ReturnType<typeof setInterval> | undefined,
      labelFrame: number | undefined;
    renderedGraph.current = null;
    setReady(false);
    setError("");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes: NodeData[] = [
      ...workspace.tags.map<NodeData>((tag, i) => {
        const a = appearanceFor(tag, workspace);
        return {
          id: tag.id,
          type: a.shape === "rounded-square" ? "rect" : a.shape,
          data: { label: tag.name, tag: true },
          style: {
            x: 140 + i * 170,
            y: 200,
            size: a.size,
            radius: 14,
            fill: a.color,
            stroke: a.color,
            labelFill: "#fff",
            labelPlacement: "center",
            labelFontWeight: 600,
          },
        };
      }),
      ...workspace.bubbles.map<NodeData>((bubble, i) => ({
        id: bubble.id,
        type: "circle",
        data: { label: bubble.title },
        style: {
          x: 90 + (i % 6) * 90,
          y: 120 + Math.floor(i / 6) * 200,
          size: 25,
          fill: "#fff",
          stroke: "#94a3b8",
          lineWidth: 2,
          labelFill: "#475569",
          labelPlacement: "bottom",
        },
      })),
    ];
    for (const node of nodes) {
      const pos = geometry?.positions[node.id];
      if (pos) node.style = { ...node.style, x: pos.x, y: pos.y };
    }
    if (geometry)
      for (const node of nodes) {
        if (geometry.positions[node.id]) continue;
        const m = workspace.memberships.find(
          (m) => m.bubbleId === node.id || m.tagId === node.id,
        );
        const neighbor = nodes.find(
          (n) => n.id === (node.data?.tag ? m?.bubbleId : m?.tagId),
        );
        if (neighbor?.style)
          node.style = {
            ...node.style,
            x: Number(neighbor.style.x) + 80,
            y: Number(neighbor.style.y) + 80,
          };
      }
    pins.current = new Set(
      Object.entries(geometry?.positions ?? {})
        .filter(([, p]) => p.pinned)
        .map(([id]) => id),
    );
    frozen.current = !!geometry;
    const sim = forceSimulation<ForceNode>();
    simulation.current = sim;
    // Public d3 simulation option supplies persisted pins without touching G6 internals.
    sim.force("saved-pins", () => {
      for (const node of sim.nodes()) {
        if (dragging.current.has(node.id)) continue;
        const datum = graph.current?.getNodeData(node.id);
        if (frozen.current || pins.current.has(node.id)) {
          node.fx = Number(datum?.style?.x ?? node.x ?? 0);
          node.fy = Number(datum?.style?.y ?? node.y ?? 0);
        } else {
          node.fx = null;
          node.fy = null;
        }
      }
    });
    const g = new Graph({
      container: container.current,
      width: container.current.clientWidth,
      height: container.current.clientHeight,
      padding: 55,
      animation: false,
      zoomRange: [0.15, 4],
      data: {
        nodes,
        edges: workspace.memberships.map((m) => ({
          id: m.id,
          source: m.bubbleId,
          target: m.tagId,
        })),
      },
      node: {
        style: {
          badge: (d) => pins.current.has(d.id),
          badges: [{
            text: "●", placement: "right-top", fill: "#dc2626",
            fontSize: 12, padding: 0, background: false,
            stroke: "#fff", lineWidth: 1,
          }],
          labelText: (d) => String(d.data?.label ?? ""),
          labelFontSize: () => 11 / (graph.current?.getZoom() ?? 1),
          labelBackground: (d) => Boolean(d.data?.tag),
          labelBackgroundFill: (d) => String(d.style?.fill ?? "#0f766e"),
          labelBackgroundOpacity: 1,
          labelBackgroundRadius: 3,
          labelPadding: (d) =>
            d.data?.tag
              ? [
                  2 / (graph.current?.getZoom() ?? 1),
                  4 / (graph.current?.getZoom() ?? 1),
                ]
              : 0,
        },
      },
      edge: { style: { stroke: "#a9bdba", lineWidth: 1.2, endArrow: false } },
      layout: {
        type: "d3-force",
        forceSimulation: sim,
        alpha: geometry || !nodes.length ? 0 : 1,
        center: false,
        animation: !reduced,
        link: { distance: 120, strength: 0.45 },
        manyBody: { strength: -250 },
        collide: {
          radius: (d) =>
            tagSizes.current.has(d.id)
              ? tagSizes.current.get(d.id)! / 2 + 20
              : 34,
        },
        alphaDecay: 0.035,
        velocityDecay: 0.45,
      },
      behaviors: [
        {
          type: "auto-adapt-label",
          key: "label-collisions",
          padding: 4,
          throttle: 32,
          sort: (a: NodeData, b: NodeData) => {
            const priority = (n: typeof a) =>
              n.id === selectedRef.current ? 2 : n.data?.tag ? 1 : 0;
            const diff = priority(b) - priority(a);
            return diff > 0
              ? 1
              : diff < 0
                ? -1
                : a.id < b.id
                  ? -1
                  : a.id > b.id
                    ? 1
                    : 0;
          },
        },
        {
          type: reduced ? "drag-element" : "drag-element-force",
          key: "node-drag",
          fixed: false,
          trigger: [],
        },
        {
          type: "scroll-canvas",
          key: "pan",
          sensitivity: 1,
          enable: (e: WheelEvent) => !e.ctrlKey,
        },
      ],
    });
    graph.current = g;
    const surface = container.current;
    const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
      const rect = surface.getBoundingClientRect();
      const origin: [number, number] =
        clientX === undefined || clientY === undefined
          ? [rect.width / 2, rect.height / 2]
          : [clientX - rect.left, clientY - rect.top];
      void g
        .zoomTo(Math.max(0.15, Math.min(4, scale)), false, origin)
        .catch((e) => {
          if (!canceled) setError(String(e));
        });
    };
    // Chromium reports trackpad pinch as Ctrl-wheel, independent of ordinary scrolling.
    const pinchWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? surface.clientHeight
            : 1);
      zoomAt(
        g.getZoom() * Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.01),
        event.clientX,
        event.clientY,
      );
    };
    // Safari exposes native trackpad gestures separately from wheel events.
    let gestureZoom: number | undefined;
    const gestureStart = (event: Event) => {
      event.preventDefault();
      gestureZoom = g.getZoom();
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & {
        scale: number;
        clientX?: number;
        clientY?: number;
      };
      if (gestureZoom !== undefined && Number.isFinite(gesture.scale))
        zoomAt(gestureZoom * gesture.scale, gesture.clientX, gesture.clientY);
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      gestureZoom = undefined;
    };
    surface.addEventListener("wheel", pinchWheel, {
      passive: false,
      capture: true,
    });
    surface.addEventListener("gesturestart", gestureStart, { passive: false });
    surface.addEventListener("gesturechange", gestureChange, {
      passive: false,
    });
    surface.addEventListener("gestureend", gestureEnd, { passive: false });
    g.on(GraphEvent.AFTER_TRANSFORM, () => {
      if (!canceled) {
        setZoom(g.getZoom());
        if (labelFrame !== undefined) cancelAnimationFrame(labelFrame);
        labelFrame = requestAnimationFrame(() => {
          labelFrame = undefined;
          if (canceled || renderedGraph.current !== g) return;
          g.updateNodeData(
            g.getNodeData().map((n) => ({
              id: n.id,
              style: { labelFontSize: 11 / g.getZoom() },
            })),
          );
          g.updateBehavior({
            key: "label-collisions",
            padding: 4 / g.getZoom(),
          });
          void g.draw().catch((e) => {
            if (!canceled) setError(String(e));
          });
        });
      }
    });
    g.on(NodeEvent.DRAG_START, (event: IElementEvent) => {
      dragging.current.add(event.target.id);
    });
    g.on(NodeEvent.DRAG_END, (event: IElementEvent) => {
      dragging.current.delete(event.target.id);
      persist();
    });
    g.on(NodeEvent.CLICK, (event: IElementEvent) =>
      onSelectRef.current(event.target.id),
    );
    let saved = "",
      changes = 0,
      last = 0,
      previous = "",
      layouts = 0;
    g.on(GraphEvent.BEFORE_LAYOUT, () => {
      layouts++;
    });
    const observer = new ResizeObserver(() => {
      if (!canceled && container.current)
        g.setSize(
          container.current.clientWidth,
          container.current.clientHeight,
        );
    });
    observer.observe(container.current);
    void g
      .render()
      .then(async () => {
        if (canceled) return;
        if (geometry?.viewport?.anchor === "center") {
          await g.zoomTo(geometry.viewport.zoom, false);
          const [width, height] = g.getSize();
          const [x, y] = g.getViewportByCanvas([
            geometry.viewport.x,
            geometry.viewport.y,
          ]);
          await g.translateBy([width / 2 - x, height / 2 - y], false);
        } else await g.fitView({}, false);
        frozen.current = false;
        if (canceled) return;
        renderedGraph.current = g;
        setReady(true);
        refreshPins();
        timer = setInterval(() => {
          if (canceled) return;
          const next = JSON.stringify(
            g.getNodeData().map((n) => [n.id, n.style?.x, n.style?.y]),
          );
          if (next !== previous) {
            previous = next;
            last = performance.now();
            changes++;
          }
          const stamp = JSON.stringify([
            next,
            g.getPosition(),
            g.getZoom(),
            [...pins.current],
          ]);
          if (performance.now() - last >= 400 && stamp !== saved) {
            persist();
            saved = stamp;
          }
          setStatus(
            `${performance.now() - last < 400 ? "Layout moving" : "Layout settled"} · ${layouts} layout run${layouts === 1 ? "" : "s"} · ${changes} position samples · ${pins.current.size} pinned`,
          );
        }, 200);
      })
      .catch((e) => {
        if (!canceled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      canceled = true;
      if (timer) clearInterval(timer);
      if (labelFrame !== undefined) cancelAnimationFrame(labelFrame);
      observer.disconnect();
      surface.removeEventListener("wheel", pinchWheel, true);
      surface.removeEventListener("gesturestart", gestureStart);
      surface.removeEventListener("gesturechange", gestureChange);
      surface.removeEventListener("gestureend", gestureEnd);
      renderedGraph.current = null;
      graph.current = null;
      sim.stop();
      g.destroy();
    };
  }, [workspace.id, retry]);
  useEffect(() => {
    const g = graph.current;
    if (!ready || !g || renderedGraph.current !== g) return;
    const currentNodes = g.getNodeData(),
      currentEdges = g.getEdgeData(),
      ids = new Set([...workspace.bubbles, ...workspace.tags].map((n) => n.id)),
      edgeIds = new Set(workspace.memberships.map((m) => m.id));
    const removedNodes = currentNodes
        .filter((n) => !ids.has(n.id))
        .map((n) => n.id),
      removedEdges = currentEdges
        .filter((e) => !edgeIds.has(e.id!))
        .map((e) => e.id!);
    const added = [...workspace.tags, ...workspace.bubbles].filter(
      (n) => !currentNodes.some((c) => c.id === n.id),
    );
    const addedEdges = workspace.memberships.filter(
      (m) => !currentEdges.some((e) => e.id === m.id),
    );
    if (removedNodes.length || removedEdges.length)
      g.removeData({ nodes: removedNodes, edges: removedEdges });
    if (added.length)
      g.addData({
        nodes: added.map((n, i) => {
          const tag = "name" in n;
          const a = tag ? appearanceFor(n, workspace) : undefined;
          const link = workspace.memberships.find(
            (m) => m.bubbleId === n.id || m.tagId === n.id,
          );
          const neighbor = currentNodes.find(
            (c) => c.id === (tag ? link?.bubbleId : link?.tagId),
          );
          return {
            id: n.id,
            type:
              a?.shape === "rounded-square" ? "rect" : (a?.shape ?? "circle"),
            data: { label: tag ? n.name : n.title, tag },
            style: {
              x: Number(neighbor?.style?.x ?? 120) + 80 + (i % 5) * 50,
              y:
                Number(neighbor?.style?.y ?? 120) + 80 + Math.floor(i / 5) * 70,
              size: a?.size ?? 25,
              fill: a?.color ?? "#fff",
              stroke: a?.color ?? "#94a3b8",
              radius: 14,
              lineWidth: 2,
              labelFill: tag ? "#fff" : "#475569",
              labelPlacement: tag ? "center" : "bottom",
            },
          };
        }),
      });
    if (addedEdges.length)
      g.addData({
        edges: addedEdges.map((m) => ({
          id: m.id,
          source: m.bubbleId,
          target: m.tagId,
        })),
      });
    g.updateNodeData(
      g
        .getNodeData()
        .map((n) => ({ id: n.id, style: { labelFontSize: 11 / g.getZoom() } })),
    );
    g.updateNodeData([
      ...workspace.tags.map((t) => ({
        id: t.id,
        data: { label: t.name, tag: true },
      })),
      ...workspace.bubbles.map((b) => ({ id: b.id, data: { label: b.title } })),
    ]);
    if (
      added.length ||
      removedNodes.length ||
      addedEdges.length ||
      removedEdges.length
    ) {
      frozen.current = true;
      const sim = simulation.current;
      sim?.alpha(0).restart();
      void g
        .layout({
          ...(!Array.isArray(g.getLayout()) ? g.getLayout() : undefined),
          type: "d3-force",
          forceSimulation: sim,
          alpha: 0,
        })
        .then(() => {
          frozen.current = false;
          persist();
        })
        .catch((e) => setError(String(e)));
    }
    const term = query.toLowerCase();
    const matching = new Set(
      workspace.bubbles
        .filter((b) =>
          `${b.title} ${b.description} ${b.url ?? ""}`
            .toLowerCase()
            .includes(term),
        )
        .map((b) => b.id),
    );
    const visibility: Record<string, "visible" | "hidden"> = {};
    for (const b of workspace.bubbles)
      visibility[b.id] = matching.has(b.id) ? "visible" : "hidden";
    const linkedTags = new Set(
      workspace.memberships
        .filter((m) => matching.has(m.bubbleId))
        .map((m) => m.tagId),
    );
    for (const tag of workspace.tags)
      visibility[tag.id] = !term || linkedTags.has(tag.id) ? "visible" : "hidden";
    for (const m of workspace.memberships)
      visibility[m.id] = matching.has(m.bubbleId) ? "visible" : "hidden";
    g.updateNodeData(
      workspace.tags.map((tag) => ({
        id: tag.id,
        style: {
          stroke:
            tag.id === selected
              ? "#183e35"
              : appearanceFor(tag, workspace).color,
          lineWidth: tag.id === selected ? 4 : 1,
          halo: tag.id === selected,
          haloStroke: "#0f766e",
          haloLineWidth: 12,
          haloStrokeOpacity: 0.25,
        },
      })),
    );
    g.setEdge({
      style: {
        stroke: (edge) =>
          edge.source === selected || edge.target === selected
            ? "#0f766e"
            : "#a9bdba",
        lineWidth: (edge) =>
          edge.source === selected || edge.target === selected ? 2.5 : 1.2,
        endArrow: false,
      },
    });
    g.updateNodeData(
      workspace.bubbles.map((b) => ({
        id: b.id,
        style: {
          stroke: b.id === selected ? "#0f766e" : "#94a3b8",
          lineWidth: b.id === selected ? 4 : 2,
        },
      })),
    );
    void g
      .setElementVisibility(visibility, false)
      .then(() => {
        if (graph.current === g) return g.draw();
      })
      .catch((e) => {
        if (graph.current === g) setError(String(e));
      });
  }, [ready, selected, query, workspace]);
  async function action(work: (g: Graph) => Promise<unknown>) {
    if (!graph.current || !ready) return;
    try {
      await work(graph.current);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="canvas-shell">
      <div className="canvas-top">
        <span className="eyebrow">G6 5.1.1 · UNDIRECTED MEMBERSHIPS</span>
        <span className="subtle">
          Two fingers to pan · Pinch to zoom · Drag a node to pull its neighbors
        </span>
      </div>
      <div
        ref={container}
        className="graph-canvas"
        role="img"
        aria-label="Force-directed bubble and tag graph"
      />
      {!workspace.bubbles.length && !workspace.tags.length && (
        <div className="canvas-empty">
          <h2>Your collection is empty</h2>
          <p>Open Import to add links, notes, or a file.</p>
        </div>
      )}
      {error && (
        <div className="canvas-error" role="alert">
          <strong>The graph couldn’t load</strong>
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry graph</button>
          <p>Your collection is available in the list.</p>
        </div>
      )}
      <div className="canvas-bottom">
        <span className="subtle" role="status">
          {status} · {Math.round(zoom * 100)}%
        </span>
        <div className="flex gap-2">
          <button
            disabled={!ready}
            onClick={() => {
              simulation.current?.alpha(1).restart();
            }}
          >
            Re-layout
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              if (window.confirm("Reset positions and clear all pins?")) {
                pins.current.clear();
                refreshPins();
                for (const [i, n] of (
                  simulation.current?.nodes() ?? []
                ).entries()) {
                  n.x = 90 + (i % 6) * 90;
                  n.y = 120 + Math.floor(i / 6) * 100;
                  n.vx = 0;
                  n.vy = 0;
                  n.fx = null;
                  n.fy = null;
                }
                simulation.current?.alpha(1).restart();
                persist();
              }
            }}
          >
            Reset positions
          </button>
          <button
            disabled={!ready}
            onClick={() => void action(async (g) => {
              const rect = container.current!.getBoundingClientRect();
              const inspector = container.current!
                .closest(".workspace-grid")
                ?.querySelector<HTMLElement>(".inspector");
              const panel = inspector?.getBoundingClientRect();
              const covered = panel && panel.width > 0
                ? Math.max(0, rect.right - panel.left) : 0;
              g.setOptions({
                padding: [65, Math.min(rect.width - 85, covered + 40), 40, 40],
              });
              await g.fitView({}, false);
            })}
          >
            Fit graph
          </button>
          <button
            aria-label="Zoom out"
            disabled={!ready}
            onClick={() => void action((g) => g.zoomBy(0.8, false))}
          >
            −
          </button>
          <button
            aria-label="Zoom in"
            disabled={!ready}
            onClick={() => void action((g) => g.zoomBy(1.25, false))}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
