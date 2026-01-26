/**
 * Feedback Processor Job
 *
 * Processes pending feedback events and applies adjustments to:
 * - Pattern confidence based on verification results
 * - Source reliability based on verification accuracy
 * - System learnings based on solution outcomes
 *
 * This creates the closed feedback loops for continuous improvement.
 */

import {
  FeedbackEventRepository,
  ConfidenceAdjustmentRepository,
  SystemLearningRepository,
  PatternRepository,
  SourceHealthRepository,
  VerificationRepository,
  SolutionOutcomeRepository,
  SolutionEffectivenessRepository,
  type FeedbackEventRow,
  type Database,
} from "@orbit/db";
import { eq, sql } from "drizzle-orm";

export interface FeedbackProcessorResult {
  eventsProcessed: number;
  adjustmentsMade: number;
  learningsUpdated: number;
  errors: number;
}

export interface FeedbackProcessorOptions {
  maxEvents?: number;
  dryRun?: boolean;
}

/**
 * Main feedback processor job
 */
export async function runFeedbackProcessor(
  db: Database,
  options: FeedbackProcessorOptions = {}
): Promise<FeedbackProcessorResult> {
  const { maxEvents = 100, dryRun = false } = options;

  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  // Get pending feedback events
  const pendingEvents = await feedbackRepo.findPending(maxEvents);

  console.log(`[FeedbackProcessor] Processing ${pendingEvents.length} pending events...`);

  let eventsProcessed = 0;
  let adjustmentsMade = 0;
  let learningsUpdated = 0;
  let errors = 0;

  for (const event of pendingEvents) {
    try {
      let result: ProcessingResult;

      switch (event.feedbackType) {
        case "verification_result":
          result = await processVerificationFeedback(db, event, adjustmentRepo, learningRepo, dryRun);
          break;
        case "solution_outcome":
          result = await processSolutionOutcomeFeedback(db, event, adjustmentRepo, learningRepo, dryRun);
          break;
        case "source_accuracy":
          result = await processSourceAccuracyFeedback(db, event, adjustmentRepo, learningRepo, dryRun);
          break;
        case "playbook_execution":
          result = await processPlaybookExecutionFeedback(db, event, adjustmentRepo, learningRepo, dryRun);
          break;
        default:
          result = { adjusted: false, learningUpdated: false };
      }

      if (result.adjusted) adjustmentsMade++;
      if (result.learningUpdated) learningsUpdated++;

      // Mark event as processed
      if (!dryRun) {
        await feedbackRepo.markProcessed(
          event.id,
          result.adjusted,
          result.adjustmentDetails
        );
      }

      eventsProcessed++;
    } catch (error) {
      console.error(`[FeedbackProcessor] Error processing event ${event.id}:`, error);
      errors++;

      if (!dryRun) {
        await feedbackRepo.markProcessed(
          event.id,
          false,
          undefined,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  }

  console.log(`[FeedbackProcessor] Completed: ${eventsProcessed} events, ${adjustmentsMade} adjustments, ${learningsUpdated} learnings, ${errors} errors`);

  return {
    eventsProcessed,
    adjustmentsMade,
    learningsUpdated,
    errors,
  };
}

interface ProcessingResult {
  adjusted: boolean;
  learningUpdated: boolean;
  adjustmentDetails?: {
    field?: string;
    previousValue?: number;
    newValue?: number;
    adjustmentReason?: string;
  };
}

/**
 * Loop 1: Verification → Pattern Confidence
 *
 * When verification results come in, adjust the pattern's confidence:
 * - Corroborated claims increase confidence
 * - Contested claims decrease confidence
 * - Partially supported claims slightly decrease confidence
 */
async function processVerificationFeedback(
  db: Database,
  event: FeedbackEventRow,
  adjustmentRepo: ConfidenceAdjustmentRepository,
  learningRepo: SystemLearningRepository,
  dryRun: boolean
): Promise<ProcessingResult> {
  const patternRepo = new PatternRepository(db);
  const data = event.feedbackData;

  // Get current pattern
  const pattern = await patternRepo.findById(event.targetEntityId);
  if (!pattern) {
    return { adjusted: false, learningUpdated: false };
  }

  // Calculate confidence adjustment based on verification outcome
  const verificationStatus = data.verificationStatus;
  let confidenceMultiplier = 1.0;

  switch (verificationStatus) {
    case "corroborated":
      confidenceMultiplier = 1.05; // Increase by 5%
      break;
    case "contested":
      confidenceMultiplier = 0.85; // Decrease by 15%
      break;
    case "partially_supported":
      confidenceMultiplier = 0.95; // Decrease by 5%
      break;
    case "unverified":
      confidenceMultiplier = 0.98; // Slight decrease for uncertainty
      break;
    default:
      return { adjusted: false, learningUpdated: false };
  }

  const previousConfidence = pattern.confidence;
  const newConfidence = Math.max(0.1, Math.min(1.0, previousConfidence * confidenceMultiplier));

  // Skip if adjustment is negligible
  if (Math.abs(newConfidence - previousConfidence) < 0.001) {
    return { adjusted: false, learningUpdated: false };
  }

  if (!dryRun) {
    // Apply the adjustment
    await patternRepo.update(event.targetEntityId, { confidence: newConfidence });

    // Record the adjustment
    await adjustmentRepo.recordAdjustment(
      "pattern",
      event.targetEntityId,
      "confidence",
      previousConfidence,
      newConfidence,
      `Verification ${verificationStatus}: confidence adjusted from ${(previousConfidence * 100).toFixed(1)}% to ${(newConfidence * 100).toFixed(1)}%`,
      event.id,
      { verificationIds: [event.sourceEntityId], confidenceInAdjustment: 0.8 }
    );

    // Update learning for pattern type
    await learningRepo.upsertLearning(
      "pattern_verification",
      `pattern_type:${pattern.patternType}`,
      {
        incrementSample: true,
        incrementSuccess: verificationStatus === "corroborated",
        incrementFailure: verificationStatus === "contested",
        avgConfidence: newConfidence,
      }
    );
  }

  console.log(
    `[FeedbackProcessor] Pattern ${pattern.id}: confidence ${(previousConfidence * 100).toFixed(1)}% → ${(newConfidence * 100).toFixed(1)}% (${verificationStatus})`
  );

  return {
    adjusted: true,
    learningUpdated: true,
    adjustmentDetails: {
      field: "confidence",
      previousValue: previousConfidence,
      newValue: newConfidence,
      adjustmentReason: `Verification result: ${verificationStatus}`,
    },
  };
}

/**
 * Loop 2: Solution Outcomes → Learning
 *
 * When solution outcomes are recorded, update system learnings:
 * - Track effectiveness by solution type
 * - Track effectiveness by domain
 * - Learn what works
 */
async function processSolutionOutcomeFeedback(
  db: Database,
  event: FeedbackEventRow,
  adjustmentRepo: ConfidenceAdjustmentRepository,
  learningRepo: SystemLearningRepository,
  dryRun: boolean
): Promise<ProcessingResult> {
  const data = event.feedbackData;

  const effectivenessScore = data.effectivenessScore ?? 0;
  const impactVariance = data.impactVariance ?? 0;
  const metricsAchieved = data.metricsAchieved ?? 0;
  const metricsMissed = data.metricsMissed ?? 0;

  // Determine success/failure
  const isSuccess = effectivenessScore >= 0.6 && impactVariance >= -0.1;
  const isFailure = effectivenessScore < 0.4 || impactVariance < -0.2;

  if (!dryRun) {
    // Update general solution effectiveness learning
    await learningRepo.upsertLearning(
      "solution_effectiveness",
      "overall",
      {
        incrementSample: true,
        incrementSuccess: isSuccess,
        incrementFailure: isFailure,
        avgEffectiveness: effectivenessScore,
      }
    );

    // If we have enough data about over/under estimation, record insight
    if (Math.abs(impactVariance) > 0.2) {
      const insight = impactVariance > 0
        ? "Solutions tend to exceed impact estimates"
        : "Solutions tend to underperform impact estimates";

      await learningRepo.addInsight(
        "solution_effectiveness",
        "overall",
        insight,
        0.7,
        [event.sourceEntityId]
      );
    }
  }

  console.log(
    `[FeedbackProcessor] Solution outcome recorded: effectiveness=${(effectivenessScore * 100).toFixed(1)}%, variance=${(impactVariance * 100).toFixed(1)}%`
  );

  return {
    adjusted: false, // Solution outcomes don't directly adjust confidence, they inform learning
    learningUpdated: true,
    adjustmentDetails: {
      adjustmentReason: `Solution outcome: effectiveness ${(effectivenessScore * 100).toFixed(1)}%`,
    },
  };
}

/**
 * Loop 3: Source Verification → Credibility
 *
 * When sources are used in verifications, track their accuracy
 * and adjust dynamic reliability accordingly.
 */
async function processSourceAccuracyFeedback(
  db: Database,
  event: FeedbackEventRow,
  adjustmentRepo: ConfidenceAdjustmentRepository,
  learningRepo: SystemLearningRepository,
  dryRun: boolean
): Promise<ProcessingResult> {
  const healthRepo = new SourceHealthRepository(db);
  const data = event.feedbackData;

  const domain = event.targetEntityId;
  const accuracyScore = data.accuracyScore ?? 0.5;

  // Get current source health
  const health = await healthRepo.findByDomain(domain);
  if (!health) {
    return { adjusted: false, learningUpdated: false };
  }

  // Update verification counts
  const verificationOutcome = accuracyScore >= 0.7 ? "corroborated" : accuracyScore <= 0.3 ? "contested" : "neutral";
  const newCorroborated = health.corroboratedCount + (verificationOutcome === "corroborated" ? 1 : 0);
  const newContested = health.contestedCount + (verificationOutcome === "contested" ? 1 : 0);
  const newTotalVerifications = health.totalVerifications + 1;

  // Calculate verification-based reliability adjustment
  const verificationAccuracy = newTotalVerifications > 0
    ? newCorroborated / newTotalVerifications
    : 0.5;

  // Blend with existing dynamic reliability
  // Weight recent verifications more heavily
  const previousReliability = health.dynamicReliability ?? 0.5;
  const verificationWeight = Math.min(0.3, newTotalVerifications * 0.05); // Max 30% weight from verifications
  const newReliability = previousReliability * (1 - verificationWeight) + verificationAccuracy * verificationWeight;

  if (!dryRun) {
    // Update source health
    await healthRepo.upsert({
      id: health.id,
      domain: health.domain,
      healthStatus: health.healthStatus,
      successRate: health.successRate,
      totalFetches: health.totalFetches,
      failedFetches: health.failedFetches,
      successfulFetches: health.successfulFetches,
      avgResponseTimeMs: health.avgResponseTimeMs,
      p95ResponseTimeMs: health.p95ResponseTimeMs,
      minResponseTimeMs: health.minResponseTimeMs,
      maxResponseTimeMs: health.maxResponseTimeMs,
      errorsByType: health.errorsByType,
      baseReliability: health.baseReliability,
      dynamicReliability: newReliability,
      reliabilityConfidence: Math.min(1, (health.reliabilityConfidence ?? 0) + 0.05),
      totalVerifications: newTotalVerifications,
      corroboratedCount: newCorroborated,
      contestedCount: newContested,
      alertActive: health.alertActive,
      alertReason: health.alertReason,
      alertSince: health.alertSince,
      windowStartAt: health.windowStartAt,
      windowDays: health.windowDays,
      lastFetchAt: health.lastFetchAt,
      lastCalculatedAt: new Date(),
      createdAt: health.createdAt,
    });

    // Record adjustment if significant
    if (Math.abs(newReliability - previousReliability) > 0.01) {
      await adjustmentRepo.recordAdjustment(
        "source_health",
        domain,
        "dynamicReliability",
        previousReliability,
        newReliability,
        `Verification accuracy: ${(verificationAccuracy * 100).toFixed(1)}%`,
        event.id,
        { verificationIds: [event.sourceEntityId], sampleSize: newTotalVerifications }
      );
    }

    // Update learning for source reliability
    await learningRepo.upsertLearning(
      "source_reliability",
      `domain:${domain}`,
      {
        incrementSample: true,
        incrementSuccess: verificationOutcome === "corroborated",
        incrementFailure: verificationOutcome === "contested",
        avgAccuracy: accuracyScore,
      }
    );
  }

  console.log(
    `[FeedbackProcessor] Source ${domain}: reliability ${(previousReliability * 100).toFixed(1)}% → ${(newReliability * 100).toFixed(1)}% (verification accuracy: ${(verificationAccuracy * 100).toFixed(1)}%)`
  );

  return {
    adjusted: Math.abs(newReliability - previousReliability) > 0.01,
    learningUpdated: true,
    adjustmentDetails: {
      field: "dynamicReliability",
      previousValue: previousReliability,
      newValue: newReliability,
      adjustmentReason: `Verification accuracy update`,
    },
  };
}

/**
 * Loop 4: Playbook Execution → Playbook Optimization
 *
 * When playbook executions complete, learn from success/failure patterns:
 * - Track step failure patterns
 * - Identify slow steps
 * - Suggest optimizations
 */
async function processPlaybookExecutionFeedback(
  db: Database,
  event: FeedbackEventRow,
  adjustmentRepo: ConfidenceAdjustmentRepository,
  learningRepo: SystemLearningRepository,
  dryRun: boolean
): Promise<ProcessingResult> {
  const data = event.feedbackData;

  const success = data.success ?? false;
  const completionRate = data.completionRate ?? 0;
  const durationMs = data.durationMs ?? 0;
  const errorCount = data.errorCount ?? 0;

  // Determine if this is a concerning execution
  const isSlowExecution = durationMs > 300000; // > 5 minutes
  const hasLowCompletion = completionRate < 0.5;

  if (!dryRun) {
    // Update playbook effectiveness learning
    await learningRepo.upsertLearning(
      "playbook_effectiveness",
      `playbook:${event.targetEntityId}`,
      {
        incrementSample: true,
        incrementSuccess: success,
        incrementFailure: !success,
        avgDuration: durationMs,
      }
    );

    // Track global playbook metrics
    await learningRepo.upsertLearning(
      "playbook_effectiveness",
      "overall",
      {
        incrementSample: true,
        incrementSuccess: success,
        incrementFailure: !success,
        avgDuration: durationMs,
      }
    );

    // Add insights for concerning patterns
    if (isSlowExecution) {
      await learningRepo.addInsight(
        "playbook_effectiveness",
        `playbook:${event.targetEntityId}`,
        `Playbook execution took ${Math.round(durationMs / 60000)} minutes - consider optimization`,
        0.6,
        [event.sourceEntityId]
      );
    }

    if (hasLowCompletion && !success) {
      await learningRepo.addInsight(
        "playbook_effectiveness",
        `playbook:${event.targetEntityId}`,
        `Low step completion rate (${(completionRate * 100).toFixed(0)}%) - review step dependencies`,
        0.7,
        [event.sourceEntityId]
      );
    }
  }

  console.log(
    `[FeedbackProcessor] Playbook ${event.targetEntityId}: ${success ? "success" : "failure"}, ${(completionRate * 100).toFixed(0)}% steps completed, ${Math.round(durationMs / 1000)}s duration`
  );

  return {
    adjusted: false, // Playbook feedback doesn't adjust confidence directly
    learningUpdated: true,
    adjustmentDetails: {
      adjustmentReason: `Playbook execution: ${success ? "success" : "failure"}, completion ${(completionRate * 100).toFixed(0)}%`,
    },
  };
}

/**
 * Generate feedback events from recent verifications
 * Call this after verification runs to populate the feedback queue
 */
export async function generateVerificationFeedback(
  db: Database,
  verificationIds: string[]
): Promise<number> {
  const verificationRepo = new VerificationRepository(db);
  const feedbackRepo = new FeedbackEventRepository(db);

  let generated = 0;

  for (const verificationId of verificationIds) {
    const verification = await verificationRepo.findById(verificationId);
    if (!verification) continue;

    // Only process verifications for patterns
    if (verification.sourceType === "pattern") {
      await feedbackRepo.createVerificationFeedback(
        verification.id,
        verification.sourceId,
        {
          verificationStatus: verification.status,
          originalConfidence: verification.originalConfidence,
          adjustedConfidence: verification.adjustedConfidence,
        }
      );
      generated++;
    }

    // Generate source accuracy feedback for each source assessment
    for (const assessment of verification.sourceAssessments) {
      try {
        const domain = new URL(assessment.url).hostname.replace(/^www\./, "");
        const accuracyScore = assessment.alignment === "supports" ? 0.9 :
          assessment.alignment === "partially_supports" ? 0.6 :
          assessment.alignment === "contradicts" ? 0.2 : 0.5;

        await feedbackRepo.createSourceAccuracyFeedback(
          verification.id,
          domain,
          {
            accuracyScore,
            verificationCount: 1,
            alignment: assessment.alignment,
          }
        );
        generated++;
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }

  return generated;
}

/**
 * Generate feedback events from recent solution effectiveness calculations
 */
export async function generateSolutionOutcomeFeedback(
  db: Database,
  solutionIds: string[]
): Promise<number> {
  const effectivenessRepo = new SolutionEffectivenessRepository(db);
  const feedbackRepo = new FeedbackEventRepository(db);

  let generated = 0;

  for (const solutionId of solutionIds) {
    const effectiveness = await effectivenessRepo.findBySolution(solutionId);
    if (!effectiveness || effectiveness.overallEffectivenessScore === null) continue;

    await feedbackRepo.createSolutionOutcomeFeedback(
      effectiveness.id,
      solutionId,
      solutionId, // TODO: Get actual issue ID from solution
      {
        effectivenessScore: effectiveness.overallEffectivenessScore,
        metricsAchieved: effectiveness.metricsAchieved,
        metricsMissed: effectiveness.metricsMissed,
        impactVariance: effectiveness.impactVariance ?? 0,
      }
    );
    generated++;
  }

  return generated;
}

/**
 * Generate feedback events from playbook execution
 *
 * This creates feedback to track:
 * - Playbook success/failure rates
 * - Step completion times
 * - Error patterns
 */
export async function generatePlaybookExecutionFeedback(
  db: Database,
  executionId: string,
  playbookId: string,
  execution: {
    success: boolean;
    totalSteps: number;
    completedSteps: number;
    durationMs: number;
    errors: string[];
  }
): Promise<void> {
  const feedbackRepo = new FeedbackEventRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  // Create feedback event
  const feedbackId = `fb_pbk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  await feedbackRepo.create({
    id: feedbackId,
    feedbackType: "playbook_execution",
    sourceEntityType: "playbook_execution",
    sourceEntityId: executionId,
    targetEntityType: "playbook",
    targetEntityId: playbookId,
    feedbackData: {
      success: execution.success,
      completionRate: execution.totalSteps > 0
        ? execution.completedSteps / execution.totalSteps
        : 0,
      durationMs: execution.durationMs,
      errorCount: execution.errors.length,
      errors: execution.errors.slice(0, 5), // Keep first 5 errors
    },
    status: "pending",
    createdAt: new Date(),
  });

  // Update playbook learning
  await learningRepo.upsertLearning(
    "playbook_effectiveness",
    `playbook:${playbookId}`,
    {
      incrementSample: true,
      incrementSuccess: execution.success,
      incrementFailure: !execution.success,
      avgDuration: execution.durationMs,
    }
  );

  console.log(
    `[FeedbackProcessor] Generated playbook execution feedback: ${feedbackId} (${execution.success ? "success" : "failure"})`
  );
}

/**
 * Generate feedback events from source fetch results during scout runs
 *
 * This tracks source reliability based on fetch success/failure,
 * creating feedback events that can update source health scores.
 */
export async function generateSourceFetchFeedback(
  db: Database,
  fetchResults: Array<{
    url: string;
    success: boolean;
    responseTimeMs?: number;
    contentLength?: number;
    error?: string;
  }>
): Promise<number> {
  const feedbackRepo = new FeedbackEventRepository(db);

  let generated = 0;

  for (const result of fetchResults) {
    try {
      const domain = new URL(result.url).hostname.replace(/^www\./, "");

      // Calculate accuracy score based on fetch success
      // Success = high accuracy, failure = low accuracy
      const accuracyScore = result.success ? 0.8 : 0.2;

      // Create feedback event
      const feedbackId = `fb_fetch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      await feedbackRepo.create({
        id: feedbackId,
        feedbackType: "source_accuracy",
        sourceEntityType: "source_fetch",
        sourceEntityId: feedbackId,
        targetEntityType: "source_health",
        targetEntityId: domain,
        feedbackData: {
          sourceDomain: domain,
          accuracyScore,
          verificationCount: 1,
          // Store fetch-specific data
          alignment: result.success ? "supports" : "contradicts",
        },
        status: "pending",
        createdAt: new Date(),
      });

      generated++;
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return generated;
}
