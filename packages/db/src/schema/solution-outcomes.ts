import { jsonb, pgEnum, pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { solutions } from "./solutions.js";
import { issues } from "./issues.js";

/**
 * Solution Outcomes Schema
 *
 * Tracks actual outcomes vs estimated impact for solutions.
 * Enables feedback loop for evaluating solution effectiveness.
 */

export const outcomeSourceEnum = pgEnum("outcome_source", [
  "automated",   // System-detected outcomes
  "manual",      // Human-reported outcomes
  "verification", // From verification process
  "metric",      // From metric collection system
]);

export const outcomeTypeEnum = pgEnum("outcome_type", [
  "metric_measurement",  // A measured metric value
  "status_change",       // Issue/solution status changed
  "feedback",           // User/stakeholder feedback
  "verification_result", // Result from a verification
]);

// Individual outcome measurements/observations
export const solutionOutcomes = pgTable("solution_outcomes", {
  id: text("id").primaryKey(),
  solutionId: text("solution_id").notNull().references(() => solutions.id),

  // Tracking metadata
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: text("recorded_by").notNull(), // "system" or user identifier

  // Outcome classification
  outcomeType: outcomeTypeEnum("outcome_type").notNull(),
  outcomeSource: outcomeSourceEnum("outcome_source").notNull(),

  // Metric tracking (for outcome_type = metric_measurement)
  metricName: text("metric_name"),
  metricValue: real("metric_value"),
  baselineValue: real("baseline_value"),
  targetValue: real("target_value"),
  metricUnit: text("metric_unit"),

  // Status tracking (for outcome_type = status_change)
  linkedIssueId: text("linked_issue_id").references(() => issues.id),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),

  // Feedback tracking (for outcome_type = feedback)
  feedback: text("feedback"),
  feedbackSentiment: real("feedback_sentiment"), // -1 to 1 scale

  // Verification tracking (for outcome_type = verification_result)
  verificationId: text("verification_id"),
  verificationOutcome: text("verification_outcome"), // corroborated, contested, insufficient_evidence

  // Additional context
  notes: text("notes"),
  evidence: jsonb("evidence").$type<{
    sources?: string[];
    screenshots?: string[];
    dataPoints?: Record<string, unknown>[];
  }>(),
});

// Aggregated effectiveness summary per solution
export const solutionEffectiveness = pgTable("solution_effectiveness", {
  id: text("id").primaryKey(),
  solutionId: text("solution_id").notNull().references(() => solutions.id).unique(),

  // Overall assessment
  overallEffectivenessScore: real("overall_effectiveness_score"), // 0-1 scale
  confidenceInScore: real("confidence_in_score"), // 0-1 scale

  // Impact comparison
  estimatedImpactScore: real("estimated_impact_score"),
  actualImpactScore: real("actual_impact_score"),
  impactVariance: real("impact_variance"), // actual - estimated

  // Metrics achievement
  metricsAchieved: integer("metrics_achieved").notNull().default(0),
  metricsMissed: integer("metrics_missed").notNull().default(0),
  metricsPartial: integer("metrics_partial").notNull().default(0),

  // Issue resolution
  issuesResolved: integer("issues_resolved").notNull().default(0),
  avgTimeToResolution: real("avg_time_to_resolution"), // in days

  // Feedback analysis
  avgFeedbackSentiment: real("avg_feedback_sentiment"),
  feedbackCount: integer("feedback_count").notNull().default(0),

  // Time series data
  metricsTrend: jsonb("metrics_trend").$type<{
    metricName: string;
    dataPoints: { timestamp: string; value: number }[];
  }[]>(),

  // Timestamps
  firstOutcomeAt: timestamp("first_outcome_at", { withTimezone: true }),
  lastOutcomeAt: timestamp("last_outcome_at", { withTimezone: true }),
  lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SolutionOutcomeRow = typeof solutionOutcomes.$inferSelect;
export type NewSolutionOutcomeRow = typeof solutionOutcomes.$inferInsert;
export type SolutionEffectivenessRow = typeof solutionEffectiveness.$inferSelect;
export type NewSolutionEffectivenessRow = typeof solutionEffectiveness.$inferInsert;
