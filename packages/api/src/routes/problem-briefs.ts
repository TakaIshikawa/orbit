import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, ProblemBriefRepository } from "@orbit/db";
import { CreateProblemBriefInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const problemBriefsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  issueId: z.string().optional(),
  status: z.string().optional(),
});

problemBriefsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, issueId, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ProblemBriefRepository(db);

  const result = await repo.findByFilters({ issueId, status }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

problemBriefsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ProblemBriefRepository(db);

  const brief = await repo.findById(id);

  if (!brief) {
    return c.json({ error: { code: "NOT_FOUND", message: "Problem brief not found" } }, 404);
  }

  return c.json({ data: brief });
});

// Get brief by issue ID (convenience endpoint)
problemBriefsRoutes.get("/by-issue/:issueId", async (c) => {
  const issueId = c.req.param("issueId");

  const db = getDatabase();
  const repo = new ProblemBriefRepository(db);

  const brief = await repo.findByIssueId(issueId);

  if (!brief) {
    return c.json({ error: { code: "NOT_FOUND", message: "No problem brief for this issue" } }, 404);
  }

  return c.json({ data: brief });
});

problemBriefsRoutes.post("/", zValidator("json", CreateProblemBriefInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new ProblemBriefRepository(db);

  const id = generateId("pbr");
  const now = new Date().toISOString();

  const payload = { ...input, type: "ProblemBrief" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const brief = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "draft",
    issueId: input.issueId,
    goals: input.goals,
    constraints: input.constraints,
    uncertainties: input.uncertainties,
    actionSpace: input.actionSpace,
    requiredEvidence: input.requiredEvidence,
  });

  eventBus.publish("pattern.created", { brief });

  return c.json({ data: brief }, 201);
});

// Update problem brief
const updateBriefSchema = CreateProblemBriefInputSchema.partial();

problemBriefsRoutes.patch("/:id", zValidator("json", updateBriefSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new ProblemBriefRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Problem brief not found" } }, 404);
  }

  const updateData: Record<string, unknown> = {};

  if (input.goals) updateData.goals = input.goals;
  if (input.constraints) updateData.constraints = input.constraints;
  if (input.uncertainties) updateData.uncertainties = input.uncertainties;
  if (input.actionSpace) updateData.actionSpace = input.actionSpace;
  if (input.requiredEvidence) updateData.requiredEvidence = input.requiredEvidence;

  updateData.version = existing.version + 1;
  updateData.parentHash = existing.contentHash;

  const payload = { ...existing, ...updateData };
  updateData.contentHash = await computeContentHash(payload);

  const updated = await repo.update(id, updateData);

  eventBus.publish("pattern.updated", { brief: updated });

  return c.json({ data: updated });
});
