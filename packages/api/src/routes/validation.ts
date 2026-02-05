import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDatabase,
  CausalClaimRepository,
  AdversarialValidationRepository,
  PredictionRepository,
  IssueRepository,
} from "@orbit/db";
import { generateId } from "@orbit/core";
import { EpistemologicalValidationService } from "../services/epistemological-validation.js";

export const validationRoutes = new Hono();

// =============================================================================
// CAUSAL CLAIMS
// =============================================================================

// Get causal claims for an issue
validationRoutes.get("/issues/:issueId/causal-claims", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new CausalClaimRepository(db);

  const claims = await repo.findClaimsByIssue(issueId);
  return c.json({ data: claims });
});

// Get causal chains for an issue
validationRoutes.get("/issues/:issueId/causal-chains", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new CausalClaimRepository(db);

  const chains = await repo.findChainsByIssue(issueId);
  return c.json({ data: chains });
});

// Get a causal chain with its claims
validationRoutes.get("/causal-chains/:chainId", async (c) => {
  const chainId = c.req.param("chainId");
  const db = getDatabase();
  const repo = new CausalClaimRepository(db);

  const result = await repo.getChainWithClaims(chainId);
  if (!result) {
    return c.json({ error: { code: "NOT_FOUND", message: "Causal chain not found" } }, 404);
  }

  return c.json({ data: result });
});

// =============================================================================
// ADVERSARIAL VALIDATIONS (Challenges)
// =============================================================================

// Get challenges for an issue
validationRoutes.get("/issues/:issueId/challenges", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new AdversarialValidationRepository(db);

  const challenges = await repo.findChallengesByEntity("issue", issueId);
  return c.json({ data: challenges });
});

// Get pending challenges for an issue
validationRoutes.get("/issues/:issueId/challenges/pending", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new AdversarialValidationRepository(db);

  const challenges = await repo.findPendingChallenges("issue", issueId);
  return c.json({ data: challenges });
});

// Resolve a challenge
const resolveChallengeSchema = z.object({
  resolution: z.enum(["resolved", "partially_resolved", "unresolved", "accepted"]),
  resolutionNotes: z.string().min(1),
  resolutionEvidence: z.array(z.object({
    sourceUrl: z.string().optional(),
    sourceName: z.string().optional(),
    excerpt: z.string(),
  })).optional(),
  confidenceImpact: z.number().min(-1).max(1).optional(),
  claimModified: z.string().optional(),
});

validationRoutes.post(
  "/challenges/:challengeId/resolve",
  zValidator("json", resolveChallengeSchema),
  async (c) => {
    const challengeId = c.req.param("challengeId");
    const body = c.req.valid("json");
    const db = getDatabase();
    const repo = new AdversarialValidationRepository(db);

    try {
      const updated = await repo.resolveChallenge(challengeId, {
        ...body,
        resolvedBy: "user",
      });
      return c.json({ data: updated });
    } catch (error) {
      return c.json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }, 404);
    }
  }
);

// Get challenge stats for an issue
validationRoutes.get("/issues/:issueId/challenges/stats", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new AdversarialValidationRepository(db);

  const stats = await repo.getChallengeStats("issue", issueId);
  return c.json({ data: stats });
});

// Get validation sessions for an issue
validationRoutes.get("/issues/:issueId/validation-sessions", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new AdversarialValidationRepository(db);

  const sessions = await repo.findSessionsByEntity("issue", issueId);
  return c.json({ data: sessions });
});

// =============================================================================
// PREDICTIONS
// =============================================================================

// Get predictions for an issue
validationRoutes.get("/issues/:issueId/predictions", async (c) => {
  const issueId = c.req.param("issueId");
  const db = getDatabase();
  const repo = new PredictionRepository(db);

  const predictions = await repo.findPredictionsByIssue(issueId);
  return c.json({ data: predictions });
});

// Get active predictions (across all issues)
validationRoutes.get("/predictions/active", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  const db = getDatabase();
  const repo = new PredictionRepository(db);

  const predictions = await repo.findActivePredictions(limit);
  return c.json({ data: predictions });
});

// Get predictions due soon
validationRoutes.get("/predictions/due-soon", async (c) => {
  const days = parseInt(c.req.query("days") || "7");
  const db = getDatabase();
  const repo = new PredictionRepository(db);

  const predictions = await repo.findPredictionsDueSoon(days);
  return c.json({ data: predictions });
});

// Get overdue predictions
validationRoutes.get("/predictions/overdue", async (c) => {
  const db = getDatabase();
  const repo = new PredictionRepository(db);

  const predictions = await repo.findOverduePredictions();
  return c.json({ data: predictions });
});

// Record prediction outcome
const recordOutcomeSchema = z.object({
  status: z.enum(["resolved_correct", "resolved_incorrect", "resolved_partial", "expired", "withdrawn"]),
  actualOutcome: z.string().min(1),
  actualValue: z.number().optional(),
  outcomeSource: z.string().optional(),
  postMortem: z.string().optional(),
});

validationRoutes.post(
  "/predictions/:predictionId/resolve",
  zValidator("json", recordOutcomeSchema),
  async (c) => {
    const predictionId = c.req.param("predictionId");
    const body = c.req.valid("json");
    const db = getDatabase();
    const repo = new PredictionRepository(db);

    try {
      const updated = await repo.resolvePrediction(predictionId, body);
      return c.json({ data: updated });
    } catch (error) {
      return c.json({ error: { code: "NOT_FOUND", message: "Prediction not found" } }, 404);
    }
  }
);

// Get calibration records
validationRoutes.get("/calibration", async (c) => {
  const scope = c.req.query("scope") || "all";
  const limit = parseInt(c.req.query("limit") || "10");
  const db = getDatabase();
  const repo = new PredictionRepository(db);

  const records = await repo.findCalibrationRecords(scope, limit);
  return c.json({ data: records });
});

// Calculate calibration for a period
const calculateCalibrationSchema = z.object({
  periodStart: z.string().transform(s => new Date(s)),
  periodEnd: z.string().transform(s => new Date(s)),
  scope: z.string().optional().default("all"),
});

validationRoutes.post(
  "/calibration/calculate",
  zValidator("json", calculateCalibrationSchema),
  async (c) => {
    const { periodStart, periodEnd, scope } = c.req.valid("json");
    const db = getDatabase();
    const repo = new PredictionRepository(db);

    try {
      const record = await repo.calculateCalibration(periodStart, periodEnd, scope);
      return c.json({ data: record });
    } catch (error) {
      return c.json({
        error: {
          code: "CALCULATION_FAILED",
          message: error instanceof Error ? error.message : "Failed to calculate calibration"
        }
      }, 400);
    }
  }
);

// =============================================================================
// VALIDATION SUMMARY
// =============================================================================

// Get validation summary for an issue
validationRoutes.get("/issues/:issueId/summary", async (c) => {
  const issueId = c.req.param("issueId");
  const service = new EpistemologicalValidationService();

  try {
    const summary = await service.getValidationSummary(issueId);
    return c.json({ data: summary });
  } catch (error) {
    return c.json({ error: { code: "NOT_FOUND", message: "Issue not found" } }, 404);
  }
});

// Trigger validation for an issue (manual trigger)
validationRoutes.post("/issues/:issueId/validate", async (c) => {
  const issueId = c.req.param("issueId");
  const service = new EpistemologicalValidationService();

  try {
    const result = await service.validateIssue(issueId);
    return c.json({
      data: {
        validationScore: result.validationScore,
        causalClaimsCount: result.causalAnalysis.claims.length,
        challengesCount: result.adversarialValidation.challenges.length,
        predictionsCount: result.predictions.predictions.length,
        adversarialResult: result.adversarialValidation.result,
      }
    });
  } catch (error) {
    return c.json({
      error: {
        code: "VALIDATION_FAILED",
        message: error instanceof Error ? error.message : "Failed to validate issue"
      }
    }, 500);
  }
});
