import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDatabase,
  FeedbackEventRepository,
  ConfidenceAdjustmentRepository,
  SystemLearningRepository,
  EvaluationRunRepository,
} from "@orbit/db";

export const feedbackRoutes = new Hono();

// Get feedback system stats
feedbackRoutes.get("/stats", async (c) => {
  const db = getDatabase();
  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  // Get pending events
  const pending = await feedbackRepo.findPending(1000);

  // Count by type
  const byType = {
    verification_result: 0,
    solution_outcome: 0,
    source_accuracy: 0,
    playbook_execution: 0,
    manual_correction: 0,
  };

  for (const event of pending) {
    if (event.feedbackType in byType) {
      byType[event.feedbackType as keyof typeof byType]++;
    }
  }

  // Get adjustment stats for last 24h
  const adjustmentStats = await adjustmentRepo.getAdjustmentStats(undefined, 1);

  // Get learning count
  const learnings = await learningRepo.findMany({ limit: 1 });

  return c.json({
    data: {
      pendingCount: pending.length,
      processedLast24h: adjustmentStats.totalAdjustments,
      adjustmentsMadeLast24h: adjustmentStats.totalAdjustments,
      learningsCount: learnings.total,
      byType,
    },
  });
});

// List pending feedback events
const listPendingQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  feedbackType: z.string().optional(),
});

feedbackRoutes.get("/pending", zValidator("query", listPendingQuerySchema), async (c) => {
  const { limit, feedbackType } = c.req.valid("query");

  const db = getDatabase();
  const repo = new FeedbackEventRepository(db);

  const pending = await repo.findPending(limit);

  // Filter by type if specified
  let data = pending;
  if (feedbackType) {
    data = pending.filter(e => e.feedbackType === feedbackType);
  }

  return c.json({
    data,
    meta: {
      total: data.length,
      limit,
      offset: 0,
    },
  });
});

// List recent adjustments
const listAdjustmentsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  entityType: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional().default(7),
});

feedbackRoutes.get("/adjustments", zValidator("query", listAdjustmentsQuerySchema), async (c) => {
  const { limit, offset, entityType } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ConfidenceAdjustmentRepository(db);

  const result = await repo.findMany({ limit, offset });

  // Filter by entity type if specified
  let data = result.data;
  if (entityType) {
    data = data.filter(a => a.entityType === entityType);
  }

  return c.json({
    data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get adjustment stats
const adjustmentStatsQuerySchema = z.object({
  entityType: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional().default(7),
});

feedbackRoutes.get("/adjustments/stats", zValidator("query", adjustmentStatsQuerySchema), async (c) => {
  const { entityType, days } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ConfidenceAdjustmentRepository(db);

  const stats = await repo.getAdjustmentStats(entityType, days);

  return c.json({ data: stats });
});

// Get adjustments for a specific entity
feedbackRoutes.get("/adjustments/:entityType/:entityId", async (c) => {
  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");

  const db = getDatabase();
  const repo = new ConfidenceAdjustmentRepository(db);

  const result = await repo.findByEntity(entityType, entityId);

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// List system learnings
const listLearningsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  category: z.string().optional(),
});

feedbackRoutes.get("/learnings", zValidator("query", listLearningsQuerySchema), async (c) => {
  const { limit, offset, category } = c.req.valid("query");

  const db = getDatabase();
  const repo = new SystemLearningRepository(db);

  let result;
  if (category) {
    result = await repo.findByCategory(category, { limit, offset });
  } else {
    result = await repo.findMany({ limit, offset });
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

// Get a specific learning
feedbackRoutes.get("/learnings/:category/:key", async (c) => {
  const category = c.req.param("category");
  const key = decodeURIComponent(c.req.param("key"));

  const db = getDatabase();
  const repo = new SystemLearningRepository(db);

  const learning = await repo.findByKey(category, key);

  if (!learning) {
    return c.json({ error: { code: "NOT_FOUND", message: "Learning not found" } }, 404);
  }

  return c.json({ data: learning });
});

// List evaluation runs
const listEvaluationsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

feedbackRoutes.get("/evaluations", zValidator("query", listEvaluationsQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid("query");

  const db = getDatabase();
  const repo = new EvaluationRunRepository(db);

  const result = await repo.findMany({ limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get latest evaluation
feedbackRoutes.get("/evaluations/latest", async (c) => {
  const db = getDatabase();
  const repo = new EvaluationRunRepository(db);

  const latest = await repo.getLatest();

  if (!latest) {
    return c.json({ error: { code: "NOT_FOUND", message: "No evaluations found" } }, 404);
  }

  return c.json({ data: latest });
});

// Run feedback processor manually
// Note: This endpoint triggers the feedback processor inline
// For production, consider using a job queue instead
feedbackRoutes.post("/process", async (c) => {
  const db = getDatabase();
  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);

  try {
    // Get pending events
    const pending = await feedbackRepo.findPending(100);

    let eventsProcessed = 0;
    let adjustmentsMade = 0;
    let errors = 0;

    // Process each event (simplified inline processing)
    for (const event of pending) {
      try {
        // Mark as processed (actual adjustment logic would go here)
        await feedbackRepo.markProcessed(event.id, false);
        eventsProcessed++;
      } catch {
        errors++;
      }
    }

    return c.json({
      data: {
        eventsProcessed,
        adjustmentsMade,
        learningsUpdated: 0,
        errors,
      },
    });
  } catch (error) {
    return c.json({
      error: {
        code: "PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Run system evaluation manually
// Returns current system metrics snapshot with real data
feedbackRoutes.post("/evaluate", async (c) => {
  const db = getDatabase();
  const evalRepo = new EvaluationRunRepository(db);

  try {
    // Import repositories dynamically to avoid circular deps
    const { PatternRepository, IssueRepository, SolutionRepository, SourceHealthRepository, VerificationRepository } = await import("@orbit/db");

    const patternRepo = new PatternRepository(db);
    const issueRepo = new IssueRepository(db);
    const solutionRepo = new SolutionRepository(db);
    const sourceHealthRepo = new SourceHealthRepository(db);
    const verificationRepo = new VerificationRepository(db);
    const feedbackRepo = new FeedbackEventRepository(db);
    const adjustmentRepo = new ConfidenceAdjustmentRepository(db);

    const id = `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Gather actual metrics
    const patterns = await patternRepo.findByFilters({}, { limit: 1000 });
    const issues = await issueRepo.findByFilters({}, { limit: 1000 });
    const solutions = await solutionRepo.findByFilters({}, { limit: 1000 });
    const sourceHealth = await sourceHealthRepo.findMany({ limit: 1000 });
    const verifications = await verificationRepo.findMany({ limit: 1000 });
    const pendingFeedback = await feedbackRepo.findPending(1000);
    const adjustmentStats = await adjustmentRepo.getAdjustmentStats(undefined, 1);

    // Calculate pattern metrics
    const avgPatternConfidence = patterns.data.length > 0
      ? patterns.data.reduce((sum, p) => sum + (p.confidence || 0), 0) / patterns.data.length
      : 0;
    const verifiedPatterns = patterns.data.filter(p => p.status === "verified").length;
    const patternVerificationRate = patterns.data.length > 0
      ? verifiedPatterns / patterns.data.length
      : 0;

    // Calculate issue metrics
    const resolvedIssues = issues.data.filter(i => i.issueStatus === "resolved").length;
    const avgCompositeScore = issues.data.length > 0
      ? issues.data.reduce((sum, i) => sum + (i.compositeScore || 0), 0) / issues.data.length
      : 0;

    // Calculate solution metrics
    const completedSolutions = solutions.data.filter(s => s.solutionStatus === "completed").length;
    const avgEffectiveness = solutions.data.length > 0
      ? solutions.data.reduce((sum, s) => sum + (s.impactScore || 0), 0) / solutions.data.length
      : 0;

    // Calculate source health metrics
    const healthySources = sourceHealth.data.filter(s => s.healthStatus === "healthy").length;
    const degradedSources = sourceHealth.data.filter(s => s.healthStatus === "degraded" || s.healthStatus === "unhealthy").length;
    const avgSourceHealth = sourceHealth.data.length > 0
      ? sourceHealth.data.reduce((sum, s) => sum + (s.successRate || 0), 0) / sourceHealth.data.length
      : 0;

    // Calculate verification accuracy
    const corroboratedVerifications = verifications.data.filter(v => v.verificationStatus === "corroborated").length;
    const avgVerificationAccuracy = verifications.data.length > 0
      ? corroboratedVerifications / verifications.data.length
      : 0;

    // Generate recommendations based on metrics
    const recommendations: string[] = [];

    if (avgPatternConfidence < 0.6) {
      recommendations.push("Pattern confidence is low. Consider running more verification passes.");
    }
    if (degradedSources > 0) {
      recommendations.push(`${degradedSources} source(s) are degraded or unhealthy. Review source health.`);
    }
    if (pendingFeedback.length > 50) {
      recommendations.push(`${pendingFeedback.length} pending feedback events. Run feedback processor.`);
    }
    if (patterns.data.length > 0 && verifiedPatterns === 0) {
      recommendations.push("No patterns have been verified yet. Run the verify command.");
    }
    if (issues.data.length > 0 && resolvedIssues === 0) {
      recommendations.push("No issues have been resolved. Review and triage open issues.");
    }

    // Create evaluation record with real metrics
    const evaluation = await evalRepo.create({
      id,
      periodStart,
      periodEnd: now,
      completedAt: now,
      metrics: {
        patternsCreated: patterns.total,
        patternsVerified: verifiedPatterns,
        avgPatternConfidence,
        patternVerificationRate,
        issuesCreated: issues.total,
        issuesResolved: resolvedIssues,
        avgResolutionTime: 0, // Would need timestamp tracking
        avgCompositeScore,
        solutionsProposed: solutions.total,
        solutionsCompleted: completedSolutions,
        avgEffectiveness,
        solutionsExceedingEstimate: 0, // Would need outcome tracking
        sourcesMonitored: sourceHealth.total,
        avgSourceHealth,
        degradedSources,
        avgVerificationAccuracy,
        feedbackEventsProcessed: adjustmentStats.totalAdjustments,
        adjustmentsMade: adjustmentStats.totalAdjustments,
        avgAdjustmentMagnitude: adjustmentStats.avgAdjustmentMagnitude,
      },
      recommendations,
    });

    return c.json({ data: evaluation });
  } catch (error) {
    console.error("Evaluation error:", error);
    return c.json({
      error: {
        code: "EVALUATION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Submit manual correction
const manualCorrectionSchema = z.object({
  targetEntityType: z.string(),
  targetEntityId: z.string(),
  field: z.string(),
  correctedValue: z.number(),
  reason: z.string(),
});

feedbackRoutes.post("/corrections", zValidator("json", manualCorrectionSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const feedbackRepo = new FeedbackEventRepository(db);

  const id = `fb_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  await feedbackRepo.create({
    id,
    feedbackType: "manual_correction",
    sourceEntityType: "user",
    sourceEntityId: "manual",
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    feedbackData: {
      field: input.field,
      correctedValue: input.correctedValue,
      reason: input.reason,
    },
    status: "pending",
    createdAt: new Date(),
  });

  return c.json({
    data: {
      id,
      message: "Manual correction submitted for processing",
    },
  }, 201);
});
