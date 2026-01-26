import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";

/**
 * Feedback Schema
 *
 * Tracks feedback loops, confidence adjustments, and system learnings
 * for continuous improvement of the Orbit system.
 */

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "verification_result",    // Verification outcome affecting pattern/source
  "solution_outcome",       // Solution effectiveness affecting issue understanding
  "source_accuracy",        // Source accuracy from verification results
  "playbook_execution",     // Playbook success/failure
  "manual_correction",      // Human correction/feedback
]);

export const feedbackStatusEnum = pgEnum("feedback_status", [
  "pending",      // Awaiting processing
  "processed",    // Successfully processed
  "skipped",      // Skipped (e.g., insufficient data)
  "failed",       // Processing failed
]);

// Individual feedback events - raw feedback data before processing
export const feedbackEvents = pgTable("feedback_events", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),

  feedbackType: feedbackTypeEnum("feedback_type").notNull(),
  status: feedbackStatusEnum("status").notNull().default("pending"),

  // Source of the feedback
  sourceEntityType: text("source_entity_type").notNull(), // verification, solution_outcome, playbook_execution
  sourceEntityId: text("source_entity_id").notNull(),

  // Target of the feedback (what should be adjusted)
  targetEntityType: text("target_entity_type").notNull(), // pattern, source_health, issue, solution
  targetEntityId: text("target_entity_id").notNull(),

  // Feedback data
  feedbackData: jsonb("feedback_data").$type<{
    // For verification feedback
    verificationStatus?: string;
    originalConfidence?: number;
    adjustedConfidence?: number;
    claimCount?: number;
    corroboratedCount?: number;
    contestedCount?: number;
    alignment?: string;

    // For solution outcome feedback
    effectivenessScore?: number;
    metricsAchieved?: number;
    metricsMissed?: number;
    impactVariance?: number;

    // For source accuracy feedback
    sourceDomain?: string;
    accuracyScore?: number;
    verificationCount?: number;

    // For playbook feedback
    success?: boolean;
    completionRate?: number;
    durationMs?: number;
    stepsCompleted?: number;
    totalSteps?: number;
    errorCount?: number;
    errors?: string[];

    // For manual correction feedback
    field?: string;
    correctedValue?: number;
    reason?: string;
  }>().notNull(),

  // Processing result
  adjustmentApplied: boolean("adjustment_applied").default(false),
  adjustmentDetails: jsonb("adjustment_details").$type<{
    field?: string;
    previousValue?: number;
    newValue?: number;
    adjustmentReason?: string;
  }>(),

  processingError: text("processing_error"),
});

// Confidence adjustments - history of all adjustments made
export const confidenceAdjustments = pgTable("confidence_adjustments", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // What was adjusted
  entityType: text("entity_type").notNull(), // pattern, source_health, issue
  entityId: text("entity_id").notNull(),
  field: text("field").notNull(), // confidence, dynamicReliability, compositeScore

  // Adjustment details
  previousValue: real("previous_value").notNull(),
  newValue: real("new_value").notNull(),
  adjustmentDelta: real("adjustment_delta").notNull(),

  // Why it was adjusted
  reason: text("reason").notNull(),
  feedbackEventId: text("feedback_event_id"),

  // Context
  context: jsonb("context").$type<{
    verificationIds?: string[];
    outcomeIds?: string[];
    sampleSize?: number;
    confidenceInAdjustment?: number;
  }>(),
});

// System learnings - aggregate insights about what works
export const systemLearnings = pgTable("system_learnings", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // Learning category
  category: text("category").notNull(), // pattern_quality, solution_effectiveness, source_reliability, issue_tractability

  // Learning key (what we learned about)
  learningKey: text("learning_key").notNull(), // e.g., "domain:healthcare", "pattern_type:policy_gap", "source:reuters.com"

  // Aggregate statistics
  sampleSize: integer("sample_size").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  successRate: real("success_rate"),

  // Aggregate scores
  avgConfidence: real("avg_confidence"),
  avgEffectiveness: real("avg_effectiveness"),
  avgAccuracy: real("avg_accuracy"),

  // Correlations discovered
  correlations: jsonb("correlations").$type<Array<{
    factor: string;
    correlation: number; // -1 to 1
    sampleSize: number;
    significance: number;
  }>>().default([]),

  // Insights
  insights: jsonb("insights").$type<Array<{
    insight: string;
    confidence: number;
    supportingEvidence: string[];
    discoveredAt: string;
  }>>().default([]),
});

// Evaluation runs - periodic system evaluation snapshots
export const evaluationRuns = pgTable("evaluation_runs", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Evaluation period
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

  // Metrics
  metrics: jsonb("metrics").$type<{
    // Pattern metrics
    patternsCreated: number;
    patternsVerified: number;
    avgPatternConfidence: number;
    patternVerificationRate: number;

    // Issue metrics
    issuesCreated: number;
    issuesResolved: number;
    avgResolutionTime: number; // days
    avgCompositeScore: number;

    // Solution metrics
    solutionsProposed: number;
    solutionsCompleted: number;
    avgEffectiveness: number;
    solutionsExceedingEstimate: number;

    // Source metrics
    sourcesMonitored: number;
    avgSourceHealth: number;
    degradedSources: number;
    avgVerificationAccuracy: number;

    // Feedback metrics
    feedbackEventsProcessed: number;
    adjustmentsMade: number;
    avgAdjustmentMagnitude: number;
  }>().notNull(),

  // Comparison to previous period
  trends: jsonb("trends").$type<{
    patternConfidenceTrend: number; // % change
    verificationRateTrend: number;
    resolutionTimeTrend: number;
    effectivenessTrend: number;
    sourceHealthTrend: number;
  }>(),

  // Recommendations from evaluation
  recommendations: jsonb("recommendations").$type<Array<{
    area: string;
    recommendation: string;
    priority: "high" | "medium" | "low";
    expectedImpact: string;
  }>>().default([]),
});

export type FeedbackEventRow = typeof feedbackEvents.$inferSelect;
export type NewFeedbackEventRow = typeof feedbackEvents.$inferInsert;
export type ConfidenceAdjustmentRow = typeof confidenceAdjustments.$inferSelect;
export type NewConfidenceAdjustmentRow = typeof confidenceAdjustments.$inferInsert;
export type SystemLearningRow = typeof systemLearnings.$inferSelect;
export type NewSystemLearningRow = typeof systemLearnings.$inferInsert;
export type EvaluationRunRow = typeof evaluationRuns.$inferSelect;
export type NewEvaluationRunRow = typeof evaluationRuns.$inferInsert;
