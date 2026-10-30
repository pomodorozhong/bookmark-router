import { useEffect, useImperativeHandle, useRef, useState, type Ref, type ReactNode } from "react";
import { CanvasEvent, Graph, GraphEvent, NodeEvent, type IElementEvent, type NodeData } from "@antv/g6";
import { forceCollide } from "d3-force";
import { connectionLinks, type Candidate, type ConnectionGraph } from "../domain/connections";
import type { GraphLayout, Workspace } from "../domain/model";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { arrangeConnections, connectionSimulation, movingConnectionIds, seedConnections, splitNodeSize, type ConnectionNode } from "./connections-layout";
import { createDrawQueue } from "./connections-render";
import type { Covered } from "./graph-placement";
import { Icon, IconButton } from "./Icon";
import "./tag-node";
import "./focus-adapt-label";

interface Props {
  ref?: Ref<GraphCanvasHandle>;
  workspace: Workspace;
  model: ConnectionGraph;
  ranking: Candidate[];
  impacts: ReadonlyMap<string, number>;
  selected?: string;
  showTags: boolean;
  contextTag?: string;
  preview?: Candidate;
  geometry?: GraphLayout;
  onGeometry: (layout: GraphLayout) => void;
  onSelect: (id?: string) => void;
  onTag: (id: string) => void;
  onBoxSelect: (ids: string[], adding: boolean) => void;
  onPinsChanged: (ids: string[]) => void;
  highlightIds: ReadonlySet<string>;
  fadeRest: boolean;
  boxSelection?: ReadonlySet<string>;
  covered: () => Covered;
  viewControls?: ReactNode;
  onReady?: (ready: boolean) => void;
  onClearSearch: () => void;
  onImport: () => void;
}

function readColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(["accent", "split", "graph-mark", "ink-muted", "danger", "focus", "graph-node", "graph-node-line", "graph-label-strong", "graph-label-bg", "graph-edge"]
    .map((role) => [role, style.getPropertyValue(`--color-${role}`).trim()]));
}

/** Tag display changes presentation only. All tracing and impact overlays refer to the bookmark projection. */
export function ConnectionsCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph | undefined>(undefined);
  const latest = useRef(props); latest.current = props;
  const layout = useRef(props.geometry);
  const previousMode = useRef(props.showTags);
  const paint = useRef<() => void>(() => {});
  const persist = useRef<() => void>(() => {});
  const frame = useRef<(ids?: string[]) => void>(() => {});
  const relayout = useRef<(clear?: boolean) => void>(() => {});
  const pauseMotion = useRef<() => void>(() => {});
  const hovered = useRef<string | undefined>(undefined);
  const [hover, setHover] = useState<string>();
  const [ready, setReady] = useState(false);
  useEffect(() => { props.onReady?.(ready); return () => props.onReady?.(false); }, [ready, props.onReady]);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [viewMenu, setViewMenu] = useState(false);
  useEffect(() => {
    if (!viewMenu) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest(".canvas-view")) setViewMenu(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setViewMenu(false); e.stopImmediatePropagation(); } };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape, true); };
  }, [viewMenu]);

  useImperativeHandle(props.ref, () => ({
    positionOf: (id) => {
      const g = graph.current;
      if (!g?.hasNode(id)) return undefined;
      const p = g.getNodeData(id).style;
      return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
    },
    frame: (ids) => frame.current(ids),
    relayout: () => relayout.current(),
    resetPositions: (options) => relayout.current(options?.clearPins),
    setPinned: (id, pinned) => {
      if (!layout.current?.positions[id]) return;
      layout.current.positions[id].pinned = pinned;
      persist.current();
      paint.current();
    },
  }), []);

  // Scope or topology changes rebuild the drawn elements, retaining all existing positions.
  // Overlay changes are handled below and never enter the layout path.
  useEffect(() => {
    if (!container.current) return;
    const modeChanged = previousMode.current !== props.showTags;
    previousMode.current = props.showTags;
    layout.current = props.geometry;
    const freshMembership = modeChanged && props.showTags;
    hovered.current = undefined; setHover(undefined);
    const positions = freshMembership && props.preview
      ? arrangeConnections(props.model, props.showTags, layout.current, true)
      : seedConnections(props.model, props.showTags, layout.current);
    layout.current = { ...layout.current, positions: { ...layout.current?.positions, ...positions } };
    const links = connectionLinks(props.model, props.showTags);
    const tagIds = new Set(props.showTags ? props.model.members.keys() : []);
    const ids = [...props.model.bookmarks.map((b) => b.id), ...tagIds];
    const bookmarkById = new Map(props.model.bookmarks.map((b) => [b.id, b]));
    const tagById = new Map(props.workspace.tags.map((t) => [t.id, t]));
    const typeColors = new Map(props.workspace.tagTypes.map((t) => [t.id, t.appearance.color]));
    // Theme reads and style rebuilding stay off the force/drag frame path.
    let colors = readColors();
    const color = (role: string) => colors[role];
    const maximumImpact = Math.max(0, ...props.impacts.values());
    const sizeOf = (id: string, z: number) => tagIds.has(id) ? Math.max(38, 18 / z)
      : splitNodeSize(props.impacts.get(id) ?? 0, maximumImpact) * Math.max(1, 0.45 / z);
    const nodes: NodeData[] = ids.map((id) => ({
      id, type: tagIds.has(id) ? "tag-shape" : "circle",
      style: { ...positions[id], size: sizeOf(id, 1), tagStyle: "price-tag", points: "right" },
    }));
    let canceled = false, rendered = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined, transformTimer: ReturnType<typeof setTimeout> | undefined;
    let moving = false, panning = false, transforming = false, styling = false;
    let styleDirty = false, motionDirty = false, exactMotion = false, saveAfterDraw = false, fitAfterDraw = false;
    setReady(false); setError("");
    const fail = (e: unknown) => { if (!canceled) setError(String(e)); };
    const g = new Graph({
      container: container.current,
      width: container.current.clientWidth,
      height: container.current.clientHeight,
      animation: false,
      zoomRange: [0.15, 4],
      data: { nodes, edges: links.map((e) => ({ id: e.id, source: e.source, target: e.target })) },
      edge: { style: { endArrow: false } },
      behaviors: [
        { type: "drag-element", key: "node-drag", trigger: [], enable: () => !latest.current.preview },
        { type: "drag-canvas", enable: (e: { targetType?: string; shiftKey?: boolean }) => e.targetType === "canvas" && !e.shiftKey, animation: false },
        { type: "scroll-canvas", enable: (e: WheelEvent) => !e.ctrlKey },
        { type: "zoom-canvas", enable: (e: WheelEvent) => e.ctrlKey, animation: false },
        { type: "brush-select", trigger: ["shift"], enableElements: ["node"], state: "boxed", mode: "union",
          enable: (e: { targetType?: string }) => e.targetType === "canvas",
          onSelect: (states: Record<string, string | string[]>) => latest.current.onBoxSelect(Object.keys(states).filter((id) => props.model.neighbors.has(id) && [states[id]].flat().includes("boxed")), true) },
        { type: "focus-adapt-label", key: "labels", padding: 5, throttle: 32,
          paused: () => !styling && (moving || panning || transforming),
          focusIds: () => [latest.current.selected, hovered.current, ...[...tagIds].filter((id) => props.model.members.get(id)?.includes(latest.current.selected ?? ""))].filter(Boolean),
          sort: (a: NodeData, b: NodeData) => {
            const priority = (id: string) => id === hovered.current ? 5 : id === latest.current.selected ? 4 : tagIds.has(id) ? 3 : id === latest.current.ranking[0]?.id ? 2 : 0;
            return priority(b.id) - priority(a.id) || a.id.localeCompare(b.id);
          } },
      ],
    });
    graph.current = g;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const dragging = new Set<string>();
    let activeGroup: ReadonlySet<string> | undefined;
    let fitOnSettle = false;
    const collision = forceCollide<ConnectionNode>().radius((n) => sizeOf(n.id, rendered ? g.getZoom() : 1) / 2 + 12);
    const simulation = connectionSimulation(props.model, props.showTags, positions).force("collide", collision);
    // Only real pins and the node under the pointer are fixed. Saved coordinates are starting points.
    simulation.force("pins-and-pointer", () => {
      for (const node of simulation.nodes()) {
        if (dragging.has(node.id)) {
          const at = g.getNodeData(node.id).style!;
          node.fx = Number(at.x); node.fy = Number(at.y);
        } else if (layout.current?.positions[node.id]?.pinned || (activeGroup && !activeGroup.has(node.id))) {
          node.fx = node.x; node.fy = node.y;
        } else { node.fx = null; node.fy = null; }
      }
    });
    // A delayed save must still belong to the arrangement that scheduled it.
    const persistLayout = props.onGeometry;
    let pinSignature: string | undefined, savedSignature: string | undefined;
    const save = () => {
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      saveTimer = undefined;
      if (canceled || !rendered) return;
      const saved = { ...layout.current?.positions };
      for (const node of g.getNodeData()) saved[node.id] = { x: Number(node.style?.x ?? 0), y: Number(node.style?.y ?? 0), pinned: saved[node.id]?.pinned ?? false };
      const anchor = g.getCanvasByViewport([g.getSize()[0] / 2, g.getSize()[1] / 2]);
      layout.current = { positions: saved, viewport: { zoom: g.getZoom(), x: anchor[0], y: anchor[1], anchor: "center" } };
      const pins = Object.entries(saved).filter(([, p]) => p.pinned).map(([id]) => id);
      const key = JSON.stringify(pins);
      if (key !== pinSignature && latest.current.showTags === props.showTags) { pinSignature = key; latest.current.onPinsChanged(pins); }
      const signature = JSON.stringify(layout.current);
      if (signature !== savedSignature) { savedSignature = signature; persistLayout(layout.current); }
    };
    const scheduleSave = () => { if (saveTimer !== undefined) clearTimeout(saveTimer); saveTimer = setTimeout(save, 180); };
    persist.current = save;
    const applyStyles = () => {
      if (!rendered || canceled) return;
      const p = latest.current, z = g.getZoom();
      const ownCluster = p.model.components.find((c) => c.includes(p.selected ?? ""));
      const nearby = new Set(ownCluster);
      const context = new Set(p.contextTag ? p.model.members.get(p.contextTag) : []);
      const pieceOf = new Map(p.preview?.pieces.flatMap((piece, i) => piece.map((id) => [id, i] as const)) ?? []);
      // The largest remaining piece stays the accent; every piece that splits off shares the split color.
      const pieceColor = (part: number) => part === 0 ? color("accent") : color("split");
      const dim = (id: string, tag: boolean) => {
        if (p.preview?.id === id) return 0.12;
        if (id === p.selected) return 1;
        if (!tag && p.highlightIds.size && p.fadeRest && !p.highlightIds.has(id)) return 0.18;
        if (context.size && !(tag ? id === p.contextTag : context.has(id))) return 0.18;
        if (p.selected && !(tag ? (p.model.members.get(id) ?? []).some((b) => nearby.has(b)) : nearby.has(id))) return 0.25;
        return 1;
      };
      g.updateNodeData(ids.map((id) => {
        const tag = tagIds.has(id), current = id === p.selected, best = id === p.ranking[0]?.id, marked = context.has(id) || p.highlightIds.has(id);
        const record = tagById.get(id), pin = layout.current?.positions[id]?.pinned;
        const tagColor = record?.appearance.color ?? typeColors.get(record?.typeId ?? "") ?? color("accent");
        const part = pieceOf.get(id), fill = part === undefined ? (tag ? tagColor : current ? color("accent") : color("graph-node")) : pieceColor(part);
        const title = tag ? record?.name ?? id : bookmarkById.get(id)?.title ?? id;
        const nearCurrent = tag && (p.model.members.get(id) ?? []).includes(p.selected ?? "");
        const fullLabel = current || id === hovered.current || nearCurrent;
        const label = fullLabel || tag || best || z > 0.9 ? `${pin ? "⌖ " : ""}${title.length > (fullLabel ? 110 : 25) ? title.slice(0, fullLabel ? 107 : 23) + "…" : title}` : "";
        const stroke = marked ? color("graph-mark") : current || best ? color("accent") : tag ? tagColor : color("graph-node-line");
        const size = sizeOf(id, z);
        const [fullWidth] = g.getSize(), { left, right } = p.covered(), width = fullWidth - right;
        const labelWidth = Math.max(80, Math.min(current ? 230 : 150, width - left - 24));
        const at = current ? g.getNodeData(id).style! : undefined;
        const screenX = at ? g.getViewportByCanvas([Number(at.x), Number(at.y)])[0] : 0;
        // A bridge can sit near the edge of its cluster. Shift only its title into view.
        const labelCenter = Math.max(left + labelWidth / 2 + 12, Math.min(width - labelWidth / 2 - 12, screenX));
        return { id, style: { size, fill, stroke, opacity: dim(id, tag), lineWidth: (current || best || marked ? 2.5 : 1.3) / z,
          halo: best || marked, haloStroke: stroke, haloFill: "transparent", haloLineWidth: 1.8 / z, haloStrokeOpacity: 1,
          haloR: size / 2 + 6 / z, haloLineDash: best ? [4 / z, 3 / z] : [],
          labelText: label, labelPlacement: nearCurrent ? "top" : "bottom", labelOffsetY: (nearCurrent ? -7 : 7) / z, labelFill: color("graph-label-strong"), labelFontSize: (current ? 13 : 11) / z,
          labelOffsetX: current ? (labelCenter - screenX) / z : 0,
          labelLineHeight: (current ? 17 : 15) / z,
          labelFontWeight: current || best ? 600 : 400, labelBackground: true, labelBackgroundFill: color("graph-label-bg"), labelBackgroundFillOpacity: 0.92,
          labelPadding: [2 / z, 4 / z], labelWordWrap: true, labelMaxWidth: labelWidth / z, labelMaxLines: current ? 3 : 2,
          zIndex: current ? 5 : tag ? 3 : 1 } };
      }));
      g.updateEdgeData(links.map((edge) => {
        const removed = p.preview && (edge.source === p.preview.id || edge.target === p.preview.id);
        const part = pieceOf.get(edge.source);
        return { id: edge.id, style: { stroke: p.preview && part !== undefined ? pieceColor(part) : color("graph-edge"),
          opacity: removed ? 0.06 : Math.min(dim(edge.source, false), dim(edge.target, props.showTags)) * 0.65,
          lineWidth: Math.min(3, 0.8 + edge.tagIds.length * 0.45) / z } };
      }));
    };
    const painted = new Map(Object.entries(positions).map(([id, at]) => [id, [at.x, at.y] as const]));
    const changedPositions = () => {
      const moved: Record<string, [number, number]> = {};
      const tolerance = exactMotion ? 0 : 0.2 / g.getZoom();
      exactMotion = false;
      for (const n of simulation.nodes()) {
        if (dragging.has(n.id) || (activeGroup && !activeGroup.has(n.id))) continue;
        const x = n.x ?? 0, y = n.y ?? 0, previous = painted.get(n.id);
        if (previous && Math.hypot(x - previous[0], y - previous[1]) <= tolerance) continue;
        moved[n.id] = [x, y]; painted.set(n.id, [x, y]);
      }
      return moved;
    };
    const drawQueue = createDrawQueue(async () => {
      if (!rendered || canceled) return;
      const moved = motionDirty ? changedPositions() : {};
      motionDirty = false;
      if (styleDirty) {
        styleDirty = false; styling = true;
        g.updateNodeData(Object.entries(moved).map(([id, [x, y]]) => ({ id, style: { x, y } })));
        applyStyles();
        try { await g.draw(); } finally { styling = false; }
      } else if (Object.keys(moved).length) {
        // G6's translate stage updates positions/incident edges without recomputing every style.
        await g.translateElementTo(moved, false);
      }
      if (saveAfterDraw) { saveAfterDraw = false; save(); }
      if (fitAfterDraw) { fitAfterDraw = false; void fit().catch(fail); }
    }, fail);
    const repaint = () => { if (rendered && !canceled) { styleDirty = true; drawQueue.request(); } };
    paint.current = repaint;
    const publishMotion = () => {
      if (canceled || !rendered) return;
      if (latest.current.preview) { simulation.stop(); return; }
      motionDirty = true; drawQueue.request();
    };
    const syncMotion = () => {
      for (const n of simulation.nodes()) {
        const at = g.getNodeData(n.id).style!;
        n.x = Number(at.x); n.y = Number(at.y); n.vx = 0; n.vy = 0;
        n.fx = dragging.has(n.id) || layout.current?.positions[n.id]?.pinned ? n.x : null;
        n.fy = n.fx === null ? null : n.y;
      }
      collision.radius((n) => sizeOf(n.id, g.getZoom()) / 2 + 12);
    };
    const startMotion = (alpha = 0.4, fitAfter = false) => {
      if (!rendered || canceled || latest.current.preview) return;
      syncMotion(); fitOnSettle = fitAfter;
      simulation.alpha(alpha).alphaTarget(0);
      moving = !reducedMotion.matches;
      if (reducedMotion.matches) {
        simulation.stop().tick(260); publishMotion();
        exactMotion = true; saveAfterDraw = true; fitAfterDraw = fitOnSettle; fitOnSettle = false;
        repaint();
      } else simulation.restart();
    };
    simulation.on("tick.connections", publishMotion);
    simulation.on("end.connections", () => {
      if (canceled) return;
      moving = false; activeGroup = undefined;
      motionDirty = true; exactMotion = true; saveAfterDraw = true;
      fitAfterDraw = fitOnSettle; fitOnSettle = false;
      repaint();
    });
    pauseMotion.current = () => {
      simulation.stop().alphaTarget(0); moving = false; activeGroup = undefined;
      motionDirty = false; exactMotion = false; fitOnSettle = false; fitAfterDraw = false; saveAfterDraw = false;
      save();
    };
    const reduceMotion = () => { if (reducedMotion.matches) pauseMotion.current(); };
    reducedMotion.addEventListener("change", reduceMotion);
    const fit = async (requested = ids) => {
      if (!rendered || canceled) return;
      const known = requested.filter((id) => g.hasNode(id));
      if (!known.length) return;
      const points = known.map((id) => g.getNodeData(id).style!);
      const xs = points.map((p) => Number(p.x)), ys = points.map((p) => Number(p.y));
      const { left, right, top, bottom } = latest.current.covered();
      const [width, height] = g.getSize();
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const z = Math.max(0.15, Math.min(1.25, (width - left - right - 90) / Math.max(180, maxX - minX + 120), (height - top - bottom - 110) / Math.max(120, maxY - minY + 100)));
      await g.zoomTo(z, false);
      if (canceled) return;
      const center = g.getViewportByCanvas([(minX + maxX) / 2, (minY + maxY) / 2]);
      await g.translateBy([(width + left - right) / 2 - center[0], (height + top - bottom) / 2 - center[1]], false);
      repaint(); save();
    };
    frame.current = (requested) => {
      fitOnSettle = false; fitAfterDraw = false;
      const p = latest.current;
      const root = requested?.find((id) => p.model.neighbors.has(id));
      const cluster = root ? p.model.components.find((c) => c.includes(root)) ?? [root] : undefined;
      const visibleTags = props.showTags && cluster ? [...p.model.members].filter(([, members]) => members.some((id) => cluster.includes(id))).map(([id]) => id) : [];
      void fit(cluster ? [...cluster, ...visibleTags] : ids).catch(fail);
    };
    relayout.current = (clear) => {
      if (!rendered) return;
      if (clear) for (const position of Object.values(layout.current?.positions ?? {})) position.pinned = false;
      activeGroup = undefined;
      startMotion(0.9, true);
    };
    g.on(NodeEvent.CLICK, (event: IElementEvent) => {
      if (tagIds.has(event.target.id)) latest.current.onTag(event.target.id);
      else latest.current.onSelect(event.target.id);
    });
    g.on(CanvasEvent.CLICK, () => latest.current.onSelect());
    g.on(CanvasEvent.DRAG_START, () => { panning = true; fitOnSettle = false; fitAfterDraw = false; });
    g.on(CanvasEvent.DRAG_END, () => {
      panning = false; transforming = false;
      if (transformTimer !== undefined) clearTimeout(transformTimer);
      hovered.current = undefined; setHover(undefined);
      repaint(); scheduleSave();
    });
    g.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => { if (!dragging.size && !panning) { hovered.current = event.target.id; setHover(event.target.id); repaint(); } });
    g.on(NodeEvent.POINTER_LEAVE, () => { if (!dragging.size && !panning) { hovered.current = undefined; setHover(undefined); repaint(); } });
    g.on(NodeEvent.DRAG_START, (event: IElementEvent) => {
      dragging.add(event.target.id); fitOnSettle = false; fitAfterDraw = false;
      activeGroup = movingConnectionIds(props.model, props.showTags, event.target.id);
      if (reducedMotion.matches) syncMotion();
      else { startMotion(0.4); simulation.alphaTarget(0.15); }
    });
    g.on(NodeEvent.DRAG_END, () => {
      for (const id of dragging) {
        const at = g.getNodeData(id).style!, node = simulation.nodes().find((n) => n.id === id)!;
        node.x = Number(at.x); node.y = Number(at.y); node.fx = node.x; node.fy = node.y;
        painted.set(id, [node.x, node.y]);
      }
      if (reducedMotion.matches) startMotion(0.5);
      dragging.clear(); simulation.alphaTarget(0);
      hovered.current = undefined; setHover(undefined);
      exactMotion = true; motionDirty = true; saveAfterDraw = true; repaint();
    });
    let lastZoom = 1;
    g.on(GraphEvent.AFTER_TRANSFORM, () => {
      if (canceled || !rendered) return;
      const z = g.getZoom();
      if (z !== lastZoom) { lastZoom = z; setZoom(z); repaint(); }
      transforming = true;
      if (transformTimer !== undefined) clearTimeout(transformTimer);
      transformTimer = setTimeout(() => { transforming = false; repaint(); }, 150);
      scheduleSave();
    });
    let measuredWidth = container.current.clientWidth, measuredHeight = container.current.clientHeight;
    const observer = new ResizeObserver(() => {
      if (!rendered || canceled || !container.current) return;
      const { clientWidth: width, clientHeight: height } = container.current;
      if (width === measuredWidth && height === measuredHeight) return;
      measuredWidth = width; measuredHeight = height;
      g.setSize(width, height);
      frame.current(latest.current.selected ? [latest.current.selected] : undefined);
    });
    observer.observe(container.current);
    const refreshColors = () => { colors = readColors(); repaint(); };
    const theme = new MutationObserver(refreshColors);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)"); scheme.addEventListener("change", refreshColors);
    void (async () => {
      await g.render();
      if (canceled) return;
      rendered = true;
      const v = freshMembership ? undefined : layout.current?.viewport;
      if (v) {
        await g.zoomTo(v.zoom, false);
        if (canceled) return;
        const center = g.getViewportByCanvas([v.x, v.y]), [width, height] = g.getSize();
        await g.translateBy([width / 2 - center[0], height / 2 - center[1]], false);
      } else await fit();
      if (canceled) return;
      repaint(); save(); setReady(true); setZoom(g.getZoom());
      startMotion(freshMembership ? 0.9 : 0.35, freshMembership || !v);
      // Navigation may arrive while G6 is rendering the changed collection.
      if (latest.current.selected && latest.current.selected !== props.selected) frame.current([latest.current.selected]);
    })().catch(fail);
    return () => {
      if (saveTimer !== undefined) { clearTimeout(saveTimer); save(); }
      canceled = true;
      drawQueue.cancel();
      reducedMotion.removeEventListener("change", reduceMotion);
      simulation.stop().on("tick.connections", null).on("end.connections", null);
      if (transformTimer !== undefined) clearTimeout(transformTimer);
      observer.disconnect(); theme.disconnect(); scheme.removeEventListener("change", refreshColors);
      paint.current = () => {}; persist.current = () => {}; frame.current = () => {}; relayout.current = () => {}; pauseMotion.current = () => {};
      if (graph.current === g) graph.current = undefined;
      g.destroy();
    };
  }, [props.model, props.showTags, retry]);

  const inspecting = Boolean(props.preview);
  useEffect(() => { if (inspecting) pauseMotion.current(); }, [inspecting]);
  useEffect(() => { paint.current(); }, [props.selected, props.preview, props.contextTag, props.highlightIds, props.fadeRest, props.boxSelection]);

  const hoveredBookmark = props.model.bookmarks.find((b) => b.id === hover);
  const hoveredTag = props.workspace.tags.find((t) => t.id === hover);
  const current = props.selected && props.model.bookmarks.find((b) => b.id === props.selected);
  return <div className="canvas-shell connections-canvas">
    <div ref={container} className="graph-canvas" role="img" aria-label={`Connections graph: ${props.model.bookmarks.length} bookmarks, ${props.showTags ? "tags shown as context nodes" : "shared-tag links"}`} />
    {!props.model.bookmarks.length && <div className="canvas-empty"><h2>No bookmarks in this view</h2><p>Clear a filter, change state, or import bookmarks.</p><button onClick={props.onClearSearch}>Clear search and filters</button><button onClick={props.onImport}>Open Import</button></div>}
    {(hoveredBookmark || hoveredTag) && <div className="connection-tooltip" role="tooltip">{hoveredBookmark?.title ?? hoveredTag?.name}
      {hoveredBookmark && <small>{props.impacts.get(hoveredBookmark.id) ?? 0} bookmarks split off from the largest remaining cluster.</small>}
      {hoveredTag && <small>{props.workspace.tagTypes.find((t) => t.id === hoveredTag.typeId)?.name ?? "Tag"} · {props.model.members.get(hoveredTag.id)?.length ?? 0} bookmarks</small>}</div>}
    {props.preview && <div className="split-legend" aria-label="Predicted remaining clusters">
      {props.preview.pieces.map((piece, i) => <span key={piece[0]} style={{ "--piece-color": i ? "var(--color-split)" : "var(--color-accent)" } as React.CSSProperties}><i />{piece.length} bookmarks</span>)}
      {!props.preview.pieces.length && <span>No bookmarks remain in this cluster.</span>}
    </div>}
    {error && <div className="canvas-error" role="alert"><strong>The graph couldn’t load</strong><p>{error}</p><button onClick={() => setRetry((n) => n + 1)}>Retry graph</button></div>}
    {props.viewControls && <div className="canvas-view layout-menu">
      <button className="tool-button view-button" aria-label="View" title="View" aria-haspopup="menu" aria-expanded={viewMenu} onClick={() => setViewMenu((open) => !open)}><Icon name="layout" size={17} /></button>
      {viewMenu && <div className="layout-menu-popover view-menu" role="menu" aria-label="View">{props.viewControls}</div>}
    </div>}
    <div className="canvas-bottom connections-tools">
      <span className="connection-scale" aria-live="polite" title="Size counts bookmarks split away from the largest remaining cluster. Drag the background to pan; Shift-drag to select.">{ready ? `${props.model.bookmarks.length} bookmarks · ${props.model.components.length} ${props.model.components.length === 1 ? "cluster" : "clusters"} · Size = bookmarks split off · dashed ring = Best next` : "Arranging connections…"}</span>
      {/* The same two groups as the Tags graph: framing, then zoom. */}
      <div className="canvas-tools">
        <div className="tool-group">
          <IconButton label="Center on the current bookmark" icon="scope" disabled={!ready || !current} onClick={() => current && frame.current([current.id])} />
          <IconButton label="Fit connections" icon="fit" disabled={!ready} onClick={() => frame.current()} />
        </div>
        <div className="tool-group">
          <IconButton label="Zoom out" icon="zoom-out" disabled={!ready} onClick={() => void graph.current?.zoomTo(Math.max(0.15, zoom / 1.25), false)} />
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" icon="zoom-in" disabled={!ready} onClick={() => void graph.current?.zoomTo(Math.min(4, zoom * 1.25), false)} />
        </div>
      </div>
    </div>
  </div>;
}
