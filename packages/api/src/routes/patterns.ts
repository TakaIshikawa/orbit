import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, PatternRepository } from "@orbit/db";
import { CreatePatternInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const patternsRoutes = new Hono();

// List patterns
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  patternType: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

patternsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, patternType, status, search } = c.req.valid("query");

  const db = getDatabase();
  const repo = new PatternRepository(db);

  const result = await repo.findByFilters({ patternType, status, search }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get pattern by ID
patternsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PatternRepository(db);

  const pattern = await repo.findById(id);

  if (!pattern) {
    return c.json({ error: { code: "NOT_FOUND", message: "Pattern not found" } }, 404);
  }

  return c.json({ data: pattern });
});

// Create pattern
patternsRoutes.post("/", zValidator("json", CreatePatternInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new PatternRepository(db);

  const id = generateId("pat");
  const now = new Date().toISOString();

  // Compute content hash
  const payload = { ...input, type: "Pattern" as const };
  const contentHash = await computeContentHash(payload);

  // TODO: Get author from auth context
  const author = "actor_system";
  // TODO: Sign content
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const pattern = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "draft",
    title: input.title,
    description: input.description,
    patternType: input.patternType,
    domains: input.domains,
    geographies: input.geographies || [],
    sources: input.sources,
    firstObserved: new Date(input.firstObserved),
    observationFrequency: input.observationFrequency,
    clusterId: input.clusterId || null,
    confidence: input.confidence,
  });

  eventBus.publish("pattern.created", { pattern });

  return c.json({ data: pattern }, 201);
});

// Get pattern history
patternsRoutes.get("/:id/history", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PatternRepository(db);

  // For now, just return the current version
  // TODO: Implement version history tracking
  const pattern = await repo.findById(id);

  if (!pattern) {
    return c.json({ error: { code: "NOT_FOUND", message: "Pattern not found" } }, 404);
  }

  return c.json({
    data: [pattern],
    meta: { total: 1 },
  });
});
