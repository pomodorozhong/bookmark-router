import { readZoomDetails, zoomDetailDefaults } from "../src/data/zoom-details";
import { fitLabelledPoints } from "../src/data/viewport";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { Dataset, Target } from "../src/data/types";
import {
  isComplete,
  inQueue,
  normalizedUrl,
  referenceDrafts,
  today,
} from "../src/data/selectors";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  createLayoutGraph,
  CENTER_ID,
  linkedNodeIds,
  forceSettings,
  separateOverlaps,
  deriveGraph,
  settle,
} from "../src/data/graph";
import { validateDataset } from "../server/validation";
import { Store } from "../server/store";
import { createApi } from "../server/api";
const original = JSON.parse(
  await readFile(new URL("./fixtures/bookmarks.json", import.meta.url), "utf8"),
) as Dataset;
const clone = () => structuredClone(original);
const target = (
  number: number,
  state: Target["placement_status"] = "pending",
): Target => ({
  kind: "existing_issue",
  issue_number: number,
  placement_status: state,
  confirmation_url:
    state === "pending"
      ? null
      : original.issue_catalog.find((i) => i.number === number)!.url,
  confirmed_on: state === "pending" ? null : today(),
  note: "",
});
const approved = (d: Dataset, index = 0) => {
  const b = d.bookmarks[index];
  b.classification.approved_category_id = b.classification.proposed_category_id;
  b.classification.status = "approved";
  return b;
};
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "bookmark-router-test-"));
  const file = join(dir, "bookmarks.json");
  await writeFile(file, JSON.stringify(original));
  return { dir, file, store: new Store(file, join(dir, "backups")) };
}

test("supplied import validates, preserves all originals, starts at zero and finds four explicit alternatives", () => {
  validateDataset(original);
  assert.equal(original.bookmarks.length, 148);
  assert.equal(original.bookmarks.filter(isComplete).length, 0);
  assert.equal(
    original.bookmarks.filter((b) => inQueue(b, "alternatives", original))
      .length,
    4,
  );
  assert.deepEqual(
    clone().bookmarks.map((b) => b.original),
    original.bookmarks.map((b) => b.original),
  );
});
test("category approval is separate from multi-target completion; deferred never completes", () => {
  const d = clone(),
    b = approved(d);
  assert.equal(isComplete(b), false);
  b.processing = {
    ...b.processing,
    review_status: "decided",
    disposition: "attach",
    selected_targets: [target(133, "added"), target(143)],
  };
  validateDataset(d);
  assert.equal(isComplete(b), false);
  b.processing.selected_targets[1] = target(143, "already_present");
  validateDataset(d);
  assert.equal(isComplete(b), true);
  b.processing.selected_targets = [];
  b.processing.disposition = "defer";
  b.processing.defer_reason = "Check later";
  validateDataset(d);
  assert.equal(isComplete(b), false);
});
test("completion validity covers kept, skipped and confirmed duplicates", () => {
  const d = clone(),
    b = approved(d);
  b.processing.review_status = "decided";
  b.processing.disposition = "keep";
  validateDataset(d);
  assert.ok(isComplete(b));
  b.processing.disposition = "skip";
  assert.throws(() => validateDataset(d), /skip requires/);
  b.processing.user_notes = "Out of scope";
  validateDataset(d);
  b.processing.disposition = "duplicate";
  assert.throws(() => validateDataset(d), /canonical/);
  b.duplicate_review.status = "confirmed";
  b.duplicate_review.confirmed_duplicate_of = d.bookmarks[1].id;
  validateDataset(d);
  assert.ok(isComplete(b));
});
test("invalid references, duplicate IDs, cycles and confirmations are rejected", () => {
  const d = clone();
  d.bookmarks[0].classification.approved_category_id = "missing";
  assert.throws(() => validateDataset(d), /category/);
  const du = clone();
  du.bookmarks[1].id = du.bookmarks[0].id;
  assert.throws(() => validateDataset(du), /Duplicate bookmark/);
  const cycle = clone();
  cycle.bookmarks[0].duplicate_review = {
    ...cycle.bookmarks[0].duplicate_review,
    status: "confirmed",
    confirmed_duplicate_of: cycle.bookmarks[1].id,
  };
  cycle.bookmarks[1].duplicate_review = {
    ...cycle.bookmarks[1].duplicate_review,
    status: "confirmed",
    confirmed_duplicate_of: cycle.bookmarks[0].id,
  };
  assert.throws(() => validateDataset(cycle), /cycle/);
  const missing = clone(),
    b = approved(missing);
  b.processing.disposition = "attach";
  b.processing.selected_targets = [target(133, "added")];
  b.processing.selected_targets[0].confirmed_on = null;
  assert.throws(() => validateDataset(missing), /URL and date/);
});
test("uncreated proposals stay pending and resolve without duplicate edges", () => {
  const d = clone(),
    p = d.bookmarks_worth_their_own_issues[0],
    b = approved(d);
  b.processing = {
    ...b.processing,
    review_status: "decided",
    disposition: "attach",
    selected_targets: [
      {
        kind: "proposed_issue",
        proposal_id: p.id,
        placement_status: "pending",
        confirmation_url: null,
        confirmed_on: null,
        note: "",
      },
    ],
  };
  validateDataset(d);
  assert.equal(isComplete(b), false);
  b.processing.selected_targets[0].placement_status = "added";
  b.processing.selected_targets[0].confirmation_url = d.issue_catalog[0].url;
  b.processing.selected_targets[0].confirmed_on = today();
  assert.throws(() => validateDataset(d), /register proposal/);
  p.created_issue_number = 133;
  p.created_issue_url = d.issue_catalog.find((i) => i.number === 133)!.url;
  p.status = "created";
  validateDataset(d);
  b.processing.selected_targets.push(target(133));
  assert.throws(() => validateDataset(d), /duplicate resolved/);
  b.processing.selected_targets.pop();
  const graph = deriveGraph(d, "proposed");
  assert.equal(
    graph.edges.filter(
      (e) => e.source === `bookmark:${b.id}` && e.target === "issue:133",
    ).length,
    1,
  );
  assert.equal(
    graph.nodes.filter((n) => n.id === `bookmark:${b.id}`).length,
    1,
  );
});
test("graph keeps topic-only bookmarks and seeded positions/pins stable", () => {
  const d = clone(),
    g = deriveGraph(d, "proposed");
  assert.equal(g.nodes.filter((n) => n.kind === "bookmark").length, 148);
  const noDestination = d.bookmarks.find(
    (b) =>
      !g.edges.some(
        (e) => e.source === `bookmark:${b.id}` && e.kind !== "topic",
      ),
  )!;
  assert.ok(
    g.edges.some(
      (e) => e.source === `bookmark:${noDestination.id}` && e.kind === "topic",
    ),
  );
  const pos = settle(g.nodes, g.edges),
    again = settle(g.nodes, g.edges);
  assert.deepEqual(pos, again);
  pos[g.nodes[0].id].pinned = true;
  const reset = settle(g.nodes, g.edges, pos, true);
  assert.deepEqual(reset[g.nodes[0].id], pos[g.nodes[0].id]);
  const retained = settle(g.nodes, g.edges, pos);
  assert.deepEqual(retained, pos);
  const approvedGraph = deriveGraph(d, "approved");
  assert.equal(
    approvedGraph.edges.filter((e) => e.target === "topic:unapproved").length,
    148,
  );
});
test("Markdown includes only accepted pending placements and preserves video IDs during normalization", () => {
  const d = clone(),
    b = approved(d);
  b.display_title = "A [title] *and*";
  b.url = "https://youtube.com/watch?v=abc&utm_source=tracking";
  b.processing = {
    ...b.processing,
    review_status: "decided",
    disposition: "attach",
    selected_targets: [target(133), target(143, "added")],
  };
  const drafts = referenceDrafts(d);
  assert.equal(drafts.length, 1);
  assert.match(drafts[0].markdown, /\\\[title\\\]/);
  assert.match(drafts[0].markdown, /v=abc/);
  assert.equal(normalizedUrl(b.url), "https://youtube.com/watch?v=abc");
  assert.equal(isComplete(b), false);
  b.processing.disposition = "defer";
  assert.equal(referenceDrafts(d).length, 0);
});
test("serialized storage backs up, survives restart, preserves originals and rejects stale/external edits", async () => {
  const f = await fixture();
  try {
    const initial = await f.store.read();
    const first = await f.store.transaction(1, initial.hash, (d) =>
      f.store.patchBookmark(d, d.bookmarks[0].id, { display_title: "Changed" }),
    );
    assert.equal(first.data.metadata.revision, 2);
    assert.equal((await readdir(join(f.dir, "backups"))).length, 1);
    assert.deepEqual(
      first.data.bookmarks.map((b) => b.original),
      original.bookmarks.map((b) => b.original),
    );
    assert.equal(
      (await new Store(f.file, join(f.dir, "backups")).read()).data.bookmarks[0]
        .display_title,
      "Changed",
    );
    await assert.rejects(
      f.store.transaction(1, initial.hash, () => {}),
      /changed/,
    );
    await writeFile(
      f.file,
      JSON.stringify({
        ...first.data,
        metadata: { ...first.data.metadata, title: "External edit" },
      }),
    );
    await assert.rejects(
      f.store.transaction(2, first.hash, () => {}),
      /changed/,
    );
    const current = await f.store.read();
    const results = await Promise.allSettled([
      f.store.transaction(2, current.hash, (d) =>
        f.store.patchBookmark(d, d.bookmarks[0].id, { favorite: true }),
      ),
      f.store.transaction(2, current.hash, (d) =>
        f.store.patchBookmark(d, d.bookmarks[1].id, { favorite: true }),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("failed backup and invalid writes retain the working file", async () => {
  const f = await fixture();
  try {
    const initial = await f.store.read();
    await assert.rejects(
      f.store.transaction(1, initial.hash, (d) =>
        f.store.patchBookmark(d, d.bookmarks[0].id, {
          processing: { disposition: "skip" },
        }),
      ),
      /skip requires/,
    );
    assert.equal((await f.store.read()).hash, initial.hash);
    const badBackups = join(f.dir, "not-a-directory");
    await writeFile(badBackups, "x");
    const broken = new Store(f.file, badBackups);
    await assert.rejects(
      broken.transaction(1, initial.hash, (d) =>
        broken.patchBookmark(d, d.bookmarks[0].id, { favorite: true }),
      ),
    );
    assert.equal((await f.store.read()).hash, initial.hash);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("undo restores a compound save and retains audit history", async () => {
  const f = await fixture();
  try {
    const initial = await f.store.read();
    const result = await f.store.transaction(1, initial.hash, (d) => {
      const b = d.bookmarks[0];
      f.store.patchBookmark(d, b.id, {
        display_title: "New title",
        classification: {
          approved_category_id: b.classification.proposed_category_id,
          status: "approved",
        },
        processing: { review_status: "decided", disposition: "keep" },
      });
    });
    assert.ok(isComplete(result.data.bookmarks[0]));
    const undone = await f.store.transaction(2, result.hash, (d) =>
      f.store.undo(d, d.bookmarks[0].id),
    );
    assert.equal(
      undone.data.bookmarks[0].display_title,
      original.bookmarks[0].display_title,
    );
    assert.equal(isComplete(undone.data.bookmarks[0]), false);
    assert.ok(
      undone.data.bookmarks[0].history.some((h) => h.action === "undo"),
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("proposal rejection returns attachments to review without completing them", () => {
  const d = clone(),
    b = approved(d),
    p = d.bookmarks_worth_their_own_issues[0];
  b.processing = {
    ...b.processing,
    review_status: "decided",
    disposition: "attach",
    selected_targets: [
      {
        kind: "proposed_issue",
        proposal_id: p.id,
        placement_status: "pending",
        confirmation_url: null,
        confirmed_on: null,
        note: "",
      },
    ],
  };
  new Store("", "").patchProposal(d, p.id, { status: "rejected" });
  validateDataset(d);
  assert.equal(b.processing.disposition, "undecided");
  assert.equal(b.processing.review_status, "reviewing");
  assert.equal(isComplete(b), false);
});
test("HTTP API enforces same origin/token and previews imports without writing", async () => {
  const f = await fixture();
  const server = createApi(f.store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const env = await (await fetch(`${base}/api/dataset`)).json();
    const body = JSON.stringify({
      revision: 1,
      hash: env.hash,
      patch: { favorite: true },
    });
    assert.equal(
      (
        await fetch(`${base}/api/bookmarks/${original.bookmarks[0].id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/bookmarks/${original.bookmarks[0].id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": env.token,
            Origin: "https://attacker.example",
          },
          body,
        })
      ).status,
      403,
    );
    const headers = {
      "Content-Type": "application/json",
      "x-session-token": env.token,
    };
    const preview = await fetch(`${base}/api/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: original, confirm: false }),
    });
    assert.equal(preview.status, 200);
    assert.equal((await f.store.read()).hash, env.hash);
    const invalid = clone();
    invalid.bookmarks[0].id = "missing";
    assert.equal(
      (
        await fetch(`${base}/api/import`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: invalid,
            confirm: true,
            revision: 1,
            hash: env.hash,
          }),
        })
      ).status,
      422,
    );
    assert.equal((await f.store.read()).hash, env.hash);
    assert.equal(
      (
        await fetch(`${base}/api/bookmarks/${original.bookmarks[0].id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            revision: 1,
            hash: env.hash,
            patch: { original: { title: "overwrite" } },
          }),
        })
      ).status,
      422,
    );
  } finally {
    server.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("ForceAtlas2 drag moves connected neighbors while respecting fixed nodes", () => {
  const nodes = ["dragged", "neighbor", "pinned"].map((id) => ({
    id,
    kind: "bookmark" as const,
    label: id,
    subtitle: "",
    count: 0,
    radius: 10,
  }));
  const graph = createLayoutGraph(
    nodes,
    [
      {
        id: "a",
        source: "dragged",
        target: "neighbor",
        kind: "topic",
        label: "",
      },
      {
        id: "b",
        source: "neighbor",
        target: "pinned",
        kind: "topic",
        label: "",
      },
    ],
    {
      dragged: { x: 0, y: 0 },
      neighbor: { x: 100, y: 0 },
      pinned: { x: 200, y: 0, pinned: true },
    },
  );
  assert.equal(graph.getNodeAttribute("neighbor", "fixed"), false);
  graph.mergeNodeAttributes("dragged", { x: -100, y: 80, fixed: true });
  forceAtlas2.assign(graph, { iterations: 80, settings: forceSettings });
  assert.equal(graph.getNodeAttribute("dragged", "x"), -100);
  assert.equal(graph.getNodeAttribute("dragged", "y"), 80);
  assert.equal(graph.getNodeAttribute("pinned", "x"), 200);
  assert.equal(graph.getNodeAttribute("pinned", "y"), 0);
  assert.ok(
    Math.hypot(
      graph.getNodeAttribute("neighbor", "x") - 100,
      graph.getNodeAttribute("neighbor", "y"),
    ) > 1,
  );
});

test("hidden center tethers orphan hubs and stays out of saved layouts and linked fits", () => {
  const nodes = ["orphan", "connected", "bubble"].map((id) => ({
    id,
    kind: id === "bubble" ? ("bookmark" as const) : ("topic" as const),
    label: id,
    subtitle: "",
    count: 0,
    radius: 10,
  }));
  const edges = [
    {
      id: "link",
      source: "bubble",
      target: "connected",
      kind: "topic" as const,
      label: "",
    },
  ];
  const graph = createLayoutGraph(nodes, edges, {
    orphan: { x: 10000, y: 10000 },
    connected: { x: 100, y: 0 },
    bubble: { x: 150, y: 0 },
  });
  assert.equal(graph.getNodeAttribute(CENTER_ID, "hidden"), true);
  assert.equal(graph.getEdgeAttribute("anchor:orphan", "hidden"), true);
  assert.deepEqual(linkedNodeIds(graph, ["connected"]).sort(), [
    "bubble",
    "connected",
  ]);
  assert.deepEqual(linkedNodeIds(graph, ["orphan"]), ["orphan"]);
  forceAtlas2.assign(graph, { iterations: 500, settings: forceSettings });
  assert.equal(graph.getNodeAttribute(CENTER_ID, "x"), 0);
  assert.equal(graph.getNodeAttribute(CENTER_ID, "y"), 0);
  assert.ok(
    Math.hypot(
      graph.getNodeAttribute("orphan", "x"),
      graph.getNodeAttribute("orphan", "y"),
    ) < Math.hypot(10000, 10000),
  );
  assert.equal(CENTER_ID in settle(nodes, edges), false);
});

test("linked fit maximizes zoom while accounting for full label bounds", () => {
  const points = [
    {
      x: 200,
      y: 200,
      radius: 16,
      labelWidth: 180,
      subtitleWidth: 120,
      lines: 2,
    },
    {
      x: 500,
      y: 350,
      radius: 6,
      labelWidth: 200,
      subtitleWidth: 240,
      lines: 1,
    },
  ];
  const result = fitLabelledPoints(points, 800, 600, 1, 1 / 3.2, 12.5);
  const factor = 1 / result.ratio;
  assert.ok(factor > 1);
  // The horizontal footprint includes the two outer label halves.
  assert.ok(300 * factor + 90 + 120 + 8 <= 752.000001);
  assert.ok(300 * factor * 1.001 + 90 + 120 + 8 > 752);
  const single = fitLabelledPoints([points[0]], 800, 600, 1, 1 / 3.2, 12.5);
  assert.ok(Math.abs(single.ratio - 1 / 3.2) < 1e-9);
  assert.ok(single.center.y > points[0].y);
});

test("zoom preferences preserve valid tuning and reject invalid fade ranges", () => {
  const value = readZoomDetails({
    bookmarkTitle: { start: 0.6, end: 1.1 },
    bookmarkSubtitle: { start: 2, end: 2 },
    hubType: { start: -1, end: 0.5 },
    hubSubtitle: { start: 1, end: Infinity },
  });
  assert.deepEqual(value.bookmarkTitle, { start: 0.6, end: 1.1 });
  assert.deepEqual(value.bookmarkSubtitle, zoomDetailDefaults.bookmarkSubtitle);
  assert.deepEqual(value.hubType, zoomDetailDefaults.hubType);
  assert.deepEqual(value.hubSubtitle, zoomDetailDefaults.hubSubtitle);
  assert.deepEqual(readZoomDetails(null), zoomDetailDefaults);
});

test("maximum zoom persists and keeps fade ranges reachable", () => {
  const raised = readZoomDetails({
    maxZoom: 6,
    bookmarkTitle: { start: 4, end: 5 },
  });
  assert.equal(raised.maxZoom, 6);
  assert.deepEqual(raised.bookmarkTitle, { start: 4, end: 5 });
  const lowered = readZoomDetails({ ...raised, maxZoom: 1 });
  assert.equal(lowered.bookmarkTitle.end, 1);
  assert.ok(lowered.bookmarkTitle.start < 1);
  assert.equal(readZoomDetails({ maxZoom: Infinity }).maxZoom, 6.2);
});

test("reviewed primary topic replaces the original topic link in both graph lenses", () => {
  const d = clone(),
    b = d.bookmarks[0];
  const originalTopic = b.classification.proposed_category_id;
  const replacement = d.category_review.categories.find(
    (c) => c.id !== originalTopic,
  )!.id;
  b.classification.approved_category_id = replacement;
  b.classification.approved_secondary_category_ids = [];
  b.classification.status = "revised";
  for (const lens of ["proposed", "approved"] as const) {
    const links = deriveGraph(d, lens).edges.filter(
      (e) => e.source === `bookmark:${b.id}` && e.kind === "topic",
    );
    assert.deepEqual(
      links.map((e) => e.target),
      [`topic:${replacement}`],
    );
  }
});

test("zoom defaults match the tuning screenshot and retain hub title tuning", () => {
  assert.equal(zoomDetailDefaults.maxZoom, 6.2);
  assert.deepEqual(zoomDetailDefaults.bookmarkTitle, { start: 1, end: 2 });
  assert.deepEqual(zoomDetailDefaults.bookmarkSubtitle, { start: 2, end: 3 });
  assert.deepEqual(zoomDetailDefaults.bookmarkSymbol, { start: 5, end: 6 });
  assert.deepEqual(zoomDetailDefaults.hubType, { start: 0.1, end: 0.2 });
  assert.deepEqual(zoomDetailDefaults.hubSubtitle, { start: 3, end: 3.5 });
  assert.deepEqual(
    readZoomDetails({ hubTitle: { start: 1, end: 2 } }).hubTitle,
    { start: 1, end: 2 },
  );
});

test("same-kind bubbles and hubs repel apart with collision spacing", () => {
  for (const kind of ["bookmark", "topic"] as const) {
    const nodes = ["left", "right"].map((id) => ({
      id,
      kind,
      label: id,
      subtitle: "",
      count: 0,
      radius: kind === "bookmark" ? 21 : 46,
    }));
    const graph = createLayoutGraph(nodes, [], {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    });
    forceAtlas2.assign(graph, { iterations: 180, settings: forceSettings });
    const before = graph.getNodeAttributes("left"),
      after = graph.getNodeAttributes("right");
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) > 2);
    separateOverlaps(graph, 1);
    const left = graph.getNodeAttributes("left"),
      right = graph.getNodeAttributes("right");
    assert.ok(
      Math.hypot(left.x - right.x, left.y - right.y) >= left.size + right.size,
    );
  }
});

test("collision correction respects fixed nodes and separates coincident nodes", () => {
  const nodes = ["pinned", "a", "b"].map((id) => ({
    id,
    kind: "bookmark" as const,
    label: id,
    subtitle: "",
    count: 0,
    radius: 21,
  }));
  const graph = createLayoutGraph(nodes, [], {
    pinned: { x: 0, y: 0, pinned: true },
    a: { x: 0, y: 0 },
    b: { x: 0, y: 0 },
  });
  separateOverlaps(graph, 30);
  assert.equal(graph.getNodeAttribute("pinned", "x"), 0);
  assert.equal(graph.getNodeAttribute("pinned", "y"), 0);
  for (const a of nodes)
    for (const b of nodes)
      if (a.id !== b.id) {
        const p = graph.getNodeAttributes(a.id),
          q = graph.getNodeAttributes(b.id);
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.size + q.size - 0.01);
      }
});
