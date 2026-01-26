import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, ArtifactRepository } from "@orbit/db";
import { CreateArtifactInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const artifactsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  solutionId: z.string().optional(),
  runId: z.string().optional(),
  artifactType: z.string().optional(),
  artifactStatus: z.string().optional(),
  status: z.string().optional(),
});

artifactsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, solutionId, runId, artifactType, artifactStatus, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const result = await repo.findByFilters(
    { solutionId, runId, artifactType, artifactStatus, status },
    { limit, offset }
  );

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

artifactsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const artifact = await repo.findById(id);

  if (!artifact) {
    return c.json({ error: { code: "NOT_FOUND", message: "Artifact not found" } }, 404);
  }

  return c.json({ data: artifact });
});

// Get artifacts by solution ID
artifactsRoutes.get("/by-solution/:solutionId", async (c) => {
  const solutionId = c.req.param("solutionId");

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const artifacts = await repo.findBySolutionId(solutionId);

  return c.json({ data: artifacts });
});

// Get artifacts by run ID
artifactsRoutes.get("/by-run/:runId", async (c) => {
  const runId = c.req.param("runId");

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const artifacts = await repo.findByRunId(runId);

  return c.json({ data: artifacts });
});

artifactsRoutes.post("/", zValidator("json", CreateArtifactInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const id = generateId("art");
  const now = new Date().toISOString();

  const payload = { ...input, type: "Artifact" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const artifact = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "active",
    solutionId: input.solutionId,
    runId: input.runId,
    title: input.title,
    artifactType: input.artifactType,
    contentRef: input.contentRef,
    format: input.format,
    sizeBytes: input.sizeBytes,
    derivedFrom: input.derivedFrom,
    artifactStatus: input.artifactStatus,
  });

  eventBus.publish("run.updated", { artifact });

  return c.json({ data: artifact }, 201);
});

// Update artifact status
artifactsRoutes.patch("/:id/status", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { artifactStatus } = body;

  if (!artifactStatus || !["draft", "final", "superseded"].includes(artifactStatus)) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Valid artifactStatus is required" } }, 400);
  }

  const db = getDatabase();
  const repo = new ArtifactRepository(db);

  const artifact = await repo.update(id, { artifactStatus });

  if (!artifact) {
    return c.json({ error: { code: "NOT_FOUND", message: "Artifact not found" } }, 404);
  }

  eventBus.publish("run.updated", { artifact });

  return c.json({ data: artifact });
});
