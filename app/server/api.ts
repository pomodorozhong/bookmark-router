import express from "express";
import { randomBytes } from "node:crypto";
import { Store, ApiError } from "./store";
import { validateDataset } from "./validation";
import { referenceDrafts } from "../src/data/selectors";
import { initializeProgress } from "../src/data/progress";
export function createApi(store: Store) {
  const app = express(),
    token = randomBytes(32).toString("hex");
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(req.hostname))
      return res.status(403).json({ error: "Localhost access required" });
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host"))
          return res
            .status(403)
            .json({ error: "Same-origin requests required" });
      } catch {
        return res.sendStatus(403);
      }
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.get("x-session-token") !== token || !req.is("application/json"))
    )
      return res.status(403).json({ error: "JSON and session token required" });
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "5mb" }));
  app.get("/api/dataset", async (_req, res) =>
    res.json({ ...(await store.read()), token }),
  );
  app.get("/api/export", async (_req, res) => {
    const { data } = await store.read();
    res.attachment("bookmarks.json").json(data);
  });
  const mutate =
    (
      change: (
        d: Parameters<Store["patchBookmark"]>[0],
        req: express.Request,
      ) => void,
    ): express.RequestHandler =>
    async (req, res) => {
      const { revision, hash } = req.body;
      if (!Number.isInteger(revision) || typeof hash !== "string")
        throw new ApiError(422, "Revision and hash required");
      res.json(await store.transaction(revision, hash, (d) => change(d, req)));
    };
  app.patch(
    "/api/bookmarks/:id",
    mutate((d, req) =>
      store.patchBookmark(d, String(req.params.id), req.body.patch),
    ),
  );
  app.post(
    "/api/bookmarks/:id/undo",
    mutate((d, req) => store.undo(d, String(req.params.id))),
  );
  app.patch(
    "/api/nodes/:id/progress",
    mutate((d, req) =>
      store.patchNodeProgress(d, String(req.params.id), req.body.progress),
    ),
  );
  app.post(
    "/api/bookmarks/bulk-topic",
    mutate((d, req) => {
      if (
        !Array.isArray(req.body.ids) ||
        !req.body.ids.length ||
        req.body.ids.length > d.bookmarks.length
      )
        throw new ApiError(422, "Select bookmark IDs");
      for (const id of new Set<string>(req.body.ids)) {
        const b = d.bookmarks.find((b) => b.id === id);
        if (!b) throw new ApiError(422, "Unknown bookmark");
        store.patchBookmark(d, id, {
          classification: {
            approved_category_id: b.classification.proposed_category_id,
            approved_secondary_category_ids:
              b.classification.proposed_secondary_category_ids,
            status: "approved",
          },
        });
      }
    }),
  );
  app.patch(
    "/api/proposals/:id",
    mutate((d, req) =>
      store.patchProposal(d, String(req.params.id), req.body.patch),
    ),
  );
  app.post(
    "/api/catalog/issues",
    mutate((d, req) => store.registerIssue(d, req.body.issue)),
  );
  app.post("/api/import", async (req, res) => {
    validateDataset(req.body.data);
    if (!req.body.confirm)
      return res.json({
        preview: {
          dataset_id: req.body.data.dataset_id,
          count: req.body.data.bookmarks.length,
          revision: req.body.data.metadata.revision,
        },
      });
    return mutate((d, r) => {
      const revision = d.metadata.revision;
      const imported = structuredClone(r.body.data);
      initializeProgress(imported);
      for (const key of Object.keys(d))
        delete (d as unknown as Record<string, unknown>)[key];
      Object.assign(d, imported);
      d.metadata.revision = revision;
    })(req, res, () => {});
  });
  app.post("/api/reference-drafts", async (_req, res) =>
    res.json(referenceDrafts((await store.read()).data)),
  );
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(err instanceof ApiError ? err.status : 422)
        .json({ error: err.message }),
  );
  return app;
}
