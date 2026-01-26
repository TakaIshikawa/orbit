import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, ScheduledJobRepository, JobRunRepository } from "@orbit/db";

export const schedulerRoutes = new Hono();

// List all scheduled jobs
const listJobsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  enabled: z.enum(["true", "false"]).optional(),
});

schedulerRoutes.get("/jobs", zValidator("query", listJobsQuerySchema), async (c) => {
  const { limit, offset, enabled } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ScheduledJobRepository(db);

  const result = await repo.findMany({ limit, offset });

  // Filter by enabled if specified
  let data = result.data;
  if (enabled !== undefined) {
    const enabledBool = enabled === "true";
    data = data.filter(job => job.enabled === enabledBool);
  }

  return c.json({
    data,
    meta: {
      total: data.length,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get a specific job
schedulerRoutes.get("/jobs/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ScheduledJobRepository(db);

  const job = await repo.findById(id);

  if (!job) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404);
  }

  return c.json({ data: job });
});

// Create a new job
const createJobSchema = z.object({
  name: z.string().min(1),
  jobType: z.enum(["scout", "analyze", "brief", "verify", "plan", "pipeline"]),
  cronExpression: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.unknown()).optional().default({}),
});

schedulerRoutes.post("/jobs", zValidator("json", createJobSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new ScheduledJobRepository(db);

  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const job = await repo.create({
    id,
    name: input.name,
    jobType: input.jobType,
    cronExpression: input.cronExpression,
    enabled: input.enabled,
    config: input.config,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({ data: job }, 201);
});

// Update job enabled status
schedulerRoutes.patch("/jobs/:id/enable", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ScheduledJobRepository(db);

  const job = await repo.findById(id);
  if (!job) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404);
  }

  await repo.setEnabled(id, true);
  return c.json({ data: { ...job, enabled: true } });
});

schedulerRoutes.patch("/jobs/:id/disable", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ScheduledJobRepository(db);

  const job = await repo.findById(id);
  if (!job) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404);
  }

  await repo.setEnabled(id, false);
  return c.json({ data: { ...job, enabled: false } });
});

// List job runs
const listRunsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  jobId: z.string().optional(),
});

schedulerRoutes.get("/runs", zValidator("query", listRunsQuerySchema), async (c) => {
  const { limit, offset, jobId } = c.req.valid("query");

  const db = getDatabase();
  const runRepo = new JobRunRepository(db);

  let result;
  if (jobId) {
    result = await runRepo.findByJob(jobId, { limit, offset });
  } else {
    result = await runRepo.findMany({ limit, offset });
  }

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get recent runs
schedulerRoutes.get("/runs/recent", async (c) => {
  const db = getDatabase();
  const runRepo = new JobRunRepository(db);

  const runs = await runRepo.findRecent(10);

  return c.json({ data: runs });
});

// Get a specific run
schedulerRoutes.get("/runs/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const runRepo = new JobRunRepository(db);

  const run = await runRepo.findById(id);

  if (!run) {
    return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
  }

  return c.json({ data: run });
});
