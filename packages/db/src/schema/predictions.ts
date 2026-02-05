import { jsonb, pgEnum, pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";

/**
 * Predictions Schema
 *
 * Tracks predictions made by the system to measure understanding and calibration.
 * If we truly understand an issue, we should be able to make accurate predictions.
 */

// Prediction types
export const predictionTypeEnum = pgEnum("prediction_type", [
  "trend_direction",      // Will metric increase/decrease?
  "threshold_crossing",   // Will metric cross a threshold?
  "event_occurrence",     // Will event X happen?
  "comparative",          // Will A > B?
  "timing",               // When will X happen?
  "magnitude",            // How much will X change?
  "conditional",          // If X, then Y?
]);

// Prediction status
export const predictionStatusEnum = pgEnum("prediction_status", [
  "active",           // Prediction is still pending resolution
  "resolved_correct", // Prediction was correct
  "resolved_incorrect", // Prediction was wrong
  "resolved_partial", // Partially correct
  "expired",          // Resolution time passed without clear outcome
  "withdrawn",        // Prediction withdrawn (conditions changed)
]);

/**
 * Predictions - Testable forecasts based on issue understanding
 */
export const predictions = pgTable("predictions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // Link to issue (optional - some predictions may be general)
  issueId: text("issue_id").references(() => issues.id),

  // The prediction
  predictionType: predictionTypeEnum("prediction_type").notNull(),
  predictionStatement: text("prediction_statement").notNull(),

  // Operationalization - how will we measure this?
  operationalization: jsonb("operationalization").$type<{
    metric?: string;
    threshold?: number;
    comparisonValue?: number;
    dataSource?: string;
    measurementMethod: string;
  }>().notNull(),

  // Confidence and probability
  probability: real("probability").notNull(), // 0-1, predicted probability of occurrence
  confidenceInterval: jsonb("confidence_interval").$type<{
    lower: number;
    upper: number;
    confidence: number; // e.g., 0.9 for 90% CI
  }>(),

  // Reasoning
  reasoning: text("reasoning").notNull(),
  keyAssumptions: jsonb("key_assumptions").$type<string[]>().default([]),

  // Based on which causal claims?
  basedOnClaimIds: jsonb("based_on_claim_ids").$type<string[]>().default([]),

  // Timeline
  predictionMadeAt: timestamp("prediction_made_at", { withTimezone: true }).notNull().defaultNow(),
  resolutionDeadline: timestamp("resolution_deadline", { withTimezone: true }).notNull(),

  // Resolution
  status: predictionStatusEnum("status").notNull().default("active"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  actualOutcome: text("actual_outcome"),
  actualValue: real("actual_value"),
  outcomeSource: text("outcome_source"), // URL or description of where outcome was verified

  // Scoring
  brierScore: real("brier_score"), // (probability - outcome)^2, lower is better
  logScore: real("log_score"),      // log(probability) for correct, log(1-probability) for incorrect

  // Learning
  postMortem: text("post_mortem"),  // What did we learn from this prediction?
  modelUpdates: jsonb("model_updates").$type<Array<{
    claimId: string;
    previousConfidence: number;
    newConfidence: number;
    reason: string;
  }>>().default([]),
});

/**
 * Calibration Records - Aggregate prediction performance
 */
export const calibrationRecords = pgTable("calibration_records", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Time period
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

  // Scope
  scope: text("scope").notNull(), // "all" | issue domain | prediction type

  // Calibration bins
  // For each probability bin (e.g., 0.6-0.7), what fraction resolved correctly?
  calibrationBins: jsonb("calibration_bins").$type<Array<{
    binStart: number;
    binEnd: number;
    count: number;
    correctCount: number;
    actualFrequency: number;
    expectedFrequency: number;
  }>>().notNull(),

  // Overall metrics
  totalPredictions: real("total_predictions").notNull(),
  meanBrierScore: real("mean_brier_score"),
  meanLogScore: real("mean_log_score"),

  // Calibration quality
  calibrationError: real("calibration_error"), // Mean absolute difference from perfect calibration
  overconfidenceRatio: real("overconfidence_ratio"), // Fraction of predictions that were overconfident

  // Resolution/discrimination
  resolution: real("resolution"), // How much predictions vary from base rate
  discrimination: real("discrimination"), // Ability to distinguish outcomes

  // By prediction type
  byType: jsonb("by_type").$type<Record<string, {
    count: number;
    brierScore: number;
    calibrationError: number;
  }>>(),
});

/**
 * Prediction Sets - Group related predictions for batch evaluation
 */
export const predictionSets = pgTable("prediction_sets", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Set metadata
  name: text("name").notNull(),
  description: text("description"),

  // Associated issue (optional)
  issueId: text("issue_id").references(() => issues.id),

  // Predictions in this set
  predictionIds: jsonb("prediction_ids").$type<string[]>().notNull().default([]),

  // Set-level metrics (computed after resolution)
  resolved: boolean("resolved").notNull().default(false),
  setAccuracy: real("set_accuracy"),
  setBrierScore: real("set_brier_score"),
});

export type PredictionRow = typeof predictions.$inferSelect;
export type NewPredictionRow = typeof predictions.$inferInsert;
export type CalibrationRecordRow = typeof calibrationRecords.$inferSelect;
export type NewCalibrationRecordRow = typeof calibrationRecords.$inferInsert;
export type PredictionSetRow = typeof predictionSets.$inferSelect;
export type NewPredictionSetRow = typeof predictionSets.$inferInsert;
