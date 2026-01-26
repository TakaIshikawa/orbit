import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, DecisionRepository } from "@orbit/db";
import { CreateDecisionInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const decisionsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  solutionId: z.string().optional(),
  decision: z.string().optional(),
  autonomyLevel: z.string().optional(),
  status: z.string().optional(),
});

decisionsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, solutionId, decision, autonomyLevel, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new DecisionRepository(db);

  const result = await repo.findByFilters(
    { solutionId, decision, autonomyLevel, status },
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

decisionsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new DecisionRepository(db);

  const decision = await repo.findById(id);

  if (!decision) {
    return c.json({ error: { code: "NOT_FOUND", message: "Decision not found" } }, 404);
  }

  return c.json({ data: decision });
});

// Get decisions by solution ID
decisionsRoutes.get("/by-solution/:solutionId", async (c) => {
  const solutionId = c.req.param("solutionId");

  const db = getDatabase();
  const repo = new DecisionRepository(db);

  const decisions = await repo.findBySolutionId(solutionId);

  return c.json({ data: decisions });
});

decisionsRoutes.post("/", zValidator("json", CreateDecisionInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new DecisionRepository(db);

  const id = generateId("dec");
  const now = new Date().toISOString();

  const payload = { ...input, type: "Decision" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const decision = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "active",
    solutionId: input.solutionId,
    decision: input.decision,
    rationale: input.rationale,
    modifications: input.modifications,
    autonomyLevel: input.autonomyLevel,
    approvals: input.approvals,
    guardrails: input.guardrails,
    runId: null,
  });

  eventBus.publish("solution.updated", { decision });

  return c.json({ data: decision }, 201);
});

// Link decision to a run
decisionsRoutes.patch("/:id/link-run", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { runId } = body;

  if (!runId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "runId is required" } }, 400);
  }

  const db = getDatabase();
  const repo = new DecisionRepository(db);

  const decision = await repo.update(id, { runId });

  if (!decision) {
    return c.json({ error: { code: "NOT_FOUND", message: "Decision not found" } }, 404);
  }

  return c.json({ data: decision });
});
