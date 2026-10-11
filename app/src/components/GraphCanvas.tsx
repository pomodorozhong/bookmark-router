import { bubbleImageMinZoom, bubbleLabelMinZoom, tagLabelOutside } from "./graph-labels";
import { placeNear, type Point } from "./graph-placement";
import "./focus-adapt-label";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type ReactNode } from "react";
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
import { appearanceFor, type Bubble, type Geometry, type Workspace } from "../domain/model";
import { Icon, IconButton } from "./Icon";
export interface GraphCanvasHandle {
  setPinned(id: string, pinned: boolean): void;
  /** Zoom and center so these nodes, with room for titles, fill the view. */
  frame(ids: string[]): void;
  /** Zoom out until every visible node fits. */
  fitAll(): void;
  positionOf(id: string): readonly [number, number] | undefined;
}
// Titles show for related or box-selected bookmarks only while there are few enough to read.
const emphasisLabelLimit = 30;
// About a bubble at maximum zoom on a 2x display.
const thumbnailSize = 256;
function roundThumbnail(img: HTMLImageElement, key: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = thumbnailSize;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(thumbnailSize / 2, thumbnailSize / 2, thumbnailSize / 2, 0, Math.PI * 2);
  context.clip();
  // Cover: fill the circle, cropping the longer side around the center.
  const scale = thumbnailSize / Math.min(img.naturalWidth || 1, img.naturalHeight || 1);
  const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
  context.drawImage(img, (thumbnailSize - width) / 2, (thumbnailSize - height) / 2, width, height);
  return Object.assign(canvas, { src: `thumbnail:${key}`, complete: true });
}

export function GraphCanvas({
  ref,
  onPinsChanged,
  workspace,
  selected,
  onSelect,
  query,
  matchingBubbleIds,
  filtering,
  hiddenTagIds = [],
  geometry,
  onGeometry,
  onImport, onClearSearch, onShowList,
  feedback,
  loadMedia,
  boxSelection,
  onBoxSelect,
}: {
  /** Bookmarks in the current box selection. */
  boxSelection?: ReadonlySet<string>;
  /** Called when a box is drawn on empty canvas; `adding` when Shift was held. */
  onBoxSelect?: (ids: string[], adding: boolean) => void;
  loadMedia?: (id: string) => Promise<{ blob: Blob } | undefined>;
  onImport: () => void;
  onClearSearch: () => void;
  onShowList?: () => void;
  feedback?: ReactNode;
  ref?: Ref<GraphCanvasHandle>;
  onPinsChanged: (ids: string[]) => void;
  workspace: Workspace;
  selected?: string;
  onSelect: (id: string) => void;
  query: string;
  matchingBubbleIds?: string[];
  filtering?: boolean;
  hiddenTagIds?: string[];
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
    // Nodes allowed to move while the rest of the layout is frozen.
    settling = useRef(new Set<string>()),
    // Fit once the layout settles, until the user moves the view themselves.
    autoFit = useRef(false),
    dragging = useRef(new Set<string>()),
    saveRef = useRef(onGeometry);
  saveRef.current = onGeometry;
  const pinsChangedRef = useRef(onPinsChanged);
  pinsChangedRef.current = onPinsChanged;
  const pinLayer = useRef<HTMLDivElement>(null);
  const drawPinsRef = useRef<() => void>(() => {});
  const outsideLabels = useRef(new Map<string, boolean>());
  const hovered = useRef<string | undefined>(undefined);
  const onBoxSelectRef = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;
  // Triage emphasis: the selected bookmark's groups, bookmarks sharing them, and the box selection.
  const emphasis = useMemo(() => {
    const groups = new Set(workspace.memberships.filter((m) => m.bubbleId === selected).map((m) => m.tagId));
    const related = new Set(workspace.memberships.filter((m) => groups.has(m.tagId) && m.bubbleId !== selected).map((m) => m.bubbleId));
    return { groups, related, box: boxSelection ?? new Set<string>() };
  }, [workspace.memberships, selected, boxSelection]);
  const emphasisRef = useRef(emphasis);
  emphasisRef.current = emphasis;
  const bubbles = useMemo(() => new Map(workspace.bubbles.map((b) => [b.id, b])), [workspace.bubbles]);
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const loadMediaRef = useRef(loadMedia);
  loadMediaRef.current = loadMedia;
  // Bubble images by source, preloaded so the graph never draws a broken image.
  // Each becomes a small round thumbnail once, because redrawing full-size
  // covers on every frame makes panning slow. G6 reloads string sources as CORS
  // requests, which most sites refuse, so the thumbnail canvas is drawn instead,
  // with the `src` and `complete` fields G's image cache keys on.
  const images = useRef(new Map<string, HTMLCanvasElement | "loading" | "failed">());
  const imageReady = useRef<(bubbleId: string) => void>(() => {});
  function bubbleImage(bubble: Bubble | undefined) {
    const asset = bubble?.asset;
    if (!asset || asset.kind !== "image") return undefined;
    const key = asset.source === "local" ? `blob:${asset.blobId}` : asset.url;
    if (!key) return undefined;
    const known = images.current.get(key);
    if (known === "failed" || known === "loading") return undefined;
    if (known) return known;
    images.current.set(key, "loading");
    void (async () => {
      const src = asset.source === "local"
        ? await loadMediaRef.current?.(asset.blobId!).then((m) => (m ? URL.createObjectURL(m.blob) : undefined)).catch(() => undefined)
        : asset.url;
      if (!src) return images.current.set(key, "failed");
      const img = new Image();
      img.onload = () => {
        images.current.set(key, roundThumbnail(img, key));
        imageReady.current(bubble!.id);
      };
      img.onerror = () => images.current.set(key, "failed");
      img.src = src;
    })();
    return undefined;
  }
  const textMetrics = useRef<CanvasRenderingContext2D | null>(null);
  function labelStyle(node: NodeData, scale: number): NonNullable<NodeData["style"]> {
    if (!node.data?.tag) {
      const { related, box } = emphasisRef.current;
      const shown = scale >= bubbleLabelMinZoom || node.id === selectedRef.current || node.id === hovered.current
        || (related.has(node.id) && related.size <= emphasisLabelLimit) || (box.has(node.id) && box.size <= emphasisLabelLimit);
      // Images show with the title once the bubble is big enough to read; far out they are too small.
      const image = shown && scale >= bubbleImageMinZoom ? bubbleImage(bubblesRef.current.get(node.id)) : undefined;
      // The 2px outline is centered on the edge; tucking the image 0.5px under
      // it fills the inner circle without a seam.
      const diameter = Number(node.style?.size ?? 25) - 1;
      // The hovered or selected title is brought to the front with a backing, so
      // neighboring nodes and edges cannot cover it.
      const focused = node.id === selectedRef.current || node.id === hovered.current;
      return {
      label: shown,
      labelPointerEvents: "none",
      labelBackground: focused,
      labelBackgroundFill: "#ffffff",
      labelBackgroundOpacity: 0.96,
      labelBackgroundRadius: 3 / scale,
      labelBackgroundPointerEvents: "none",
      labelPadding: focused ? [2 / scale, 4 / scale] : 0,
      labelFill: focused ? "#183e35" : "#475569",
      icon: !!image,
      iconSrc: image as unknown as HTMLImageElement | undefined,
      iconWidth: diameter,
      iconHeight: diameter,
      labelFontSize: 13 / scale, labelOffsetY: 6 / scale, labelWordWrap: true, labelMaxWidth: 180 / scale, labelMaxLines: 1 };
    }
    const context = textMetrics.current ??= document.createElement("canvas").getContext("2d");
    if (context) context.font = '600 13px sans-serif';
    const title = String(node.data.label ?? "");
    const width = context?.measureText(title).width ?? title.length * 7;
    const outside = tagLabelOutside(Number(node.style?.size ?? 65), scale, width, outsideLabels.current.get(node.id));
    outsideLabels.current.set(node.id, outside);
    return {
      labelFontSize: 13 / scale,
      labelFontFamily: "sans-serif",
      labelWordWrap: true,
      labelMaxWidth: 220 / scale,
      labelMaxLines: 1,
      labelFontWeight: 600,
      labelPlacement: outside ? "bottom" : "center",
      labelOffsetY: outside ? 6 / scale : 0,
      labelFill: outside ? "#294d41" : "#fff",
      labelBackground: outside,
      labelBackgroundFill: "#f8faf9",
      labelBackgroundOpacity: .94,
      labelBackgroundRadius: 3 / scale,
      // Zoomed-out tag titles cover nearby bubbles; let hover and clicks reach them.
      labelPointerEvents: "none",
      labelBackgroundPointerEvents: "none",
      labelPadding: outside ? [2 / scale, 3 / scale] : 0,
    };
  }
  function refreshPins() {
    pinsChangedRef.current([...pins.current]);
    const g = graph.current;
    if (!g || renderedGraph.current !== g) return;
    drawPinsRef.current();
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
    frame(ids) {
      const g = graph.current;
      if (!g || renderedGraph.current !== g) return;
      const points = ids.filter((id) => g.hasNode(id)).map((id) => g.getElementPosition(id));
      if (!points.length) return;
      autoFit.current = false;
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      const [width, height] = g.getSize();
      const padX = 130, padY = 80; // screen room for titles around the outer nodes
      const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1), spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1);
      const zoom = Math.max(0.15, Math.min(1.2, (width - 2 * padX) / spanX, (height - 2 * padY) / spanY));
      const center: [number, number] = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
      void g.zoomTo(zoom, false)
        .then(() => {
          const [x, y] = g.getViewportByCanvas(center);
          return g.translateBy([width / 2 - x, height / 2 - y], { duration: 300 });
        })
        .catch((e) => setError(String(e)));
    },
    fitAll() {
      const g = graph.current;
      if (!g || renderedGraph.current !== g) return;
      autoFit.current = false;
      void g.fitView({}, { duration: 300 }).catch((e) => setError(String(e)));
    },
    positionOf(id) {
      const g = graph.current;
      return g && renderedGraph.current === g && g.hasNode(id) ? (g.getElementPosition(id).slice(0, 2) as [number, number]) : undefined;
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
    [zoom, setZoom] = useState(1),
    [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => {
    const closeMenus = (event: KeyboardEvent | PointerEvent) => {
      const shell = container.current?.parentElement;
      if (!shell) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      const target = event.target as Element;
      if (event instanceof KeyboardEvent || !target.closest(".layout-menu")) setLayoutOpen(false);
      if (event instanceof KeyboardEvent || !target.closest(".help-menu")) shell.querySelector(".help-menu")?.removeAttribute("open");
    };
    document.addEventListener("keydown", closeMenus);
    document.addEventListener("pointerdown", closeMenus);
    return () => { document.removeEventListener("keydown", closeMenus); document.removeEventListener("pointerdown", closeMenus); };
  }, []);
  useEffect(() => {
    if (!container.current) return;
    let canceled = false,
      timer: ReturnType<typeof setInterval> | undefined,
      labelFrame: number | undefined;
    outsideLabels.current.clear();
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
          data: { label: a.icon ? `${a.icon} ${tag.name}` : tag.name, tag: true },
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
    const hasSavedPositions = nodes.some((node) => geometry?.positions[node.id]);
    const unplaced = hasSavedPositions
      ? nodes.filter((node) => !geometry?.positions[node.id]).map((node) => node.id)
      : [];
    if (unplaced.length) {
      const saved = Object.entries(geometry!.positions);
      const center: Point = [
        saved.reduce((sum, [, p]) => sum + p.x, 0) / saved.length,
        saved.reduce((sum, [, p]) => sum + p.y, 0) / saved.length,
      ];
      const start = placeNear(
        unplaced,
        new Map(saved.map(([id, p]) => [id, [p.x, p.y] as const])),
        workspace.memberships,
        center,
      );
      for (const node of nodes)
        if (start.has(node.id))
          node.style = { ...node.style, x: start.get(node.id)![0], y: start.get(node.id)![1] };
    }
    // Saved nodes stay where the user left them; only unplaced nodes settle.
    settling.current = new Set(unplaced);
    pins.current = new Set(
      Object.entries(geometry?.positions ?? {})
        .filter(([, p]) => p.pinned)
        .map(([id]) => id),
    );
    frozen.current = hasSavedPositions;
    autoFit.current = !geometry?.viewport && !hasSavedPositions;
    const sim = forceSimulation<ForceNode>();
    simulation.current = sim;
    // Public d3 simulation option supplies persisted pins without touching G6 internals.
    sim.force("saved-pins", () => {
      for (const node of sim.nodes()) {
        if (dragging.current.has(node.id)) continue;
        const datum = graph.current?.getNodeData(node.id);
        if ((frozen.current && !settling.current.has(node.id)) || pins.current.has(node.id)) {
          node.fx = Number(datum?.style?.x ?? node.x ?? 0);
          node.fy = Number(datum?.style?.y ?? node.y ?? 0);
        } else {
          node.fx = null;
          node.fy = null;
        }
      }
    });
    const boxStyle = { fill: "#2563eb", fillOpacity: 0.06, stroke: "#2563eb", lineWidth: 1, lineDash: [4, 3] };
    const boxed = (states: Record<string, string | string[]>, adding: boolean) => {
      const ids = Object.entries(states)
        .filter(([id, state]) => bubblesRef.current.has(id) && [state].flat().includes("boxed"))
        .map(([id]) => id);
      onBoxSelectRef.current?.(ids, adding);
    };
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
          badge: false,
          labelText: (d) => String(d.data?.label ?? ""),
          labelFontSize: () => 13 / (graph.current?.getZoom() ?? 1),
        },
      },
      edge: { style: { stroke: "#a9bdba", lineWidth: 1.2, endArrow: false } },
      layout: {
        type: "d3-force",
        forceSimulation: sim,
        alpha: hasSavedPositions ? (unplaced.length ? 0.6 : 0) : nodes.length ? 1 : 0,
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
          type: "focus-adapt-label",
          key: "label-collisions",
          focusIds: () => [hovered.current, selectedRef.current].filter((id): id is string => !!id),
          padding: 4,
          throttle: 32,
          sort: (a: NodeData, b: NodeData) => {
            const { groups, related, box } = emphasisRef.current;
            const priority = (n: typeof a) =>
              n.id === hovered.current ? 4 : n.id === selectedRef.current ? 3 : groups.has(n.id) ? 2
                : n.data?.tag ? 1 : related.has(n.id) || box.has(n.id) ? 0.5 : 0;
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
        // Dragging on empty canvas draws a selection box; Shift adds to the selection.
        {
          type: "brush-select",
          key: "box",
          trigger: ["drag"],
          enableElements: ["node"],
          state: "boxed",
          mode: "default",
          enable: (e: { targetType?: string; shiftKey?: boolean }) => e.targetType === "canvas" && !e.shiftKey,
          onSelect: (states: Record<string, string | string[]>) => boxed(states, false),
          style: boxStyle,
        },
        {
          type: "brush-select",
          key: "box-add",
          trigger: ["shift"],
          enableElements: ["node"],
          state: "boxed",
          mode: "union",
          enable: (e: { targetType?: string }) => e.targetType === "canvas",
          onSelect: (states: Record<string, string | string[]>) => boxed(states, true),
          style: boxStyle,
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
    // A supplied d3 simulation does not get the layout adapter's default tick
    // listener. Publish its positions through G6's public data API so explicit
    // re-layout and force dragging actually repaint after a saved layout loads.
    sim.on("tick.workspace", () => {
      if (canceled || (frozen.current && !settling.current.size) || renderedGraph.current !== g) return;
      const ids = new Set(g.getNodeData().map((node) => node.id));
      g.updateNodeData(sim.nodes().filter((node) => ids.has(node.id)).map((node) => ({
        id: node.id, style: { x: node.x ?? 0, y: node.y ?? 0 },
      })));
      void g.draw().catch((error) => { if (!canceled) setError(String(error)); });
    });
    sim.on("end.fit", () => {
      if (canceled || renderedGraph.current !== g || !autoFit.current) return;
      autoFit.current = false;
      void g.fitView({}, false).catch((error) => { if (!canceled) setError(String(error)); });
    });
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
      autoFit.current = false;
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
    const userMoved = () => { autoFit.current = false; };
    surface.addEventListener("pointerdown", userMoved);
    surface.addEventListener("wheel", userMoved, { passive: true });
    surface.addEventListener("wheel", pinchWheel, {
      passive: false,
      capture: true,
    });
    surface.addEventListener("gesturestart", gestureStart, { passive: false });
    surface.addEventListener("gesturechange", gestureChange, {
      passive: false,
    });
    surface.addEventListener("gestureend", gestureEnd, { passive: false });
    // Decorative SVGs live outside graph bounds and never affect hit testing or physics.
    // Their tip is anchored to the node contour; size falls from 18px to 12px for tiny nodes.
    const drawPins = () => {
      const layer = pinLayer.current;
      if (!layer || canceled) return;
      layer.replaceChildren();
      for (const n of g.getNodeData()) {
        if (!pins.current.has(n.id) || g.getElementVisibility(n.id) === "hidden") continue;
        const size = Number(n.style?.size ?? 25), r = size / 2;
        const offset = n.type === "diamond" ? r / 2 : n.type === "rect" ? r - Math.min(14, r) * (1 - Math.SQRT1_2) : r * Math.SQRT1_2;
        const [nodeX, nodeY] = g.getElementPosition(n.id);
        const [x, y] = g.getViewportByCanvas([nodeX + offset, nodeY - offset]);
        const marker = document.createElement("div");
        marker.className = "graph-pin";
        const px = Math.max(12, Math.min(18, size * g.getZoom() * .65));
        marker.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + px + "px;height:" + px + "px";
        marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 21 7-7" stroke="#68766f" stroke-width="1.8" stroke-linecap="round"/><path d="m12 3 9 9-2 2-3-1-3 3-1 3-7-7 3-1 3-3-1-3Z" fill="#d84c58" stroke="#a93643" stroke-width="1" stroke-linejoin="round"/></svg>';
        layer.append(marker);
      }
    };
    drawPinsRef.current = drawPins;
    g.on(GraphEvent.AFTER_DRAW, drawPins);
    g.on(GraphEvent.AFTER_TRANSFORM, drawPins);
    g.on(GraphEvent.AFTER_ELEMENT_TRANSLATE, drawPins);
    g.on(NodeEvent.DRAG, drawPins);
    let labelZoom: number | undefined;
    g.on(GraphEvent.AFTER_TRANSFORM, () => {
      // Transforms can fire while G6 is still creating its viewport.
      if (!canceled && renderedGraph.current === g) {
        setZoom(g.getZoom());
        // Labels keep a fixed screen size, so only a zoom change restyles them; panning does not.
        if (g.getZoom() === labelZoom) return;
        labelZoom = g.getZoom();
        if (labelFrame !== undefined) cancelAnimationFrame(labelFrame);
        labelFrame = requestAnimationFrame(() => {
          labelFrame = undefined;
          if (canceled || renderedGraph.current !== g) return;
          g.updateNodeData(
            g.getNodeData().map((n) => ({
              id: n.id,
              style: labelStyle(n, g.getZoom()),
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
    const hover = (id: string | undefined) => {
      const previous = hovered.current;
      hovered.current = id;
      if (canceled || renderedGraph.current !== g) return;
      const ids = [previous, id].filter((x): x is string => !!x && g.hasNode(x));
      g.updateNodeData(ids.map((nodeId) => ({ id: nodeId, style: labelStyle(g.getNodeData(nodeId), g.getZoom()) })));
      void g.draw().catch((e) => { if (!canceled) setError(String(e)); });
    };
    imageReady.current = (bubbleId) => {
      if (canceled || renderedGraph.current !== g || !g.hasNode(bubbleId)) return;
      g.updateNodeData([{ id: bubbleId, style: labelStyle(g.getNodeData(bubbleId), g.getZoom()) }]);
      void g.draw().catch((e) => { if (!canceled) setError(String(e)); });
    };
    g.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => hover(event.target.id));
    g.on(NodeEvent.POINTER_LEAVE, () => hover(undefined));
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
      if (!canceled && container.current && container.current.clientWidth > 0 && container.current.clientHeight > 0)
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
        // Show records added since the view was saved, such as a new import.
        if (unplaced.length && geometry?.viewport) await g.fitView({}, false);
        frozen.current = false;
        settling.current = new Set();
        if (canceled) return;
        renderedGraph.current = g;
        setZoom(g.getZoom());
        g.updateNodeData(g.getNodeData().map((n) => ({ id: n.id, style: labelStyle(n, g.getZoom()) })));
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
            performance.now() - last < 400 ? "Layout moving" : "Layout settled",
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
      surface.removeEventListener("pointerdown", userMoved);
      surface.removeEventListener("wheel", userMoved);
      surface.removeEventListener("gesturestart", gestureStart);
      surface.removeEventListener("gesturechange", gestureChange);
      surface.removeEventListener("gestureend", gestureEnd);
      renderedGraph.current = null;
      graph.current = null;
      drawPinsRef.current = () => {};
      sim.on("tick.workspace", null);
      sim.on("end.fit", null);
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
    const [width, height] = g.getSize();
    const positions = placeNear(
      added.map((n) => n.id),
      new Map(currentNodes.map((c) => [c.id, [Number(c.style?.x ?? 0), Number(c.style?.y ?? 0)] as const])),
      workspace.memberships,
      g.getCanvasByViewport([width / 2, height / 2]) as Point,
    );
    if (added.length)
      g.addData({
        nodes: added.map((n) => {
          const tag = "name" in n;
          const a = tag ? appearanceFor(n, workspace) : undefined;
          const [x, y] = positions.get(n.id)!;
          return {
            id: n.id,
            type:
              a?.shape === "rounded-square" ? "rect" : (a?.shape ?? "circle"),
            data: {
              label: tag
                ? (() => {
                    const appearance = a!;
                    return appearance.icon ? `${appearance.icon} ${n.name}` : n.name;
                  })()
                : n.title,
              tag,
            },
            style: {
              x,
              y,
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
    g.updateNodeData([
      ...workspace.tags.map((t) => ({
        id: t.id,
        data: {
          label: appearanceFor(t, workspace).icon
            ? `${appearanceFor(t, workspace).icon} ${t.name}`
            : t.name,
          tag: true,
        },
      })),
      ...workspace.bubbles.map((b) => ({ id: b.id, data: { label: b.title } })),
    ]);
    g.updateNodeData(
      g.getNodeData().map((n) => ({
        id: n.id,
        style: labelStyle(n, g.getZoom()),
      })),
    );
    if (
      added.length ||
      removedNodes.length ||
      addedEdges.length ||
      removedEdges.length
    ) {
      // Existing nodes stay where the user left them; only new nodes settle.
      frozen.current = true;
      settling.current = new Set(added.map((n) => n.id));
      if (!currentNodes.length) autoFit.current = true;
      const sim = simulation.current;
      sim?.alpha(0).restart();
      void g
        .layout({
          ...(!Array.isArray(g.getLayout()) ? g.getLayout() : undefined),
          type: "d3-force",
          forceSimulation: sim,
          alpha: added.length ? 0.6 : 0,
        })
        .then(() => {
          frozen.current = false;
          settling.current = new Set();
          persist();
        })
        .catch((e) => setError(String(e)));
    }
    const term = query.toLowerCase();
    const matching = new Set(
      matchingBubbleIds ??
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
        .filter((m) => matching.has(m.bubbleId) && !hiddenTagIds.includes(m.tagId))
        .map((m) => m.tagId),
    );
    const shouldFilterTags = filtering ?? (matchingBubbleIds === undefined ? Boolean(term) : true);
    for (const tag of workspace.tags)
      visibility[tag.id] = hiddenTagIds.includes(tag.id)
        ? "hidden"
        : !shouldFilterTags || linkedTags.has(tag.id)
          ? "visible"
          : "hidden";
    for (const m of workspace.memberships)
      visibility[m.id] = matching.has(m.bubbleId) && !hiddenTagIds.includes(m.tagId) ? "visible" : "hidden";
    // Triage emphasis: the current bookmark with its groups and related bookmarks
    // stays strong, the box selection is outlined, and everything else fades.
    const { groups, related, box } = emphasis;
    const focusing = Boolean(selected && workspace.bubbles.some((b) => b.id === selected));
    const decided = new Set(workspace.statuses.filter((s) => s.outcome !== "active").map((s) => s.id));
    g.updateNodeData([
      ...workspace.tags.map((tag) => ({
        id: tag.id,
        style: {
          opacity: !focusing || groups.has(tag.id) ? 1 : 0.28,
          stroke: appearanceFor(tag, workspace).color,
          lineWidth: 1,
          halo: false,
        },
      })),
      ...workspace.bubbles.map((b) => {
        const current = b.id === selected, inBox = box.has(b.id), done = decided.has(b.statusId);
        return {
          id: b.id,
          style: {
            opacity: !focusing || current || related.has(b.id) || inBox ? 1 : 0.18,
            stroke: current ? "#0f766e" : inBox ? "#2563eb" : done ? "#cbd5d1" : "#94a3b8",
            lineWidth: current ? 4 : inBox ? 3 : 2,
            fill: done ? "#eef2f0" : "#fff",
            halo: current || inBox,
            haloStroke: current ? "#0f766e" : "#2563eb",
            haloLineWidth: current ? 14 : 8,
            haloStrokeOpacity: current ? 0.25 : 0.16,
          },
        };
      }),
    ]);
    const tagOf = new Map(workspace.memberships.map((m) => [m.id, m.tagId]));
    g.setEdge({
      style: {
        stroke: (edge) => (edge.source === selected ? "#0f766e" : "#a9bdba"),
        lineWidth: (edge) => (edge.source === selected ? 2.5 : 1.2),
        opacity: (edge) => (!focusing || edge.source === selected ? 1 : groups.has(tagOf.get(String(edge.id)) ?? "") ? 0.45 : 0.08),
        endArrow: false,
      },
    });
    // Keep G6's brush state in step with the selection (it is cleared outside the graph too).
    const brushStates: Record<string, string[]> = {};
    for (const b of workspace.bubbles) {
      const has = g.getElementState(b.id).includes("boxed");
      if (has !== box.has(b.id)) brushStates[b.id] = box.has(b.id) ? ["boxed"] : [];
    }
    if (Object.keys(brushStates).length) void g.setElementState(brushStates, false);
    void g
      .setElementVisibility(visibility, false)
      .then(() => {
        if (graph.current === g) return g.draw();
      })

      .catch((e) => {
        if (graph.current === g) setError(String(e));
      });
  }, [ready, selected, query, matchingBubbleIds, filtering, hiddenTagIds, workspace, emphasis]);
  async function action(work: (g: Graph) => Promise<unknown>) {
    if (!graph.current || !ready) return;
    autoFit.current = false;
    try {
      await work(graph.current);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="canvas-shell">

      <div
        ref={container}
        className="graph-canvas"
        role="img"
        aria-label="Force-directed bubble and tag graph"
      />
      <div ref={pinLayer} className="pin-layer" aria-hidden="true" />
      {!workspace.bubbles.length && !workspace.tags.length && (
        <div className="canvas-empty">
          <h2>Your collection is empty</h2>
          <p>Add links, notes, or a file to start exploring.</p>
          <button className="primary" onClick={onImport}>Open Import</button>
        </div>
      )}
      {workspace.bubbles.length > 0 && matchingBubbleIds !== undefined && matchingBubbleIds.length === 0 && <div className="canvas-empty"><h2>No matching bubbles</h2><p>Try a different search or clear the filter.</p><button onClick={onClearSearch}>Clear search</button></div>}
      {matchingBubbleIds === undefined && query && workspace.bubbles.length > 0 && !workspace.bubbles.some((b) => `${b.title} ${b.description} ${b.url ?? ""}`.toLowerCase().includes(query.toLowerCase())) && <div className="canvas-empty"><h2>No matching bubbles</h2><p>Try a different search or clear the filter.</p><button onClick={onClearSearch}>Clear search</button></div>}
      {error && (
        <div className="canvas-error" role="alert">
          <strong>The graph couldn’t load</strong>
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry graph</button>
          {onShowList && <button onClick={onShowList}>Open list</button>}
        </div>
      )}
      <div className="canvas-bottom">
        <div className="canvas-status">
          {!ready && <span className="subtle" role="status">{status}</span>}
          {feedback}
        </div>
        <div className="canvas-tools">
          <details className="help-menu"><summary aria-label="Graph help"><Icon name="info" /><span>Help</span></summary><div className="help-popover"><strong>Explore your collection</strong><p>Drag a bubble to move it. Scroll with two fingers to pan; pinch to zoom.</p><p>Select an item for Details. Pin it there to keep its position during layout.</p></div></details>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <div className="layout-menu">
            <button
              className="tool-button"
              aria-expanded={layoutOpen}
              disabled={!ready}
              onClick={() => setLayoutOpen((v) => !v)}
            >
              <Icon name="layout" size={15} /> <span>Layout</span><Icon name="chevron-down" size={14} />
            </button>
            {layoutOpen && (
              <div className="layout-menu-popover">
                <button onClick={() => { setLayoutOpen(false); simulation.current?.alpha(1).restart(); }}>
                  <Icon name="refresh" size={15} /> Re-layout
                </button>
                <button onClick={() => {
                  setLayoutOpen(false);
                  if (window.confirm("Reset positions and clear all pins?")) {
                    pins.current.clear();
                    refreshPins();
                    for (const [i, n] of (simulation.current?.nodes() ?? []).entries()) {
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
                }}>
                  <Icon name="refresh" size={15} /> Reset positions
                </button>
              </div>
            )}
          </div>
          <IconButton
            label="Fit graph"
            icon="fit"
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
          />
          <IconButton label="Zoom out" icon="zoom-out" disabled={!ready} onClick={() => void action((g) => g.zoomBy(0.8, false))} />
          <IconButton label="Zoom in" icon="zoom-in" disabled={!ready} onClick={() => void action((g) => g.zoomBy(1.25, false))} />
        </div>
      </div>
    </div>
  );
}
