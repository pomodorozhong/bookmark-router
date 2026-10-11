// Triage mockup: the force-directed graph stays in view while triaging, so the
// current bookmark is seen among its groups and related bookmarks. Nothing is saved.
import { Graph } from "@antv/g6";

const typeColor = { "type:existing-issue": "#0f766e", "type:proposal-issue": "#b45309", "type:topic": "#475569" };
const typeLabel = { "type:existing-issue": "Existing issue", "type:proposal-issue": "Proposal issue", "type:topic": "Topic" };
const typeSize = { "type:existing-issue": 72, "type:proposal-issue": 64, "type:topic": 52 };
const statusLabel = { pending: "Pending", done: "Done", dropped: "Dropped" };

const backup = await (await fetch("/.runtime/bookmarks-converted.json")).json();
const w = backup.workspace;
const tags = new Map(w.tags.map((t) => [t.id, t]));
const bubbles = new Map(w.bubbles.map((b) => [b.id, b]));
const links = new Map(w.bubbles.map((b) => [b.id, new Set()]));
const members = new Map(w.tags.map((t) => [t.id, new Set()]));
for (const m of w.memberships) { links.get(m.bubbleId).add(m.tagId); members.get(m.tagId).add(m.bubbleId); }

const filter = { text: "", types: new Set(["type:existing-issue", "type:proposal-issue", "type:topic"]), decided: true };
const state = { tab: "pending", current: undefined, query: "", menuIndex: 0, last: undefined, options: [] };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u ?? ""; } };
const warningsOf = (b) => (b.notes ?? []).filter((n) => /^(Link check|Possible duplicate)/.test(n.label));
const whyFor = (b, tag) => (b.notes ?? []).find((n) =>
  tag.typeId === "type:topic" ? n.label === "Why this topic" && n.text.includes(`"${tag.name}"`) : n.label === `Why ${tag.name.split(" ")[0]}`)?.text;
// The filter narrows both the graph and the queue. Text matches a bookmark's
// title, URL, or description, or the name of a group it belongs to.
function matchesText(b) {
  const q = filter.text.trim().toLowerCase();
  if (!q) return true;
  return `${b.title} ${b.url ?? ""} ${b.description}`.toLowerCase().includes(q)
    || [...links.get(b.id)].some((t) => filter.types.has(tags.get(t).typeId) && tags.get(t).name.toLowerCase().includes(q));
}
const shownBubble = (b) => matchesText(b) && (filter.decided || b.statusId === "pending" || b.id === state.current);
const visible = () => clockwise(w.bubbles.filter((b) => !state.selection || state.selection.has(b.id)).filter(matchesText).filter((b) => state.tab === "all" || b.statusId === state.tab));
// A box selection is ordered clockwise from 12 o'clock around the selection's
// center, so the queue sweeps around the graph and neighbors stay together.
function clockwise(list) {
  if (!state.selection || typeof graph === "undefined") return list;
  const at = new Map([...state.selection].map((id) => [id, graph.getElementPosition(id)]));
  const cx = [...at.values()].reduce((sum, p) => sum + p[0], 0) / at.size;
  const cy = [...at.values()].reduce((sum, p) => sum + p[1], 0) / at.size;
  const angle = (id) => { const [x, y] = at.get(id); return (Math.atan2(x - cx, cy - y) + 2 * Math.PI) % (2 * Math.PI); };
  const distance = (id) => { const [x, y] = at.get(id); return Math.hypot(x - cx, y - cy); };
  return [...list].sort((a, b) => angle(a.id) - angle(b.id) || distance(a.id) - distance(b.id));
}
const relatedOf = (id) => {
  const via = new Map();
  for (const tagId of links.get(id)) for (const other of members.get(tagId)) if (other !== id) via.set(other, [...(via.get(other) ?? []), tagId]);
  return via;
};
const edgeId = (bubbleId, tagId) => `${bubbleId}|${tagId}`;
// G6 keeps truncating at the width a label was created with, so titles are shortened here instead.
const clip = (text, length) => (text.length > length ? text.slice(0, length - 1).trimEnd() + "…" : text);

// ---- Graph ----
const boxStyle = { fill: "#2563eb", fillOpacity: 0.06, stroke: "#2563eb", lineWidth: 1, lineDash: [4, 3] };
// The box selection narrows the queue to the bookmarks inside it.
function selectBox(states, adding) {
  const ids = Object.entries(states).filter(([id, s]) => bubbles.has(id) && [s].flat().includes("selected")).map(([id]) => id);
  state.selection = ids.length || adding ? new Set([...(adding ? state.selection ?? [] : []), ...ids]) : undefined;
  state.current = state.selection && state.selection.has(state.current) ? state.current : undefined;
  // Repaint after brush-select has applied its states; keep the view where the box was drawn.
  setTimeout(() => render(false), 0);
}
// Deselect takes one bookmark out of the working set without deciding it.
function setSelected(id, on) {
  if (on) state.selection = new Set([...(state.selection ?? []), id]);
  else { state.selection?.delete(id); if (!state.selection?.size) state.selection = undefined; }
  void graph.setElementState({ [id]: on ? ["selected"] : [] }, false);
}
function clearSelection() {
  state.selection = undefined;
  const states = {};
  for (const n of graph.getNodeData()) if (graph.getElementState(n.id).includes("selected")) states[n.id] = [];
  void graph.setElementState(states, false);
  render();
}
const graph = new Graph({
  container: "graph",
  autoFit: "view",
  padding: 40,
  animation: false,
  zoomRange: [0.1, 4],
  data: {
    nodes: [
      ...w.tags.map((t) => ({ id: t.id, type: t.typeId === "type:topic" ? "rect" : "circle", data: { tag: true, label: t.name },
        style: { size: typeSize[t.typeId], fill: typeColor[t.typeId], stroke: typeColor[t.typeId], radius: 12 } })),
      ...w.bubbles.map((b) => ({ id: b.id, type: "circle", data: { tag: false, label: b.title },
        style: { size: 22, fill: "#fff", stroke: "#94a3b8", lineWidth: 2 } })),
    ],
    edges: w.memberships.map((m) => ({ id: edgeId(m.bubbleId, m.tagId), source: m.bubbleId, target: m.tagId })),
  },
  node: { style: { labelText: (d) => d.data.label, labelPlacement: "bottom", labelWordWrap: false } },
  layout: { type: "d3-force", link: { distance: 110, strength: 0.4 }, manyBody: { strength: -260 },
    collide: { radius: (d) => (d.data?.tag ? typeSize[tags.get(d.id).typeId] / 2 + 18 : 22) } },
  // Two-finger trackpad scrolling pans; pinching zooms (handled below).
  // Dragging on the canvas draws a selection box (Shift adds), so panning is
  // two-finger scrolling or the mouse wheel.
  behaviors: [
    { type: "scroll-canvas", enable: (e) => !e.ctrlKey },
    { type: "auto-adapt-label", padding: 4 },
    { type: "brush-select", key: "box", trigger: ["drag"], enableElements: ["node"], mode: "default", enable: (e) => !e.shiftKey, onSelect: (states) => selectBox(states, false), style: boxStyle },
    { type: "brush-select", key: "box-add", trigger: ["shift"], enableElements: ["node"], mode: "union", onSelect: (states) => selectBox(states, true), style: boxStyle },
  ],
  // G6's theme gives selected nodes a fixed 12-unit title; keep it screen-sized like the others.
  node: { state: { selected: { stroke: "#2563eb", lineWidth: 3, halo: true, haloStroke: "#2563eb", haloLineWidth: 10, haloStrokeOpacity: 0.18,
    labelFontSize: () => 12 / graph.getZoom(), labelFontWeight: 400 } } },
});
graph.on("node:click", (e) => { if (bubbles.has(e.target.id)) select(e.target.id); });
await graph.render();
// Pinch zoom centered on the fingers: Chromium reports a trackpad pinch as a
// Ctrl-wheel, and Safari as gesture events.
const surface = $("graph");
const zoomAt = (zoom, clientX, clientY) => {
  const rect = surface.getBoundingClientRect();
  const origin = clientX === undefined ? [rect.width / 2, rect.height / 2] : [clientX - rect.left, clientY - rect.top];
  void graph.zoomTo(Math.max(0.1, Math.min(4, zoom)), false, origin);
};
surface.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? surface.clientHeight : 1);
  zoomAt(graph.getZoom() * Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.01), e.clientX, e.clientY);
}, { passive: false, capture: true });
let gestureZoom;
surface.addEventListener("gesturestart", (e) => { e.preventDefault(); gestureZoom = graph.getZoom(); }, { passive: false });
surface.addEventListener("gesturechange", (e) => { e.preventDefault(); if (gestureZoom !== undefined) zoomAt(gestureZoom * e.scale, e.clientX, e.clientY); }, { passive: false });
surface.addEventListener("gestureend", (e) => { e.preventDefault(); gestureZoom = undefined; }, { passive: false });
// Registered after the first render: G6 emits transforms before its viewport exists.
let labelZoom, labelFrame;
graph.on("aftertransform", () => {
  if (graph.getZoom() === labelZoom) return;
  labelZoom = graph.getZoom();
  cancelAnimationFrame(labelFrame);
  labelFrame = requestAnimationFrame(() => void paintGraph(false));
});

// Titles keep a fixed size on screen, so a wide view of far-apart groups stays readable.
function paintGraph(animate) {
  const z = graph.getZoom();
  const id = state.current;
  const groupIds = id ? links.get(id) : new Set();
  const related = id ? relatedOf(id) : new Map();
  const showRelatedLabels = related.size <= 30;
  graph.updateNodeData([
    ...w.tags.map((t) => {
      const on = !id || groupIds.has(t.id);
      return { id: t.id, style: { opacity: on ? 1 : 0.18, label: on || !id, labelFill: "#1f3b33", labelFontWeight: 600,
        labelText: clip(t.name, 34), labelFontSize: 12 / z, labelOffsetY: 4 / z,
        labelBackground: groupIds.has(t.id), labelBackgroundFill: "#fff", labelBackgroundOpacity: 0.9, labelPadding: [1 / z, 4 / z], zIndex: on ? 2 : 0 } };
    }),
    ...w.bubbles.map((b) => {
      const isCurrent = b.id === id, isRelated = related.has(b.id), isSelected = !!state.selection?.has(b.id);
      const decided = b.statusId === "done" || b.statusId === "dropped";
      return { id: b.id, style: {
        size: isCurrent ? 34 : 22,
        stroke: isCurrent ? "#0f766e" : decided ? "#cbd5d1" : "#94a3b8",
        lineWidth: isCurrent ? 5 : 2,
        fill: decided ? "#eef2f0" : "#fff",
        halo: isCurrent, haloStroke: "#0f766e", haloLineWidth: 18, haloStrokeOpacity: 0.2,
        opacity: !id || isCurrent || isRelated || isSelected ? 1 : 0.15,
        label: isCurrent || (isRelated && showRelatedLabels) || (isSelected && state.selection.size <= 30),
        labelFill: isCurrent ? "#0b3b33" : "#475569", labelFontWeight: isCurrent ? 700 : 400, labelFontSize: (isCurrent ? 15 : 12) / z,
        labelText: clip(b.title, isCurrent ? 48 : 26), labelOffsetY: 4 / z,
        labelBackground: isCurrent, labelBackgroundFill: "#fff", labelBackgroundOpacity: 0.95, labelPadding: [2 / z, 6 / z],
        zIndex: isCurrent ? 5 : isRelated ? 3 : 1 } };
    }),
  ]);
  graph.updateEdgeData(w.bubbles.flatMap((b) => [...links.get(b.id)].map((tagId) => {
    const own = b.id === id, viaGroup = groupIds.has(tagId);
    return { id: edgeId(b.id, tagId), style: { stroke: own ? "#0f766e" : "#a9bdba", lineWidth: own ? 3 : 1.2, opacity: !id || own ? 1 : viaGroup ? 0.45 : 0.06 } };
  })));
  const shown = new Set(w.bubbles.filter(shownBubble).map((b) => b.id));
  const shownTags = new Set(w.tags.filter((t) => filter.types.has(t.typeId)
    && (!filter.text.trim() || t.name.toLowerCase().includes(filter.text.trim().toLowerCase()) || [...members.get(t.id)].some((m) => shown.has(m)))).map((t) => t.id));
  const visibility = {};
  for (const b of w.bubbles) visibility[b.id] = shown.has(b.id) ? "visible" : "hidden";
  for (const t of w.tags) visibility[t.id] = shownTags.has(t.id) ? "visible" : "hidden";
  for (const b of w.bubbles) for (const t of links.get(b.id)) visibility[edgeId(b.id, t)] = shown.has(b.id) && shownTags.has(t) ? "visible" : "hidden";
  $("filter-count").textContent = shown.size === w.bubbles.length && shownTags.size === w.tags.length ? "" : `${shown.size} bookmarks · ${shownTags.size} groups`;
  return graph.setElementVisibility(visibility, false).then(() => graph.draw()).then(() => (id && animate ? frame(id) : undefined));
}

// Frame the current bookmark together with all of its groups.
async function frame(id) {
  const points = [id, ...links.get(id)].map((n) => graph.getElementPosition(n));
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [width, height] = graph.getSize();
  // Screen padding leaves room for titles (up to 200px wide) around the outer nodes.
  const padX = 130, padY = 80;
  const boxWidth = Math.max(Math.max(...xs) - Math.min(...xs), 1), boxHeight = Math.max(Math.max(...ys) - Math.min(...ys), 1);
  await graph.zoomTo(Math.max(0.1, Math.min(1.2, (width - 2 * padX) / boxWidth, (height - 2 * padY) / boxHeight)), false);
  const center = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
  const [x, y] = graph.getViewportByCanvas(center);
  await graph.translateBy([width / 2 - x, height / 2 - y], { duration: 300 });
}

// ---- Panel ----
function render(animate = true) {
  const counts = Object.fromEntries(["pending", "done", "dropped"].map((s) => [s, w.bubbles.filter((b) => b.statusId === s).length]));
  const total = w.bubbles.length;
  $("bar").innerHTML = [["done", "#0f766e"], ["dropped", "#9fb1a9"]].map(([s, c]) => `<span style="width:${(counts[s] / total) * 100}%;background:${c}"></span>`).join("");
  $("counts").textContent = `${counts.done} done · ${counts.dropped} dropped · ${counts.pending} to triage`;
  $("tabs").innerHTML = [["pending", `To triage ${counts.pending}`], ["done", `Done ${counts.done}`], ["dropped", `Dropped ${counts.dropped}`], ["all", "All"]]
    .map(([k, l]) => `<button class="${state.tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("");
  const list = visible();
  if (!state.current || !bubbles.has(state.current)) state.current = list[0]?.id;
  const selectionBar = state.selection ? `<div class="selection-bar"><span title="Selected in the graph · in this tab"><strong>${state.selection.size}</strong> selected${list.length !== state.selection.size ? ` · ${list.length} here` : ""}</span><span class="bar-actions"><button id="copy" title="Copy the selected bookmarks (C)">Copy…</button><button id="clear-selection" title="Clear selection (Esc)">Clear</button></span></div>` : "";
  $("queue").innerHTML = selectionBar + list.map((b) => `<button class="queue-item ${b.id === state.current ? "on" : ""}" data-id="${b.id}"><span class="t">${esc(b.title)}</span><span class="d">${warningsOf(b).length ? '<i class="warn-dot" title="Has a warning"></i>' : ""}${esc(domain(b.url))}${b.statusId !== "pending" ? `<span class="decided">${statusLabel[b.statusId]}</span>` : ""}<span style="margin-left:auto">${links.get(b.id).size}</span></span></button>`).join("")
    || '<p style="padding:16px;color:var(--muted)">Nothing here.</p>';
  document.querySelector(".queue-item.on")?.scrollIntoView({ block: "nearest" });
  renderCard();
  void paintGraph(animate);
}

function renderCard() {
  const b = bubbles.get(state.current);
  if (!b) { $("card").innerHTML = '<p style="color:var(--muted)">All done in this view.</p>'; $("decisions").innerHTML = ""; return; }
  const cover = b.asset?.url;
  const raindropTags = (b.source?.fields?.tags ?? "").split(",").map((t) => t.trim()).filter((t) => t && t !== "indie-dev");
  const groups = [...links.get(b.id)].map((id) => tags.get(id)).sort((a, c) => a.typeId.localeCompare(c.typeId));
  const related = [...relatedOf(b.id)].sort((a, c) => c[1].length - a[1].length);
  $("card").innerHTML = `
    <div class="top ${cover ? "" : "no-image"}">
      <div><h2>${esc(b.title)}</h2>${b.url ? `<a class="url" href="${esc(b.url)}" target="_blank" rel="noreferrer">${esc(domain(b.url))} ↗</a>` : '<span class="url">No URL</span>'}</div>
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" onerror="this.remove()" />` : ""}
    </div>
    <p class="desc">${esc(b.description) || '<span style="color:var(--muted)">No description.</span>'}</p>
    ${raindropTags.length ? `<div class="raindrop">Raindrop ${raindropTags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    ${warningsOf(b).length ? `<div class="warnings">${warningsOf(b).map((n) => `<div class="warning"><strong>${esc(n.label)}</strong>${esc(n.text)}</div>`).join("")}</div>` : ""}
    <section>
      <h3>Groups (${groups.length})</h3>
      <div class="group-list">${groups.map((t) => `<div class="group"><i class="swatch" style="background:${typeColor[t.typeId]}"></i><div><span class="name">${esc(t.name)}</span><span class="type">${typeLabel[t.typeId]}</span>${whyFor(b, t) ? `<div class="why">${esc(whyFor(b, t))}</div>` : ""}</div><button data-remove="${t.id}" title="Remove from this group">✕</button></div>`).join("") || '<p style="color:var(--muted);margin:0">Not in any group yet.</p>'}</div>
      <div class="add"><input id="add" placeholder="Add to an issue or topic…  ( / )" value="${esc(state.query)}" autocomplete="off" />${state.menuOpen ? menu(b) : ""}</div>
    </section>
    <section>
      <h3>Related bookmarks (${related.length})</h3>
      <div class="related">${related.slice(0, 12).map(([id, via]) => `<button data-id="${id}"><span class="rt">${esc(bubbles.get(id).title)}</span><span class="via">via ${esc(tags.get(via[0]).name.slice(0, 24))}${via.length > 1 ? ` +${via.length - 1}` : ""}</span></button>`).join("") || '<p style="color:var(--muted);margin:0">Shares no group with another bookmark.</p>'}</div>
      ${related.length > 12 ? `<p style="color:var(--muted);font-size:12px;margin:6px 0 0">and ${related.length - 12} more, highlighted in the graph</p>` : ""}
    </section>`;
  const inSelection = !!state.selection?.has(b.id);
  $("decisions").innerHTML = `
    ${groups.length ? "" : '<span class="hint">Not in any group yet</span>'}
    <button class="keep" data-decide="done">Done<small>D</small></button>
    <button data-decide="dropped">Drop<small>X</small></button>
    <button data-deselect ${inSelection ? "" : 'disabled title="Only for bookmarks in a box selection"'}>Deselect<small>S</small></button>`;
}

function menu(b) {
  const q = state.query.toLowerCase();
  state.options = w.tags.filter((t) => !links.get(b.id).has(t.id) && t.name.toLowerCase().includes(q));
  let i = -1;
  return `<div class="menu">${["type:existing-issue", "type:proposal-issue", "type:topic"].map((type) => {
    const l = state.options.filter((t) => t.typeId === type);
    return l.length ? `<div class="label">${typeLabel[type]}</div>${l.map((t) => { i++; return `<button data-add="${t.id}" class="${i === state.menuIndex ? "hl" : ""}"><i class="swatch" style="background:${typeColor[type]}"></i>${esc(t.name)}</button>`; }).join("")}` : "";
  }).join("") || '<div class="label">No match</div>'}</div>`;
}

// ---- Actions ----
function select(id) { state.current = id; state.query = ""; state.menuOpen = false; render(); }
// Done, Drop, and Deselect all move on to the next bookmark in the queue.
function advance(from) {
  const list = visible();
  const index = from.findIndex((b) => b.id === state.current);
  state.menuOpen = false; state.query = "";
  state.current = (from[index + 1] ?? from[index - 1])?.id;
  if (!list.some((b) => b.id === state.current)) state.current = list[0]?.id;
}
function decide(status) {
  const before = visible();
  const b = bubbles.get(state.current);
  state.last = { kind: "status", id: b.id, status: b.statusId };
  b.statusId = status;
  advance(before);
  toast(`${statusLabel[status]}: ${b.title.slice(0, 50)}`);
  render();
}
function deselect() {
  const before = visible();
  const id = state.current;
  if (!state.selection?.has(id)) return;
  state.last = { kind: "deselect", id };
  setSelected(id, false);
  advance(before);
  toast(`Deselected: ${bubbles.get(id).title.slice(0, 50)}`);
  render();
}
function toast(text) {
  $("toast").innerHTML = `${esc(text)} <button id="undo">Undo</button>`;
  $("toast").style.display = "flex";
  clearTimeout(toast.t); toast.t = setTimeout(() => ($("toast").style.display = "none"), 4000);
}
function move(step) {
  const list = visible();
  const i = list.findIndex((b) => b.id === state.current);
  select(list[Math.max(0, Math.min(list.length - 1, i + step))]?.id);
}
function setLink(tagId, on) {
  const id = state.current;
  if (on) { links.get(id).add(tagId); members.get(tagId).add(id); graph.addEdgeData([{ id: edgeId(id, tagId), source: id, target: tagId }]); }
  else { links.get(id).delete(tagId); members.get(tagId).delete(id); graph.removeEdgeData([edgeId(id, tagId)]); }
  state.query = "";
  render();
}
// ---- Copy ----
// Copies the selected bookmarks, in queue order, through a template. The last
// template is remembered on this device.
const presets = [
  ["Markdown list", "- [{title}]({url})", "\n"],
  ["Title + link", "{title}\n{url}", "\n\n"],
  ["Links only", "{url}", "\n"],
  ["Titles only", "{title}", "\n"],
  ["With groups", "- [{title}]({url}) — {groups}", "\n"],
];
const fields = {
  title: (b) => b.title, url: (b) => b.url ?? "", domain: (b) => domain(b.url),
  description: (b) => b.description.replace(/\s+/g, " ").trim(), status: (b) => statusLabel[b.statusId],
  groups: (b) => [...links.get(b.id)].map((t) => tags.get(t).name).join(", "),
  issues: (b) => [...links.get(b.id)].map((t) => tags.get(t)).filter((t) => t.typeId !== "type:topic").map((t) => t.name).join(", "),
  topics: (b) => [...links.get(b.id)].map((t) => tags.get(t)).filter((t) => t.typeId === "type:topic").map((t) => t.name).join(", "),
};
const savedCopy = (() => { try { return JSON.parse(localStorage.getItem("triage-copy") ?? "null"); } catch { return null; } })();
const copy = { template: savedCopy?.template ?? presets[0][1], separator: savedCopy?.separator ?? presets[0][2], scope: "all" };
const copyOpen = () => !$("copy-dialog").hidden;
function copyItems() {
  const selected = clockwise(w.bubbles.filter((b) => state.selection?.has(b.id)));
  return copy.scope === "queue" ? visible() : selected;
}
function copyText(n = Infinity) {
  return copyItems().slice(0, n).map((b, i) => copy.template.replace(/\{(\w+)\}/g, (m, k) => (k === "n" ? String(i + 1) : fields[k] ? fields[k](b) : m))).join(copy.separator);
}
function renderCopy() {
  const items = copyItems();
  $("copy-dialog").innerHTML = `<div class="copy-box" role="dialog" aria-label="Copy selected bookmarks">
    <div class="copy-head"><h3>Copy ${items.length} bookmark${items.length === 1 ? "" : "s"}</h3><button id="copy-close" title="Close (Esc)">✕</button></div>
    <div class="presets">${presets.map(([name, t, sep]) => `<button data-preset="${esc(name)}" class="${copy.template === t && copy.separator === sep ? "on" : ""}">${esc(name)}</button>`).join("")}</div>
    <label>Template<textarea id="copy-template" rows="2" spellcheck="false">${esc(copy.template)}</textarea></label>
    <p class="fields">Fields: ${Object.keys(fields).concat("n").map((k) => `<code>{${k}}</code>`).join(" ")}</p>
    <div class="copy-row">
      <label>Between items<select id="copy-separator">${[["\n", "New line"], ["\n\n", "Blank line"], [", ", "Comma"], [" ", "Space"]].map(([v, l]) => `<option value="${esc(JSON.stringify(v))}" ${copy.separator === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Bookmarks<select id="copy-scope"><option value="all" ${copy.scope === "all" ? "selected" : ""}>All selected (${clockwise(w.bubbles.filter((b) => state.selection?.has(b.id))).length})</option><option value="queue" ${copy.scope === "queue" ? "selected" : ""}>Only this tab (${visible().length})</option></select></label>
    </div>
    <pre class="preview">${esc(copyText(40))}${items.length > 40 ? "\n…" : ""}</pre>
    <div class="copy-foot"><span class="subtle">Clockwise order, as in the queue</span><button id="copy-go" class="keep">Copy text</button></div>
  </div>`;
}
function openCopy() { $("copy-dialog").hidden = false; renderCopy(); $("copy-go").focus(); }
function closeCopy() { $("copy-dialog").hidden = true; }
function saveCopy() { try { localStorage.setItem("triage-copy", JSON.stringify({ template: copy.template, separator: copy.separator })); } catch {} }
$("copy-dialog").addEventListener("click", async (e) => {
  if (e.target.id === "copy-dialog" || e.target.id === "copy-close") return closeCopy();
  const preset = e.target.closest("[data-preset]")?.dataset.preset;
  if (preset) { const [, t, sep] = presets.find(([n]) => n === preset); copy.template = t; copy.separator = sep; saveCopy(); return renderCopy(); }
  if (e.target.id === "copy-go") {
    const text = copyText();
    try { await navigator.clipboard.writeText(text); } catch { window.__lastCopy = text; }
    window.__lastCopy = text;
    closeCopy();
    $("toast").innerHTML = `Copied ${copyItems().length} bookmarks`; $("toast").style.display = "flex";
    clearTimeout(toast.t); toast.t = setTimeout(() => ($("toast").style.display = "none"), 2500);
  }
});
$("copy-dialog").addEventListener("input", (e) => {
  if (e.target.id === "copy-template") { copy.template = e.target.value; saveCopy(); }
  if (e.target.id === "copy-separator") { copy.separator = JSON.parse(e.target.value); saveCopy(); }
  if (e.target.id === "copy-scope") copy.scope = e.target.value;
  document.querySelector("#copy-dialog .preview").textContent = copyText(40) + (copyItems().length > 40 ? "\n…" : "");
  document.querySelectorAll("[data-preset]").forEach((b) => { const [, t, sep] = presets.find(([n]) => n === b.dataset.preset); b.classList.toggle("on", copy.template === t && copy.separator === sep); });
  if (e.target.id === "copy-scope") renderCopy();
});
document.addEventListener("keydown", (e) => { if (copyOpen() && e.key === "Escape") closeCopy(); });

function keepMenuFocus() { const i = $("add"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }

document.addEventListener("click", (e) => {
  const t = e.target.closest?.("button"); if (!t) return;
  if (t.id === "undo") {
    const b = bubbles.get(state.last.id);
    if (state.last.kind === "deselect") setSelected(b.id, true); else b.statusId = state.last.status;
    $("toast").style.display = "none";
    return select(b.id);
  }
  if (t.id === "copy") return openCopy();
  if (t.dataset.deselect !== undefined) return deselect();
  if (t.id === "clear-selection") return clearSelection();
  if (t.id === "fit") return void graph.fitView({}, { duration: 300 });
  if (t.id === "focus") return void (state.current && frame(state.current));
  if (t.id === "toggle-queue") { $("main").classList.toggle("queue-closed"); return void setTimeout(() => graph.resize(), 0); }
  if (t.dataset.tab) { state.tab = t.dataset.tab; state.current = undefined; return render(); }
  if (t.dataset.id) return select(t.dataset.id);
  if (t.dataset.remove) return setLink(t.dataset.remove, false);
  if (t.dataset.add) { state.menuOpen = false; return setLink(t.dataset.add, true); }
  if (t.dataset.decide) return decide(t.dataset.decide);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "filter-text") { filter.text = e.target.value; state.current = undefined; return render(); }
  if (e.target.dataset?.type) { e.target.checked ? filter.types.add(e.target.dataset.type) : filter.types.delete(e.target.dataset.type); return render(false); }
  if (e.target.id === "filter-decided") { filter.decided = e.target.checked; return render(false); }
  if (e.target.id !== "add") return;
  state.query = e.target.value; state.menuIndex = 0; state.menuOpen = true;
  renderCard(); keepMenuFocus();
});
document.addEventListener("focusin", (e) => { if (e.target.id === "add" && !state.menuOpen) { state.menuOpen = true; renderCard(); keepMenuFocus(); } });
document.addEventListener("mousedown", (e) => { if (state.menuOpen && !e.target.closest?.(".add")) { state.menuOpen = false; state.query = ""; renderCard(); } });
document.addEventListener("keydown", (e) => {
  if (copyOpen()) return;
  if (e.target.id === "filter-text") { if (e.key === "Escape") { e.target.value = ""; filter.text = ""; e.target.blur(); render(); } return; }
  if (e.target.id === "add") {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); state.menuIndex = Math.max(0, Math.min(state.options.length - 1, state.menuIndex + (e.key === "ArrowDown" ? 1 : -1))); renderCard(); keepMenuFocus(); }
    if (e.key === "Enter" && state.options[state.menuIndex]) { setLink(state.options[state.menuIndex].id, true); state.menuOpen = true; renderCard(); keepMenuFocus(); }
    if (e.key === "Escape") { state.query = ""; state.menuOpen = false; e.target.blur(); renderCard(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const b = bubbles.get(state.current);
  const key = e.key.toLowerCase();
  if (e.key === "/") { e.preventDefault(); $("add")?.focus(); }
  else if (key === "f") { e.preventDefault(); $("filter-text").focus(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (key === "q") $("toggle-queue").click();
  else if (e.key === "Escape" && state.selection) clearSelection();
  else if (key === "c" && state.selection) openCopy();
  else if (!b) return;
  else if (key === "d") decide("done");
  else if (key === "x") decide("dropped");
  else if (key === "s") deselect();
});
render();
