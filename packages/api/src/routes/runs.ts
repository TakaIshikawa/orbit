import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, RunLogRepository } from "@orbit/db";
import { CreateRunLogInputSchema, generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

export const runsRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  decisionId: z.string().optional(),
  agentId: z.string().optional(),
  runStatus: z.string().optional(),
});

runsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, decisionId, agentId, runStatus } = c.req.valid("query");

  const db = getDatabase();
  const repo = new RunLogRepository(db);

  const result = await repo.findByFilters({ decisionId, agentId, runStatus }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

runsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new RunLogRepository(db);

  const runLog = await repo.findById(id);

  if (!runLog) {
    return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
  }

  return c.json({ data: runLog });
});

runsRoutes.post("/", zValidator("json", CreateRunLogInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new RunLogRepository(db);

  const id = generateId("run");
  const now = new Date().toISOString();

  const payload = { ...input, type: "RunLog" as const };
  const contentHash = await computeContentHash(payload);

  const author = "actor_system";
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const runLog = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "active",
    decisionId: input.decisionId,
    agentId: input.agentId,
    triggeredBy: input.triggeredBy,
    startedAt: new Date(input.startedAt),
    completedAt: null,
    llmCalls: [],
    decisions: [],
    toolCalls: [],
    runStatus: "running",
    error: null,
    artifacts: [],
    stateChanges: [],
  });

  eventBus.publish("run.started", { run: runLog });

  return c.json({ data: runLog }, 201);
});

runsRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const db = getDatabase();
  const repo = new RunLogRepository(db);

  const runLog = await repo.update(id, body);

  if (!runLog) {
    return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
  }

  // Emit appropriate event based on run status
  const eventType = runLog.runStatus === "success" || runLog.runStatus === "failed" || runLog.runStatus === "timeout"
    ? "run.completed"
    : "run.updated";
  eventBus.publish(eventType, { run: runLog });

  return c.json({ data: runLog });
});
