import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, PlaybookRepository, PlaybookExecutionRepository, PlaybookStepExecutionRepository, type PlaybookStep, type PlaybookTrigger } from "@orbit/db";
import { CreatePlaybookInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const playbooksRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  playbookStatus: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
});

playbooksRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, playbookStatus, search, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const result = await repo.findByFilters({ playbookStatus, search, status }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

playbooksRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const playbook = await repo.findById(id);

  if (!playbook) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  return c.json({ data: playbook });
});

playbooksRoutes.post("/", zValidator("json", CreatePlaybookInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const id = generateId("pbk");
  const now = new Date().toISOString();

  const payload = { ...input, type: "Playbook" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const playbook = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: (input.playbookStatus || "draft") as "draft" | "active",
    name: input.name,
    description: input.description,
    applicableTo: input.applicableTo as Record<string, unknown>,
    problemBriefTemplate: input.problemBriefTemplate as Record<string, unknown>,
    investigationSteps: input.investigationSteps as string[],
    solutionPatterns: input.solutionPatterns as Array<{ name: string; description: string; template: Record<string, unknown> }>,
    timesUsed: 0,
    successRate: null,
    avgTimeToResolution: null,
    forkedFrom: input.forkedFrom ?? null,
    playbookStatus: (input.playbookStatus || "draft") as "draft" | "active" | "deprecated",
    steps: input.steps as PlaybookStep[],
    triggers: input.triggers as PlaybookTrigger[],
    isEnabled: false,
  });

  eventBus.publish("playbook.created", { playbook });

  return c.json({ data: playbook }, 201);
});

playbooksRoutes.post("/:id/fork", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const original = await repo.findById(id);

  if (!original) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  const forkId = generateId("pbk");
  const now = new Date().toISOString();

  const payload = {
    type: "Playbook" as const,
    name: `${original.name} (Fork)`,
    description: original.description,
    applicableTo: original.applicableTo,
    problemBriefTemplate: original.problemBriefTemplate,
    investigationSteps: original.investigationSteps,
    solutionPatterns: original.solutionPatterns,
    forkedFrom: id,
    playbookStatus: "draft" as const,
  };

  const contentHash = await computeContentHash(payload);
  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const forked = await repo.create({
    id: forkId,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: "draft",
    name: payload.name,
    description: payload.description,
    applicableTo: payload.applicableTo,
    problemBriefTemplate: payload.problemBriefTemplate,
    investigationSteps: payload.investigationSteps,
    solutionPatterns: payload.solutionPatterns,
    timesUsed: 0,
    successRate: null,
    avgTimeToResolution: null,
    forkedFrom: id,
    playbookStatus: "draft",
  });

  eventBus.publish("playbook.created", { playbook: forked });

  return c.json({ data: forked }, 201);
});

// Toggle playbook enabled status
playbooksRoutes.patch("/:id/enable", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const playbook = await repo.findById(id);
  if (!playbook) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  await repo.update(id, { isEnabled: true, playbookStatus: "active" });
  return c.json({ data: { ...playbook, isEnabled: true, playbookStatus: "active" } });
});

playbooksRoutes.patch("/:id/disable", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const playbook = await repo.findById(id);
  if (!playbook) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  await repo.update(id, { isEnabled: false });
  return c.json({ data: { ...playbook, isEnabled: false } });
});

// Run/execute a playbook
playbooksRoutes.post("/:id/run", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);
  const executionRepo = new PlaybookExecutionRepository(db);

  const playbook = await repo.findById(id);
  if (!playbook) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  const steps = (playbook.steps || []) as PlaybookStep[];
  if (steps.length === 0) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Playbook has no steps" } }, 400);
  }

  // Create execution record
  const executionId = `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  await executionRepo.create({
    id: executionId,
    playbookId: id,
    triggeredBy: "manual",
    triggerRef: undefined,
    status: "pending",
    startedAt: new Date(),
    context: {},
    currentStep: 0,
    totalSteps: steps.length,
    output: {},
    logs: [{ level: "info", message: "Execution queued", timestamp: new Date().toISOString() }],
  });

  // In a real implementation, this would trigger the playbook engine asynchronously
  // For now, we just create the execution record and return
  // The actual execution would be handled by a background worker

  // Note: Could publish event here when event type is registered
  // eventBus.publish("playbook.execution.started", { executionId, playbookId: id });

  return c.json({
    data: {
      executionId,
      playbookId: id,
      status: "pending",
      message: "Playbook execution started",
    },
  }, 202);
});

// Delete playbook
playbooksRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new PlaybookRepository(db);

  const playbook = await repo.findById(id);
  if (!playbook) {
    return c.json({ error: { code: "NOT_FOUND", message: "Playbook not found" } }, 404);
  }

  await repo.delete(id);
  return c.json({ data: { deleted: true, id } });
});

// Get playbook executions
playbooksRoutes.get("/:id/executions", async (c) => {
  const id = c.req.param("id");
  const limit = Number(c.req.query("limit") || "20");
  const offset = Number(c.req.query("offset") || "0");

  const db = getDatabase();
  const executionRepo = new PlaybookExecutionRepository(db);

  const result = await executionRepo.findByPlaybook(id, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get execution details
playbooksRoutes.get("/executions/:execId", async (c) => {
  const execId = c.req.param("execId");

  const db = getDatabase();
  const executionRepo = new PlaybookExecutionRepository(db);
  const stepRepo = new PlaybookStepExecutionRepository(db);

  const execution = await executionRepo.findById(execId);
  if (!execution) {
    return c.json({ error: { code: "NOT_FOUND", message: "Execution not found" } }, 404);
  }

  const steps = await stepRepo.findByExecution(execId);

  return c.json({
    data: {
      ...execution,
      steps,
    },
  });
});

// Get all recent executions
playbooksRoutes.get("/executions", async (c) => {
  const limit = Number(c.req.query("limit") || "20");
  const offset = Number(c.req.query("offset") || "0");

  const db = getDatabase();
  const executionRepo = new PlaybookExecutionRepository(db);

  const result = await executionRepo.findMany({ limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});
