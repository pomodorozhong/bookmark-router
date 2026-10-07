import { useEffect, useMemo, useRef, useState } from "react";
import {
  Focus,
  GitBranch,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import Graphology from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import type { NodeLabelDrawingFunction } from "sigma/rendering";
import {
  deriveGraph,
  captureLayoutPositions,
  graphVisibility,
  settle,
  forceSettingsFor,
  separateOverlaps,
  collisionRadius,
  CENTER_ID,
  syncHubAnchors,
  linkedNodeIds,
  placeMostLinkedHubsOnPerimeter,
  type GraphLayoutSettings,
  type Position,
} from "../data/graph";
import type { ZoomDetails, ZoomDetailKey } from "../data/zoom-details";
import { fitLabelledPoints } from "../data/viewport";
import { domain } from "../data/selectors";
import { progressLabels, type ProgressFilter } from "../data/progress";
import type { Dataset } from "../data/types";
export type View = {
  x: number;
  y: number;
  scale: number;
  engine?: "sigma";
  bounds?: { x: [number, number]; y: [number, number] };
};
type Props = {
  bubbleProgress: ProgressFilter;
  bubbleQueueProgress: ProgressFilter;
  hubProgress: ProgressFilter;
  hiddenHubs: string[];
  revealedHubs: string[];
  highlightedHubs: string[];
  zoomDetails: ZoomDetails;
  data: Dataset;
  lens: "proposed" | "approved";
  filterRevision: number;
  visible: Set<string>;
  selected: string[];
  focus: string | null;
  mode: "select" | "pan";
  allEdges: boolean;
  onToggleAllEdges: () => void;
  layoutSettings: GraphLayoutSettings;
  hubPerimeterSeeded: boolean;
  positions: Record<string, Position>;
  view: View | null;
  onPositions: (
    p: Record<string, Position>,
    hubPerimeterSeeded?: boolean,
  ) => void;
  onView: (v: View) => void;
  onSelect: (id: string, multi?: boolean) => void;
  onEdge: (label: string) => void;
};
const colors = {
  bookmark: "#ffffff",
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
function graphBounds(graph: Graphology): {
  x: [number, number];
  y: [number, number];
} {
  const points = graph
    .filterNodes((id) => id !== CENTER_ID)
    .map((id) => graph.getNodeAttributes(id));
  return {
    x: [
      (points.length ? Math.min(...points.map((a) => a.x)) : 0) - 80,
      (points.length ? Math.max(...points.map((a) => a.x)) : 0) + 80,
    ],
    y: [
      (points.length ? Math.min(...points.map((a) => a.y)) : 0) - 80,
      (points.length ? Math.max(...points.map((a) => a.y)) : 0) + 80,
    ],
  };
}
const fade = (scale: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (scale - start) / (end - start)));
  return t * t * (3 - 2 * t);
};
type Runtime = {
  graph: Graphology;
  renderer: Sigma;
  worker: FA2Layout | null;
  timer: ReturnType<typeof setTimeout> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  drag: {
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    resume: boolean;
  } | null;
  fixed: Map<string, { x: number; y: number }>;
  suppressClick: boolean;
  stop: () => void;
  run: () => void;
  save: () => void;
};
export function Graph(p: Props) {
  const container = useRef<HTMLDivElement>(null);
  const props = useRef(p);
  props.current = p;
  const runtime = useRef<Runtime | null>(null);
  const [scale, setScale] = useState(1);
  const [overview, setOverview] = useState<
    { id: string; x: number; y: number; hub: boolean }[]
  >([]);
  const previousTopicLinks = useRef<Map<string, string> | null>(null);
  const previousLayoutSettings = useRef(p.layoutSettings);
  const previousFilterRevision = useRef(0);
  const derived = useMemo(() => deriveGraph(p.data, p.lens), [p.data, p.lens]);

  useEffect(() => {
    if (!container.current) return;
    const graph = new Graphology();
    const r = {} as Runtime;
    const drawLabel: NodeLabelDrawingFunction = (ctx, data) => {
      const a = graph.getNodeAttributes(data.key);
      const hub = a.kind !== "bookmark";
      const zoom = 1 / r.renderer.getCamera().ratio;
      const selected =
        props.current.selected.includes(data.key) ||
        props.current.highlightedHubs.includes(data.key);
      const detail = (key: ZoomDetailKey) => {
        const { start, end } = props.current.zoomDetails[key];
        return fade(zoom, start, end);
      };
      ctx.save();
      ctx.globalAlpha = a.dimmed ? 0.38 : 1;
      ctx.strokeStyle = selected
        ? "#174f43"
        : a.progress === "dropped"
          ? "#b76868"
          : a.complete
            ? "#278367"
            : strokes[a.kind as keyof typeof strokes];
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(data.x, data.y, data.size, 0, Math.PI * 2);
      ctx.stroke();
      if (selected) {
        ctx.beginPath();
        ctx.arc(data.x, data.y, data.size + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = (
        value: string,
        y: number,
        font: string,
        color: string,
        alpha = 1,
      ) => {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.font = font;
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#f7f9fa";
        ctx.lineWidth = 4;
        ctx.strokeText(value, data.x, y);
        ctx.fillStyle = color;
        ctx.fillText(value, data.x, y);
        ctx.restore();
      };
      if (hub) {
        text(
          a.kind.toUpperCase(),
          data.y - 6,
          "600 9px sans-serif",
          "#526779",
          detail("hubType"),
        );
        text(String(a.count), data.y + 7, "600 12px sans-serif", "#314557");
        if (a.complete || a.progress === "dropped")
          text(
            a.symbol,
            data.y - data.size + 2,
            "600 12px sans-serif",
            a.complete ? "#278367" : "#b76868",
          );
      } else {
        text(
          a.symbol,
          data.y,
          "12px sans-serif",
          a.complete
            ? "#278367"
            : a.progress === "dropped"
              ? "#b76868"
              : "#788690",
          detail("bookmarkSymbol"),
        );
      }
      if (a.pinned) {
        ctx.fillStyle = "#174f43";
        ctx.beginPath();
        ctx.arc(
          data.x + data.size * 0.7,
          data.y - data.size * 0.7,
          3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      // Titles keep the same shape throughout zoom. No greedy collision pass
      // can make hub titles disappear or reshuffle bookmark labels mid-gesture.
      const lines = hub
        ? wrapLabel(a.label)
        : [a.label.length > 38 ? a.label.slice(0, 37) + "…" : a.label];
      const titleAlpha = detail(hub ? "hubTitle" : "bookmarkTitle");
      lines.forEach((line, i) =>
        text(
          line,
          data.y + data.size + 17 + i * 16,
          `${hub || selected ? "600" : "400"} 12px sans-serif`,
          "#344b56",
          titleAlpha,
        ),
      );
      text(
        a.subtitle,
        data.y + data.size + 17 + lines.length * 16,
        "10px sans-serif",
        "#75818b",
        hub ? detail("hubSubtitle") : detail("bookmarkSubtitle"),
      );
      ctx.restore();
    };
    const renderer = new Sigma(graph, container.current, {
      defaultDrawNodeLabel: drawLabel,
      defaultDrawNodeHover: () => {},
      hideLabelsOnMove: false,
      hideEdgesOnMove: false,
      labelRenderedSizeThreshold: 0,
      enableEdgeEvents: true,
      enableCameraRotation: false,
      minCameraRatio: 1 / props.current.zoomDetails.maxZoom,
      maxCameraRatio: 1 / 0.08,
      zoomDuration: 180,
      zoomToSizeRatioFunction: (ratio) => Math.sqrt(ratio),
      zIndex: true,
      edgeReducer: (_id, a) => ({ ...a, color: "#00000000" }),
      nodeReducer: (_id, a) => ({
        ...a,
        color: a.dimmed ? "#e9edf0" : a.color,
        size: a.kind === "bookmark" ? 6 : 16,
      }),
    });
    const edgeCanvas = renderer.createCanvas("edge-patterns", {
      beforeLayer: "nodes",
      style: { pointerEvents: "none" },
    });
    const edgeContext = edgeCanvas.getContext("2d")!;
    Object.assign(r, {
      graph,
      renderer,
      worker: null,
      timer: null,
      saveTimer: null,
      drag: null,
      fixed: new Map(),
      suppressClick: false,
    });
    r.save = () => {
      const positions = captureLayoutPositions(graph, props.current.positions);
      props.current.onPositions(positions);
      setOverview(
        graph
          .mapNodes((id, a) => ({
            id,
            x: a.x,
            y: a.y,
            hub: a.kind !== "bookmark",
          }))
          .filter((n) => n.id !== CENTER_ID),
      );
    };
    r.stop = () => {
      if (r.timer) clearTimeout(r.timer);
      r.timer = null;
      r.worker?.kill();
      r.worker = null;
    };
    graph.on("eachNodeAttributesUpdated", () => {
      if (r.worker?.isRunning()) {
        const settings = props.current.layoutSettings;
        separateOverlaps(graph, settings.overlapPasses, settings.overlapGap);
      }
    });
    r.run = () => {
      r.stop();
      r.fixed.clear();
      graph.forEachNode((id, a) => {
        const fixed =
          id === CENTER_ID ||
          !!a.pinned ||
          props.current.selected.includes(id) ||
          r.drag?.id === id;
        if (id !== CENTER_ID)
          graph.setNodeAttribute(id, "size", collisionRadius(a.kind, a.radius));
        graph.setNodeAttribute(id, "fixed", fixed);
        if (fixed) r.fixed.set(id, { x: a.x, y: a.y });
      });
      if (!graph.order) return;
      const settings = props.current.layoutSettings;
      separateOverlaps(graph, settings.overlapPasses, settings.overlapGap);
      r.worker = new FA2Layout(graph, {
        settings: forceSettingsFor(settings),
        getEdgeWeight: settings.edgeWeightsEnabled ? "weight" : null,
        // The worker's returned positions must never overwrite a newer drag
        // position. The supervisor also feeds these coordinates back to it.
        outputReducer: (id, a) => ({ ...a, ...r.fixed.get(id) }),
      });
      r.worker.start();
      if (!r.drag)
        r.timer = setTimeout(() => {
          r.stop();
          r.save();
        }, settings.settleDurationMs);
    };
    const release = () => {
      if (!r.drag) return;
      const moved = r.drag.moved;
      const resume = r.drag.resume;
      r.drag = null;
      renderer.getCamera().enable();
      container.current?.classList.remove("is-dragging");
      if (moved) {
        r.save();
        r.run();
      } else {
        r.stop();
        if (resume) r.run();
      }
    };
    renderer.on("downNode", ({ node, event }) => {
      if (
        props.current.mode === "pan" ||
        ("button" in event.original && event.original.button !== 0)
      )
        return;
      event.preventSigmaDefault();
      event.original.preventDefault();
      const resume = !!r.worker?.isRunning();
      r.stop();
      r.suppressClick = false;
      renderer.getCamera().disable();
      r.drag = {
        id: node,
        startX: event.x,
        startY: event.y,
        moved: false,
        resume,
      };
      container.current?.classList.add("is-dragging");
    });
    const move = (x: number, y: number) => {
      if (!r.drag) return;
      if (
        !r.drag.moved &&
        Math.hypot(x - r.drag.startX, y - r.drag.startY) <= 4
      )
        return;
      const start = !r.drag.moved;
      r.drag.moved = true;
      r.suppressClick = true;
      const position = renderer.viewportToGraph({ x, y });
      graph.mergeNodeAttributes(r.drag.id, position);
      r.fixed.set(r.drag.id, position);
      if (start) r.run();
    };
    renderer.getMouseCaptor().on("mousemovebody", (event) => {
      if (!r.drag) return;
      event.preventSigmaDefault();
      event.original.preventDefault();
      move(event.x, event.y);
    });
    const onTouchMove = (event: TouchEvent) => {
      if (!r.drag || !event.touches[0] || !container.current) return;
      event.preventDefault();
      const rect = container.current.getBoundingClientRect();
      move(
        event.touches[0].clientX - rect.left,
        event.touches[0].clientY - rect.top,
      );
    };
    renderer.on("clickNode", ({ node, event }) => {
      if (r.suppressClick || r.drag?.moved) return;
      props.current.onSelect(
        node,
        "shiftKey" in event.original && event.original.shiftKey,
      );
    });
    renderer.on("clickEdge", ({ edge }) =>
      props.current.onEdge(graph.getEdgeAttribute(edge, "label")),
    );
    // Finish after Sigma dispatches its click, so a drag cannot become a click.
    const onUp = () => queueMicrotask(release);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", release);
    window.addEventListener("blur", release);
    renderer.getCamera().on("updated", (camera) => {
      if (r.saveTimer) clearTimeout(r.saveTimer);
      r.saveTimer = setTimeout(() => {
        setScale(1 / camera.ratio);
        props.current.onView({
          x: camera.x,
          y: camera.y,
          scale: 1 / camera.ratio,
          engine: "sigma",
          bounds: r.renderer.getCustomBBox() ?? undefined,
        });
      }, 160);
    });
    renderer.on("afterRender", () => {
      const dimensions = renderer.getDimensions();
      const pixelRatio = window.devicePixelRatio || 1;
      if (
        edgeCanvas.width !== Math.round(dimensions.width * pixelRatio) ||
        edgeCanvas.height !== Math.round(dimensions.height * pixelRatio)
      ) {
        edgeCanvas.width = Math.round(dimensions.width * pixelRatio);
        edgeCanvas.height = Math.round(dimensions.height * pixelRatio);
      }
      edgeCanvas.style.width = `${dimensions.width}px`;
      edgeCanvas.style.height = `${dimensions.height}px`;
      edgeContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      edgeContext.clearRect(0, 0, dimensions.width, dimensions.height);
      graph.forEachEdge((_id, a, source, target) => {
        if (a.hidden) return;
        const from = renderer.graphToViewport(
          graph.getNodeAttributes(source) as { x: number; y: number },
        );
        const to = renderer.graphToViewport(
          graph.getNodeAttributes(target) as { x: number; y: number },
        );
        edgeContext.strokeStyle = a.color;
        edgeContext.lineWidth = a.size;
        edgeContext.lineCap = "round";
        edgeContext.setLineDash(
          a.kind === "topic" ? [1, 4] : a.kind === "suggestion" ? [5, 5] : [],
        );
        edgeContext.beginPath();
        edgeContext.moveTo(from.x, from.y);
        edgeContext.lineTo(to.x, to.y);
        edgeContext.stroke();
        if (
          a.kind === "selected" &&
          (props.current.selected.includes(source) ||
            props.current.selected.includes(target))
        ) {
          edgeContext.font = "10px sans-serif";
          edgeContext.fillStyle = "#40596b";
          edgeContext.fillText(
            a.label,
            (from.x + to.x) / 2,
            (from.y + to.y) / 2 - 8,
          );
        }
      });
      const nodeButtons =
        container.current?.parentElement?.querySelectorAll<HTMLButtonElement>(
          "[data-node-id]",
        );
      nodeButtons?.forEach((button) => {
        const id = button.dataset.nodeId!;
        if (!graph.hasNode(id)) return;
        const a = graph.getNodeAttributes(id);
        const screen = renderer.graphToViewport(a as { x: number; y: number });
        button.dataset.screenX = String(screen.x);
        button.dataset.screenY = String(screen.y);
        button.dataset.worldX = String(a.x);
        button.dataset.worldY = String(a.y);
      });
    });
    runtime.current = r;
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", release);
      window.removeEventListener("blur", release);
      r.stop();
      if (r.saveTimer) clearTimeout(r.saveTimer);
      renderer.kill();
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const layoutSettingsChanged =
      previousLayoutSettings.current !== p.layoutSettings;
    previousLayoutSettings.current = p.layoutSettings;
    const topicLinks = new Map<string, string>();
    for (const edge of derived.edges.filter((e) => e.kind === "topic")) {
      topicLinks.set(
        edge.source,
        (topicLinks.get(edge.source) ?? "") + edge.target + "|",
      );
    }
    const changedTopics = [...topicLinks]
      .filter(
        ([id, links]) =>
          previousTopicLinks.current?.has(id) &&
          previousTopicLinks.current.get(id) !== links,
      )
      .map(([id]) => id);
    previousTopicLinks.current = topicLinks;
    const {
      nodes: shown,
      edges,
      relevant,
    } = graphVisibility(
      derived,
      p.visible,
      p.selected,
      p.hiddenHubs,
      p.revealedHubs,
      p.bubbleProgress,
      p.hubProgress,
      p.bubbleQueueProgress,
    );
    const ids = new Set(shown.map((n) => n.id));
    const emphasized = [...p.selected, ...p.highlightedHubs];
    const neighbors = new Set(emphasized);
    edges
      .filter(
        (e) => emphasized.includes(e.source) || emphasized.includes(e.target),
      )
      .forEach((e) => {
        neighbors.add(e.source);
        neighbors.add(e.target);
      });
    const topologyChanged =
      shown.length !== r.graph.filterNodes((id) => id !== CENTER_ID).length ||
      edges.length !== r.graph.filterEdges((_id, a) => !a.anchor).length ||
      shown.some((n) => !r.graph.hasNode(n.id)) ||
      edges.some((e) => !r.graph.hasEdge(e.id));
    const pinsChanged = shown.some(
      (n) =>
        r.graph.hasNode(n.id) &&
        !!p.positions[n.id]?.pinned !==
          !!r.graph.getNodeAttribute(n.id, "pinned"),
    );
    const selectionPinsChanged = shown.some(
      (n) =>
        r.graph.hasNode(n.id) &&
        (!!p.positions[n.id]?.pinned || p.selected.includes(n.id)) !==
          !!r.graph.getNodeAttribute(n.id, "fixed"),
    );
    const resume =
      ((pinsChanged || selectionPinsChanged) && !!r.worker?.isRunning()) ||
      changedTopics.some((id) => ids.has(id));
    const shouldRun =
      resume || (topologyChanged && shown.length > 0) || layoutSettingsChanged;
    const workerWasRunning = !!r.worker?.isRunning();
    const savedPositions =
      workerWasRunning && shouldRun
        ? captureLayoutPositions(
            r.graph,
            p.positions,
            r.graph.filterNodes(
              (id) =>
                !layoutSettingsChanged ||
                !!p.positions[id]?.pinned ||
                p.selected.includes(id),
            ),
          )
        : p.positions;
    if (
      topologyChanged ||
      pinsChanged ||
      selectionPinsChanged ||
      layoutSettingsChanged
    )
      r.stop();
    let positions = layoutSettingsChanged
      ? settle(
          derived.nodes,
          derived.edges,
          savedPositions,
          true,
          p.layoutSettings,
          p.selected,
        )
      : derived.nodes.some((n) => !savedPositions[n.id])
        ? settle(
            derived.nodes,
            derived.edges,
            savedPositions,
            false,
            p.layoutSettings,
          )
        : savedPositions;
    const seedHubPerimeter = !p.hubPerimeterSeeded || layoutSettingsChanged;
    if (seedHubPerimeter)
      positions = placeMostLinkedHubsOnPerimeter(
        derived.nodes,
        derived.edges,
        positions,
        p.layoutSettings.overlapGap,
        p.selected,
      );
    r.graph
      .nodes()
      .filter((id) => id !== CENTER_ID && !ids.has(id))
      .forEach((id) => r.graph.dropNode(id));
    r.graph
      .edges()
      .filter(
        (id) =>
          !r.graph.getEdgeAttribute(id, "anchor") &&
          !edges.some((e) => e.id === id),
      )
      .forEach((id) => r.graph.dropEdge(id));
    const bookmarks = new Map(
      p.data.bookmarks.map((b) => [`bookmark:${b.id}`, b]),
    );
    shown.forEach((n) => {
      const position = positions[n.id];
      const b = bookmarks.get(n.id);
      const attributes = {
        ...n,
        x: position.x,
        y: -position.y,
        size: collisionRadius(n.kind, n.radius),
        color: colors[n.kind],
        pinned: !!position.pinned,
        fixed:
          !!position.pinned || p.selected.includes(n.id) || r.drag?.id === n.id,
        forceLabel: true,
        zIndex: p.selected.includes(n.id) ? 2 : n.kind === "bookmark" ? 0 : 1,
        dimmed: emphasized.length > 0 && !neighbors.has(n.id),
        complete: n.progress === "done",
        symbol:
          n.progress === "done"
            ? "✓"
            : n.progress === "dropped"
              ? "×"
              : b?.favorite
                ? "★"
                : "·",
        count:
          n.kind === "bookmark"
            ? n.count
            : new Set(
                relevant.filter((e) => e.target === n.id).map((e) => e.source),
              ).size,
        subtitle: b
          ? `${domain(b.url)} · ${progressLabels[n.progress]}`
          : `${n.subtitle} · ${progressLabels[n.progress]}`,
      };
      // Selection/filter rendering updates must not reset live physics positions.
      if (r.graph.hasNode(n.id)) {
        if (r.worker?.isRunning()) {
          attributes.size = r.graph.getNodeAttribute(n.id, "size");
          attributes.x = r.graph.getNodeAttribute(n.id, "x");
          attributes.y = r.graph.getNodeAttribute(n.id, "y");
        }
        r.graph.mergeNodeAttributes(n.id, attributes);
      } else r.graph.addNode(n.id, attributes);
    });
    edges.forEach((e) => {
      const active =
        emphasized.includes(e.source) || emphasized.includes(e.target);
      const a = {
        ...e,
        color:
          emphasized.length && !active
            ? "#a5b3bd"
            : e.kind === "selected"
              ? "#455e71"
              : e.kind === "topic"
                ? "#6f8d9b"
                : "#738697",
        size: e.kind === "selected" ? 2.5 : 1.8,
        hidden: !p.allEdges && p.selected.length > 0 && !active,
        weight: e.kind === "selected" ? 2 : 1,
      };
      if (r.graph.hasEdge(e.id)) r.graph.mergeEdgeAttributes(e.id, a);
      else r.graph.addEdgeWithKey(e.id, e.source, e.target, a);
    });
    syncHubAnchors(r.graph);
    if (!r.renderer.getCustomBBox()) {
      r.renderer.setCustomBBox(
        p.view?.engine === "sigma"
          ? (p.view.bounds ?? graphBounds(r.graph))
          : graphBounds(r.graph),
      );
      r.renderer.refresh();
      if (p.view?.engine === "sigma")
        r.renderer
          .getCamera()
          .setState({ x: p.view.x, y: p.view.y, ratio: 1 / p.view.scale });
      else r.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1 });
    }
    setOverview(
      r.graph
        .mapNodes((id, a) => ({
          id,
          x: a.x,
          y: a.y,
          hub: a.kind !== "bookmark",
        }))
        .filter((n) => n.id !== CENTER_ID),
    );
    if (positions !== p.positions || !p.hubPerimeterSeeded)
      p.onPositions(positions, !p.hubPerimeterSeeded);
    if (shouldRun) r.run();
  }, [
    derived,
    p.visible,
    p.bubbleProgress,
    p.bubbleQueueProgress,
    p.hubProgress,
    p.selected,
    p.allEdges,
    p.layoutSettings,
    p.hubPerimeterSeeded,
    p.positions,
    p.hiddenHubs,
    p.revealedHubs,
    p.highlightedHubs,
  ]);

  useEffect(() => {
    const renderer = runtime.current?.renderer;
    if (!renderer) return;
    renderer.setSetting("minCameraRatio", 1 / p.zoomDetails.maxZoom);
    const camera = renderer.getCamera();
    camera.setState({
      ratio: Math.max(camera.ratio, 1 / p.zoomDetails.maxZoom),
    });
    renderer.refresh();
  }, [p.zoomDetails]);

  const fit = () => {
    const r = runtime.current;
    if (!r) return;
    r.renderer.setSetting(
      "minCameraRatio",
      1 / props.current.zoomDetails.maxZoom,
    );
    r.renderer.setCustomBBox(graphBounds(r.graph));
    r.renderer.refresh();
    void r.renderer.getCamera().animatedReset({ duration: 220 });
  };
  const fitNodeIds = (nodeIds: string[]) => {
    const r = runtime.current;
    if (!r) return;
    const ids = nodeIds.filter((id) => r.graph.hasNode(id));
    if (!ids.length) return;
    const maxZoom = props.current.zoomDetails.maxZoom;
    r.renderer.setSetting("minCameraRatio", 1 / maxZoom);
    const ctx = document.createElement("canvas").getContext("2d")!;
    const points = ids.map((id) => {
      const a = r.graph.getNodeAttributes(id);
      const hub = a.kind !== "bookmark";
      const lines = hub
        ? wrapLabel(a.label)
        : [a.label.length > 38 ? a.label.slice(0, 37) + "…" : a.label];
      ctx.font = `${hub || props.current.selected.includes(id) ? "600" : "400"} 12px sans-serif`;
      const labelWidth = Math.max(
        ...lines.map((line) => ctx.measureText(line).width),
      );
      ctx.font = "10px sans-serif";
      return {
        ...r.renderer.graphToViewport(a as { x: number; y: number }),
        radius: r.renderer.scaleSize(hub ? 16 : 6),
        labelWidth,
        subtitleWidth: ctx.measureText(a.subtitle).width,
        lines: lines.length,
      };
    });
    const { width, height } = r.renderer.getDimensions();
    const camera = r.renderer.getCamera();
    const target = fitLabelledPoints(
      points,
      width,
      height,
      camera.ratio,
      1 / maxZoom,
      1 / 0.08,
    );
    const center = r.renderer.viewportToFramedGraph(target.center);
    void camera.animate({ ...center, ratio: target.ratio }, { duration: 220 });
  };
  const fitLinked = () => {
    const r = runtime.current;
    if (!r) return;
    fitNodeIds(linkedNodeIds(r.graph, props.current.selected));
  };
  const fitVisibleItems = () => {
    const r = runtime.current;
    if (!r) return;
    const ids = new Set<string>();
    for (const bookmarkId of props.current.visible) {
      const id = `bookmark:${bookmarkId}`;
      if (!r.graph.hasNode(id)) continue;
      ids.add(id);
      r.graph.forEachNeighbor(id, (neighbor) => {
        if (neighbor !== CENTER_ID) ids.add(neighbor);
      });
    }
    fitNodeIds([...ids]);
  };
  useEffect(() => {
    if (previousFilterRevision.current === p.filterRevision) return;
    previousFilterRevision.current = p.filterRevision;
    fitVisibleItems();
  }, [p.filterRevision]);
  const zoom = (factor: number) => {
    const r = runtime.current;
    if (!r) return;
    r.renderer.setSetting(
      "minCameraRatio",
      1 / props.current.zoomDetails.maxZoom,
    );
    const camera = r.renderer.getCamera();
    if (camera)
      void camera.animate({ ratio: camera.ratio / factor }, { duration: 180 });
  };
  const relayout = () => {
    const r = runtime.current;
    if (!r) return;
    const startingPositions = captureLayoutPositions(
      r.graph,
      props.current.positions,
    );
    r.stop();
    const positions = placeMostLinkedHubsOnPerimeter(
      derived.nodes,
      derived.edges,
      settle(
        derived.nodes,
        derived.edges,
        startingPositions,
        true,
        props.current.layoutSettings,
        props.current.selected,
      ),
      props.current.layoutSettings.overlapGap,
      props.current.selected,
    );
    r.graph
      .filterNodes((id) => id !== CENTER_ID)
      .forEach((id) =>
        r.graph.mergeNodeAttributes(id, {
          x: positions[id].x,
          y: -positions[id].y,
        }),
      );
    props.current.onPositions(positions);
    fit();
    r.run();
  };
  const minX = Math.min(0, ...overview.map((n) => n.x)) - 60;
  const minY = Math.min(0, ...overview.map((n) => n.y)) - 60;
  const w = Math.max(0, ...overview.map((n) => n.x)) - minX + 60;
  const h = Math.max(0, ...overview.map((n) => n.y)) - minY + 60;
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden graph-surface select-none">
      <div
        ref={container}
        className={`absolute inset-0 touch-none ${p.mode === "pan" ? "cursor-grab" : ""}`}
        role="img"
        aria-label="Force-directed bookmark graph"
      />
      <div
        className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-2 focus-within:top-2 focus-within:z-20 focus-within:flex focus-within:max-h-80 focus-within:flex-col focus-within:overflow-auto focus-within:rounded-lg focus-within:bg-white"
        aria-label="Graph nodes"
      >
        {overview.map((n) => (
          <button
            key={n.id}
            data-node-id={n.id}
            onClick={(e) => p.onSelect(n.id, e.shiftKey)}
          >
            {derived.nodes.find((node) => node.id === n.id)?.label}
          </button>
        ))}
      </div>
      {!overview.some((n) => !n.hub) && (
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
      <button
        className={`absolute right-5 top-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm ${!p.allEdges ? "!bg-slate-100" : ""}`}
        title={
          p.allEdges
            ? "Show only selected relationships"
            : "Show all connections"
        }
        aria-label="Toggle all connections"
        aria-pressed={p.allEdges}
        onClick={p.onToggleAllEdges}
      >
        <GitBranch size={16} />
        <span>{p.allEdges ? "All connections" : "Selection links"}</span>
      </button>
      <div className="absolute bottom-5 right-5 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
        >
          <Minus size={16} />
        </button>
        <span className="w-14 text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={16} />
        </button>
        <span className="mx-1 h-5 border-l border-slate-200" />
        <button title="Fit graph" aria-label="Fit graph" onClick={fit}>
          <Maximize size={16} />
        </button>
        {p.selected.length > 0 && (
          <button
            title="Fit linked nodes"
            aria-label="Fit linked nodes"
            onClick={fitLinked}
          >
            <Focus size={16} />
          </button>
        )}
        <button
          title="Re-layout unpinned nodes"
          aria-label="Re-layout unpinned nodes"
          onClick={relayout}
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
          viewBox={`${minX} ${minY} ${w} ${h}`}
          aria-hidden="true"
        >
          {overview.map((n) => (
            <circle
              key={n.id}
              cx={n.x}
              cy={-n.y + minY + h + minY}
              r={((n.hub ? 4 : 2) * w) / 110}
              fill="#708795"
            />
          ))}
        </svg>
      </button>
    </div>
  );
}
