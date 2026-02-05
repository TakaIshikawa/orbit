import { eq, desc, and, gte, lte, sql, isNull } from "drizzle-orm";
import {
  feedbackEvents,
  confidenceAdjustments,
  systemLearnings,
  evaluationRuns,
  type FeedbackEventRow,
  type NewFeedbackEventRow,
  type ConfidenceAdjustmentRow,
  type NewConfidenceAdjustmentRow,
  type SystemLearningRow,
  type NewSystemLearningRow,
  type EvaluationRunRow,
  type NewEvaluationRunRow,
} from "../schema/feedback.js";
import { patterns } from "../schema/patterns.js";
import { sourceHealth } from "../schema/source-health.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export class FeedbackEventRepository extends BaseRepository<
  typeof feedbackEvents,
  FeedbackEventRow,
  NewFeedbackEventRow
> {
  constructor(db: Database) {
    super(db, feedbackEvents, "id");
  }

  async findPending(limit: number = 100): Promise<FeedbackEventRow[]> {
    return this.db
      .select()
      .from(feedbackEvents)
      .where(eq(feedbackEvents.status, "pending"))
      .orderBy(feedbackEvents.createdAt)
      .limit(limit);
  }

  async findByTarget(
    targetEntityType: string,
    targetEntityId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<FeedbackEventRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(feedbackEvents)
      .where(
        and(
          eq(feedbackEvents.targetEntityType, targetEntityType),
          eq(feedbackEvents.targetEntityId, targetEntityId)
        )
      )
      .orderBy(desc(feedbackEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(feedbackEvents)
      .where(
        and(
          eq(feedbackEvents.targetEntityType, targetEntityType),
          eq(feedbackEvents.targetEntityId, targetEntityId)
        )
      );

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async markProcessed(
    id: string,
    adjustmentApplied: boolean,
    adjustmentDetails?: {
      field?: string;
      previousValue?: number;
      newValue?: number;
      adjustmentReason?: string;
    },
    error?: string
  ): Promise<FeedbackEventRow | null> {
    const status = error ? "failed" : "processed";
    const results = await this.db
      .update(feedbackEvents)
      .set({
        status,
        processedAt: new Date(),
        adjustmentApplied,
        adjustmentDetails: adjustmentDetails ?? null,
        processingError: error ?? null,
      })
      .where(eq(feedbackEvents.id, id))
      .returning();

    return results[0] ?? null;
  }

  async createVerificationFeedback(
    verificationId: string,
    patternId: string,
    data: {
      verificationStatus: string;
      originalConfidence: number;
      adjustedConfidence: number;
    }
  ): Promise<FeedbackEventRow> {
    const id = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      feedbackType: "verification_result",
      status: "pending",
      sourceEntityType: "verification",
      sourceEntityId: verificationId,
      targetEntityType: "pattern",
      targetEntityId: patternId,
      feedbackData: {
        verificationStatus: data.verificationStatus,
        originalConfidence: data.originalConfidence,
        adjustedConfidence: data.adjustedConfidence,
      },
    });
  }

  async createSolutionOutcomeFeedback(
    outcomeId: string,
    solutionId: string,
    issueId: string,
    data: {
      effectivenessScore: number;
      metricsAchieved: number;
      metricsMissed: number;
      impactVariance: number;
    }
  ): Promise<FeedbackEventRow> {
    const id = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      feedbackType: "solution_outcome",
      status: "pending",
      sourceEntityType: "solution_outcome",
      sourceEntityId: outcomeId,
      targetEntityType: "solution",
      targetEntityId: solutionId,
      feedbackData: {
        effectivenessScore: data.effectivenessScore,
        metricsAchieved: data.metricsAchieved,
        metricsMissed: data.metricsMissed,
        impactVariance: data.impactVariance,
      },
    });
  }

  async createSourceAccuracyFeedback(
    verificationId: string,
    domain: string,
    data: {
      accuracyScore: number;
      verificationCount: number;
      alignment: string;
    }
  ): Promise<FeedbackEventRow> {
    const id = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      feedbackType: "source_accuracy",
      status: "pending",
      sourceEntityType: "verification",
      sourceEntityId: verificationId,
      targetEntityType: "source_health",
      targetEntityId: domain,
      feedbackData: {
        sourceDomain: domain,
        accuracyScore: data.accuracyScore,
        verificationCount: data.verificationCount,
      },
    });
  }

  async createPlaybookExecutionFeedback(
    executionId: string,
    playbookId: string,
    data: {
      success: boolean;
      completionRate: number;
      durationMs: number;
      stepsCompleted: number;
      totalSteps: number;
      errorCount?: number;
      errors?: string[];
    }
  ): Promise<FeedbackEventRow> {
    const id = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      feedbackType: "playbook_execution",
      status: "pending",
      sourceEntityType: "playbook_execution",
      sourceEntityId: executionId,
      targetEntityType: "playbook",
      targetEntityId: playbookId,
      feedbackData: {
        success: data.success,
        completionRate: data.completionRate,
        durationMs: data.durationMs,
        stepsCompleted: data.stepsCompleted,
        totalSteps: data.totalSteps,
        errorCount: data.errorCount,
        errors: data.errors,
      },
    });
  }
}

export class ConfidenceAdjustmentRepository extends BaseRepository<
  typeof confidenceAdjustments,
  ConfidenceAdjustmentRow,
  NewConfidenceAdjustmentRow
> {
  constructor(db: Database) {
    super(db, confidenceAdjustments, "id");
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<ConfidenceAdjustmentRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(confidenceAdjustments)
      .where(
        and(
          eq(confidenceAdjustments.entityType, entityType),
          eq(confidenceAdjustments.entityId, entityId)
        )
      )
      .orderBy(desc(confidenceAdjustments.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(confidenceAdjustments)
      .where(
        and(
          eq(confidenceAdjustments.entityType, entityType),
          eq(confidenceAdjustments.entityId, entityId)
        )
      );

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async recordAdjustment(
    entityType: string,
    entityId: string,
    field: string,
    previousValue: number,
    newValue: number,
    reason: string,
    feedbackEventId?: string,
    context?: {
      verificationIds?: string[];
      outcomeIds?: string[];
      sampleSize?: number;
      confidenceInAdjustment?: number;
    }
  ): Promise<ConfidenceAdjustmentRow> {
    const id = `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      entityType,
      entityId,
      field,
      previousValue,
      newValue,
      adjustmentDelta: newValue - previousValue,
      reason,
      feedbackEventId: feedbackEventId ?? null,
      context: context ?? null,
    });
  }

  async getAdjustmentStats(
    entityType?: string,
    days: number = 30
  ): Promise<{
    totalAdjustments: number;
    avgAdjustmentMagnitude: number;
    positiveAdjustments: number;
    negativeAdjustments: number;
  }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const conditions = [gte(confidenceAdjustments.createdAt, cutoff)];
    if (entityType) {
      conditions.push(eq(confidenceAdjustments.entityType, entityType));
    }

    const results = await this.db
      .select({
        count: sql<number>`count(*)`,
        avgMagnitude: sql<number>`avg(abs(adjustment_delta))`,
        positiveCount: sql<number>`count(*) filter (where adjustment_delta > 0)`,
        negativeCount: sql<number>`count(*) filter (where adjustment_delta < 0)`,
      })
      .from(confidenceAdjustments)
      .where(and(...conditions));

    const row = results[0];
    return {
      totalAdjustments: Number(row?.count ?? 0),
      avgAdjustmentMagnitude: row?.avgMagnitude ?? 0,
      positiveAdjustments: Number(row?.positiveCount ?? 0),
      negativeAdjustments: Number(row?.negativeCount ?? 0),
    };
  }
}

export class SystemLearningRepository extends BaseRepository<
  typeof systemLearnings,
  SystemLearningRow,
  NewSystemLearningRow
> {
  constructor(db: Database) {
    super(db, systemLearnings, "id");
  }

  async findByKey(category: string, learningKey: string): Promise<SystemLearningRow | null> {
    const results = await this.db
      .select()
      .from(systemLearnings)
      .where(
        and(
          eq(systemLearnings.category, category),
          eq(systemLearnings.learningKey, learningKey)
        )
      )
      .limit(1);

    return results[0] ?? null;
  }

  async findByCategory(
    category: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SystemLearningRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(systemLearnings)
      .where(eq(systemLearnings.category, category))
      .orderBy(desc(systemLearnings.sampleSize))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(systemLearnings)
      .where(eq(systemLearnings.category, category));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async upsertLearning(
    category: string,
    learningKey: string,
    update: {
      incrementSample?: boolean;
      incrementSuccess?: boolean;
      incrementFailure?: boolean;
      avgConfidence?: number;
      avgEffectiveness?: number;
      avgAccuracy?: number;
      avgDuration?: number; // For tracking playbook execution times
    }
  ): Promise<SystemLearningRow> {
    const existing = await this.findByKey(category, learningKey);

    if (existing) {
      const newSampleSize = existing.sampleSize + (update.incrementSample ? 1 : 0);
      const newSuccessCount = existing.successCount + (update.incrementSuccess ? 1 : 0);
      const newFailureCount = existing.failureCount + (update.incrementFailure ? 1 : 0);
      const successRate = newSampleSize > 0 ? newSuccessCount / newSampleSize : null;

      // Running average calculation
      const newAvgConfidence = update.avgConfidence !== undefined
        ? existing.avgConfidence !== null
          ? (existing.avgConfidence * existing.sampleSize + update.avgConfidence) / newSampleSize
          : update.avgConfidence
        : existing.avgConfidence;

      const newAvgEffectiveness = update.avgEffectiveness !== undefined
        ? existing.avgEffectiveness !== null
          ? (existing.avgEffectiveness * existing.sampleSize + update.avgEffectiveness) / newSampleSize
          : update.avgEffectiveness
        : existing.avgEffectiveness;

      const newAvgAccuracy = update.avgAccuracy !== undefined
        ? existing.avgAccuracy !== null
          ? (existing.avgAccuracy * existing.sampleSize + update.avgAccuracy) / newSampleSize
          : update.avgAccuracy
        : existing.avgAccuracy;

      const results = await this.db
        .update(systemLearnings)
        .set({
          sampleSize: newSampleSize,
          successCount: newSuccessCount,
          failureCount: newFailureCount,
          successRate,
          avgConfidence: newAvgConfidence,
          avgEffectiveness: newAvgEffectiveness,
          avgAccuracy: newAvgAccuracy,
          updatedAt: new Date(),
        })
        .where(eq(systemLearnings.id, existing.id))
        .returning();

      return results[0];
    }

    // Create new learning
    const id = `learn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      category,
      learningKey,
      sampleSize: update.incrementSample ? 1 : 0,
      successCount: update.incrementSuccess ? 1 : 0,
      failureCount: update.incrementFailure ? 1 : 0,
      successRate: update.incrementSuccess ? 1 : update.incrementFailure ? 0 : null,
      avgConfidence: update.avgConfidence ?? null,
      avgEffectiveness: update.avgEffectiveness ?? null,
      avgAccuracy: update.avgAccuracy ?? null,
      correlations: [],
      insights: [],
    });
  }

  async addInsight(
    category: string,
    learningKey: string,
    insight: string,
    confidence: number,
    supportingEvidence: string[]
  ): Promise<void> {
    const existing = await this.findByKey(category, learningKey);
    if (!existing) return;

    const insights = existing.insights || [];
    insights.push({
      insight,
      confidence,
      supportingEvidence,
      discoveredAt: new Date().toISOString(),
    });

    await this.db
      .update(systemLearnings)
      .set({
        insights,
        updatedAt: new Date(),
      })
      .where(eq(systemLearnings.id, existing.id));
  }
}

export class EvaluationRunRepository extends BaseRepository<
  typeof evaluationRuns,
  EvaluationRunRow,
  NewEvaluationRunRow
> {
  constructor(db: Database) {
    super(db, evaluationRuns, "id");
  }

  async getLatest(): Promise<EvaluationRunRow | null> {
    const results = await this.db
      .select()
      .from(evaluationRuns)
      .orderBy(desc(evaluationRuns.createdAt))
      .limit(1);

    return results[0] ?? null;
  }

  async findByPeriod(
    start: Date,
    end: Date,
    options: ListOptions = {}
  ): Promise<PaginatedResult<EvaluationRunRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(evaluationRuns)
      .where(
        and(
          gte(evaluationRuns.periodStart, start),
          lte(evaluationRuns.periodEnd, end)
        )
      )
      .orderBy(desc(evaluationRuns.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(evaluationRuns)
      .where(
        and(
          gte(evaluationRuns.periodStart, start),
          lte(evaluationRuns.periodEnd, end)
        )
      );

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async markCompleted(
    id: string,
    trends?: EvaluationRunRow["trends"],
    recommendations?: EvaluationRunRow["recommendations"]
  ): Promise<EvaluationRunRow | null> {
    const results = await this.db
      .update(evaluationRuns)
      .set({
        completedAt: new Date(),
        trends: trends ?? null,
        recommendations: recommendations ?? [],
      })
      .where(eq(evaluationRuns.id, id))
      .returning();

    return results[0] ?? null;
  }
}
