import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, SituationModelRepository } from "@orbit/db";
import { CreateSituationModelInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const situationModelsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  problemBriefId: z.string().optional(),
  status: z.string().optional(),
});

situationModelsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, problemBriefId, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const result = await repo.findByFilters({ problemBriefId, status }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

situationModelsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const model = await repo.findById(id);

  if (!model) {
    return c.json({ error: { code: "NOT_FOUND", message: "Situation model not found" } }, 404);
  }

  return c.json({ data: model });
});

// Get situation model by problem brief ID (convenience endpoint)
situationModelsRoutes.get("/by-brief/:briefId", async (c) => {
  const briefId = c.req.param("briefId");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const model = await repo.findByProblemBriefId(briefId);

  if (!model) {
    return c.json({ error: { code: "NOT_FOUND", message: "No situation model for this brief" } }, 404);
  }

  return c.json({ data: model });
});

// Get claims graph
situationModelsRoutes.get("/:id/claims", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const model = await repo.findById(id);

  if (!model) {
    return c.json({ error: { code: "NOT_FOUND", message: "Situation model not found" } }, 404);
  }

  return c.json({
    data: {
      claims: model.claims,
      evidence: model.evidence,
    },
  });
});

// Get system map
situationModelsRoutes.get("/:id/system-map", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const model = await repo.findById(id);

  if (!model) {
    return c.json({ error: { code: "NOT_FOUND", message: "Situation model not found" } }, 404);
  }

  return c.json({ data: model.systemMap });
});

situationModelsRoutes.post("/", zValidator("json", CreateSituationModelInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const id = generateId("sit");
  const now = new Date().toISOString();

  const payload = { ...input, type: "SituationModel" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const model = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "draft",
    problemBriefId: input.problemBriefId,
    claims: input.claims,
    evidence: input.evidence,
    systemMap: input.systemMap,
    uncertaintyMap: input.uncertaintyMap,
    keyInsights: input.keyInsights,
    recommendedLeveragePoints: input.recommendedLeveragePoints,
  });

  eventBus.publish("pattern.created", { model });

  return c.json({ data: model }, 201);
});

// Update situation model
const updateModelSchema = CreateSituationModelInputSchema.partial();

situationModelsRoutes.patch("/:id", zValidator("json", updateModelSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new SituationModelRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Situation model not found" } }, 404);
  }

  const updateData: Record<string, unknown> = {};

  if (input.claims) updateData.claims = input.claims;
  if (input.evidence) updateData.evidence = input.evidence;
  if (input.systemMap) updateData.systemMap = input.systemMap;
  if (input.uncertaintyMap) updateData.uncertaintyMap = input.uncertaintyMap;
  if (input.keyInsights) updateData.keyInsights = input.keyInsights;
  if (input.recommendedLeveragePoints) updateData.recommendedLeveragePoints = input.recommendedLeveragePoints;

  updateData.version = existing.version + 1;
  updateData.parentHash = existing.contentHash;

  const payload = { ...existing, ...updateData };
  updateData.contentHash = await computeContentHash(payload);

  const updated = await repo.update(id, updateData);

  eventBus.publish("pattern.updated", { model: updated });

  return c.json({ data: updated });
});
