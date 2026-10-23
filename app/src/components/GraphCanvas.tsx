import { bookmarkImageMinZoom, bookmarkLabelMinZoom } from "./graph-labels";
import { placeNear, type Point } from "./graph-placement";
import "./focus-adapt-label";
import "./tag-node";
import { isTagStyle } from "./tag-shapes";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type ReactNode } from "react";
import {
  CanvasEvent,
  Graph,
  GraphEvent,
  NodeEvent,
  type IElementEvent,
  type NodeData,
} from "@antv/g6";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
} from "d3-force";
import { appearanceFor, type Appearance, type Bookmark, type Geometry, type Workspace } from "../domain/model";
import { Icon, IconButton } from "./Icon";
import { displayImage } from "../domain/thumbnails";
export interface GraphCanvasHandle {
  setPinned(id: string, pinned: boolean): void;
  /** Zoom and center so these nodes, with room for titles, fill the view. */
  frame(ids: string[]): void;
  /** Zoom out until every visible node fits. */
  /** Lays every shown node out again from a grid; pinned nodes stay put unless `clearPins`. */
  resetPositions(options?: { clearPins?: boolean }): void;
  positionOf(id: string): readonly [number, number] | undefined;
}
// Titles show for related or box-selected bookmarks only while there are few enough to read.
const emphasisLabelLimit = 30;
/** A theme color role from styles.css, so the graph follows the theme for letter tiles, the current bookmark and a box selection. */
function role(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
// About a bookmark at maximum zoom on a 2x display.
const thumbnailSize = 256;
function roundThumbnail(img: HTMLImageElement, key: string, icon = false): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = thumbnailSize;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(thumbnailSize / 2, thumbnailSize / 2, thumbnailSize / 2, 0, Math.PI * 2);
  context.clip();
  // Cover: fill the circle, cropping the longer side around the center.
  if (icon) { context.fillStyle = "#f4f7f5"; context.fillRect(0, 0, thumbnailSize, thumbnailSize); }
  const scale = icon ? thumbnailSize * .5 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    : thumbnailSize / Math.min(img.naturalWidth || 1, img.naturalHeight || 1);
  const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
  context.drawImage(img, (thumbnailSize - width) / 2, (thumbnailSize - height) / 2, width, height);
  return Object.assign(canvas, { src: `thumbnail:${key}`, complete: true });
}

// A tag's node follows its appearance: shape picks the node type (tag styles share
// the "tag-shape" node, turned by `points`), color fills it, and the icon is drawn inside.
function tagNode(a: Appearance) {
  const tag = isTagStyle(a.shape);
  return {
    type: tag ? "tag-shape" : a.shape === "rounded-square" ? "rect" : a.shape,
    style: {
      size: a.size,
      radius: 14,
      ...(tag ? { tagStyle: a.shape, points: a.points } : {}),
      fill: a.color,
      stroke: a.color,
      icon: Boolean(a.icon),
      iconText: a.icon ?? "",
      iconFill: "#fff",
      iconFontSize: Math.round(a.size * (tag ? 0.27 : 0.42)),
      iconFontWeight: 600,
    },
  };
}

const noTags: string[] = [];

export function GraphCanvas({
  ref,
  onPinsChanged,
  workspace,
  selected,
  onSelect,
  query,
  matchingBookmarkIds,
  filtering,
  hiddenTagIds = [],
  peekTagIds = noTags,
  geometry,
  onGeometry,
  onImport, onClearSearch, onShowList,
  loadMedia,
  boxSelection,
  onBoxSelect,
  tools,
}: {
  /** Extra buttons placed before the fit button in the bottom bar. */
  tools?: ReactNode;
  /** Bookmarks in the current box selection. */
  boxSelection?: ReadonlySet<string>;
  /** Called when a box is drawn on empty canvas; `adding` when Shift was held. */
  onBoxSelect?: (ids: string[], adding: boolean) => void;
  loadMedia?: (id: string) => Promise<{ blob: Blob } | undefined>;
  onImport: () => void;
  onClearSearch: () => void;
  onShowList?: () => void;
  ref?: Ref<GraphCanvasHandle>;
  onPinsChanged: (ids: string[]) => void;
  workspace: Workspace;
  selected?: string;
  /** Called with a node's ID, or with nothing when empty canvas is clicked. */
  onSelect: (id?: string) => void;
  query: string;
  matchingBookmarkIds?: string[];
  filtering?: boolean;
  hiddenTagIds?: string[];
  /** Groups of a hidden type shown anyway because the current bookmark is in them; drawn faded and dashed. */
  peekTagIds?: string[];
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
    // Nodes the filters hide; they keep their place while the shown ones lay out.
    hiddenNodes = useRef(new Set<string>()),
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
  const hovered = useRef<string | undefined>(undefined);
  const onBoxSelectRef = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;
  // Triage emphasis: the selected bookmark's groups, bookmarks sharing them, and the box selection.
  const emphasis = useMemo(() => {
    const groups = new Set(workspace.memberships.filter((m) => m.bookmarkId === selected).map((m) => m.tagId));
    const related = new Set(workspace.memberships.filter((m) => groups.has(m.tagId) && m.bookmarkId !== selected).map((m) => m.bookmarkId));
    return { groups, related, box: boxSelection ?? new Set<string>() };
  }, [workspace.memberships, selected, boxSelection]);
  const emphasisRef = useRef(emphasis);
  emphasisRef.current = emphasis;
  const bookmarks = useMemo(() => new Map(workspace.bookmarks.map((b) => [b.id, b])), [workspace.bookmarks]);
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const loadMediaRef = useRef(loadMedia);
  loadMediaRef.current = loadMedia;
  // Bookmark images by source, preloaded so the graph never draws a broken image.
  // Each becomes a small round thumbnail once, because redrawing full-size
  // covers on every frame makes panning slow. G6 reloads string sources as CORS
  // requests, which most sites refuse, so the thumbnail canvas is drawn instead,
  // with the `src` and `complete` fields G's image cache keys on.
  const images = useRef(new Map<string, HTMLCanvasElement | "loading" | "failed">());
  const imageReady = useRef<(bookmarkId: string) => void>(() => {});
  function letterImage(bookmark: Bookmark | undefined) {
    if (!bookmark) return undefined;
    const letter = (bookmark.title.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase();
    const key = `letter:${letter}`;
    const known = images.current.get(key);
    if (known && typeof known !== "string") return known;
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
    canvas.width = canvas.height = thumbnailSize;
    context.fillStyle = role("--color-tile", "#e8f3f2");
    context.beginPath(); context.arc(thumbnailSize / 2, thumbnailSize / 2, thumbnailSize / 2 - 4, 0, Math.PI * 2); context.fill();
    context.lineWidth = 8; context.strokeStyle = role("--color-tile-line", "#a5ccc9"); context.stroke();
    context.fillStyle = role("--color-on-tile", "#115e59"); context.font = "600 130px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(letter, thumbnailSize / 2, thumbnailSize / 2 + 5);
    const tile = Object.assign(canvas, { src: key, complete: true });
    images.current.set(key, tile);
    return tile;
  }
  function bookmarkImage(bookmark: Bookmark | undefined) {
    const image = bookmark && displayImage(bookmark);
    if (!image) return undefined;
    const local = "blobId" in image;
    const key = local ? `blob:${image.blobId}` : image.url;
    if (!key) return undefined;
    const known = images.current.get(key);
    if (known === "failed" || known === "loading") return undefined;
    if (known) return known;
    images.current.set(key, "loading");
    void (async () => {
      const src = local
        ? await loadMediaRef.current?.(image.blobId).then((m) => (m ? URL.createObjectURL(m.blob) : undefined)).catch(() => undefined)
        : image.url;
      if (!src) return images.current.set(key, "failed");
      const img = new Image();
      img.onload = () => {
        images.current.set(key, roundThumbnail(img, key, local && Boolean(image.icon)));
        if (local) URL.revokeObjectURL(src);
        imageReady.current(bookmark!.id);
      };
      img.onerror = () => { if (local) URL.revokeObjectURL(src); images.current.set(key, "failed"); };
      img.src = src;
    })();
    return undefined;
  }
  function labelStyle(node: NodeData, scale: number): NonNullable<NodeData["style"]> {
    if (!node.data?.tag) {
      const { related, box } = emphasisRef.current;
      const shown = scale >= bookmarkLabelMinZoom || node.id === selectedRef.current || node.id === hovered.current
        || (related.has(node.id) && related.size <= emphasisLabelLimit) || (box.has(node.id) && box.size <= emphasisLabelLimit);
      // Images show with the title once the bookmark is big enough to read; far out they are too small.
      const bookmark = bookmarksRef.current.get(node.id);
      const image = shown && scale >= bookmarkImageMinZoom ? bookmarkImage(bookmark) ?? letterImage(bookmark) : undefined;
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
    // A tag's title always sits below it, never inside the tag.
    return {
      labelFontSize: 13 / scale,
      labelFontFamily: "sans-serif",
      labelWordWrap: true,
      labelMaxWidth: 220 / scale,
      labelMaxLines: 1,
      labelFontWeight: 600,
      labelPlacement: "bottom",
      labelOffsetY: 6 / scale,
      labelFill: "#294d41",
      labelBackground: true,
      labelBackgroundFill: "#f8faf9",
      labelBackgroundOpacity: .94,
      labelBackgroundRadius: 3 / scale,
      // Zoomed-out tag titles cover nearby bookmarks; let hover and clicks reach them.
      labelPointerEvents: "none",
      labelBackgroundPointerEvents: "none",
      labelPadding: [2 / scale, 3 / scale],
    };
  }
  function refreshPins() {
    pinsChangedRef.current([...pins.current]);
    const g = graph.current;
    if (!g || renderedGraph.current !== g) return;
    drawPinsRef.current();
    void g.draw().catch((e) => setError(String(e)));
  }
  const handle: GraphCanvasHandle = {
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
    resetPositions,
    positionOf(id) {
      const g = graph.current;
      return g && renderedGraph.current === g && g.hasNode(id) ? (g.getElementPosition(id).slice(0, 2) as [number, number]) : undefined;
    },
  };
  useImperativeHandle(ref, () => handle);
  const tagSizes = useRef(new Map<string, number>());
  // Fit everything shown. G6's fitView also counts hidden nodes, which would
  // zoom far out past a filtered graph.
  async function fitWhole(g: Graph) {
    handle.frame(g.getNodeData().map((n) => n.id).filter((id) => g.getElementVisibility(id) !== "hidden"));
  }
  const collideRadius = (id: string) => (tagSizes.current.has(id) ? tagSizes.current.get(id)! / 2 + 20 : 34);
  function resetPositions({ clearPins = false } = {}) {
    if (clearPins) {
      pins.current.clear();
      refreshPins();
    }
    const sim = simulation.current;
    if (!sim) return;
    // Lay out only what is shown: hidden nodes hold still and exert no force.
    const hidden = (node: ForceNode | string | number) => hiddenNodes.current.has(typeof node === "object" ? node.id : String(node));
    (sim.force("charge") as ReturnType<typeof forceManyBody<ForceNode>> | undefined)?.strength((n) => (hidden(n) ? 0 : -250));
    (sim.force("collide") as ReturnType<typeof forceCollide<ForceNode>> | undefined)?.radius((n) => (hidden(n) ? 0 : collideRadius(n.id)));
    (sim.force("link") as ReturnType<typeof forceLink<ForceNode, SimulationLinkDatum<ForceNode>>> | undefined)?.strength((l) => (hidden(l.source as ForceNode) || hidden(l.target as ForceNode) ? 0 : 0.45));
    const shown = sim.nodes().filter((n) => !hidden(n) && !pins.current.has(n.id));
    const columns = Math.max(1, Math.ceil(Math.sqrt(shown.length)));
    for (const [i, n] of shown.entries()) {
      n.x = 90 + (i % columns) * 90;
      n.y = 120 + Math.floor(i / columns) * 100;
      n.vx = 0;
      n.vy = 0;
      n.fx = null;
      n.fy = null;
    }
    // Settle the layout at once instead of animating it, then fit the view
    // right away, as the Whole collection button does.
    frozen.current = false;
    sim.stop();
    sim.alpha(1);
    while (sim.alpha() > sim.alphaMin()) sim.tick();
    const g = graph.current;
    if (g && renderedGraph.current === g) {
      const ids = new Set(g.getNodeData().map((node) => node.id));
      g.updateNodeData(sim.nodes().filter((node) => ids.has(node.id)).map((node) => ({ id: node.id, style: { x: node.x ?? 0, y: node.y ?? 0 } })));
      void g.draw().then(() => fitWhole(g)).catch((e) => setError(String(e)));
    }
    persist();
  }
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
    renderedGraph.current = null;
    setReady(false);
    setError("");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes: NodeData[] = [
      ...workspace.tags.map<NodeData>((tag, i) => {
        const node = tagNode(appearanceFor(tag, workspace));
        return {
          id: tag.id,
          type: node.type,
          data: { label: tag.name, tag: true },
          style: {
            x: 140 + i * 170,
            y: 200,
            ...node.style,
            labelFill: "#294d41",
            labelPlacement: "bottom",
            labelFontWeight: 600,
          },
        };
      }),
      ...workspace.bookmarks.map<NodeData>((bookmark, i) => ({
        id: bookmark.id,
        type: "circle",
        data: { label: bookmark.title },
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
    pinsChangedRef.current([...pins.current]);
    frozen.current = hasSavedPositions;
    autoFit.current = !geometry?.viewport && !hasSavedPositions;
    const sim = forceSimulation<ForceNode>();
    simulation.current = sim;
    // Public d3 simulation option supplies persisted pins without touching G6 internals.
    sim.force("saved-pins", () => {
      for (const node of sim.nodes()) {
        if (dragging.current.has(node.id)) continue;
        const datum = graph.current?.getNodeData(node.id);
        if ((frozen.current && !settling.current.has(node.id)) || pins.current.has(node.id) || hiddenNodes.current.has(node.id)) {
          node.fx = Number(datum?.style?.x ?? node.x ?? 0);
          node.fy = Number(datum?.style?.y ?? node.y ?? 0);
        } else {
          node.fx = null;
          node.fy = null;
        }
      }
    });
    const selectionColor = role("--color-selection", "#183e3b");
    const boxStyle = { fill: selectionColor, fillOpacity: 0.06, stroke: selectionColor, lineWidth: 1, lineDash: [4, 3] };
    const boxed = (states: Record<string, string | string[]>, adding: boolean) => {
      const ids = Object.entries(states)
        .filter(([id, state]) => bookmarksRef.current.has(id) && [state].flat().includes("boxed"))
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
          source: m.bookmarkId,
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
        collide: { radius: (d) => collideRadius(String(d.id)) },
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
    imageReady.current = (bookmarkId) => {
      if (canceled || renderedGraph.current !== g || !g.hasNode(bookmarkId)) return;
      g.updateNodeData([{ id: bookmarkId, style: labelStyle(g.getNodeData(bookmarkId), g.getZoom()) }]);
      void g.draw().catch((e) => { if (!canceled) setError(String(e)); });
    };
    g.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => hover(event.target.id));
    g.on(NodeEvent.POINTER_LEAVE, () => hover(undefined));
    g.on(NodeEvent.CLICK, (event: IElementEvent) =>
      onSelectRef.current(event.target.id),
    );
    g.on(CanvasEvent.CLICK, () => onSelectRef.current());
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
      ids = new Set([...workspace.bookmarks, ...workspace.tags].map((n) => n.id)),
      edgeIds = new Set(workspace.memberships.map((m) => m.id));
    const removedNodes = currentNodes
        .filter((n) => !ids.has(n.id))
        .map((n) => n.id),
      removedEdges = currentEdges
        .filter((e) => !edgeIds.has(e.id!))
        .map((e) => e.id!);
    const added = [...workspace.tags, ...workspace.bookmarks].filter(
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
            type: a ? tagNode(a).type : "circle",
            data: { label: tag ? n.name : n.title, tag },
            style: {
              x,
              y,
              ...(a ? tagNode(a).style : { size: 25, fill: "#fff", stroke: "#94a3b8" }),
              lineWidth: 2,
              labelFill: tag ? "#294d41" : "#475569",
              labelPlacement: "bottom",
            },
          };
        }),
      });
    if (addedEdges.length)
      g.addData({
        edges: addedEdges.map((m) => ({
          id: m.id,
          source: m.bookmarkId,
          target: m.tagId,
        })),
      });
    g.updateNodeData([
      ...workspace.tags.map((t) => {
        // Restyle on every change, so appearance edits reach nodes drawn earlier;
        // a new shape swaps the node type.
        const node = tagNode(appearanceFor(t, workspace));
        return {
          id: t.id,
          ...(g.getNodeData(t.id).type !== node.type ? { type: node.type } : {}),
          data: { label: t.name, tag: true },
          style: node.style,
        };
      }),
      ...workspace.bookmarks.map((b) => ({ id: b.id, data: { label: b.title } })),
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
      matchingBookmarkIds ??
        workspace.bookmarks
          .filter((b) =>
            `${b.title} ${b.description} ${b.url ?? ""}`
              .toLowerCase()
              .includes(term),
          )
          .map((b) => b.id),
    );
    const visibility: Record<string, "visible" | "hidden"> = {};
    for (const b of workspace.bookmarks)
      visibility[b.id] = matching.has(b.id) ? "visible" : "hidden";
    const linkedTags = new Set(
      workspace.memberships
        .filter((m) => matching.has(m.bookmarkId) && !hiddenTagIds.includes(m.tagId))
        .map((m) => m.tagId),
    );
    const shouldFilterTags = filtering ?? (matchingBookmarkIds === undefined ? Boolean(term) : true);
    for (const tag of workspace.tags)
      visibility[tag.id] = hiddenTagIds.includes(tag.id)
        ? "hidden"
        : !shouldFilterTags || linkedTags.has(tag.id)
          ? "visible"
          : "hidden";
    for (const m of workspace.memberships)
      visibility[m.id] = matching.has(m.bookmarkId) && !hiddenTagIds.includes(m.tagId) ? "visible" : "hidden";
    // Triage emphasis: the current bookmark with its groups and related bookmarks
    // stays strong, the box selection is outlined, and everything else fades.
    const { groups, related, box } = emphasis;
    const focusing = Boolean(selected && workspace.bookmarks.some((b) => b.id === selected));
    const decided = new Set(workspace.statuses.filter((s) => s.outcome !== "active").map((s) => s.id));
    const peeking = new Set(peekTagIds);
    const accent = role("--color-accent", "#0f766e"), selection = role("--color-selection", "#183e3b");
    g.updateNodeData([
      ...workspace.tags.map((tag) => ({
        id: tag.id,
        style: {
          opacity: !focusing || groups.has(tag.id) ? 1 : 0.28,
          stroke: appearanceFor(tag, workspace).color,
          lineWidth: peeking.has(tag.id) ? 2.5 : 1,
          lineDash: peeking.has(tag.id) ? [5, 4] : [],
          fillOpacity: peeking.has(tag.id) ? 0.32 : 1,
          halo: false,
        },
      })),
      ...workspace.bookmarks.map((b) => {
        const current = b.id === selected, inBox = box.has(b.id), done = decided.has(b.statusId);
        return {
          id: b.id,
          style: {
            opacity: !focusing || current || related.has(b.id) || inBox ? 1 : 0.18,
            stroke: current ? accent : inBox ? selection : done ? "#cbd5d1" : "#94a3b8",
            lineWidth: current ? 4 : inBox ? 3 : 2,
            fill: done ? "#eef2f0" : "#fff",
            halo: current || inBox,
            haloStroke: current ? accent : selection,
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
        lineDash: (edge) => (peeking.has(tagOf.get(String(edge.id)) ?? "") ? [5, 4] : []),
        endArrow: false,
      },
    });
    // Keep G6's brush state in step with the selection (it is cleared outside the graph too).
    const brushStates: Record<string, string[]> = {};
    for (const b of workspace.bookmarks) {
      const has = g.getElementState(b.id).includes("boxed");
      if (has !== box.has(b.id)) brushStates[b.id] = box.has(b.id) ? ["boxed"] : [];
    }
    if (Object.keys(brushStates).length) void g.setElementState(brushStates, false);
    hiddenNodes.current = new Set(Object.keys(visibility).filter((id) => visibility[id] === "hidden"));
    void g
      .setElementVisibility(visibility, false)
      .then(() => {
        if (graph.current === g) return g.draw();
      })

      .catch((e) => {
        if (graph.current === g) setError(String(e));
      });
  }, [ready, selected, query, matchingBookmarkIds, filtering, hiddenTagIds, peekTagIds, workspace, emphasis]);
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
        aria-label="Force-directed bookmark and tag graph"
      />
      <div ref={pinLayer} className="pin-layer" aria-hidden="true" />
      {!workspace.bookmarks.length && !workspace.tags.length && (
        <div className="canvas-empty">
          <h2>Your collection is empty</h2>
          <p>Add links, notes, or a file to start exploring.</p>
          <button className="primary" onClick={onImport}>Open Import</button>
        </div>
      )}
      {workspace.bookmarks.length > 0 && matchingBookmarkIds !== undefined && matchingBookmarkIds.length === 0 && <div className="canvas-empty"><h2>No matching bookmarks</h2><p>Try a different search or clear the filter.</p><button onClick={onClearSearch}>Clear search</button></div>}
      {matchingBookmarkIds === undefined && query && workspace.bookmarks.length > 0 && !workspace.bookmarks.some((b) => `${b.title} ${b.description} ${b.url ?? ""}`.toLowerCase().includes(query.toLowerCase())) && <div className="canvas-empty"><h2>No matching bookmarks</h2><p>Try a different search or clear the filter.</p><button onClick={onClearSearch}>Clear search</button></div>}
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
        </div>
        <div className="canvas-tools">
          <div className="layout-menu">
            <button
              className="tool-button"
              aria-expanded={layoutOpen}
              disabled={!ready}
              onClick={() => setLayoutOpen((v) => !v)}
            >
              <Icon name="layout" size={15} /> <span>Layout</span><Icon name="chevron-down" size={13} />
            </button>
            {layoutOpen && (
              <div className="layout-menu-popover">
                <button onClick={() => { setLayoutOpen(false); simulation.current?.alpha(1).restart(); }}>
                  <Icon name="refresh" size={15} /> Re-layout
                </button>
                <button onClick={() => {
                  setLayoutOpen(false);
                  if (window.confirm("Reset positions and clear all pins?")) {
                    resetPositions({ clearPins: true });
                  }
                }}>
                  <Icon name="refresh" size={15} /> Reset positions
                </button>
              </div>
            )}
          </div>
          <div className="tool-group">
            {tools}
            <IconButton
              label="Whole collection"
              icon="fit"
              disabled={!ready}
              onClick={() => void action(fitWhole)}
            />
          </div>
          <div className="tool-group">
            <IconButton label="Zoom out" icon="zoom-out" disabled={!ready} onClick={() => void action((g) => g.zoomBy(0.8, false))} />
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <IconButton label="Zoom in" icon="zoom-in" disabled={!ready} onClick={() => void action((g) => g.zoomBy(1.25, false))} />
          </div>
        </div>
      </div>
    </div>
  );
}
