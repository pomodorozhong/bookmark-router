import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import type { Dataset, Target } from "../src/data/types";
import {
  bookmarkWorkflowProgress,
  initializeProgress,
  isComplete,
  matchesProgress,
  nodeIds,
  nodeProgress,
  readProgressFilter,
  progressStatuses,
} from "../src/data/progress";
import { deriveGraph, graphVisibility } from "../src/data/graph";
import { inQueue, today } from "../src/data/selectors";
import { validateDataset } from "../server/validation";
import { Store } from "../server/store";
import { createApi } from "../server/api";

const original = JSON.parse(
  await readFile(new URL("./fixtures/bookmarks.json", import.meta.url), "utf8"),
) as Dataset;
const clone = () => structuredClone(original);
const bookmarkId = (d: Dataset, i = 0) => `bookmark:${d.bookmarks[i].id}`;
const approved = (d: Dataset) => {
  const b = d.bookmarks[0];
  b.classification.approved_category_id = b.classification.proposed_category_id;
  b.classification.status = "approved";
  return b;
};
const target = (
  d: Dataset,
  number: number,
  status: Target["placement_status"] = "pending",
): Target => ({
  kind: "existing_issue",
  issue_number: number,
  placement_status: status,
  confirmed_on: status === "pending" ? null : today(),
  confirmation_url:
    status === "pending"
      ? null
      : d.issue_catalog.find((i) => i.number === number)!.url,
  note: "",
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "bookmark-progress-"));
  const file = join(dir, "bookmarks.json");
  await writeFile(file, JSON.stringify(original));
  return { dir, file, store: new Store(file, join(dir, "backups")) };
}

test("legacy progress initializes every node without losing explicit statuses", () => {
  const d = clone();
  const b = approved(d);
  b.processing.review_status = "decided";
  b.processing.disposition = "keep";
  d.node_progress = { [bookmarkId(d, 1)]: "dropped" };
  const originals = d.bookmarks.map((b) => structuredClone(b.original));
  initializeProgress(d);
  assert.equal(nodeProgress(d, bookmarkId(d)), "done");
  assert.equal(nodeProgress(d, bookmarkId(d, 1)), "dropped");
  assert.equal(Object.keys(d.node_progress!).length, nodeIds(d).size);
  assert.equal(nodeProgress(d, "topic:unapproved"), "pending");
  assert.ok(deriveGraph(d, "approved").nodes.every((n) => n.progress));
  assert.deepEqual(
    d.bookmarks.map((b) => b.original),
    originals,
  );
  validateDataset(d);
  const hidden = d.bookmarks_worth_their_own_issues[0];
  hidden.created_issue_number = d.issue_catalog[0].number;
  hidden.created_issue_url = d.issue_catalog[0].url;
  hidden.status = "created";
  d.node_progress![`proposal:${hidden.id}`] = "done";
  validateDataset(d);
});

test("progress schema rejects invalid states and unknown IDs", () => {
  const d = clone();
  d.node_progress = { unknown: "pending" };
  assert.throws(() => validateDataset(d), /Unknown progress node/);
  d.node_progress = { [bookmarkId(d)]: "invalid" as never };
  assert.throws(() => validateDataset(d), /allowed values/);
  d.node_progress = { "topic:unapproved": "done" };
  validateDataset(d);
});

test("workflow projection covers pending, active, terminal, deferred and multi-target work", () => {
  const d = clone(),
    b = d.bookmarks[0];
  assert.equal(bookmarkWorkflowProgress(b), "pending");
  approved(d);
  assert.equal(bookmarkWorkflowProgress(b), "in_progress");
  b.processing.review_status = "decided";
  b.processing.disposition = "keep";
  assert.equal(bookmarkWorkflowProgress(b), "done");
  b.processing.disposition = "skip";
  assert.equal(bookmarkWorkflowProgress(b), "dropped");
  b.processing.disposition = "duplicate";
  b.duplicate_review.status = "confirmed";
  b.duplicate_review.confirmed_duplicate_of = d.bookmarks[1].id;
  assert.equal(bookmarkWorkflowProgress(b), "done");
  b.processing.disposition = "defer";
  assert.equal(bookmarkWorkflowProgress(b), "pending");
  b.processing.disposition = "attach";
  b.processing.selected_targets = [target(d, 133, "added"), target(d, 143)];
  assert.equal(bookmarkWorkflowProgress(b), "in_progress");
  b.processing.selected_targets[1] = target(d, 143, "already_present");
  assert.equal(bookmarkWorkflowProgress(b), "done");
});

test("manual progress wins over workflow changes, survives unrelated edits, then resyncs and undoes", async () => {
  const f = await fixture();
  try {
    const initial = await f.store.read();
    assert.equal(
      JSON.parse(await readFile(f.file, "utf8")).node_progress,
      undefined,
    );
    const id = initial.data.bookmarks[0].id;
    const save = async (patch: Parameters<Store["patchBookmark"]>[2]) => {
      const current = await f.store.read();
      return f.store.transaction(
        current.data.metadata.revision,
        current.hash,
        (d) => f.store.patchBookmark(d, id, patch),
      );
    };
    await save({
      classification: {
        approved_category_id:
          initial.data.bookmarks[0].classification.proposed_category_id,
        status: "approved",
      },
      progress: "dropped",
    });
    await save({
      display_title: "Renamed",
      processing: { user_notes: "Note only" },
    });
    let result = await f.store.read();
    assert.equal(nodeProgress(result.data, bookmarkId(result.data)), "dropped");
    result = await save({
      processing: { review_status: "decided", disposition: "keep" },
    });
    assert.equal(nodeProgress(result.data, bookmarkId(result.data)), "done");
    const undone = await f.store.transaction(
      result.data.metadata.revision,
      result.hash,
      (d) => f.store.undo(d, id),
    );
    assert.equal(nodeProgress(undone.data, bookmarkId(undone.data)), "dropped");
    assert.equal(
      undone.data.bookmarks[0].processing.review_status,
      "unreviewed",
    );
    const manual = await save({ progress: "done" });
    assert.ok(isComplete(manual.data.bookmarks[0], manual.data));
    const restarted = await new Store(f.file, join(f.dir, "backups")).read();
    assert.equal(
      nodeProgress(restarted.data, bookmarkId(restarted.data)),
      "done",
    );
    assert.deepEqual(
      restarted.data.bookmarks.map((b) => b.original),
      original.bookmarks.map((b) => b.original),
    );
    await assert.rejects(
      f.store.transaction(
        initial.data.metadata.revision,
        initial.hash,
        () => {},
      ),
      /changed/,
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("bookmark synchronization tracks placements, preserves target-note edits, and returns rejected proposals to review", () => {
  const d = clone(),
    b = approved(d),
    store = new Store("unused", "unused");
  initializeProgress(d);
  store.patchBookmark(d, b.id, {
    processing: {
      review_status: "decided",
      disposition: "attach",
      selected_targets: [target(d, 133)],
    },
  });
  assert.equal(nodeProgress(d, bookmarkId(d)), "in_progress");
  store.patchBookmark(d, b.id, {
    processing: { selected_targets: [target(d, 133, "added")] },
  });
  assert.equal(nodeProgress(d, bookmarkId(d)), "done");
  store.patchBookmark(d, b.id, { progress: "dropped" });
  const edited = target(d, 133, "added");
  edited.note = "Evidence note";
  store.patchBookmark(d, b.id, { processing: { selected_targets: [edited] } });
  assert.equal(nodeProgress(d, bookmarkId(d)), "dropped");
  const p = d.bookmarks_worth_their_own_issues[0];
  store.patchBookmark(d, b.id, {
    processing: {
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
    },
    progress: "done",
  });
  store.patchProposal(d, p.id, { status: "rejected" });
  assert.equal(nodeProgress(d, bookmarkId(d)), "in_progress");
  assert.equal(nodeProgress(d, `proposal:${p.id}`), "pending");
  validateDataset(d);
});

test("hub progress is independent, and newly registered issues start pending", () => {
  const d = clone(),
    store = new Store("unused", "unused");
  initializeProgress(d);
  const bookmarks = structuredClone(d.bookmarks),
    issueState = d.issue_catalog[0].state;
  for (const id of [
    `topic:${d.category_review.categories[0].id}`,
    `issue:${d.issue_catalog[0].number}`,
    `proposal:${d.bookmarks_worth_their_own_issues[0].id}`,
    "topic:unapproved",
  ])
    store.patchNodeProgress(d, id, "done");
  assert.deepEqual(d.bookmarks, bookmarks);
  assert.equal(d.issue_catalog[0].state, issueState);
  assert.throws(
    () => store.patchNodeProgress(d, "topic:missing", "done"),
    /Unknown/,
  );
  assert.throws(
    () => store.patchNodeProgress(d, "topic:unapproved", "unknown"),
    /Invalid/,
  );
  store.registerIssue(d, {
    ...d.issue_catalog[0],
    number: 999999,
    url: "https://github.com/test/test/issues/999999",
  });
  assert.equal(nodeProgress(d, "issue:999999"), "pending");
});

test("progress queues and filters treat dropped separately from completed", () => {
  const d = clone();
  initializeProgress(d);
  const b = d.bookmarks[0];
  for (const status of ["pending", "in_progress", "done", "dropped"] as const) {
    d.node_progress![bookmarkId(d)] = status;
    for (const queue of [
      "pending",
      "in_progress",
      "completed",
      "dropped",
    ] as const)
      assert.equal(
        inQueue(b, queue, d),
        status === (queue === "completed" ? "done" : queue),
      );
    assert.equal(matchesProgress(status, progressStatuses), true);
    assert.deepEqual(readProgressFilter(status), [status]);
  }
  assert.deepEqual(readProgressFilter("invalid"), progressStatuses);
  assert.deepEqual(readProgressFilter(null), progressStatuses);
});

test("shared visibility independently filters bubbles/hubs and excludes nonmatching selection/reveal", () => {
  const d = clone();
  initializeProgress(d);
  const b = d.bookmarks[0],
    bId = bookmarkId(d),
    hubId = `topic:${b.classification.proposed_category_id}`;
  d.node_progress![hubId] = "done";
  let graph = deriveGraph(d, "proposed");
  const visible = new Set([b.id]);
  const view = (
    bubble: "" | "pending" | "done",
    hub: "" | "done" | "dropped",
  ) =>
    graphVisibility(
      graph,
      visible,
      [bId, hubId],
      [],
      [hubId],
      readProgressFilter(bubble),
      readProgressFilter(hub),
    );
  let result = view("pending", "dropped");
  assert.ok(result.nodes.some((n) => n.id === bId));
  assert.ok(!result.shownHubs.has(hubId));
  assert.ok(
    result.edges.every(
      (e) =>
        result.nodes.some((n) => n.id === e.source) &&
        result.nodes.some((n) => n.id === e.target),
    ),
  );
  result = view("done", "done");
  assert.ok(!result.nodes.some((n) => n.id === bId));
  assert.ok(result.shownHubs.has(hubId));
  assert.equal(result.edges.length, 0);
  result = view("pending", "done");
  assert.ok(result.edges.some((e) => e.source === bId && e.target === hubId));
  assert.ok(
    graphVisibility(
      graph,
      visible,
      [hubId],
      [hubId],
      [hubId],
      progressStatuses,
      progressStatuses,
    ).shownHubs.has(hubId) === false,
  );
  d.node_progress![bId] = "done";
  graph = deriveGraph(d, "proposed");
  assert.ok(!view("pending", "done").nodes.some((n) => n.id === bId));
  assert.ok(view("", "").nodes.some((n) => n.id === bId));
  // Hub focus uses original relationships, regardless of hub visibility.
  assert.ok(graph.edges.some((e) => e.source === bId && e.target === hubId));
});

test("progress API protects writes, persists all kinds, supports bulk sync and round-trips imports", async () => {
  const f = await fixture(),
    server = createApi(f.store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let envelope = await (await fetch(`${base}/api/dataset`)).json();
    const token = envelope.token;
    const send = async (path: string, body: object, method = "PATCH") => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-session-token": token,
        },
        body: JSON.stringify({
          revision: envelope.data.metadata.revision,
          hash: envelope.hash,
          ...body,
        }),
      });
      const result = await response.json();
      if (result.data) envelope = result;
      return { response, result };
    };
    const path = "/api/nodes/topic%3Aunapproved/progress";
    assert.equal(
      (
        await fetch(`${base}${path}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ progress: "done" }),
        })
      ).status,
      403,
    );
    for (const id of [
      bookmarkId(envelope.data),
      `topic:${envelope.data.category_review.categories[0].id}`,
      `issue:${envelope.data.issue_catalog[0].number}`,
      `proposal:${envelope.data.bookmarks_worth_their_own_issues[0].id}`,
      "topic:unapproved",
    ]) {
      const { response } = await send(
        `/api/nodes/${encodeURIComponent(id)}/progress`,
        { progress: "done" },
      );
      assert.equal(response.status, 200);
      assert.equal(envelope.data.node_progress[id], "done");
    }
    assert.equal((await send(path, { progress: "bad" })).response.status, 422);
    const b = envelope.data.bookmarks[0];
    assert.equal(
      (await send("/api/bookmarks/bulk-topic", { ids: [b.id] }, "POST"))
        .response.status,
      200,
    );
    assert.equal(
      envelope.data.node_progress[`bookmark:${b.id}`],
      "in_progress",
    );
    const exported = await (await fetch(`${base}/api/export`)).json();
    validateDataset(exported);
    assert.deepEqual(exported.node_progress, envelope.data.node_progress);
    assert.equal(
      (await send("/api/import", { data: exported, confirm: true }, "POST"))
        .response.status,
      200,
    );
    assert.deepEqual(envelope.data.node_progress, exported.node_progress);
    const before = await readFile(f.file, "utf8");
    assert.equal(
      (await send("/api/import", { data: original, confirm: false }, "POST"))
        .response.status,
      200,
    );
    assert.equal(await readFile(f.file, "utf8"), before);
    assert.equal(
      (await send("/api/import", { data: original, confirm: true }, "POST"))
        .response.status,
      200,
    );
    assert.equal(
      envelope.data.node_progress[bookmarkId(envelope.data)],
      "pending",
    );
    assert.equal(envelope.data.node_progress["topic:unapproved"], "pending");
  } finally {
    server.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("hub completion atomically marks all linked bubbles done for each hub and topic lens", async () => {
  const f = await fixture();
  const server = createApi(f.store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let envelope = await (await fetch(`${base}/api/dataset`)).json();
    const token = envelope.token;
    const send = async (id: string, lens: string) => {
      const response = await fetch(
        `${base}/api/hubs/${encodeURIComponent(id)}/complete-bubbles`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-session-token": token,
          },
          body: JSON.stringify({
            revision: envelope.data.metadata.revision,
            hash: envelope.hash,
            lens,
          }),
        },
      );
      const result = await response.json();
      if (result.data) envelope = result;
      return response;
    };
    for (const lens of ["proposed", "approved"] as const) {
      for (const kind of ["topic", "issue", "proposal"] as const) {
        const graph = deriveGraph(envelope.data, lens);
        const hub = graph.nodes.find((n) => n.kind === kind && n.count > 0)!;
        assert.ok(hub);
        const linked = new Set(
          graph.edges.filter((e) => e.target === hub.id).map((e) => e.source),
        );
        const before = structuredClone(envelope.data) as Dataset;
        assert.equal((await send(hub.id, lens)).status, 200);
        assert.equal(
          envelope.data.metadata.revision,
          before.metadata.revision + 1,
        );
        for (const id of nodeIds(before))
          assert.equal(
            nodeProgress(envelope.data, id),
            linked.has(id) ? "done" : nodeProgress(before, id),
          );
        for (const b of before.bookmarks) {
          const updated = envelope.data.bookmarks.find(
            (v: Dataset["bookmarks"][number]) => v.id === b.id,
          );
          assert.deepEqual(updated.processing, {
            ...b.processing,
            updated_at: linked.has(`bookmark:${b.id}`)
              ? updated.processing.updated_at
              : b.processing.updated_at,
          });
          assert.deepEqual(updated.classification, b.classification);
        }
        assert.deepEqual(
          (await f.store.read()).data.node_progress,
          envelope.data.node_progress,
        );
      }
    }
    const before = await readFile(f.file, "utf8");
    assert.equal(
      (await send(bookmarkId(envelope.data), "proposed")).status,
      422,
    );
    assert.equal((await send("topic:missing", "proposed")).status, 422);
    assert.equal((await send("topic:unapproved", "invalid")).status, 422);
    assert.equal(await readFile(f.file, "utf8"), before);
  } finally {
    server.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("progress queues cannot reveal a selected bubble with another status", () => {
  const d = clone();
  initializeProgress(d);
  const id = bookmarkId(d);
  d.node_progress![id] = "done";
  const graph = deriveGraph(d, "proposed");
  const result = graphVisibility(
    graph,
    new Set(),
    [id],
    [],
    [],
    progressStatuses,
    progressStatuses,
    ["pending"],
  );
  assert.ok(!result.nodes.some((n) => n.id === id));
});

test("undo preserves manual status when workflow sync yields the same status", () => {
  const d = clone(),
    store = new Store("unused", "unused"),
    b = d.bookmarks[0];
  initializeProgress(d);
  store.patchBookmark(d, b.id, { progress: "in_progress" });
  store.patchBookmark(d, b.id, {
    classification: {
      status: "approved",
      approved_category_id: b.classification.proposed_category_id,
    },
  });
  store.undo(d, b.id);
  assert.equal(b.classification.status, "pending");
  assert.equal(nodeProgress(d, bookmarkId(d)), "in_progress");
  validateDataset(d);
});

test("undo initializes progress for historic saves without a progress snapshot", () => {
  const d = clone(),
    store = new Store("unused", "unused"),
    b = d.bookmarks[0];
  const previous = structuredClone(b.classification);
  approved(d);
  b.history.push({
    id: "legacy-edit",
    at: "2026-10-01T00:00:00.000Z",
    action: "edit",
    field: "classification",
    previous_value: previous,
    new_value: structuredClone(b.classification),
    note: "",
  });
  initializeProgress(d);
  assert.equal(nodeProgress(d, bookmarkId(d)), "in_progress");
  store.undo(d, b.id);
  assert.equal(nodeProgress(d, bookmarkId(d)), "pending");
  validateDataset(d);
});

test("checkbox filters preserve multiple selections, empty selections and legacy preferences", () => {
  assert.deepEqual(readProgressFilter("pending"), ["pending"]);
  assert.deepEqual(readProgressFilter(""), progressStatuses);
  assert.deepEqual(readProgressFilter(["done", "pending", "done", "invalid"]), [
    "pending",
    "done",
  ]);
  assert.deepEqual(readProgressFilter([]), []);
  const selected = readProgressFilter(
    JSON.parse(JSON.stringify(["pending", "in_progress"])),
  );
  assert.ok(matchesProgress("pending", selected));
  assert.ok(matchesProgress("in_progress", selected));
  assert.ok(!matchesProgress("done", selected));
  assert.ok(!matchesProgress("pending", []));
});

test("graph checkbox filters include the union of checked states independently for bubbles and hubs", () => {
  const d = clone();
  initializeProgress(d);
  const initial = deriveGraph(d, "proposed");
  initial.nodes.forEach((n, i) => {
    d.node_progress![n.id] = progressStatuses[i % progressStatuses.length];
  });
  const graph = deriveGraph(d, "proposed");
  const visible = new Set(d.bookmarks.map((b) => b.id));
  const hubs = graph.nodes
    .filter((n) => n.kind !== "bookmark")
    .map((n) => n.id);
  const result = graphVisibility(
    graph,
    visible,
    graph.nodes.map((n) => n.id),
    [],
    hubs,
    ["pending", "in_progress"],
    ["done", "dropped"],
  );
  assert.ok(
    result.nodes.some((n) => n.kind === "bookmark" && n.progress === "pending"),
  );
  assert.ok(
    result.nodes.some(
      (n) => n.kind === "bookmark" && n.progress === "in_progress",
    ),
  );
  assert.ok(
    result.nodes.some((n) => n.kind !== "bookmark" && n.progress === "done"),
  );
  assert.ok(
    result.nodes.some((n) => n.kind !== "bookmark" && n.progress === "dropped"),
  );
  assert.ok(
    result.nodes.every((n) =>
      (n.kind === "bookmark"
        ? ["pending", "in_progress"]
        : ["done", "dropped"]
      ).includes(n.progress),
    ),
  );
  const noBubbles = graphVisibility(
    graph,
    visible,
    [],
    [],
    hubs,
    [],
    progressStatuses,
  );
  assert.ok(noBubbles.nodes.every((n) => n.kind !== "bookmark"));
  assert.equal(noBubbles.edges.length, 0);
  const noHubs = graphVisibility(
    graph,
    visible,
    [],
    [],
    hubs,
    progressStatuses,
    [],
  );
  assert.equal(noHubs.nodes.length, d.bookmarks.length);
  assert.equal(noHubs.shownHubs.size, 0);
  assert.equal(noHubs.edges.length, 0);
});
