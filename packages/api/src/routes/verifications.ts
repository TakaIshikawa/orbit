import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, VerificationRepository, IssueRepository, ProblemBriefRepository } from "@orbit/db";

export const verificationsRoutes = new Hono();

// List verifications
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  status: z.string().optional(),
});

verificationsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, sourceType, sourceId, status } = c.req.valid("query");

  const db = getDatabase();
  const repo = new VerificationRepository(db);

  const result = await repo.findByFilters({ sourceType, sourceId, status }, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get verification by ID
verificationsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new VerificationRepository(db);

  const verification = await repo.findById(id);

  if (!verification) {
    return c.json({ error: { code: "NOT_FOUND", message: "Verification not found" } }, 404);
  }

  return c.json({ data: verification });
});

// Get verifications for a specific source (pattern or brief)
verificationsRoutes.get("/by-source/:sourceType/:sourceId", async (c) => {
  const sourceType = c.req.param("sourceType");
  const sourceId = c.req.param("sourceId");

  const db = getDatabase();
  const repo = new VerificationRepository(db);

  const verifications = await repo.findBySource(sourceType, sourceId);

  return c.json({
    data: verifications,
    meta: {
      total: verifications.length,
    },
  });
});

// Get verification summary for a source
verificationsRoutes.get("/summary/:sourceType/:sourceId", async (c) => {
  const sourceType = c.req.param("sourceType");
  const sourceId = c.req.param("sourceId");

  const db = getDatabase();
  const repo = new VerificationRepository(db);

  const summary = await repo.getVerificationSummary(sourceType, sourceId);

  return c.json({ data: summary });
});

// Get verifications for an issue (includes verifications from patterns and brief)
verificationsRoutes.get("/by-issue/:issueId", async (c) => {
  const issueId = c.req.param("issueId");

  const db = getDatabase();
  const verificationRepo = new VerificationRepository(db);
  const issueRepo = new IssueRepository(db);
  const briefRepo = new ProblemBriefRepository(db);

  // Get the issue
  const issue = await issueRepo.findById(issueId);
  if (!issue) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }

  // Build list of sources to check
  const sources: Array<{ sourceType: string; sourceId: string }> = [];

  // Add pattern sources
  for (const patternId of issue.patternIds) {
    sources.push({ sourceType: "pattern", sourceId: patternId });
  }

  // Add brief source if exists
  const brief = await briefRepo.findByIssueId(issueId);
  if (brief) {
    sources.push({ sourceType: "brief", sourceId: brief.id });
  }

  // Fetch all verifications for these sources
  const verifications = await verificationRepo.findBySourceIds(sources);

  return c.json({
    data: verifications,
    meta: {
      total: verifications.length,
      issueId,
      patternCount: issue.patternIds.length,
      hasBrief: !!brief,
    },
  });
});
