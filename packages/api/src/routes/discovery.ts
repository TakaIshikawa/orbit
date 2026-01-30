import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, DiscoveryProfileRepository, PlaybookExecutionRepository, PlaybookRepository } from "@orbit/db";
import { eventBus } from "../events/index.js";

export const discoveryRoutes = new Hono();

// Query schemas
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  isScheduled: z.coerce.boolean().optional(),
  isDefault: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

const runsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  offset: z.coerce.number().min(0).optional().default(0),
});

// Create/Update schemas
const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sourceIds: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
  excludeKeywords: z.array(z.string()).optional().default([]),
  maxPatterns: z.number().min(1).max(100).optional().default(20),
  maxIssues: z.number().min(1).max(50).optional().default(5),
  minSourceCredibility: z.number().min(0).max(1).optional().default(0.5),
  isDefault: z.boolean().optional().default(false),
});

const updateProfileSchema = createProfileSchema.partial();

const scheduleSchema = z.object({
  cronExpression: z.string().min(1),
  nextRunAt: z.string().datetime().optional(),
});

// List all discovery profiles
discoveryRoutes.get("/profiles", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, isScheduled, isDefault, search } = c.req.valid("query");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const result = await repo.findByFilters(
    { isScheduled, isDefault, search },
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

// Get recent discovery runs (playbook executions with scout action)
discoveryRoutes.get("/runs", zValidator("query", runsQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid("query");

  const db = getDatabase();
  const executionRepo = new PlaybookExecutionRepository(db);

  // Get recent executions - in a real implementation, we'd filter by discovery-related playbooks
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

// Get a specific discovery profile
discoveryRoutes.get("/profiles/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const profile = await repo.findById(id);

  if (!profile) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  return c.json({ data: profile });
});

// Create a new discovery profile
discoveryRoutes.post("/profiles", zValidator("json", createProfileSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const profile = await repo.createProfile(input);

  eventBus.publish("discovery.profile.created", { profile });

  return c.json({ data: profile }, 201);
});

// Update a discovery profile
discoveryRoutes.patch("/profiles/:id", zValidator("json", updateProfileSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  const updated = await repo.updateProfile(id, input);

  if (!updated) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to update profile" } }, 500);
  }

  eventBus.publish("discovery.profile.updated", { profile: updated });

  return c.json({ data: updated });
});

// Delete a discovery profile
discoveryRoutes.delete("/profiles/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  await repo.delete(id);

  eventBus.publish("discovery.profile.deleted", { profileId: id });

  return c.json({ data: { deleted: true, id } });
});

// Run a discovery profile (triggers playbook execution)
discoveryRoutes.post("/profiles/:id/run", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const profileRepo = new DiscoveryProfileRepository(db);
  const playbookRepo = new PlaybookRepository(db);
  const executionRepo = new PlaybookExecutionRepository(db);

  const profile = await profileRepo.findById(id);
  if (!profile) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  // Find or create a discovery playbook
  // In a real implementation, this would use a specific discovery playbook
  // For now, we'll create an execution record directly
  const executionId = `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  await executionRepo.create({
    id: executionId,
    playbookId: "discovery", // Virtual playbook ID for discovery runs
    triggeredBy: "manual",
    triggerRef: id, // Profile ID as trigger reference
    status: "pending",
    startedAt: new Date(),
    context: {
      variables: {
        profileId: id,
        profileName: profile.name,
        sourceIds: profile.sourceIds,
        domains: profile.domains,
        keywords: profile.keywords,
        excludeKeywords: profile.excludeKeywords,
        maxPatterns: profile.maxPatterns,
        maxIssues: profile.maxIssues,
        minSourceCredibility: profile.minSourceCredibility,
      },
    },
    currentStep: 0,
    totalSteps: 5, // Scout -> Analyze -> Issues -> Verify -> Solutions
    output: {},
    logs: [{ level: "info", message: "Discovery run queued", timestamp: new Date().toISOString() }],
  });

  // Record the run in the profile
  await profileRepo.recordRun(id);

  eventBus.publish("discovery.run.started", { executionId, profileId: id });

  return c.json({
    data: {
      executionId,
      profileId: id,
      status: "pending",
      message: "Discovery run started",
    },
  }, 202);
});

// Enable scheduling for a profile
discoveryRoutes.post("/profiles/:id/schedule", zValidator("json", scheduleSchema), async (c) => {
  const id = c.req.param("id");
  const { cronExpression, nextRunAt } = c.req.valid("json");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  const updated = await repo.enableSchedule(
    id,
    cronExpression,
    nextRunAt ? new Date(nextRunAt) : undefined
  );

  if (!updated) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to enable schedule" } }, 500);
  }

  eventBus.publish("discovery.profile.scheduled", { profile: updated });

  return c.json({ data: updated });
});

// Disable scheduling for a profile
discoveryRoutes.delete("/profiles/:id/schedule", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  const updated = await repo.disableSchedule(id);

  if (!updated) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to disable schedule" } }, 500);
  }

  eventBus.publish("discovery.profile.unscheduled", { profile: updated });

  return c.json({ data: updated });
});

// Set a profile as the default
discoveryRoutes.post("/profiles/:id/set-default", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Discovery profile not found" } }, 404);
  }

  const updated = await repo.setDefault(id);

  if (!updated) {
    return c.json({ error: { code: "UPDATE_FAILED", message: "Failed to set default" } }, 500);
  }

  return c.json({ data: updated });
});

// Get the default profile
discoveryRoutes.get("/profiles/default", async (c) => {
  const db = getDatabase();
  const repo = new DiscoveryProfileRepository(db);

  const profile = await repo.findDefault();

  if (!profile) {
    return c.json({ error: { code: "NOT_FOUND", message: "No default profile set" } }, 404);
  }

  return c.json({ data: profile });
});
