import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDatabase, IssueRepository, PatternRepository, SolutionRepository } from "@orbit/db";
import { CreateIssueInputSchema, generateId, computeContentHash, computeCompositeScore } from "@orbit/core";
import { generateIssueSummary, type IssueSummaryInput } from "@orbit/agent";
import { eventBus } from "../events/index.js";

export const issuesRoutes = new Hono();

// List issues
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  issueStatus: z.string().optional(),
  timeHorizon: z.string().optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  maxScore: z.coerce.number().min(0).max(1).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["compositeScore", "createdAt", "urgency", "impact"]).optional().default("compositeScore"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

issuesRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, issueStatus, timeHorizon, minScore, maxScore, search, sortBy, order } =
    c.req.valid("query");

  const db = getDatabase();
  const repo = new IssueRepository(db);

  const result = await repo.findByFilters(
    {
      issueStatus,
      timeHorizon,
      minCompositeScore: minScore,
      maxCompositeScore: maxScore,
      search,
    },
    { limit, offset, sortBy, order }
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

// Get issue by ID
issuesRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new IssueRepository(db);

  const issue = await repo.findById(id);

  if (!issue) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }

  return c.json({ data: issue });
});

// Get issue graph (connected issues)
issuesRoutes.get("/:id/graph", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new IssueRepository(db);

  const issue = await repo.findById(id);

  if (!issue) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }

  const related = await repo.findRelated(id);

  return c.json({
    data: {
      issue,
      upstream: related.upstream,
      downstream: related.downstream,
      related: related.related,
    },
  });
});

// Create issue
issuesRoutes.post("/", zValidator("json", CreateIssueInputSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new IssueRepository(db);

  const id = generateId("iss");
  const now = new Date().toISOString();
  const compositeScore = computeCompositeScore(input.scores);

  // Compute content hash
  const payload = { ...input, type: "Issue" as const, compositeScore };
  const contentHash = await computeContentHash(payload);

  // TODO: Get author from auth context
  const author = "actor_system";
  // TODO: Sign content
  const authorSignature = `sig:placeholder_${Date.now()}`;

  const issue = await repo.create({
    id,
    contentHash,
    parentHash: null,
    author,
    authorSignature,
    createdAt: new Date(now),
    version: 1,
    status: input.status || "draft",
    title: input.title,
    summary: input.summary,
    patternIds: input.patternIds || [],
    rootCauses: input.rootCauses || [],
    affectedDomains: input.affectedDomains,
    leveragePoints: input.leveragePoints || [],
    scoreImpact: input.scores.impact,
    scoreUrgency: input.scores.urgency,
    scoreTractability: input.scores.tractability,
    scoreLegitimacy: input.scores.legitimacy,
    scoreNeglectedness: input.scores.neglectedness,
    compositeScore,
    upstreamIssues: input.upstreamIssues || [],
    downstreamIssues: input.downstreamIssues || [],
    relatedIssues: input.relatedIssues || [],
    timeHorizon: input.timeHorizon,
    propagationVelocity: input.propagationVelocity,
    issueStatus: input.issueStatus || "identified",
  });

  eventBus.publish("issue.created", { issue });

  return c.json({ data: issue }, 201);
});

// Update issue
const updateIssueSchema = CreateIssueInputSchema.partial();

issuesRoutes.patch("/:id", zValidator("json", updateIssueSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new IssueRepository(db);

  const existing = await repo.findById(id);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }

  // Build update object
  const updateData: Record<string, unknown> = {};

  if (input.title) updateData.title = input.title;
  if (input.summary) updateData.summary = input.summary;
  if (input.patternIds) updateData.patternIds = input.patternIds;
  if (input.rootCauses) updateData.rootCauses = input.rootCauses;
  if (input.affectedDomains) updateData.affectedDomains = input.affectedDomains;
  if (input.leveragePoints) updateData.leveragePoints = input.leveragePoints;
  if (input.scores) {
    updateData.scoreImpact = input.scores.impact;
    updateData.scoreUrgency = input.scores.urgency;
    updateData.scoreTractability = input.scores.tractability;
    updateData.scoreLegitimacy = input.scores.legitimacy;
    updateData.scoreNeglectedness = input.scores.neglectedness;
    updateData.compositeScore = computeCompositeScore(input.scores);
  }
  if (input.upstreamIssues) updateData.upstreamIssues = input.upstreamIssues;
  if (input.downstreamIssues) updateData.downstreamIssues = input.downstreamIssues;
  if (input.relatedIssues) updateData.relatedIssues = input.relatedIssues;
  if (input.timeHorizon) updateData.timeHorizon = input.timeHorizon;
  if (input.propagationVelocity) updateData.propagationVelocity = input.propagationVelocity;
  if (input.issueStatus) updateData.issueStatus = input.issueStatus;

  // Increment version
  updateData.version = existing.version + 1;
  updateData.parentHash = existing.contentHash;

  // Recompute content hash
  const payload = { ...existing, ...updateData };
  updateData.contentHash = await computeContentHash(payload);

  const updated = await repo.update(id, updateData);

  eventBus.publish("issue.updated", { issue: updated });

  return c.json({ data: updated });
});

// Generate/regenerate summary for an issue
issuesRoutes.post("/:id/summarize", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const issueRepo = new IssueRepository(db);
  const patternRepo = new PatternRepository(db);
  const solutionRepo = new SolutionRepository(db);

  const issue = await issueRepo.findById(id);
  if (!issue) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }

  // Get related patterns for context
  let patterns: Array<{ title: string; description: string }> = [];
  if (issue.patternIds && issue.patternIds.length > 0) {
    const patternResults = await Promise.all(
      issue.patternIds.slice(0, 5).map(pid => patternRepo.findById(pid))
    );
    patterns = patternResults
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map(p => ({ title: p.title, description: p.description }));
  }

  // Get solution counts
  const solutions = await solutionRepo.findByFilters({ issueId: id }, { limit: 100 });
  const activeSolutions = solutions.data.filter(s => s.solutionStatus === "in_progress");

  // Build input for summarization
  const summaryInput: IssueSummaryInput = {
    title: issue.title,
    summary: issue.summary,
    rootCauses: issue.rootCauses || [],
    affectedDomains: issue.affectedDomains,
    scoreImpact: issue.scoreImpact,
    scoreUrgency: issue.scoreUrgency,
    scoreTractability: issue.scoreTractability,
    scoreNeglectedness: issue.scoreNeglectedness,
    patterns,
    solutionCount: solutions.total,
    activeSolutionCount: activeSolutions.length,
    issueStatus: issue.issueStatus,
  };

  // Generate summary
  const summary = await generateIssueSummary(summaryInput);

  // Update issue with summary fields
  const updated = await issueRepo.update(id, {
    headline: summary.headline,
    whyNow: summary.whyNow,
    keyNumber: summary.keyNumber,
    simpleStatus: summary.simpleStatus,
  });

  return c.json({
    data: {
      issue: updated,
      summary,
    },
  });
});

// Batch summarize all issues (or issues without summaries)
issuesRoutes.post("/summarize-all", async (c) => {
  const db = getDatabase();
  const issueRepo = new IssueRepository(db);

  // Get issues without headlines
  const issues = await issueRepo.findByFilters({}, { limit: 100 });
  const needsSummary = issues.data.filter(i => !i.headline);

  const results: Array<{ id: string; headline: string; error?: string }> = [];

  for (const issue of needsSummary.slice(0, 10)) { // Limit to 10 at a time
    try {
      // Call the individual summarize endpoint logic
      const summaryInput: IssueSummaryInput = {
        title: issue.title,
        summary: issue.summary,
        rootCauses: issue.rootCauses || [],
        affectedDomains: issue.affectedDomains,
        scoreImpact: issue.scoreImpact,
        scoreUrgency: issue.scoreUrgency,
        scoreTractability: issue.scoreTractability,
        scoreNeglectedness: issue.scoreNeglectedness,
        issueStatus: issue.issueStatus,
      };

      const summary = await generateIssueSummary(summaryInput);

      await issueRepo.update(issue.id, {
        headline: summary.headline,
        whyNow: summary.whyNow,
        keyNumber: summary.keyNumber,
        simpleStatus: summary.simpleStatus,
      });

      results.push({ id: issue.id, headline: summary.headline });
    } catch (error) {
      results.push({
        id: issue.id,
        headline: "",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return c.json({
    data: {
      processed: results.length,
      total: needsSummary.length,
      results,
    },
  });
});
