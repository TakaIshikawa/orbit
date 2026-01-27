import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDatabase,
  SolutionRepository,
  SolutionOutcomeRepository,
  SolutionEffectivenessRepository,
  FeedbackEventRepository,
} from "@orbit/db";
import { CreateSolutionInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const solutionsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  situationModelId: z.string().optional(),
  issueId: z.string().optional(),
  solutionType: z.string().optional(),
  solutionStatus: z.string().optional(),
  status: z.string().optional(),
});

solutionsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, situationModelId, issueId, solutionType, solutionStatus, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const result = await repo.findByFilters(
    { situationModelId, issueId, solutionType, solutionStatus, status },
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

solutionsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const solution = await repo.findById(id);

  if (!solution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  return c.json({ data: solution });
});

solutionsRoutes.post("/", zValidator("json", CreateSolutionInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const id = generateId("sol");
  const now = new Date().toISOString();

  const payload = { ...input, type: "Solution" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const solution = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "draft",
    situationModelId: input.situationModelId,
    title: input.title,
    summary: input.summary,
    solutionType: input.solutionType,
    mechanism: input.mechanism,
    components: input.components,
    preconditions: input.preconditions,
    risks: input.risks,
    metrics: input.metrics,
    executionPlan: input.executionPlan,
    artifacts: input.artifacts,
    addressesIssues: input.addressesIssues,
    solutionStatus: input.solutionStatus,
  });

  eventBus.publish("solution.created", { solution });

  return c.json({ data: solution }, 201);
});

solutionsRoutes.post("/:id/approve", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const solution = await repo.update(id, {
    solutionStatus: "approved",
  });

  if (!solution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  eventBus.publish("solution.updated", { solution });

  return c.json({ data: solution });
});

// Update solution status
const updateStatusSchema = z.object({
  status: z.enum(["proposed", "approved", "in_progress", "completed", "abandoned"]),
});

solutionsRoutes.patch("/:id/status", zValidator("json", updateStatusSchema), async (c) => {
  const id = c.req.param("id");
  const { status } = c.req.valid("json");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const previousSolution = await repo.findById(id);
  if (!previousSolution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  const previousStatus = previousSolution.solutionStatus;
  const solution = await repo.updateSolutionStatus(id, status);

  if (!solution) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to update solution" } }, 500);
  }

  eventBus.publish("solution.updated", { solution, previousStatus });

  // Generate feedback event when solution is completed
  if (status === "completed" && previousStatus !== "completed") {
    try {
      const feedbackRepo = new FeedbackEventRepository(db);
      const effectivenessRepo = new SolutionEffectivenessRepository(db);

      // Get or calculate effectiveness
      const effectiveness = await effectivenessRepo.findBySolution(id);

      const feedbackId = `fb_sol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      await feedbackRepo.create({
        id: feedbackId,
        feedbackType: "solution_outcome",
        sourceEntityType: "solution_effectiveness",
        sourceEntityId: effectiveness?.id ?? id,
        targetEntityType: "solution",
        targetEntityId: id,
        feedbackData: {
          effectivenessScore: effectiveness?.overallEffectivenessScore ?? 0.5,
          metricsAchieved: effectiveness?.metricsAchieved ?? 0,
          metricsMissed: effectiveness?.metricsMissed ?? 0,
          impactVariance: effectiveness?.impactVariance ?? 0,
        },
        status: "pending",
        createdAt: new Date(),
      });

      eventBus.publish("feedback.created", { feedbackId, type: "solution_outcome", solutionId: id });
    } catch (error) {
      console.error("Failed to create solution outcome feedback:", error);
      // Don't fail the status update just because feedback creation failed
    }
  }

  return c.json({ data: solution });
});

// Record a solution outcome
const recordOutcomeSchema = z.object({
  outcomeType: z.enum(["metric_measurement", "status_change", "feedback", "verification_result"]),
  outcomeSource: z.enum(["automated", "manual", "verification", "metric"]),
  metricName: z.string().optional(),
  metricValue: z.number().optional(),
  baselineValue: z.number().optional(),
  targetValue: z.number().optional(),
  linkedIssueId: z.string().optional(),
  feedback: z.string().optional(),
  feedbackSentiment: z.number().min(-1).max(1).optional(),
  notes: z.string().optional(),
});

solutionsRoutes.post("/:id/outcomes", zValidator("json", recordOutcomeSchema), async (c) => {
  const solutionId = c.req.param("id");
  const input = c.req.valid("json");

  const db = getDatabase();
  const solutionRepo = new SolutionRepository(db);
  const outcomeRepo = new SolutionOutcomeRepository(db);
  const effectivenessRepo = new SolutionEffectivenessRepository(db);

  // Verify solution exists
  const solution = await solutionRepo.findById(solutionId);
  if (!solution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  // Create outcome record
  const outcomeId = `outcome_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const outcome = await outcomeRepo.create({
    id: outcomeId,
    solutionId,
    recordedBy: "api",
    outcomeType: input.outcomeType,
    outcomeSource: input.outcomeSource,
    metricName: input.metricName,
    metricValue: input.metricValue,
    baselineValue: input.baselineValue,
    targetValue: input.targetValue,
    linkedIssueId: input.linkedIssueId,
    feedback: input.feedback,
    feedbackSentiment: input.feedbackSentiment,
    notes: input.notes,
    recordedAt: new Date(),
  });

  // Recalculate effectiveness
  try {
    await effectivenessRepo.recalculateEffectiveness(solutionId);
  } catch (error) {
    console.error("Failed to recalculate effectiveness:", error);
  }

  eventBus.publish("solution.outcome.recorded", { outcome, solutionId });

  return c.json({ data: outcome }, 201);
});

// Get solution outcomes
solutionsRoutes.get("/:id/outcomes", async (c) => {
  const solutionId = c.req.param("id");

  const db = getDatabase();
  const outcomeRepo = new SolutionOutcomeRepository(db);

  const result = await outcomeRepo.findBySolution(solutionId);

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get solution effectiveness
solutionsRoutes.get("/:id/effectiveness", async (c) => {
  const solutionId = c.req.param("id");

  const db = getDatabase();
  const effectivenessRepo = new SolutionEffectivenessRepository(db);

  const effectiveness = await effectivenessRepo.findBySolution(solutionId);

  if (!effectiveness) {
    return c.json({ error: { code: "NOT_FOUND", message: "No effectiveness data found" } }, 404);
  }

  return c.json({ data: effectiveness });
});

// Assign solution to a user
const assignSolutionSchema = z.object({
  userId: z.string(),
});

solutionsRoutes.post("/:id/assign", zValidator("json", assignSolutionSchema), async (c) => {
  const id = c.req.param("id");
  const { userId } = c.req.valid("json");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const solution = await repo.assignSolution(id, userId);

  if (!solution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  eventBus.publish("solution.updated", { solution });

  return c.json({ data: solution });
});

// Unassign solution
solutionsRoutes.post("/:id/unassign", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new SolutionRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Solution not found" } }, 404);
  }

  const solution = await repo.unassignSolution(id);

  if (!solution) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to unassign solution" } }, 500);
  }

  eventBus.publish("solution.updated", { solution });

  return c.json({ data: solution });
});
