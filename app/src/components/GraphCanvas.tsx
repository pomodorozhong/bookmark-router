import { useEffect, useRef, useState } from 'react';
import { Graph, GraphEvent, NodeEvent, type IElementEvent, type NodeData } from '@antv/g6';
import { appearanceFor, type Workspace } from '../domain/model';
export function GraphCanvas({ workspace, selected, onSelect, query }: { workspace: Workspace; selected?: string; onSelect: (id: string) => void; query: string }) {
  const container = useRef<HTMLDivElement>(null), graph = useRef<Graph | null>(null), onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [status, setStatus] = useState('Placing your collection…'), [retry, setRetry] = useState(0), [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!container.current) return;
    let canceled = false, timer: ReturnType<typeof setInterval> | undefined;
    setReady(false); setError('');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes: NodeData[] = [
      ...workspace.tags.map<NodeData>((tag, i) => { const a = appearanceFor(tag, workspace); return { id: tag.id, type: a.shape === 'rounded-square' ? 'rect' : a.shape, data: { label: tag.name, tag: true }, style: { x: 140 + i * 170, y: 200, size: a.size, radius: 14, fill: a.color, stroke: a.color, labelFill: '#fff', labelPlacement: 'center', labelFontWeight: 600 } }; }),
      ...workspace.bubbles.map<NodeData>((bubble, i) => ({ id: bubble.id, type: 'circle', data: { label: bubble.title }, style: { x: 90 + i % 6 * 90, y: 120 + Math.floor(i / 6) * 200, size: 25, fill: '#fff', stroke: '#94a3b8', lineWidth: 2, labelFill: '#475569', labelPlacement: 'bottom' } })),
    ];
    const g = new Graph({ container: container.current, width: container.current.clientWidth, height: container.current.clientHeight, padding: 55, animation: false, zoomRange: [.15, 4],
      data: { nodes, edges: workspace.memberships.map(m => ({ id: m.id, source: m.bubbleId, target: m.tagId })) },
      node: { style: { labelText: d => String(d.data?.label ?? ''), labelFontSize: 11 } }, edge: { style: { stroke: '#a9bdba', lineWidth: 1.2, endArrow: false } },
      layout: { type: 'd3-force', animation: !reduced, link: { distance: 120, strength: .45 }, manyBody: { strength: -250 }, collide: { radius: d => d.data?.tag ? Number(d.style?.size ?? 64) / 2 + 20 : 34 }, alphaDecay: .035, velocityDecay: .45 },
      behaviors: [{ type: reduced ? 'drag-element' : 'drag-element-force', key: 'node-drag', fixed: true, trigger: [] }, { type: 'scroll-canvas', key: 'pan', sensitivity: 1, enable: (e: WheelEvent) => !e.ctrlKey }],
    });
    graph.current = g;
    const surface = container.current;
    const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
      const rect = surface.getBoundingClientRect();
      const origin: [number, number] = clientX === undefined || clientY === undefined ? [rect.width / 2, rect.height / 2] : [clientX - rect.left, clientY - rect.top];
      void g.zoomTo(Math.max(.15, Math.min(4, scale)), false, origin).catch(e => { if (!canceled) setError(String(e)); });
    };
    // Chromium reports trackpad pinch as Ctrl-wheel, independent of ordinary scrolling.
    const pinchWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
      zoomAt(g.getZoom() * Math.exp(-Math.max(-100, Math.min(100, pixels)) * .01), event.clientX, event.clientY);
    };
    // Safari exposes native trackpad gestures separately from wheel events.
    let gestureZoom: number | undefined;
    const gestureStart = (event: Event) => { event.preventDefault(); gestureZoom = g.getZoom(); };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale: number; clientX?: number; clientY?: number };
      if (gestureZoom !== undefined && Number.isFinite(gesture.scale)) zoomAt(gestureZoom * gesture.scale, gesture.clientX, gesture.clientY);
    };
    const gestureEnd = (event: Event) => { event.preventDefault(); gestureZoom = undefined; };
    surface.addEventListener('wheel', pinchWheel, { passive: false, capture: true });
    surface.addEventListener('gesturestart', gestureStart, { passive: false });
    surface.addEventListener('gesturechange', gestureChange, { passive: false });
    surface.addEventListener('gestureend', gestureEnd, { passive: false });
    g.on(GraphEvent.AFTER_TRANSFORM, () => { if (!canceled) setZoom(g.getZoom()); });
    g.on(NodeEvent.CLICK, (event: IElementEvent) => onSelectRef.current(event.target.id));
    let changes = 0, last = 0, previous = '', layouts = 0;
    g.on(GraphEvent.BEFORE_LAYOUT, () => { layouts++; });
    const observer = new ResizeObserver(() => { if (!canceled && container.current) g.setSize(container.current.clientWidth, container.current.clientHeight); });
    observer.observe(container.current);
    void g.render().then(async () => {
      if (canceled) return;
      await g.fitView();
      if (canceled) return;
      setReady(true);
      timer = setInterval(() => {
        if (canceled) return;
        const next = JSON.stringify(g.getNodeData().map(n => [n.id, n.style?.x, n.style?.y]));
        if (next !== previous) { previous = next; last = performance.now(); changes++; }
        setStatus(`${performance.now() - last < 400 ? 'Layout moving' : 'Layout settled'} · ${layouts} layout run${layouts === 1 ? '' : 's'} · ${changes} position samples`);
      }, 200);
    }).catch(e => { if (!canceled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { canceled = true; if (timer) clearInterval(timer); observer.disconnect(); surface.removeEventListener('wheel', pinchWheel, true); surface.removeEventListener('gesturestart', gestureStart); surface.removeEventListener('gesturechange', gestureChange); surface.removeEventListener('gestureend', gestureEnd); graph.current = null; g.destroy(); };
  }, [workspace.id, retry]);
  useEffect(() => {
    const g = graph.current;
    if (!ready || !g) return;
    const term = query.toLowerCase();
    const matching = new Set(workspace.bubbles.filter(b => `${b.title} ${b.description} ${b.url ?? ''}`.toLowerCase().includes(term)).map(b => b.id));
    const visibility: Record<string, 'visible' | 'hidden'> = {};
    for (const b of workspace.bubbles) visibility[b.id] = matching.has(b.id) ? 'visible' : 'hidden';
    for (const m of workspace.memberships) visibility[m.id] = matching.has(m.bubbleId) ? 'visible' : 'hidden';
    g.updateNodeData(workspace.tags.map(tag => ({ id: tag.id, style: { stroke: tag.id === selected ? '#183e35' : appearanceFor(tag, workspace).color, lineWidth: tag.id === selected ? 4 : 1, halo: tag.id === selected, haloStroke: '#0f766e', haloLineWidth: 12, haloStrokeOpacity: .25 } })));
    g.setEdge({ style: { stroke: edge => edge.source === selected || edge.target === selected ? '#0f766e' : '#a9bdba', lineWidth: edge => edge.source === selected || edge.target === selected ? 2.5 : 1.2, endArrow: false } });
    g.updateNodeData(workspace.bubbles.map(b => ({ id: b.id, style: { stroke: b.id === selected ? '#0f766e' : '#94a3b8', lineWidth: b.id === selected ? 4 : 2 } })));
    void g.setElementVisibility(visibility, false).then(() => g.draw()).catch(e => setError(String(e)));
  }, [ready, selected, query, workspace]);
  async function action(work: (g: Graph) => Promise<unknown>) { if (!graph.current || !ready) return; try { await work(graph.current); } catch (e) { setError(String(e)); } }
  return <div className="canvas-shell">
    <div className="canvas-top"><span className="eyebrow">G6 5.1.1 · UNDIRECTED MEMBERSHIPS</span><span className="subtle">Two fingers to pan · Pinch to zoom · Drag a node to pull its neighbors</span></div>
    <div ref={container} className="graph-canvas" role="img" aria-label="Force-directed bubble and tag graph" />
    {error && <div className="canvas-error" role="alert"><strong>The graph couldn’t load</strong><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Retry graph</button><p>Your collection is available in the list.</p></div>}
    <div className="canvas-bottom"><span className="subtle" role="status">{status} · {Math.round(zoom * 100)}%</span><div className="flex gap-2"><button disabled={!ready} onClick={() => void action(g => g.fitView())}>Fit graph</button><button aria-label="Zoom out" disabled={!ready} onClick={() => void action(g => g.zoomBy(.8))}>−</button><button aria-label="Zoom in" disabled={!ready} onClick={() => void action(g => g.zoomBy(1.25))}>+</button></div></div>
  </div>;
}
