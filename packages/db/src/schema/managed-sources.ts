import { jsonb, pgEnum, pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";

/**
 * Managed Sources Schema
 *
 * User-managed sources with granular trustworthiness and bias assessments.
 * Supports add, pause, and remove operations with full assessment tracking.
 */

export const sourceStatusEnum = pgEnum("source_status", [
  "active",     // Source is actively used
  "paused",     // Temporarily disabled
  "removed",    // Soft-deleted
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "research",     // Academic/research sources
  "news",         // News outlets
  "government",   // Government data sources
  "ngo",          // NGO/nonprofit reports
  "think_tank",   // Think tank publications
  "industry",     // Industry reports
  "aggregator",   // Data aggregators
  "preprint",     // Preprint servers
  "other",
]);

export const incentiveTypeEnum = pgEnum("incentive_type", [
  "academic",           // Reputation-driven
  "nonprofit",          // Mission-driven
  "commercial",         // Profit-driven
  "government",         // Policy-driven
  "advocacy",           // Cause-driven
  "wire_service",       // News accuracy-driven
  "aggregator",         // Comprehensiveness-driven
  "platform",           // Engagement-driven
  "independent",        // Varied/personal
]);

// Main managed sources table
export const managedSources = pgTable("managed_sources", {
  id: text("id").primaryKey(),

  // Source identification
  domain: text("domain").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),

  // Status and type
  status: sourceStatusEnum("status").notNull().default("active"),
  sourceType: sourceTypeEnum("source_type").notNull().default("other"),
  incentiveType: incentiveTypeEnum("incentive_type").notNull().default("independent"),

  // Domains this source covers
  domains: jsonb("domains").$type<string[]>().notNull().default([]),

  // Overall credibility score (0-1)
  overallCredibility: real("overall_credibility").notNull().default(0.5),

  // Core assessment metrics (0-1 scale)
  // Factual accuracy and methodology
  factualAccuracy: real("factual_accuracy").notNull().default(0.5),
  methodologicalRigor: real("methodological_rigor").notNull().default(0.5),
  transparencyScore: real("transparency_score").notNull().default(0.5),

  // Anti-bias metrics
  independenceScore: real("independence_score").notNull().default(0.5),        // Freedom from commercial/political pressure
  ideologicalTransparency: real("ideological_transparency").notNull().default(0.5), // Discloses ideological stance
  fundingTransparency: real("funding_transparency").notNull().default(0.5),    // Discloses funding sources
  conflictDisclosure: real("conflict_disclosure").notNull().default(0.5),      // Discloses conflicts of interest
  perspectiveDiversity: real("perspective_diversity").notNull().default(0.5),  // Represents multiple viewpoints
  geographicNeutrality: real("geographic_neutrality").notNull().default(0.5),  // Avoids geographic/cultural bias
  temporalNeutrality: real("temporal_neutrality").notNull().default(0.5),      // Avoids recency bias
  selectionBiasResistance: real("selection_bias_resistance").notNull().default(0.5), // Avoids cherry-picking
  quantificationBias: real("quantification_bias").notNull().default(0.5),      // Acknowledges unmeasurable factors

  // Calculated debiased score (weighted combination of anti-bias metrics)
  debiasedScore: real("debiased_score").notNull().default(0.5),

  // User notes and custom metadata
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  customMetadata: jsonb("custom_metadata").$type<Record<string, unknown>>(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),

  // Assessment metadata
  lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true }),
  assessedBy: text("assessed_by"),
  assessmentVersion: real("assessment_version").notNull().default(1),

  // Auto-sync with source health
  autoSyncHealth: boolean("auto_sync_health").notNull().default(true),
});

// Assessment history for tracking changes over time
export const sourceAssessmentHistory = pgTable("source_assessment_history", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(), // References managedSources.id

  // Snapshot of all assessment fields at this point
  assessmentSnapshot: jsonb("assessment_snapshot").$type<{
    overallCredibility: number;
    factualAccuracy: number;
    methodologicalRigor: number;
    transparencyScore: number;
    independenceScore: number;
    ideologicalTransparency: number;
    fundingTransparency: number;
    conflictDisclosure: number;
    perspectiveDiversity: number;
    geographicNeutrality: number;
    temporalNeutrality: number;
    selectionBiasResistance: number;
    quantificationBias: number;
    debiasedScore: number;
  }>().notNull(),

  // What changed
  changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
  changeReason: text("change_reason"),

  // Who made the change
  assessedBy: text("assessed_by"),

  // When
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Type exports
export type ManagedSourceRow = typeof managedSources.$inferSelect;
export type NewManagedSourceRow = typeof managedSources.$inferInsert;
export type SourceAssessmentHistoryRow = typeof sourceAssessmentHistory.$inferSelect;
export type NewSourceAssessmentHistoryRow = typeof sourceAssessmentHistory.$inferInsert;

// Helper type for assessment updates
export interface SourceAssessmentInput {
  factualAccuracy?: number;
  methodologicalRigor?: number;
  transparencyScore?: number;
  independenceScore?: number;
  ideologicalTransparency?: number;
  fundingTransparency?: number;
  conflictDisclosure?: number;
  perspectiveDiversity?: number;
  geographicNeutrality?: number;
  temporalNeutrality?: number;
  selectionBiasResistance?: number;
  quantificationBias?: number;
}

/**
 * Calculate debiased score from anti-bias metrics using weighted formula.
 * Weights prioritize independence and perspective diversity.
 */
export function calculateDebiasedScore(metrics: {
  independenceScore: number;
  ideologicalTransparency: number;
  fundingTransparency: number;
  conflictDisclosure: number;
  perspectiveDiversity: number;
  geographicNeutrality: number;
  temporalNeutrality: number;
  selectionBiasResistance: number;
  quantificationBias: number;
}): number {
  return (
    metrics.independenceScore * 0.30 +
    metrics.ideologicalTransparency * 0.10 +
    metrics.fundingTransparency * 0.08 +
    metrics.conflictDisclosure * 0.07 +
    metrics.perspectiveDiversity * 0.15 +
    metrics.geographicNeutrality * 0.05 +
    metrics.selectionBiasResistance * 0.10 +
    metrics.temporalNeutrality * 0.05 +
    metrics.quantificationBias * 0.10
  );
}

/**
 * Calculate overall credibility from all assessment metrics.
 */
export function calculateOverallCredibility(metrics: {
  factualAccuracy: number;
  methodologicalRigor: number;
  transparencyScore: number;
  debiasedScore: number;
}): number {
  return (
    metrics.factualAccuracy * 0.35 +
    metrics.methodologicalRigor * 0.25 +
    metrics.transparencyScore * 0.15 +
    metrics.debiasedScore * 0.25
  );
}
